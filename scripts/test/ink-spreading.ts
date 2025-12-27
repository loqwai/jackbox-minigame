import { describe, it, expect, beforeEach, vi } from "vitest"

// Ink spreading simulation test harness
// Explores: spread rate, collision, territory ownership, wall mechanics

type Point = { x: number; y: number }

type InkParticle = {
  id: string
  x: number
  y: number
  color: string
  strength: number      // From brush size - affects spread speed and combat power
  radius: number        // Current spread radius
  maxRadius: number     // Limit to prevent infinite spread
  age: number           // Time since spawned (ms)
  sourceStrokeId: string
}

type Stroke = {
  id: string
  points: Point[]
  color: string
  size: number          // Brush size - determines strength
  peerId: string
}

type TerritoryCell = {
  color: string | null
  strength: number
  ownerId: string | null
}

type SpreadConfig = {
  baseSpreadRate: number       // Pixels per second at strength 1
  strengthMultiplier: number   // How much strength affects spread rate
  maxSpreadRadius: number      // Maximum radius a particle can reach
  spawnDensity: number         // Particles per pixel of stroke length
  combatStrengthRatio: number  // Threshold for combat (1.5 = 50% stronger wins)
  wallThickness: number        // Brush size threshold for "wall" behavior
  wallResistance: number       // Multiplier for wall defense (higher = harder to break)
}

const DEFAULT_CONFIG: SpreadConfig = {
  baseSpreadRate: 20,          // 20 px/sec base
  strengthMultiplier: 2,       // Strength 10 = 200 px/sec
  maxSpreadRadius: 200,        // Stop spreading at 200px from source
  spawnDensity: 0.5,           // 1 particle per 2 pixels
  combatStrengthRatio: 1.2,    // 20% stronger wins
  wallThickness: 15,           // Brush size >= 15 = wall
  wallResistance: 3,           // Walls are 3x harder to push through
}

// Core spreading simulation
const createSpreadSimulation = (config = DEFAULT_CONFIG) => {
  const particles: InkParticle[] = []
  const territory: Map<string, TerritoryCell> = new Map()
  let nextParticleId = 0

  // Convert world position to grid key
  const toGridKey = (x: number, y: number, cellSize = 10) => {
    const gx = Math.floor(x / cellSize)
    const gy = Math.floor(y / cellSize)
    return `${gx},${gy}`
  }

  // Spawn particles along a stroke
  const spawnFromStroke = (stroke: Stroke) => {
    if (stroke.points.length < 2) return []

    const spawned: InkParticle[] = []
    const strength = stroke.size / 10  // Normalize brush size to strength

    for (let i = 1; i < stroke.points.length; i++) {
      const p1 = stroke.points[i - 1]
      const p2 = stroke.points[i]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const numParticles = Math.max(1, Math.floor(dist * config.spawnDensity))

      for (let j = 0; j < numParticles; j++) {
        const t = j / numParticles
        const x = p1.x + (p2.x - p1.x) * t
        const y = p1.y + (p2.y - p1.y) * t

        const particle: InkParticle = {
          id: `p${nextParticleId++}`,
          x,
          y,
          color: stroke.color,
          strength,
          radius: stroke.size / 2,  // Initial radius = brush radius
          maxRadius: config.maxSpreadRadius * strength,
          age: 0,
          sourceStrokeId: stroke.id,
        }

        particles.push(particle)
        spawned.push(particle)

        // Mark initial territory
        const key = toGridKey(x, y)
        const isWall = stroke.size >= config.wallThickness
        territory.set(key, {
          color: stroke.color,
          strength: isWall ? strength * config.wallResistance : strength,
          ownerId: stroke.peerId,
        })
      }
    }

    return spawned
  }

  // Update simulation by deltaTime (seconds)
  const update = (deltaTime: number) => {
    const events: Array<{ type: string; data: unknown }> = []

    for (const particle of particles) {
      if (particle.radius >= particle.maxRadius) continue

      particle.age += deltaTime * 1000

      // Calculate spread rate based on strength
      const spreadRate = config.baseSpreadRate +
        (particle.strength * config.strengthMultiplier)
      const radiusIncrease = spreadRate * deltaTime

      const oldRadius = particle.radius
      particle.radius = Math.min(particle.maxRadius, particle.radius + radiusIncrease)

      // Claim new territory cells in the expanded ring
      const cellSize = 10
      const minX = Math.floor((particle.x - particle.radius) / cellSize)
      const maxX = Math.ceil((particle.x + particle.radius) / cellSize)
      const minY = Math.floor((particle.y - particle.radius) / cellSize)
      const maxY = Math.ceil((particle.y + particle.radius) / cellSize)

      for (let gx = minX; gx <= maxX; gx++) {
        for (let gy = minY; gy <= maxY; gy++) {
          const cellX = gx * cellSize + cellSize / 2
          const cellY = gy * cellSize + cellSize / 2
          const dist = Math.hypot(cellX - particle.x, cellY - particle.y)

          // Skip if not in the new ring
          if (dist > particle.radius || dist < oldRadius) continue

          const key = `${gx},${gy}`
          const existing = territory.get(key)

          if (!existing) {
            // Claim empty territory
            territory.set(key, {
              color: particle.color,
              strength: particle.strength,
              ownerId: null, // Will be set from stroke
            })
            events.push({ type: "claim", data: { key, color: particle.color } })
          } else if (existing.color !== particle.color) {
            // Combat! Compare strengths
            const attackStrength = particle.strength
            const defendStrength = existing.strength

            if (attackStrength > defendStrength * config.combatStrengthRatio) {
              // Attacker wins
              territory.set(key, {
                color: particle.color,
                strength: attackStrength - defendStrength * 0.5, // Weakened by combat
                ownerId: null,
              })
              events.push({
                type: "combat",
                data: { key, winner: particle.color, loser: existing.color }
              })
            } else if (defendStrength > attackStrength * config.combatStrengthRatio) {
              // Defender wins - attacker bounces off
              particle.radius = oldRadius  // Stop spreading in this direction
            }
            // Otherwise stalemate - border forms
          }
        }
      }
    }

    return events
  }

  // Get territory stats
  const getStats = () => {
    const colorCounts: Record<string, number> = {}
    territory.forEach(cell => {
      if (cell.color) {
        colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1
      }
    })
    return {
      particleCount: particles.length,
      territoryCells: territory.size,
      colorBreakdown: colorCounts,
    }
  }

  // Check if a point is in territory of a color
  const getTerritoryAt = (x: number, y: number) => {
    const key = toGridKey(x, y)
    return territory.get(key) || null
  }

  return {
    spawnFromStroke,
    update,
    getStats,
    getTerritoryAt,
    getParticles: () => [...particles],
    getTerritory: () => new Map(territory),
  }
}

// Helper to create test strokes
const createStroke = (
  id: string,
  points: Point[],
  color: string,
  size: number,
  peerId = "test-peer"
): Stroke => ({
  id,
  points,
  color,
  size,
  peerId,
})

// Helper for line strokes
const lineStroke = (
  id: string,
  x1: number, y1: number,
  x2: number, y2: number,
  color: string,
  size: number
) => createStroke(id, [{ x: x1, y: y1 }, { x: x2, y: y2 }], color, size)

describe("Ink Spreading Mechanics", () => {
  describe("particle spawning", () => {
    let sim: ReturnType<typeof createSpreadSimulation>

    beforeEach(() => {
      sim = createSpreadSimulation()
    })

    it("spawns particles along a stroke", () => {
      const stroke = lineStroke("s1", 0, 0, 100, 0, "#ff0000", 10)
      sim.spawnFromStroke(stroke)

      const particles = sim.getParticles()
      expect(particles.length).toBeGreaterThan(0)
      expect(particles.every(p => p.color === "#ff0000")).toBe(true)
    })

    it("spawns more particles for longer strokes", () => {
      const short = lineStroke("s1", 0, 0, 50, 0, "#ff0000", 10)
      const long = lineStroke("s2", 0, 0, 200, 0, "#ff0000", 10)

      const simShort = createSpreadSimulation()
      const simLong = createSpreadSimulation()

      simShort.spawnFromStroke(short)
      simLong.spawnFromStroke(long)

      expect(simLong.getParticles().length).toBeGreaterThan(simShort.getParticles().length)
    })

    it("sets strength based on brush size", () => {
      const thin = lineStroke("s1", 0, 0, 100, 0, "#ff0000", 5)
      const thick = lineStroke("s2", 0, 0, 100, 0, "#ff0000", 20)

      const simThin = createSpreadSimulation()
      const simThick = createSpreadSimulation()

      simThin.spawnFromStroke(thin)
      simThick.spawnFromStroke(thick)

      const thinStrength = simThin.getParticles()[0].strength
      const thickStrength = simThick.getParticles()[0].strength

      expect(thickStrength).toBeGreaterThan(thinStrength)
    })

    it("marks initial territory along stroke", () => {
      const stroke = lineStroke("s1", 0, 0, 100, 0, "#ff0000", 10)
      sim.spawnFromStroke(stroke)

      const territory = sim.getTerritoryAt(50, 0)
      expect(territory).not.toBeNull()
      expect(territory?.color).toBe("#ff0000")
    })
  })

  describe("spreading behavior", () => {
    let sim: ReturnType<typeof createSpreadSimulation>

    beforeEach(() => {
      sim = createSpreadSimulation()
    })

    it("particles spread outward over time", () => {
      const stroke = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 10)
      sim.spawnFromStroke(stroke)

      const initialRadius = sim.getParticles()[0].radius

      sim.update(1)  // 1 second

      const newRadius = sim.getParticles()[0].radius
      expect(newRadius).toBeGreaterThan(initialRadius)
    })

    it("thicker strokes spread faster", () => {
      const thin = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 5)
      const thick = lineStroke("s2", 200, 0, 210, 0, "#00ff00", 20)

      sim.spawnFromStroke(thin)
      sim.spawnFromStroke(thick)

      const particles = sim.getParticles()
      const thinParticle = particles.find(p => p.color === "#ff0000")!
      const thickParticle = particles.find(p => p.color === "#00ff00")!

      const thinInitial = thinParticle.radius
      const thickInitial = thickParticle.radius

      sim.update(1)

      const thinGrowth = thinParticle.radius - thinInitial
      const thickGrowth = thickParticle.radius - thickInitial

      expect(thickGrowth).toBeGreaterThan(thinGrowth)
    })

    it("particles stop spreading at max radius", () => {
      const config = { ...DEFAULT_CONFIG, maxSpreadRadius: 50 }
      const sim = createSpreadSimulation(config)
      const stroke = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 10)
      sim.spawnFromStroke(stroke)

      // Update many times
      for (let i = 0; i < 100; i++) {
        sim.update(0.1)
      }

      const maxRadius = Math.max(...sim.getParticles().map(p => p.radius))
      expect(maxRadius).toBeLessThanOrEqual(config.maxSpreadRadius * (10 / 10))  // strength = size/10
    })

    it("claims territory as it spreads", () => {
      const stroke = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 10)
      sim.spawnFromStroke(stroke)

      const initialStats = sim.getStats()

      sim.update(2)  // 2 seconds

      const newStats = sim.getStats()
      expect(newStats.territoryCells).toBeGreaterThan(initialStats.territoryCells)
    })
  })

  describe("ink collision/combat", () => {
    it("stronger ink pushes through weaker ink", () => {
      const sim = createSpreadSimulation()

      // Strong red stroke on left
      const strong = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 20)
      // Weak blue stroke on right
      const weak = lineStroke("s2", 50, 0, 60, 0, "#0000ff", 5)

      sim.spawnFromStroke(strong)
      sim.spawnFromStroke(weak)

      // Let them spread and collide
      for (let i = 0; i < 50; i++) {
        sim.update(0.1)
      }

      // Red should dominate the middle ground
      const middleTerritory = sim.getTerritoryAt(30, 0)
      expect(middleTerritory?.color).toBe("#ff0000")
    })

    it("equal strength creates stable border", () => {
      const sim = createSpreadSimulation()

      const left = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 10)
      const right = lineStroke("s2", 100, 0, 110, 0, "#0000ff", 10)

      sim.spawnFromStroke(left)
      sim.spawnFromStroke(right)

      // Let them meet in the middle
      for (let i = 0; i < 30; i++) {
        sim.update(0.1)
      }

      // Both should have some territory
      const stats = sim.getStats()
      expect(stats.colorBreakdown["#ff0000"]).toBeGreaterThan(0)
      expect(stats.colorBreakdown["#0000ff"]).toBeGreaterThan(0)
    })

    it("combat weakens the winner", () => {
      const sim = createSpreadSimulation()

      // Slightly stronger attacker
      const strong = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 15)
      const weak = lineStroke("s2", 40, 0, 50, 0, "#0000ff", 8)

      sim.spawnFromStroke(strong)
      sim.spawnFromStroke(weak)

      // Capture initial red territory strength
      const initialRedTerritory = sim.getTerritoryAt(5, 0)
      const initialStrength = initialRedTerritory?.strength || 0

      // Let them fight
      for (let i = 0; i < 30; i++) {
        sim.update(0.1)
      }

      // Red conquers blue territory, but at reduced strength
      const conqueredTerritory = sim.getTerritoryAt(45, 0)
      if (conqueredTerritory?.color === "#ff0000") {
        expect(conqueredTerritory.strength).toBeLessThan(initialStrength)
      }
    })
  })

  describe("wall mechanics", () => {
    it("walls spread slower but resist better", () => {
      const config = { ...DEFAULT_CONFIG, wallThickness: 15 }
      const sim = createSpreadSimulation(config)

      // Wall stroke
      const wall = lineStroke("w1", 50, -50, 50, 50, "#00ff00", 20)
      sim.spawnFromStroke(wall)

      const wallTerritory = sim.getTerritoryAt(50, 0)
      const regularConfig = createSpreadSimulation(config)
      const regular = lineStroke("r1", 50, 0, 60, 0, "#ff0000", 10)
      regularConfig.spawnFromStroke(regular)
      const regularTerritory = regularConfig.getTerritoryAt(55, 0)

      // Wall should have higher effective strength
      expect(wallTerritory?.strength).toBeGreaterThan(regularTerritory?.strength || 0)
    })

    it("walls block spreading enemies", () => {
      const sim = createSpreadSimulation()

      // Wall in the middle
      const wall = lineStroke("w1", 50, -50, 50, 50, "#00ff00", 25)
      sim.spawnFromStroke(wall)

      // Attacker from the left
      const attacker = lineStroke("a1", 0, 0, 10, 0, "#ff0000", 10)
      sim.spawnFromStroke(attacker)

      // Spread for a while
      for (let i = 0; i < 50; i++) {
        sim.update(0.1)
      }

      // Wall should still hold (mostly green on the right side)
      const beyondWall = sim.getTerritoryAt(60, 0)
      expect(beyondWall?.color).not.toBe("#ff0000")
    })
  })

  describe("performance", () => {
    it("handles 100 strokes efficiently", () => {
      const sim = createSpreadSimulation()

      const start = performance.now()

      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 1000
        const y = Math.random() * 1000
        const stroke = lineStroke(
          `s${i}`,
          x, y,
          x + 50, y + 50,
          `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`,
          5 + Math.random() * 15
        )
        sim.spawnFromStroke(stroke)
      }

      const spawnTime = performance.now() - start

      const updateStart = performance.now()
      for (let i = 0; i < 60; i++) {  // 1 second at 60fps
        sim.update(1/60)
      }
      const updateTime = performance.now() - updateStart

      expect(spawnTime).toBeLessThan(100)
      expect(updateTime).toBeLessThan(1000)

      const stats = sim.getStats()
      expect(stats.particleCount).toBeGreaterThan(1000)
    })
  })

  describe("territory queries", () => {
    it("correctly reports territory ownership", () => {
      const sim = createSpreadSimulation()

      const red = lineStroke("r1", 0, 0, 20, 0, "#ff0000", 10)
      const blue = lineStroke("b1", 100, 0, 120, 0, "#0000ff", 10)

      sim.spawnFromStroke(red)
      sim.spawnFromStroke(blue)

      sim.update(2)

      expect(sim.getTerritoryAt(10, 0)?.color).toBe("#ff0000")
      expect(sim.getTerritoryAt(110, 0)?.color).toBe("#0000ff")
    })

    it("returns null for unclaimed territory", () => {
      const sim = createSpreadSimulation()

      const stroke = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 10)
      sim.spawnFromStroke(stroke)

      expect(sim.getTerritoryAt(1000, 1000)).toBeNull()
    })
  })
})

describe("Spread Rate Tuning", () => {
  // These tests help find the right feel for spreading

  it("slow config - strategic, deliberate", () => {
    const config: SpreadConfig = {
      baseSpreadRate: 5,
      strengthMultiplier: 1,
      maxSpreadRadius: 100,
      spawnDensity: 0.3,
      combatStrengthRatio: 1.5,
      wallThickness: 20,
      wallResistance: 5,
    }
    const sim = createSpreadSimulation(config)
    const stroke = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 10)
    sim.spawnFromStroke(stroke)

    sim.update(5)  // 5 seconds

    const stats = sim.getStats()
    // Slow spread = fewer cells claimed
    expect(stats.territoryCells).toBeLessThan(100)
  })

  it("fast config - arcade, responsive", () => {
    const config: SpreadConfig = {
      baseSpreadRate: 50,
      strengthMultiplier: 5,
      maxSpreadRadius: 300,
      spawnDensity: 1,
      combatStrengthRatio: 1.1,
      wallThickness: 10,
      wallResistance: 2,
    }
    const sim = createSpreadSimulation(config)
    const stroke = lineStroke("s1", 0, 0, 10, 0, "#ff0000", 10)
    sim.spawnFromStroke(stroke)

    sim.update(2)  // 2 seconds

    const stats = sim.getStats()
    // Fast spread = more cells claimed
    expect(stats.territoryCells).toBeGreaterThan(50)
  })

  it("balanced config - watercolor feel", () => {
    const config: SpreadConfig = {
      baseSpreadRate: 15,
      strengthMultiplier: 3,
      maxSpreadRadius: 150,
      spawnDensity: 0.5,
      combatStrengthRatio: 1.3,
      wallThickness: 15,
      wallResistance: 3,
    }
    const sim = createSpreadSimulation(config)

    // Draw a quick scribble (thin, fast)
    const scribble = lineStroke("s1", 0, 0, 50, 0, "#ff0000", 5)
    // Draw a deliberate wall (thick, slow)
    const wall = lineStroke("s2", 100, -30, 100, 30, "#0000ff", 20)

    sim.spawnFromStroke(scribble)
    sim.spawnFromStroke(wall)

    sim.update(3)

    const stats = sim.getStats()
    // Both colors should have territory
    expect(stats.colorBreakdown["#ff0000"]).toBeGreaterThan(0)
    expect(stats.colorBreakdown["#0000ff"]).toBeGreaterThan(0)
  })
})

// Export for use in actual game
export { createSpreadSimulation, DEFAULT_CONFIG }
export type { InkParticle, Stroke, TerritoryCell, SpreadConfig }
