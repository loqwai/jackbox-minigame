# Fluid Ink Simulation System

A WebGL 2-based cellular automata fluid simulation for Worldbox-style ink spreading. Designed for multiplayer real-time sync and mobile performance.

## Overview

The ink spreading mechanic is the core gameplay element. When players draw strokes, the ink comes alive - pooling, flowing, and claiming territory. Different colors fight when they meet, and the ink naturally evaporates over time to prevent infinite growth.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WebGL 2 Fluid System                      │
├─────────────────────────────────────────────────────────────┤
│  Strokes (Yjs sync)                                          │
│      ↓                                                       │
│  addInkFromStroke() → interpolate points → pendingInk[]     │
│      ↓                                                       │
│  flushPendingInk() → GPU texture upload                     │
│      ↓                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Per-Chunk Simulation Loop (ping-pong)               │    │
│  │  1. Sync ghost cells from neighbors                 │    │
│  │  2. Run flow shader (parity 0 - even cells)         │    │
│  │  3. Sync ghost cells again                          │    │
│  │  4. Run flow shader (parity 1 - odd cells)          │    │
│  │  5. Swap read/write textures                        │    │
│  └─────────────────────────────────────────────────────┘    │
│      ↓                                                       │
│  Render shader → screen (per visible chunk)                 │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/gpu/webgl-fluid.js` | ~1000 | Main fluid simulation system |
| `public/js/gpu/chunk-manager.js` | ~200 | Sparse chunk allocation logic |
| `src/fluid-logic.test.ts` | ~400 | Unit tests for pure logic |
| `scripts/test/fluid-harness.html` | ~350 | Visual test harness |

## Chunked Architecture

The infinite canvas is divided into **sparse chunks** - only chunks with ink are allocated:

```
Chunk Config:
- size: 128 cells (128 × 128 grid)
- cellSize: 8 world pixels per cell
- ghostCells: 2 border cells for neighbor sampling
- maxActiveChunks: 50 (memory limit)
- unloadDelay: 3000ms before empty chunks are freed
```

**Chunk World Size:** 128 × 8 = 1024 world pixels per chunk

**Texture Size:** 128 + 4 (ghost cells) = 132 × 132 pixels

**Memory per Chunk:** 132² × 4 channels × 4 bytes (RGBA32F) = ~280KB

## Cell Data Format (RGBA32F)

Each cell in the simulation stores 4 floats:

| Channel | Name | Range | Purpose |
|---------|------|-------|---------|
| R | volume | 0.0 - 1.2 | Amount of ink in this cell |
| G | source | 0.0 - 1.0 | Source strength (decays over time) |
| B | pressure | 0.0 - 1.0 | Pressure from blocked neighbors |
| A | colorIdx | 0-0.875 | Color index / 8 (0 = empty, 1-6 = colors) |

## Flow Simulation (GLSL)

The flow shader runs cellular automata simulation:

### 1. Checkerboard Updates

Cells update in two passes based on `(x + y) % 2` parity:
- Pass 1: Update cells where parity = 0 (even cells)
- Pass 2: Update cells where parity = 1 (odd cells)

This breaks coherent wavefronts that would create square patterns.

### 2. Eight-Neighbor Sampling

```glsl
vec2 offsets[8];
offsets[0] = vec2(0.0, -1.0);   // up
offsets[1] = vec2(0.0, 1.0);    // down
offsets[2] = vec2(-1.0, 0.0);   // left
offsets[3] = vec2(1.0, 0.0);    // right
offsets[4] = vec2(-1.0, -1.0);  // up-left
offsets[5] = vec2(1.0, -1.0);   // up-right
offsets[6] = vec2(-1.0, 1.0);   // down-left
offsets[7] = vec2(1.0, 1.0);    // down-right
```

### 3. Distance-Weighted Flow

Diagonal neighbors are √2 farther away, so their flow strength is weighted:

```glsl
// Cardinal: 1.0, Diagonal: 0.707 (1/√2)
flowStrength[0..3] = 1.0;
flowStrength[4..7] = 0.707;
```

This creates **isotropic flow** - ink spreads at equal speed in all directions.

### 4. Radial Flow Bias

To prevent square shapes, flow is biased based on the ink gradient:

```glsl
// Calculate gradient (direction of steepest volume increase)
vec2 gradient = sum(offset[i] * neighbor[i].volume * flowStrength[i])

// Bias flow toward gradient (fills gaps) and tangent (rounds edges)
float radialBias = 0.7 + dot(dir, gradient) * 0.2 + tangentAlign * 0.3;
```

### 5. Deterministic Spatial Hash

For multiplayer sync, all "randomness" is position-based:

```glsl
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
```

Same position → same result on all clients.

### 6. Impedance Terrain

Fractal Brownian Motion (FBM) noise creates organic flow patterns:

```glsl
float impedance = 0.5 + fbm(cellPos * 0.037) * 1.5;
// Range: 0.5 (fast flow) to 2.0 (slow/sticky)
```

Low impedance areas: ink flows quickly
High impedance areas: ink pools and slows

### 7. Pressure System

When ink is blocked by other colors, pressure builds:

```glsl
// Blocked neighbors increase pressure
pressure += blockedCount * 0.05 * dt;

// Pressure boosts flow through open neighbors
float pressureBoost = 1.0 + pressure * (pressureMultiplier - 1.0);
```

This allows ink to "find a way around" obstacles.

### 8. Evaporation

Ink slowly dries out to prevent infinite growth:

```glsl
volume *= evaporation;  // 0.9995 per frame
```

After ~5000 frames (83 seconds at 60fps), volume drops to ~8% of original.

## Ghost Cell Synchronization

Chunks need to "see" their neighbors for cross-boundary flow:

```
┌─────────────────┬─────────────────┐
│     Chunk 0     │     Chunk 1     │
│                 │                 │
│            [G G]│[G G]            │
│            [G G]│[G G]            │
│  ← right edge  →│← left edge →    │
│  copied to      │copied to        │
│  Chunk 1 ghost  │Chunk 0 ghost    │
└─────────────────┴─────────────────┘
```

**Cardinal syncs:** Copy 2-cell-wide strips from each neighbor
**Diagonal syncs:** Copy 2×2 corners for 8-directional flow

## Render Shader

The render shader converts cell data to visible pixels:

### Color-Aware Gaussian Blur

```glsl
// 3x3 kernel, but only blur same-color cells
for (int i = 0; i < 9; i++) {
  vec4 s = texture(u_state, uv + offsets[i] * texel);
  int sColor = int(s.a * 8.0 + 0.5);

  if (sColor == centerColor || s.r < 0.001) {
    vol += s.r * weight[i];
    totalWeight += weight[i];
  }
}
```

This prevents colors from bleeding into each other during rendering.

### Edge Falloff

```glsl
float edgeFade = smoothstep(0.005, 0.05, volume);
```

Creates soft organic edges instead of hard pixel boundaries.

## Simulation Parameters

```javascript
const FLUID_PARAMS = {
  maxVolume: 1.0,          // Max ink per cell
  minVolume: 0.001,        // Below this = empty
  flowRate: 0.35,          // Flow speed per frame
  surfaceTension: 0.008,   // Min diff to trigger flow
  sourceDecay: 0.98,       // Source fade rate
  sourceStrength: 0.06,    // Volume from active source
  pressureMultiplier: 2.0, // Boost when pressurized
  restlessness: 0.002,     // Subtle time-varying motion
  evaporation: 0.9995,     // Dry-out rate per frame
}
```

## Stroke Processing

When a stroke arrives from Yjs sync:

```javascript
addInkFromStroke(stroke) {
  // Skip white (eraser)
  if (stroke.color === '#ffffff') return

  // Interpolate points along stroke
  for (segment in stroke) {
    const dist = distance(p1, p2)
    if (dist < 4) continue  // Skip tiny segments

    const steps = floor(dist / 6)
    for (j in steps) {
      pendingInk.push({ worldX, worldY, volume, colorIndex })
    }
  }
}
```

## Testing

### Unit Tests (Vitest)

```bash
npm test -- src/fluid-logic.test.ts
```

43 tests covering:
- Color mapping
- Coordinate conversion
- Flow physics (diagonal weighting, surface tension, evaporation)
- Hash determinism
- Chunk boundary math
- Stroke processing

### Visual Tests (Browser)

Open `scripts/test/fluid-harness.html` in a browser:

| Test | What it checks |
|------|---------------|
| Circular Spread | Ink spreads in rounded shapes, not squares |
| Chunk Boundary | Flow crosses chunk boundaries smoothly |
| Diagonal Boundary | 8-directional flow at chunk corners |
| Color Blocking | Different colors push but don't blend |
| Pressure Buildup | Blocked ink finds alternate paths |
| Evaporation | Ink fades over time |
| Large Pool | Pools stabilize, don't grow forever |
| Multi-Chunk Stress | Flow across 3+ chunks simultaneously |

## Performance

Designed for 60fps on mobile:

- **1 iteration/frame** (reduced from 4 for mobile)
- **2-octave FBM** (reduced from 4)
- **128-cell chunks** (smaller GPU textures)
- **Sparse allocation** (only active chunks in memory)
- **Empty chunk cleanup** (freed after 3 seconds idle)

## Multiplayer Considerations

1. **Deterministic** - All calculations use position-based hashes, not Math.random()
2. **Sync via Yjs** - Strokes sync, fluid simulation runs locally on each client
3. **Identical params** - All clients use same FLUID_PARAMS constants
4. **Time-independent** - Uses fixed dt (0.016) regardless of frame rate

Note: Minor drift may occur over long sessions. This is acceptable since the fluid is visual decoration, not authoritative game state.

## Known Issues

- **Square aliasing** - Partial fix with radial bias, FBM, checkerboard updates
- **Chunk seams** - Mostly fixed with 2-ghost-cell sync + diagonal corners
- **Mobile performance** - May drop below 60fps with many active chunks
- **GPU memory** - 50 chunks × 280KB = ~14MB max

## Future Improvements

1. **Marching squares** - Render contours for smoother edges
2. **Hexagonal grid** - Eliminates 4/8 anisotropy entirely
3. **Particle system** - Hybrid SPH for organic flow
4. **LOD chunks** - Lower resolution for distant chunks
5. **Compute shaders** - When WebGPU is broadly available
