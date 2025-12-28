// WebGL 2 Fluid Simulation System
// Chunked architecture for infinite canvas with Worldbox-style water physics

import { CHUNK_CONFIG } from './chunk-manager.js'

const FLUID_PARAMS = {
  maxVolume: 1.0,
  minVolume: 0.001,
  flowRate: 0.35,           // Faster flow (compensate for fewer iterations)
  surfaceTension: 0.008,    // Very low threshold - ink keeps flowing
  sourceDecay: 0.995,       // Slower decay - sources stay active longer
  sourceStrength: 0.06,     // More volume from source
  pressureMultiplier: 2.0,  // More pressure-driven flow
  iterations: 1,            // Single pass for mobile performance
  restlessness: 0.003,      // Prevents total equilibrium
}

// Map game colors to indices (must match PALETTE in shader)
const COLOR_TO_INDEX = {
  '#e94560': 1,  // red
  '#f39c12': 2,  // orange
  '#2ecc71': 3,  // green
  '#3498db': 4,  // blue
  '#9b59b6': 5,  // purple
  '#1abc9c': 6,  // teal
}

const colorToIndex = (color) => {
  const index = COLOR_TO_INDEX[color?.toLowerCase()] || 0
  if (index === 0 && color) {
    console.warn('[WebGL] Unknown color:', color, 'Available:', Object.keys(COLOR_TO_INDEX))
  }
  return index
}

// Vertex shader for simulation - simple fullscreen quad
const SIM_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

// Vertex shader for rendering - transforms chunk to world position
const RENDER_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
out vec2 v_worldPos;

uniform vec2 u_chunkWorldPos;
uniform float u_chunkWorldSize;
uniform mat4 u_viewProj;

void main() {
  // a_position is -1 to 1, convert to 0-1 for UV
  v_uv = a_position * 0.5 + 0.5;

  // Calculate world position of this vertex
  v_worldPos = u_chunkWorldPos + v_uv * u_chunkWorldSize;

  // Apply view projection
  gl_Position = u_viewProj * vec4(v_worldPos, 0.0, 1.0);
}
`

// Flow simulation fragment shader
const FLOW_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform vec2 u_resolution;
uniform float u_dt;
uniform float u_maxVolume;
uniform float u_minVolume;
uniform float u_flowRate;
uniform float u_surfaceTension;
uniform float u_sourceDecay;
uniform float u_sourceStrength;
uniform float u_pressureMultiplier;
uniform float u_restlessness;
uniform int u_parity;  // 0 or 1 for checkerboard updates
uniform float u_time;

in vec2 v_uv;
out vec4 fragColor;

vec4 sampleCell(vec2 offset) {
  vec2 coord = v_uv + offset / u_resolution;
  if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) {
    return vec4(0.0);
  }
  return texture(u_state, coord);
}

int getColorIndex(vec4 cell) {
  return int(cell.a * 8.0 + 0.5);
}

bool colorsMatch(vec4 a, vec4 b) {
  return getColorIndex(a) == getColorIndex(b);
}

bool isEmpty(vec4 cell) {
  return cell.r < u_minVolume;
}

// Deterministic hash for spatial "personality" - same position always gives same result
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Multi-value hash for neighbor selection (returns 8 values 0-1)
float hashN(vec2 p, int n) {
  return fract(sin(dot(p + float(n) * 17.3, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);  // Smoothstep

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Rotation matrix to break grid alignment
mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);  // ~37 degree rotation

// Simplified FBM - only 2 octaves for mobile performance
float fbm(vec2 p) {
  float value = noise(p) * 0.6;
  p = rot * p * 2.0;
  value += noise(p) * 0.4;
  return value;
}

void main() {
  // Checkerboard: only update cells matching current parity
  // This breaks coherent wavefronts that create squares
  vec2 cellPos = floor(v_uv * u_resolution);
  int cellParity = int(mod(cellPos.x + cellPos.y, 2.0));

  vec4 cell = texture(u_state, v_uv);

  // If parity doesn't match, just copy the cell unchanged
  if (cellParity != u_parity) {
    fragColor = cell;
    return;
  }

  float volume = cell.r;
  float source = cell.g;
  float pressure = cell.b;
  float colorIdx = cell.a;

  // Sample ALL 8 neighbors (cardinal + diagonal) for organic shapes
  vec4 neighbors[8];
  vec2 offsets[8];
  offsets[0] = vec2(0.0, -1.0);   // up
  offsets[1] = vec2(0.0, 1.0);    // down
  offsets[2] = vec2(-1.0, 0.0);   // left
  offsets[3] = vec2(1.0, 0.0);    // right
  offsets[4] = vec2(-1.0, -1.0);  // up-left
  offsets[5] = vec2(1.0, -1.0);   // up-right
  offsets[6] = vec2(-1.0, 1.0);   // down-left
  offsets[7] = vec2(1.0, 1.0);    // down-right

  for (int i = 0; i < 8; i++) {
    neighbors[i] = sampleCell(offsets[i]);
  }

  // Diagonal flow is weaker (1/√2 ≈ 0.707) to equalize effective speed
  // This fixes the fundamental isotropy problem of square grids
  float flowStrength[8];
  flowStrength[0] = 1.0; flowStrength[1] = 1.0;
  flowStrength[2] = 1.0; flowStrength[3] = 1.0;
  flowStrength[4] = 0.707; flowStrength[5] = 0.707;
  flowStrength[6] = 0.707; flowStrength[7] = 0.707;

  // Calculate volume gradient - which direction has the steepest drop
  // This helps us bias flow to create rounder shapes
  vec2 gradient = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    gradient += offsets[i] * neighbors[i].r * flowStrength[i];
  }
  gradient = normalize(gradient + vec2(0.001)); // Avoid division by zero

  // Radial flow bias: prefer flowing perpendicular to gradient (rounds edges)
  // and in gradient direction (fills gaps), rather than along grid axes
  float neighborBias[8];
  for (int i = 0; i < 8; i++) {
    vec2 dir = normalize(offsets[i]);

    // How aligned is this direction with the gradient?
    float gradAlign = dot(dir, gradient);

    // How aligned with perpendicular (tangent)?
    vec2 tangent = vec2(-gradient.y, gradient.x);
    float tangentAlign = abs(dot(dir, tangent));

    // Boost flow in gradient direction (fills gaps) and tangent (rounds edges)
    // Reduce flow that would extend corners
    float radialBias = 0.7 + gradAlign * 0.2 + tangentAlign * 0.3;

    // Combine with spatial hash for deterministic variation
    float spatialBias = 0.8 + hashN(cellPos * 0.1, i) * 0.4;

    neighborBias[i] = radialBias * spatialBias;
  }

  // Source generates volume over time
  if (source > u_minVolume) {
    volume += source * u_sourceStrength * u_dt;
    source *= u_sourceDecay;
  }

  // Get terrain properties - impedance controls flow speed
  // Use cell position with prime-based offset to avoid grid alignment
  vec2 noisePos = cellPos * 0.037 + vec2(hash(cellPos * 0.01) * 2.0, hash(cellPos * 0.013) * 2.0);

  // Impedance: 0.3 = fast flow (slippery), 1.0 = normal, 2.0 = slow (sticky)
  float impedance = 0.5 + fbm(noisePos) * 1.5;

  // Pre-calculate neighbor impedances for flow calculations
  float nImpedances[8];
  for (int i = 0; i < 8; i++) {
    vec2 nCellPos = cellPos + offsets[i];
    vec2 nNoisePos = nCellPos * 0.037 + vec2(hash(nCellPos * 0.01) * 2.0, hash(nCellPos * 0.013) * 2.0);
    nImpedances[i] = 0.5 + fbm(nNoisePos) * 1.5;
  }

  // CRITICAL: Empty cells must still receive inflow from neighbors
  if (volume < u_minVolume) {
    float totalInflow = 0.0;
    float dominantColor = 0.0;
    float maxInflow = 0.0;

    for (int i = 0; i < 8; i++) {
      vec4 n = neighbors[i];
      if (isEmpty(n)) continue;

      float nVolume = n.r;
      float nPressure = n.b;
      float nPressureBoost = 1.0 + nPressure * (u_pressureMultiplier - 1.0);

      // Flow speed depends on BOTH cells' impedance (average)
      float avgImpedance = (impedance + nImpedances[i]) * 0.5;
      float flowSpeed = 1.0 / avgImpedance;  // Lower impedance = faster

      if (nVolume > u_surfaceTension * 2.0) {
        float inflow = nVolume * 0.15 * nPressureBoost * flowStrength[i] * flowSpeed * neighborBias[i];
        inflow = min(inflow, u_flowRate * u_dt * nPressureBoost * flowSpeed * neighborBias[i]);
        totalInflow += inflow;
        if (inflow > maxInflow) {
          maxInflow = inflow;
          dominantColor = n.a;
        }
      }
    }

    if (totalInflow > u_minVolume) {
      fragColor = vec4(totalInflow, 0.0, 0.0, dominantColor);
    } else {
      fragColor = vec4(0.0);
    }
    return;
  }

  // Count blocked and open neighbors
  int blockedCount = 0;
  int openCount = 0;

  for (int i = 0; i < 8; i++) {
    if (!isEmpty(neighbors[i]) && !colorsMatch(cell, neighbors[i])) {
      blockedCount++;
    } else {
      openCount++;
    }
  }

  // Update pressure
  if (blockedCount > 0) {
    pressure = min(1.0, pressure + float(blockedCount) * 0.05 * u_dt);
  } else {
    pressure *= 0.95;
  }

  // Calculate flow with pressure boost
  float pressureBoost = 1.0 + pressure * (u_pressureMultiplier - 1.0);
  float baseFlow = u_flowRate * u_dt * pressureBoost / max(1.0, float(openCount));
  float totalFlowOut = 0.0;

  // Flow to each open neighbor - speed based on impedance
  for (int i = 0; i < 8; i++) {
    vec4 n = neighbors[i];
    if (!isEmpty(n) && !colorsMatch(cell, n)) continue;

    // Flow speed depends on impedance of both cells
    float avgImpedance = (impedance + nImpedances[i]) * 0.5;
    float flowSpeed = 1.0 / avgImpedance;

    float diff = volume - n.r;
    if (diff > u_surfaceTension) {
      float toFlow = diff * 0.3 * pressureBoost * flowStrength[i] * flowSpeed * neighborBias[i];
      toFlow = min(toFlow, baseFlow * flowStrength[i] * flowSpeed * neighborBias[i]);
      totalFlowOut += toFlow;
    }
  }

  // Apply outflow
  totalFlowOut = min(totalFlowOut, volume * 0.5);
  volume -= totalFlowOut;

  // Receive inflow from same-color neighbors
  for (int i = 0; i < 8; i++) {
    vec4 n = neighbors[i];
    if (isEmpty(n) || !colorsMatch(cell, n)) continue;

    float diff = n.r - volume;
    if (diff > u_surfaceTension) {
      float nPressureBoost = 1.0 + n.b * (u_pressureMultiplier - 1.0);
      float inflow = diff * 0.2 * nPressureBoost * flowStrength[i] * neighborBias[i];
      inflow = min(inflow, u_flowRate * u_dt * nPressureBoost * neighborBias[i]);
      volume += inflow;
    }
  }

  // Diffusion pass: blend with neighbors to soften grid boundaries
  // AGGRESSIVE diffusion at high volumes to prevent square boundaries
  float baseRate = 0.08;
  float highVolBoost = smoothstep(0.5, 0.9, volume) * 0.25;  // Up to 33% diffusion when full
  float diffusionRate = baseRate + highVolBoost;

  float neighborAvg = 0.0;
  float sameColorCount = 0.0;
  float minNeighborVol = 999.0;
  float maxNeighborVol = 0.0;

  for (int i = 0; i < 8; i++) {
    vec4 n = neighbors[i];
    if (colorsMatch(cell, n) || isEmpty(n)) {
      neighborAvg += n.r * flowStrength[i];
      sameColorCount += flowStrength[i];
      if (!isEmpty(n) && colorsMatch(cell, n)) {
        minNeighborVol = min(minNeighborVol, n.r);
        maxNeighborVol = max(maxNeighborVol, n.r);
      }
    }
  }

  if (sameColorCount > 0.0) {
    neighborAvg /= sameColorCount;

    // Extra diffusion at boundaries (where there's high variance)
    float variance = maxNeighborVol - minNeighborVol;
    float boundaryBoost = smoothstep(0.1, 0.4, variance) * 0.15;

    // Blend current volume toward neighbor average
    volume = mix(volume, neighborAvg, diffusionRate + boundaryBoost);
  }

  // Restlessness: add subtle time-varying perturbation to prevent equilibrium
  // This keeps ink flowing and prevents "beading" where blobs separate
  if (volume > u_minVolume * 2.0) {
    float wave = sin(u_time * 2.0 + cellPos.x * 0.3 + cellPos.y * 0.37) * 0.5 + 0.5;
    float perturbation = (wave - 0.5) * u_restlessness * volume;
    volume += perturbation;
  }

  // Clamp volume
  volume = clamp(volume, 0.0, u_maxVolume * 1.8);

  fragColor = vec4(volume, source, pressure, colorIdx);
}
`

// Render fragment shader - draws the fluid with smooth contours
const RENDER_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_state;
uniform float u_chunkSize;
uniform float u_ghostCells;
uniform float u_cellSize;
uniform float u_time;

in vec2 v_uv;
in vec2 v_worldPos;
out vec4 fragColor;

// Color palette matching game colors
const vec3 PALETTE[8] = vec3[8](
  vec3(0.0, 0.0, 0.0),       // 0: empty/black
  vec3(0.914, 0.271, 0.376), // 1: #e94560 red
  vec3(0.953, 0.612, 0.071), // 2: #f39c12 orange
  vec3(0.180, 0.800, 0.443), // 3: #2ecc71 green
  vec3(0.204, 0.596, 0.859), // 4: #3498db blue
  vec3(0.608, 0.349, 0.714), // 5: #9b59b6 purple
  vec3(0.102, 0.737, 0.612), // 6: #1abc9c teal
  vec3(0.5, 0.5, 0.5)        // 7: unused
);

// Sample with color-aware 3x3 gaussian blur (only blurs same-color neighbors)
vec4 sampleSmooth(vec2 uv, float texSize) {
  float texel = 1.0 / texSize;

  // Get center cell to determine which color to blur
  vec4 center = texture(u_state, uv);
  int centerColor = int(center.a * 8.0 + 0.5);

  // 3x3 Gaussian kernel weights (sigma ~0.8)
  float w[9];
  w[0] = 0.0625; w[1] = 0.125; w[2] = 0.0625;
  w[3] = 0.125;  w[4] = 0.25;  w[5] = 0.125;
  w[6] = 0.0625; w[7] = 0.125; w[8] = 0.0625;

  vec2 offsets[9];
  offsets[0] = vec2(-1, -1); offsets[1] = vec2(0, -1); offsets[2] = vec2(1, -1);
  offsets[3] = vec2(-1,  0); offsets[4] = vec2(0,  0); offsets[5] = vec2(1,  0);
  offsets[6] = vec2(-1,  1); offsets[7] = vec2(0,  1); offsets[8] = vec2(1,  1);

  float vol = 0.0;
  float src = 0.0;
  float prs = 0.0;
  float totalWeight = 0.0;

  for (int i = 0; i < 9; i++) {
    vec4 s = texture(u_state, uv + offsets[i] * texel);
    int sColor = int(s.a * 8.0 + 0.5);

    // Only include same-color or empty cells in blur
    if (sColor == centerColor || s.r < 0.001) {
      vol += s.r * w[i];
      src += s.g * w[i];
      prs += s.b * w[i];
      totalWeight += w[i];
    }
  }

  // Normalize by actual weight used
  if (totalWeight > 0.0) {
    vol /= totalWeight;
    src /= totalWeight;
    prs /= totalWeight;
  }

  return vec4(vol, src, prs, center.a);
}

void main() {
  // Map UV to texture coordinates, accounting for ghost cells
  float texSize = u_chunkSize + u_ghostCells * 2.0;
  vec2 texUV = (v_uv * u_chunkSize + u_ghostCells) / texSize;

  // Use smooth bilinear sampling for organic edges
  vec4 cell = sampleSmooth(texUV, texSize);
  float volume = cell.r;
  float source = cell.g;
  float pressure = cell.b;
  int colorIdx = int(cell.a * 8.0 + 0.5);

  // Smooth threshold for organic edges (not hard 0.001 cutoff)
  float edgeThreshold = 0.05;
  if (volume < edgeThreshold * 0.1) {
    discard;
  }

  // Smooth alpha falloff at edges
  float edgeFade = smoothstep(edgeThreshold * 0.1, edgeThreshold, volume);

  vec3 color = colorIdx < 8 ? PALETTE[colorIdx] : vec3(0.5);

  // Volume affects opacity
  float volumeRatio = clamp(volume, 0.0, 1.0);
  float alpha = (0.4 + volumeRatio * 0.5) * edgeFade;

  // Source cells glow
  if (source > 0.1) {
    color = mix(color, vec3(1.0), source * 0.15);
    alpha = min(0.95, alpha + source * 0.1);
  }

  // Pressure pulsing
  if (pressure > 0.3) {
    float pulse = sin(u_time * 3.0 + v_worldPos.x * 0.1 + v_worldPos.y * 0.1) * 0.5 + 0.5;
    alpha = min(0.95, alpha + pressure * pulse * 0.1);
  }

  fragColor = vec4(color * alpha, alpha);
}
`

// Fullscreen quad for rendering
const QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1, -1,
   1,  1,
  -1,  1,
])

const createShader = (gl, type, source) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${error}`)
  }
  return shader
}

const createProgram = (gl, vertexSource, fragmentSource) => {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  const program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link error: ${error}`)
  }
  return program
}

export const createFluidWebGL = (canvas) => {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true })
  if (!gl) throw new Error('WebGL 2 not supported')

  // Check for required extensions
  const floatExt = gl.getExtension('EXT_color_buffer_float')
  if (!floatExt) {
    console.warn('[WebGL] EXT_color_buffer_float not available, using fallback')
  }

  console.log('[WebGL] Initializing fluid simulation...')

  // Create shader programs
  const flowProgram = createProgram(gl, SIM_VERTEX_SHADER, FLOW_SHADER)
  const renderProgram = createProgram(gl, RENDER_VERTEX_SHADER, RENDER_SHADER)

  // Create vertex buffer for fullscreen quad
  const quadBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW)

  // Chunk management
  const chunks = new Map()
  const config = CHUNK_CONFIG

  const createChunkTextures = () => {
    const size = config.size + config.ghostCells * 2

    const createTex = () => {
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      // Use RGBA32F for better compatibility
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return tex
    }

    const fbo = gl.createFramebuffer()

    return { read: createTex(), write: createTex(), fbo, size }
  }

  const getOrCreateChunk = (cx, cy) => {
    const key = `${cx},${cy}`
    if (chunks.has(key)) return chunks.get(key)

    const textures = createChunkTextures()
    const chunk = {
      cx, cy, key,
      textures,
      dirty: false,
      cellCount: 0,
      worldOrigin: {
        x: cx * config.size * config.cellSize,
        y: cy * config.size * config.cellSize,
      },
    }
    chunks.set(key, chunk)
    return chunk
  }

  const worldToChunk = (worldX, worldY) => ({
    cx: Math.floor(worldX / (config.size * config.cellSize)),
    cy: Math.floor(worldY / (config.size * config.cellSize)),
  })

  const worldToLocal = (worldX, worldY) => {
    const { cx, cy } = worldToChunk(worldX, worldY)
    const chunkWorldX = cx * config.size * config.cellSize
    const chunkWorldY = cy * config.size * config.cellSize
    return {
      cx, cy,
      lx: Math.floor((worldX - chunkWorldX) / config.cellSize),
      ly: Math.floor((worldY - chunkWorldY) / config.cellSize),
    }
  }

  // Pending ink to add
  const pendingInk = []
  let time = 0

  const addInkFromStroke = (stroke) => {
    if (!stroke.points || stroke.points.length < 2) return
    if (stroke.color === '#ffffff') return

    const baseVolume = (stroke.size || 5) / 8  // Reduced base volume
    const colorIndex = colorToIndex(stroke.color)

    for (let i = 1; i < stroke.points.length; i++) {
      const p1 = stroke.points[i - 1]
      const p2 = stroke.points[i]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)

      // Skip very short segments to avoid pooling at stroke start
      if (dist < 4) continue

      // Volume proportional to distance traveled (consistent density)
      const volumeForSegment = baseVolume * Math.min(dist / 20, 1.5)
      const steps = Math.max(1, Math.floor(dist / 6))
      const volumePerPoint = volumeForSegment / (steps + 1)

      // Skip first point of segment to avoid overlap with previous segment's last point
      for (let j = 1; j <= steps; j++) {
        const t = j / steps
        const x = p1.x + (p2.x - p1.x) * t
        const y = p1.y + (p2.y - p1.y) * t
        pendingInk.push({ worldX: x, worldY: y, volume: volumePerPoint, colorIndex })
      }
    }
  }

  const flushPendingInk = () => {
    if (pendingInk.length === 0) return

    const chunkUpdates = new Map()

    pendingInk.forEach(({ worldX, worldY, volume, colorIndex }) => {
      const { cx, cy, lx, ly } = worldToLocal(worldX, worldY)
      const key = `${cx},${cy}`

      if (!chunkUpdates.has(key)) chunkUpdates.set(key, { cx, cy, cells: new Map() })
      const cellKey = `${lx},${ly}`
      const existing = chunkUpdates.get(key).cells.get(cellKey) || { lx, ly, volume: 0, colorIndex }
      existing.volume += volume
      chunkUpdates.get(key).cells.set(cellKey, existing)
    })

    chunkUpdates.forEach(({ cx, cy, cells }) => {
      const chunk = getOrCreateChunk(cx, cy)
      const texSize = chunk.textures.size
      const ghost = config.ghostCells

      // Read back current texture to accumulate ink
      if (!chunk.cpuData) {
        chunk.cpuData = new Float32Array(texSize * texSize * 4)
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, chunk.textures.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, chunk.textures.read, 0)
      gl.readPixels(0, 0, texSize, texSize, gl.RGBA, gl.FLOAT, chunk.cpuData)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)

      // Add ink on top of existing
      cells.forEach(({ lx, ly, volume, colorIndex }) => {
        const tx = lx + ghost
        const ty = ly + ghost
        if (tx < 0 || tx >= texSize || ty < 0 || ty >= texSize) return

        const idx = (ty * texSize + tx) * 4
        const existing = chunk.cpuData[idx]

        // Accumulate volume, refresh source
        chunk.cpuData[idx] = Math.min(FLUID_PARAMS.maxVolume * 1.5, existing + volume)
        chunk.cpuData[idx + 1] = Math.min(0.8, chunk.cpuData[idx + 1] + 0.15)  // boost source
        chunk.cpuData[idx + 3] = colorIndex / 8.0  // set color
      })

      // Upload back to GPU
      gl.bindTexture(gl.TEXTURE_2D, chunk.textures.read)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texSize, texSize, gl.RGBA, gl.FLOAT, chunk.cpuData)

      chunk.dirty = true
      chunk.cellCount = Math.max(chunk.cellCount, cells.size)
    })

    pendingInk.length = 0
  }

  // Run one simulation pass for a chunk with given parity (0 or 1)
  const simulateChunkPass = (chunk, parity) => {
    const size = chunk.textures.size

    // Bind FBO with write texture as target
    gl.bindFramebuffer(gl.FRAMEBUFFER, chunk.textures.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, chunk.textures.write, 0)
    gl.viewport(0, 0, size, size)

    gl.useProgram(flowProgram)

    // Set uniforms
    gl.uniform1i(gl.getUniformLocation(flowProgram, 'u_state'), 0)
    gl.uniform2f(gl.getUniformLocation(flowProgram, 'u_resolution'), size, size)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_dt'), 0.016)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_maxVolume'), FLUID_PARAMS.maxVolume)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_minVolume'), FLUID_PARAMS.minVolume)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_flowRate'), FLUID_PARAMS.flowRate)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_surfaceTension'), FLUID_PARAMS.surfaceTension)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_sourceDecay'), FLUID_PARAMS.sourceDecay)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_sourceStrength'), FLUID_PARAMS.sourceStrength)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_pressureMultiplier'), FLUID_PARAMS.pressureMultiplier)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_restlessness'), FLUID_PARAMS.restlessness)
    gl.uniform1i(gl.getUniformLocation(flowProgram, 'u_parity'), parity)
    gl.uniform1f(gl.getUniformLocation(flowProgram, 'u_time'), time)

    // Bind read texture
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, chunk.textures.read)

    // Draw fullscreen quad
    const posLoc = gl.getAttribLocation(flowProgram, 'a_position')
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Swap textures for next pass
    const temp = chunk.textures.read
    chunk.textures.read = chunk.textures.write
    chunk.textures.write = temp
  }

  // Always create neighbor chunks for any chunk with ink
  // Mark them dirty so they get simulated (allows ink to flow in)
  const expandChunks = () => {
    const activeChunks = Array.from(chunks.values()).filter(c => c.cellCount > 0 || c.dirty)

    activeChunks.forEach(chunk => {
      const { cx, cy } = chunk
      // Create all 4 cardinal neighbors and mark them for simulation
      const neighbors = [
        getOrCreateChunk(cx - 1, cy),
        getOrCreateChunk(cx + 1, cy),
        getOrCreateChunk(cx, cy - 1),
        getOrCreateChunk(cx, cy + 1),
      ]
      // Mark neighbors as dirty so they get simulated
      // This allows ink to flow INTO them from the active chunk
      neighbors.forEach(n => { n.dirty = true })
    })
  }

  // Sync ghost cells between adjacent chunks so edges can "see" neighbors
  // This fixes the issue where flow stops at chunk boundaries
  const syncGhostCells = () => {
    const ghost = config.ghostCells
    const size = config.size
    const texSize = size + ghost * 2

    // Create temp framebuffers for reading if needed
    if (!syncFBO) {
      syncFBO = gl.createFramebuffer()
    }

    // First, expand chunks where ink is near edges
    expandChunks()

    chunks.forEach(chunk => {
      const { cx, cy } = chunk

      // Copy edge columns/rows from neighbors into this chunk's ghost cells
      // Left neighbor: copy their right edge (col size) to our left ghost (col 0)
      const leftKey = `${cx - 1},${cy}`
      const leftChunk = chunks.get(leftKey)
      if (leftChunk) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, syncFBO)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, leftChunk.textures.read, 0)
        gl.bindTexture(gl.TEXTURE_2D, chunk.textures.read)
        // Copy from left chunk's right edge (x=size) to this chunk's left ghost (x=0)
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, ghost, size, ghost, ghost, size)
      }

      // Right neighbor: copy their left edge (col ghost) to our right ghost (col size+ghost)
      const rightKey = `${cx + 1},${cy}`
      const rightChunk = chunks.get(rightKey)
      if (rightChunk) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, syncFBO)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rightChunk.textures.read, 0)
        gl.bindTexture(gl.TEXTURE_2D, chunk.textures.read)
        // Copy from right chunk's left edge (x=ghost) to this chunk's right ghost (x=size+ghost)
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, size + ghost, ghost, ghost, ghost, ghost, size)
      }

      // Top neighbor: copy their bottom edge (row size) to our top ghost (row 0)
      const topKey = `${cx},${cy - 1}`
      const topChunk = chunks.get(topKey)
      if (topChunk) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, syncFBO)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, topChunk.textures.read, 0)
        gl.bindTexture(gl.TEXTURE_2D, chunk.textures.read)
        // Copy from top chunk's bottom edge (y=size) to this chunk's top ghost (y=0)
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, ghost, 0, ghost, size, size, ghost)
      }

      // Bottom neighbor: copy their top edge (row ghost) to our bottom ghost (row size+ghost)
      const bottomKey = `${cx},${cy + 1}`
      const bottomChunk = chunks.get(bottomKey)
      if (bottomChunk) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, syncFBO)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bottomChunk.textures.read, 0)
        gl.bindTexture(gl.TEXTURE_2D, chunk.textures.read)
        // Copy from bottom chunk's top edge (y=ghost) to this chunk's bottom ghost (y=size+ghost)
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, ghost, size + ghost, ghost, ghost, size, ghost)
      }
    })

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  let syncFBO = null

  const simulate = (dt) => {
    flushPendingInk()
    time += dt

    // Sync ghost cells from neighboring chunks before simulation
    // This allows flow to cross chunk boundaries
    syncGhostCells()

    // Run simulation with checkerboard pattern:
    // Pass 1: update cells where (x+y) % 2 == 0
    // Pass 2: update cells where (x+y) % 2 == 1
    // This breaks coherent wavefronts that create square patterns
    const iterations = FLUID_PARAMS.iterations || 1
    for (let i = 0; i < iterations; i++) {
      // Parity 0 pass - update "even" cells
      chunks.forEach(chunk => {
        if (chunk.cellCount > 0 || chunk.dirty) {
          simulateChunkPass(chunk, 0)
        }
      })

      // Sync again between parity passes for better cross-chunk flow
      syncGhostCells()

      // Parity 1 pass - update "odd" cells (neighbors just updated!)
      chunks.forEach(chunk => {
        if (chunk.cellCount > 0 || chunk.dirty) {
          simulateChunkPass(chunk, 1)
          chunk.dirty = false
        }
      })
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  const render = (view) => {
    const { x, y, scale, width, height } = view

    // Ensure canvas is properly sized
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    // Set viewport to canvas size
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    // Calculate visible world bounds
    const worldLeft = x
    const worldTop = y
    const worldRight = x + width / scale
    const worldBottom = y + height / scale

    const minCx = Math.floor(worldLeft / (config.size * config.cellSize)) - 1
    const maxCx = Math.ceil(worldRight / (config.size * config.cellSize)) + 1
    const minCy = Math.floor(worldTop / (config.size * config.cellSize)) - 1
    const maxCy = Math.ceil(worldBottom / (config.size * config.cellSize)) + 1

    gl.useProgram(renderProgram)

    // View projection matrix (orthographic)
    const projMatrix = new Float32Array([
      2 / (worldRight - worldLeft), 0, 0, 0,
      0, 2 / (worldTop - worldBottom), 0, 0,
      0, 0, 1, 0,
      -(worldRight + worldLeft) / (worldRight - worldLeft), -(worldTop + worldBottom) / (worldTop - worldBottom), 0, 1,
    ])

    gl.uniformMatrix4fv(gl.getUniformLocation(renderProgram, 'u_viewProj'), false, projMatrix)
    gl.uniform1f(gl.getUniformLocation(renderProgram, 'u_time'), time)
    gl.uniform1f(gl.getUniformLocation(renderProgram, 'u_cellSize'), config.cellSize)
    gl.uniform1f(gl.getUniformLocation(renderProgram, 'u_chunkSize'), config.size)
    gl.uniform1f(gl.getUniformLocation(renderProgram, 'u_ghostCells'), config.ghostCells)
    gl.uniform1i(gl.getUniformLocation(renderProgram, 'u_state'), 0)

    const posLoc = gl.getAttribLocation(renderProgram, 'a_position')
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    const chunkWorldSize = config.size * config.cellSize

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx},${cy}`
        const chunk = chunks.get(key)
        if (!chunk || chunk.cellCount === 0) continue

        gl.uniform2f(gl.getUniformLocation(renderProgram, 'u_chunkWorldPos'), chunk.worldOrigin.x, chunk.worldOrigin.y)
        gl.uniform1f(gl.getUniformLocation(renderProgram, 'u_chunkWorldSize'), chunkWorldSize)

        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, chunk.textures.read)

        gl.drawArrays(gl.TRIANGLES, 0, 6)
      }
    }

    gl.disable(gl.BLEND)
  }

  const getStats = () => ({
    activeChunks: chunks.size,
    totalCells: Array.from(chunks.values()).reduce((sum, c) => sum + c.cellCount, 0),
    pendingInk: pendingInk.length,
  })

  console.log('[WebGL] Fluid simulation ready')

  return {
    addInkFromStroke,
    simulate,
    render,
    getStats,
    isWebGL: true,
  }
}

export const supportsWebGL2 = () => {
  const canvas = document.createElement('canvas')
  return !!canvas.getContext('webgl2')
}
