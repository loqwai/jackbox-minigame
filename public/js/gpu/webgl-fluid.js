// WebGL 2 Fluid Simulation System
// Chunked architecture for infinite canvas with Worldbox-style water physics

import { CHUNK_CONFIG } from './chunk-manager.js'

const FLUID_PARAMS = {
  maxVolume: 1.0,
  minVolume: 0.001,
  flowRate: 0.25,           // Faster flow
  surfaceTension: 0.02,     // Lower threshold = more spreading
  sourceDecay: 0.9995,      // Slower decay = longer generation
  sourceStrength: 0.04,     // More volume from source
  pressureMultiplier: 2.0,  // More pressure-driven flow
  iterations: 4,            // Multiple sim passes per frame
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

// Simplex-like noise for organic flow perturbation
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
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

// Fractal brownian motion for multi-scale noise
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Get flow bias based on position (like terrain elevation)
// Returns values that can BLOCK flow (0.0) or BOOST it (up to 2.0)
vec4 getFlowBias(vec2 uv) {
  vec2 worldPos = uv * u_resolution * 0.05;  // Larger scale for visible patterns

  // Create terrain-like elevation
  float elevation = fbm(worldPos);

  // Sample elevation at neighbor positions
  float elevUp = fbm(worldPos + vec2(0.0, 0.05));
  float elevDown = fbm(worldPos + vec2(0.0, -0.05));
  float elevLeft = fbm(worldPos + vec2(-0.05, 0.0));
  float elevRight = fbm(worldPos + vec2(0.05, 0.0));

  // Flow prefers going "downhill" - towards lower elevation
  // If neighbor is higher, reduce flow; if lower, increase flow
  float biasUp = 1.0 + (elevation - elevUp) * 3.0;
  float biasDown = 1.0 + (elevation - elevDown) * 3.0;
  float biasLeft = 1.0 + (elevation - elevLeft) * 3.0;
  float biasRight = 1.0 + (elevation - elevRight) * 3.0;

  // Clamp to prevent negative flow, allow boosted flow
  return clamp(vec4(biasUp, biasDown, biasLeft, biasRight), 0.0, 2.5);
}

void main() {
  vec4 cell = texture(u_state, v_uv);
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

  // Diagonal flow is slightly weaker (longer distance)
  float flowStrength[8];
  flowStrength[0] = 1.0; flowStrength[1] = 1.0;
  flowStrength[2] = 1.0; flowStrength[3] = 1.0;
  flowStrength[4] = 0.7; flowStrength[5] = 0.7;
  flowStrength[6] = 0.7; flowStrength[7] = 0.7;

  // Source generates volume over time
  if (source > u_minVolume) {
    volume += source * u_sourceStrength * u_dt;
    source *= u_sourceDecay;
  }

  // Get terrain-based flow bias - creates river-like channels
  vec2 worldPos = v_uv * u_resolution * 0.015;  // Larger features
  float elevation = fbm(worldPos);

  // Pre-calculate all neighbor elevations and find the LOWEST ones
  float nElevations[8];
  float minElev = 999.0;
  float maxElev = -999.0;
  for (int i = 0; i < 8; i++) {
    vec2 nWorldPos = (v_uv + offsets[i] / u_resolution) * u_resolution * 0.015;
    nElevations[i] = fbm(nWorldPos);
    minElev = min(minElev, nElevations[i]);
    maxElev = max(maxElev, nElevations[i]);
  }
  float elevRange = max(0.01, maxElev - minElev);

  // CRITICAL: Empty cells must still receive inflow from neighbors
  if (volume < u_minVolume) {
    float totalInflow = 0.0;
    float dominantColor = 0.0;
    float maxInflow = 0.0;

    for (int i = 0; i < 8; i++) {
      vec4 n = neighbors[i];
      if (isEmpty(n)) continue;

      // Flow downhill - neighbor flows to us if we're lower
      // Use steep falloff - only the lowest 1-2 directions get significant flow
      float elevDiff = nElevations[i] - elevation;
      float normalizedElev = (nElevations[i] - minElev) / elevRange;
      // Steep curve: low elevation = high flow, high elevation = nearly zero
      float terrainBias = pow(1.0 - normalizedElev, 3.0) * 2.0 + 0.05;

      float nVolume = n.r;
      float nPressure = n.b;
      float nPressureBoost = 1.0 + nPressure * (u_pressureMultiplier - 1.0);

      if (nVolume > u_surfaceTension * 2.0) {
        float inflow = nVolume * 0.15 * nPressureBoost * flowStrength[i] * terrainBias;
        inflow = min(inflow, u_flowRate * u_dt * nPressureBoost);
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

  // Flow to each open neighbor - STRONGLY prefer lowest neighbors
  for (int i = 0; i < 8; i++) {
    vec4 n = neighbors[i];
    if (!isEmpty(n) && !colorsMatch(cell, n)) continue;

    // Steep terrain bias - flow almost exclusively to lowest neighbors
    float normalizedElev = (nElevations[i] - minElev) / elevRange;
    // Cubic falloff: lowest neighbor gets ~2x flow, highest gets ~0.05x
    float terrainBias = pow(1.0 - normalizedElev, 3.0) * 2.0 + 0.05;

    float diff = volume - n.r;
    if (diff > u_surfaceTension) {
      float toFlow = diff * 0.3 * pressureBoost * flowStrength[i] * terrainBias;
      toFlow = min(toFlow, baseFlow * flowStrength[i] * terrainBias);
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
      float inflow = diff * 0.2 * nPressureBoost * flowStrength[i];
      inflow = min(inflow, u_flowRate * u_dt * nPressureBoost);
      volume += inflow;
    }
  }

  // Clamp volume
  volume = clamp(volume, 0.0, u_maxVolume * 1.8);

  fragColor = vec4(volume, source, pressure, colorIdx);
}
`

// Render fragment shader - draws the fluid with nice visuals
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

void main() {
  // Map UV to texture coordinates, accounting for ghost cells
  float texSize = u_chunkSize + u_ghostCells * 2.0;
  vec2 texUV = (v_uv * u_chunkSize + u_ghostCells) / texSize;

  vec4 cell = texture(u_state, texUV);
  float volume = cell.r;
  float source = cell.g;
  float pressure = cell.b;
  int colorIdx = int(cell.a * 8.0 + 0.5);

  if (volume < 0.001) {
    discard;
  }

  vec3 color = colorIdx < 8 ? PALETTE[colorIdx] : vec3(0.5);

  // Volume affects opacity
  float volumeRatio = clamp(volume, 0.0, 1.0);
  float alpha = 0.4 + volumeRatio * 0.5;

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

    const baseVolume = (stroke.size || 5) / 5  // Increased volume
    const colorIndex = colorToIndex(stroke.color)
    console.log('[WebGL] Adding stroke:', stroke.color, 'colorIndex:', colorIndex, 'points:', stroke.points.length, 'volume:', baseVolume)

    for (let i = 1; i < stroke.points.length; i++) {
      const p1 = stroke.points[i - 1]
      const p2 = stroke.points[i]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const steps = Math.max(1, Math.floor(dist / 4))

      for (let j = 0; j <= steps; j++) {
        const t = j / steps
        const x = p1.x + (p2.x - p1.x) * t
        const y = p1.y + (p2.y - p1.y) * t
        pendingInk.push({ worldX: x, worldY: y, volume: baseVolume / steps, colorIndex })
      }
    }
  }

  // Single-pixel buffer for incremental ink updates
  const singlePixel = new Float32Array(4)

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

      // Read current texture state to add ink on top
      // First, read back current texture data if we haven't
      if (!chunk.cpuData) {
        chunk.cpuData = new Float32Array(texSize * texSize * 4)
      }

      // For each cell, read its current value, add ink, write back
      // Use FBO to read from texture
      gl.bindFramebuffer(gl.FRAMEBUFFER, chunk.textures.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, chunk.textures.read, 0)

      // Read back current data
      gl.readPixels(0, 0, texSize, texSize, gl.RGBA, gl.FLOAT, chunk.cpuData)

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)

      // Add ink to CPU buffer
      cells.forEach(({ lx, ly, volume, colorIndex }) => {
        const tx = lx + ghost
        const ty = ly + ghost
        if (tx < 0 || tx >= texSize || ty < 0 || ty >= texSize) return

        const idx = (ty * texSize + tx) * 4

        // Add volume and ALWAYS set color (combat happens in shader)
        const existingVolume = chunk.cpuData[idx]
        const existingColor = Math.round(chunk.cpuData[idx + 3] * 8)
        const newVolume = volume

        if (existingVolume < 0.01 || existingColor === colorIndex) {
          // Empty or same color - just add
          chunk.cpuData[idx] = Math.min(FLUID_PARAMS.maxVolume * 1.8, existingVolume + newVolume)
          chunk.cpuData[idx + 3] = colorIndex / 8.0
        } else {
          // Different color - COMBAT! New ink fights existing
          const newTotal = existingVolume + newVolume
          if (newVolume > existingVolume * 0.5) {
            // New ink is strong enough to take over
            chunk.cpuData[idx] = newVolume - existingVolume * 0.3  // Lose some in combat
            chunk.cpuData[idx + 3] = colorIndex / 8.0
          } else {
            // Existing ink wins but loses some volume
            chunk.cpuData[idx] = existingVolume - newVolume * 0.5
          }
        }
        chunk.cpuData[idx + 1] = Math.min(1.0, chunk.cpuData[idx + 1] + 0.5) // source
      })

      // Upload entire texture back
      gl.bindTexture(gl.TEXTURE_2D, chunk.textures.read)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texSize, texSize, gl.RGBA, gl.FLOAT, chunk.cpuData)

      chunk.dirty = true
      chunk.cellCount += cells.size
    })

    pendingInk.length = 0
  }

  const simulateChunk = (chunk) => {
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

    // Bind read texture
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, chunk.textures.read)

    // Draw fullscreen quad
    const posLoc = gl.getAttribLocation(flowProgram, 'a_position')
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
    gl.enableVertexAttribArray(posLoc)
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)

    // Swap textures
    const temp = chunk.textures.read
    chunk.textures.read = chunk.textures.write
    chunk.textures.write = temp
  }

  const simulate = (dt) => {
    flushPendingInk()
    time += dt

    // Run multiple simulation iterations per frame for faster spreading
    const iterations = FLUID_PARAMS.iterations || 1
    for (let i = 0; i < iterations; i++) {
      chunks.forEach(chunk => {
        if (chunk.cellCount > 0 || chunk.dirty) {
          simulateChunk(chunk)
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
