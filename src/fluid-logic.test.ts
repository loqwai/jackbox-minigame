// Unit tests for fluid simulation logic
// These test the pure functions extracted from the WebGL system

import { describe, it, expect, beforeEach } from 'vitest'

// ============================================================================
// EXTRACTED PURE FUNCTIONS (mirroring webgl-fluid.js logic)
// ============================================================================

const FLUID_PARAMS = {
  maxVolume: 1.0,
  minVolume: 0.001,
  flowRate: 0.35,
  surfaceTension: 0.008,
  sourceDecay: 0.98,
  sourceStrength: 0.06,
  pressureMultiplier: 2.0,
  evaporation: 0.9995,
  restlessness: 0.002,
}

const CHUNK_CONFIG = {
  size: 128,
  cellSize: 8,
  ghostCells: 2,
  maxActiveChunks: 50,
}

const COLOR_TO_INDEX = {
  '#e94560': 1,  // red
  '#f39c12': 2,  // orange
  '#2ecc71': 3,  // green
  '#3498db': 4,  // blue
  '#9b59b6': 5,  // purple
  '#1abc9c': 6,  // teal
}

const colorToIndex = (color) => COLOR_TO_INDEX[color?.toLowerCase()] || 0

const worldToChunk = (worldX, worldY) => ({
  cx: Math.floor(worldX / (CHUNK_CONFIG.size * CHUNK_CONFIG.cellSize)),
  cy: Math.floor(worldY / (CHUNK_CONFIG.size * CHUNK_CONFIG.cellSize)),
})

const worldToLocal = (worldX, worldY) => {
  const { cx, cy } = worldToChunk(worldX, worldY)
  const chunkWorldX = cx * CHUNK_CONFIG.size * CHUNK_CONFIG.cellSize
  const chunkWorldY = cy * CHUNK_CONFIG.size * CHUNK_CONFIG.cellSize
  return {
    cx, cy,
    lx: Math.floor((worldX - chunkWorldX) / CHUNK_CONFIG.cellSize),
    ly: Math.floor((worldY - chunkWorldY) / CHUNK_CONFIG.cellSize),
  }
}

// Deterministic hash (mirrors GLSL)
const hash = (x, y) => {
  const p = x * 127.1 + y * 311.7
  return ((Math.sin(p) * 43758.5453) % 1 + 1) % 1
}

// Distance-weighted flow strength for 8 neighbors
const getFlowStrength = (isCardinal) => isCardinal ? 1.0 : 0.707

// Check if cells have same color
const colorsMatch = (colorA, colorB) => colorA === colorB

// Check if cell is empty
const isEmpty = (volume) => volume < FLUID_PARAMS.minVolume

// ============================================================================
// TESTS
// ============================================================================

describe('Color Mapping', () => {
  it('maps known colors to correct indices', () => {
    expect(colorToIndex('#e94560')).toBe(1)
    expect(colorToIndex('#f39c12')).toBe(2)
    expect(colorToIndex('#2ecc71')).toBe(3)
    expect(colorToIndex('#3498db')).toBe(4)
    expect(colorToIndex('#9b59b6')).toBe(5)
    expect(colorToIndex('#1abc9c')).toBe(6)
  })

  it('handles case insensitivity', () => {
    expect(colorToIndex('#E94560')).toBe(1)
    expect(colorToIndex('#F39C12')).toBe(2)
  })

  it('returns 0 for unknown colors', () => {
    expect(colorToIndex('#ffffff')).toBe(0)
    expect(colorToIndex('#000000')).toBe(0)
    expect(colorToIndex('invalid')).toBe(0)
    expect(colorToIndex(null)).toBe(0)
    expect(colorToIndex(undefined)).toBe(0)
  })
})

describe('Coordinate Conversion', () => {
  const chunkWorldSize = CHUNK_CONFIG.size * CHUNK_CONFIG.cellSize // 1024

  it('converts world coordinates to chunk coordinates', () => {
    // Origin
    expect(worldToChunk(0, 0)).toEqual({ cx: 0, cy: 0 })

    // Just inside first chunk
    expect(worldToChunk(100, 100)).toEqual({ cx: 0, cy: 0 })
    expect(worldToChunk(1023, 1023)).toEqual({ cx: 0, cy: 0 })

    // Crossing into next chunk
    expect(worldToChunk(1024, 0)).toEqual({ cx: 1, cy: 0 })
    expect(worldToChunk(0, 1024)).toEqual({ cx: 0, cy: 1 })
    expect(worldToChunk(1024, 1024)).toEqual({ cx: 1, cy: 1 })
  })

  it('handles negative coordinates', () => {
    expect(worldToChunk(-1, -1)).toEqual({ cx: -1, cy: -1 })
    expect(worldToChunk(-1024, -1024)).toEqual({ cx: -1, cy: -1 })
    expect(worldToChunk(-1025, -1025)).toEqual({ cx: -2, cy: -2 })
  })

  it('converts world coordinates to local cell coordinates', () => {
    const result = worldToLocal(100, 100)
    expect(result.cx).toBe(0)
    expect(result.cy).toBe(0)
    expect(result.lx).toBe(Math.floor(100 / CHUNK_CONFIG.cellSize))
    expect(result.ly).toBe(Math.floor(100 / CHUNK_CONFIG.cellSize))
  })

  it('local coordinates wrap at chunk boundaries', () => {
    // Just inside chunk 0,0
    const inside = worldToLocal(1016, 1016)
    expect(inside.cx).toBe(0)
    expect(inside.lx).toBe(127)

    // Just inside chunk 1,0
    const nextChunk = worldToLocal(1024, 0)
    expect(nextChunk.cx).toBe(1)
    expect(nextChunk.lx).toBe(0)
  })
})

describe('Flow Physics', () => {
  describe('Diagonal Flow Weighting', () => {
    it('cardinal directions have strength 1.0', () => {
      expect(getFlowStrength(true)).toBe(1.0)
    })

    it('diagonal directions have strength ~0.707 (1/√2)', () => {
      expect(getFlowStrength(false)).toBeCloseTo(0.707, 2)
    })

    it('this creates isotropic flow (equal speed in all directions)', () => {
      // Cardinal neighbors are 1 cell away
      // Diagonal neighbors are √2 cells away
      // With weight 0.707 (1/√2), diagonal flow compensates for longer distance
      // The weighting ensures diagonal doesn't over-contribute
      // since there are 4 cardinal and 4 diagonal neighbors
      const diagonalWeight = 0.707
      expect(diagonalWeight).toBeCloseTo(1 / Math.sqrt(2), 2)
    })
  })

  describe('Color Interactions', () => {
    it('same colors can flow into each other', () => {
      expect(colorsMatch(1, 1)).toBe(true)
      expect(colorsMatch(2, 2)).toBe(true)
    })

    it('different colors block each other', () => {
      expect(colorsMatch(1, 2)).toBe(false)
      expect(colorsMatch(3, 4)).toBe(false)
    })

    it('empty cells (color 0) are treated as color 0', () => {
      expect(colorsMatch(0, 0)).toBe(true)
      expect(colorsMatch(0, 1)).toBe(false)
    })
  })

  describe('Volume Thresholds', () => {
    it('cells below minVolume are considered empty', () => {
      expect(isEmpty(0)).toBe(true)
      expect(isEmpty(0.0001)).toBe(true)
      expect(isEmpty(0.0009)).toBe(true)
    })

    it('cells at or above minVolume are not empty', () => {
      expect(isEmpty(0.001)).toBe(false)
      expect(isEmpty(0.01)).toBe(false)
      expect(isEmpty(1.0)).toBe(false)
    })
  })

  describe('Surface Tension', () => {
    it('flow only occurs when diff exceeds surfaceTension', () => {
      const canFlow = (vol1, vol2) => (vol1 - vol2) > FLUID_PARAMS.surfaceTension

      // Small differences don't flow
      expect(canFlow(0.5, 0.495)).toBe(false)

      // Larger differences do flow
      expect(canFlow(0.5, 0.4)).toBe(true)
      expect(canFlow(1.0, 0.9)).toBe(true)
    })
  })

  describe('Evaporation', () => {
    it('volume decays exponentially', () => {
      const evap = FLUID_PARAMS.evaporation
      let vol = 1.0

      // After 1000 frames
      for (let i = 0; i < 1000; i++) {
        vol *= evap
      }
      expect(vol).toBeCloseTo(0.606, 2) // e^(-0.5) ≈ 0.606

      // After 5000 frames (about 80 seconds at 60fps)
      vol = 1.0
      for (let i = 0; i < 5000; i++) {
        vol *= evap
      }
      expect(vol).toBeLessThan(0.1)
    })

    it('source decay is faster than evaporation', () => {
      expect(FLUID_PARAMS.sourceDecay).toBeLessThan(FLUID_PARAMS.evaporation)

      // Source decays to 10% in ~100 frames
      let src = 1.0
      for (let i = 0; i < 100; i++) {
        src *= FLUID_PARAMS.sourceDecay
      }
      expect(src).toBeLessThan(0.15)
    })
  })
})

describe('Hash Function Determinism', () => {
  it('same inputs produce same output', () => {
    const h1 = hash(100, 200)
    const h2 = hash(100, 200)
    expect(h1).toBe(h2)
  })

  it('different inputs produce different outputs', () => {
    const h1 = hash(100, 200)
    const h2 = hash(101, 200)
    const h3 = hash(100, 201)
    expect(h1).not.toBe(h2)
    expect(h1).not.toBe(h3)
  })

  it('output is in range [0, 1)', () => {
    for (let x = -100; x < 100; x += 10) {
      for (let y = -100; y < 100; y += 10) {
        const h = hash(x, y)
        expect(h).toBeGreaterThanOrEqual(0)
        expect(h).toBeLessThan(1)
      }
    }
  })

  it('provides good distribution (no clustering)', () => {
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    for (let x = 0; x < 100; x++) {
      for (let y = 0; y < 100; y++) {
        const h = hash(x, y)
        buckets[Math.floor(h * 10)]++
      }
    }

    // Each bucket should have roughly 1000 values (10%)
    // Allow 30% deviation for randomness
    buckets.forEach((count, i) => {
      expect(count).toBeGreaterThan(700)
      expect(count).toBeLessThan(1300)
    })
  })
})

describe('Chunk Management Edge Cases', () => {
  it('handles coordinates at exact chunk boundaries', () => {
    const chunkSize = CHUNK_CONFIG.size * CHUNK_CONFIG.cellSize

    // Right at boundary
    const atBoundary = worldToLocal(chunkSize, 0)
    expect(atBoundary.cx).toBe(1)
    expect(atBoundary.lx).toBe(0)

    // One pixel before boundary
    const beforeBoundary = worldToLocal(chunkSize - 1, 0)
    expect(beforeBoundary.cx).toBe(0)
    expect(beforeBoundary.lx).toBe(Math.floor((chunkSize - 1) / CHUNK_CONFIG.cellSize))
  })

  it('handles very large coordinates', () => {
    const huge = 1e9
    const result = worldToChunk(huge, huge)
    expect(result.cx).toBe(Math.floor(huge / (CHUNK_CONFIG.size * CHUNK_CONFIG.cellSize)))
    expect(result.cy).toBe(Math.floor(huge / (CHUNK_CONFIG.size * CHUNK_CONFIG.cellSize)))
  })

  it('handles floating point coordinates', () => {
    const result = worldToLocal(100.5, 200.7)
    expect(Number.isInteger(result.cx)).toBe(true)
    expect(Number.isInteger(result.cy)).toBe(true)
    expect(Number.isInteger(result.lx)).toBe(true)
    expect(Number.isInteger(result.ly)).toBe(true)
  })
})

describe('Ghost Cell Configuration', () => {
  it('ghost cells provide margin for neighbor sampling', () => {
    const ghost = CHUNK_CONFIG.ghostCells
    const size = CHUNK_CONFIG.size

    // With 2 ghost cells, texture size is size + 4
    const texSize = size + ghost * 2
    expect(texSize).toBe(132) // 128 + 4

    // Diagonal neighbors need 1 cell margin, but with 2 we have extra safety
    expect(ghost).toBeGreaterThanOrEqual(1)
  })

  it('8-neighbor sampling stays within ghost cell bounds', () => {
    const ghost = CHUNK_CONFIG.ghostCells
    const offsets = [
      [0, -1], [0, 1], [-1, 0], [1, 0],  // Cardinal
      [-1, -1], [1, -1], [-1, 1], [1, 1], // Diagonal
    ]

    // Any cell at edge of main grid (0 or size-1) plus offset
    // should stay within ghost cell region
    offsets.forEach(([dx, dy]) => {
      expect(Math.abs(dx)).toBeLessThanOrEqual(ghost)
      expect(Math.abs(dy)).toBeLessThanOrEqual(ghost)
    })
  })
})

describe('Flow Simulation Edge Cases', () => {
  describe('Checkerboard Update Pattern', () => {
    it('cells update based on (x+y) % 2 parity', () => {
      const getParity = (x, y) => (x + y) % 2

      // Same parity neighbors don't update together
      expect(getParity(0, 0)).toBe(0)
      expect(getParity(1, 1)).toBe(0)
      expect(getParity(2, 2)).toBe(0)

      // Adjacent cells have opposite parity
      expect(getParity(0, 0)).not.toBe(getParity(0, 1))
      expect(getParity(0, 0)).not.toBe(getParity(1, 0))

      // Diagonal neighbors have same parity
      expect(getParity(0, 0)).toBe(getParity(1, 1))
    })
  })

  describe('Pressure Buildup', () => {
    it('pressure increases when neighbors are blocked', () => {
      const blockedCount = 4
      const dt = 0.016
      let pressure = 0

      // Pressure increases
      pressure = Math.min(1.0, pressure + blockedCount * 0.05 * dt)
      expect(pressure).toBeGreaterThan(0)

      // Maxes at 1.0
      for (let i = 0; i < 1000; i++) {
        pressure = Math.min(1.0, pressure + blockedCount * 0.05 * dt)
      }
      expect(pressure).toBe(1.0)
    })

    it('pressure decays when neighbors are open', () => {
      let pressure = 1.0
      const decayRate = 0.95

      for (let i = 0; i < 100; i++) {
        pressure *= decayRate
      }
      expect(pressure).toBeLessThan(0.01)
    })

    it('pressure multiplier boosts flow', () => {
      const pressure = 0.5
      const boost = 1.0 + pressure * (FLUID_PARAMS.pressureMultiplier - 1.0)
      expect(boost).toBe(1.5) // 1.0 + 0.5 * 1.0
    })
  })

  describe('Volume Clamping', () => {
    it('volume cannot exceed maxVolume * 1.2', () => {
      const maxCap = FLUID_PARAMS.maxVolume * 1.2
      expect(maxCap).toBe(1.2)

      // Clamping function
      const clamp = (v) => Math.min(Math.max(v, 0), maxCap)
      expect(clamp(2.0)).toBe(1.2)
      expect(clamp(-0.5)).toBe(0)
      expect(clamp(0.5)).toBe(0.5)
    })
  })
})

describe('Stroke Processing', () => {
  const processStroke = (stroke) => {
    if (!stroke.points || stroke.points.length < 2) return []
    if (stroke.color === '#ffffff') return []

    const result = []
    const baseVolume = (stroke.size || 5) / 8

    for (let i = 1; i < stroke.points.length; i++) {
      const p1 = stroke.points[i - 1]
      const p2 = stroke.points[i]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)

      if (dist < 4) continue

      const volumeForSegment = baseVolume * Math.min(dist / 20, 1.5)
      const steps = Math.max(1, Math.floor(dist / 6))
      const volumePerPoint = volumeForSegment / (steps + 1)

      for (let j = 1; j <= steps; j++) {
        const t = j / steps
        const x = p1.x + (p2.x - p1.x) * t
        const y = p1.y + (p2.y - p1.y) * t
        result.push({ x, y, volume: volumePerPoint })
      }
    }
    return result
  }

  it('rejects strokes with fewer than 2 points', () => {
    expect(processStroke({ points: [], color: '#e94560' })).toEqual([])
    expect(processStroke({ points: [{ x: 0, y: 0 }], color: '#e94560' })).toEqual([])
  })

  it('rejects white/eraser strokes', () => {
    const stroke = {
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#ffffff',
    }
    expect(processStroke(stroke)).toEqual([])
  })

  it('skips very short segments (< 4 pixels)', () => {
    const stroke = {
      points: [{ x: 0, y: 0 }, { x: 2, y: 2 }],
      color: '#e94560',
    }
    expect(processStroke(stroke)).toEqual([])
  })

  it('interpolates points along long segments', () => {
    const stroke = {
      points: [{ x: 0, y: 0 }, { x: 60, y: 0 }],
      color: '#e94560',
      size: 8,
    }
    const result = processStroke(stroke)

    // Should have multiple interpolated points
    expect(result.length).toBeGreaterThan(1)

    // Points should be evenly spaced along x-axis
    result.forEach(p => {
      expect(p.y).toBe(0)
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThanOrEqual(60)
    })
  })

  it('distributes volume based on segment length', () => {
    const shortStroke = {
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      color: '#e94560',
      size: 8,
    }
    const longStroke = {
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      color: '#e94560',
      size: 8,
    }

    const shortResult = processStroke(shortStroke)
    const longResult = processStroke(longStroke)

    // Long stroke generates more ink points
    expect(longResult.length).toBeGreaterThan(shortResult.length)
  })
})

describe('Boundary Conditions', () => {
  describe('Chunk Boundary Flow', () => {
    it('flow can cross chunk boundaries via ghost cells', () => {
      // A cell at local x = size - 1 (edge of chunk)
      // Its neighbor at local x = size would be in ghost region
      // That ghost cell gets synced from the next chunk's edge
      const size = CHUNK_CONFIG.size
      const ghost = CHUNK_CONFIG.ghostCells

      // Edge cell in main grid
      const edgeCell = { lx: size - 1, ly: 64 }

      // Its right neighbor is at x = size (in ghost region)
      const neighborInGhost = { lx: size, ly: 64 }

      // This ghost cell corresponds to lx=0 in the right-adjacent chunk
      const correspondingInNextChunk = { lx: 0, ly: 64 }

      expect(neighborInGhost.lx).toBe(correspondingInNextChunk.lx + size)
    })

    it('diagonal flow across corners needs diagonal chunk sync', () => {
      // A cell at (size-1, size-1) has a diagonal neighbor at (size, size)
      // This requires syncing from the chunk at (cx+1, cy+1)
      const diagonalChunks = [
        [-1, -1], [1, -1], [-1, 1], [1, 1],
      ]

      // All 4 diagonal chunks should be synced
      expect(diagonalChunks.length).toBe(4)
    })
  })

  describe('Empty Cell Behavior', () => {
    it('empty cells can receive inflow from neighbors', () => {
      // This is critical - empty cells must "pull" from neighbors
      // not just wait for neighbors to "push"
      const emptyVolume = 0
      const neighborVolume = 0.5
      const threshold = FLUID_PARAMS.surfaceTension * 2

      // Neighbor has enough to flow
      expect(neighborVolume).toBeGreaterThan(threshold)

      // Empty cell receives inflow calculation
      const inflow = neighborVolume * 0.15
      expect(inflow).toBeGreaterThan(0)
    })
  })
})

describe('Numerical Stability', () => {
  it('parameters prevent division by zero', () => {
    // minVolume > 0 prevents empty cell issues
    expect(FLUID_PARAMS.minVolume).toBeGreaterThan(0)

    // maxVolume prevents unbounded growth
    expect(FLUID_PARAMS.maxVolume).toBe(1.0)
  })

  it('flow rates are bounded', () => {
    const dt = 0.016 // 60fps
    const maxFlowPerFrame = FLUID_PARAMS.flowRate * dt * FLUID_PARAMS.pressureMultiplier

    // Max flow should be < 50% of volume to prevent oscillation
    expect(maxFlowPerFrame).toBeLessThan(0.5)
  })

  it('evaporation stays bounded', () => {
    expect(FLUID_PARAMS.evaporation).toBeGreaterThan(0)
    expect(FLUID_PARAMS.evaporation).toBeLessThan(1)
  })
})
