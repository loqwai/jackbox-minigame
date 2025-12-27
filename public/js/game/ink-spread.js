// Ink spreading simulation - the heart of the territory mechanic
// Ink spreads like watercolor, with behavior based on drawing intent
// Combat creates "paper texture" that affects future spreading

import { detectIntent, getIntentSpreadParams, StrokeIntent } from './stroke-intent.js'

export const SPREAD_CONFIG = {
  baseSpreadRate: 25,          // Pixels per second at strength 1
  strengthMultiplier: 3,       // How much strength affects spread rate
  maxSpreadRadius: 180,        // Maximum radius a particle can reach
  spawnDensity: 0.4,           // Particles per pixel of stroke length
  combatStrengthRatio: 1.15,   // 15% stronger wins
  cellSize: 8,                 // Territory grid cell size
  updateInterval: 50,          // Ms between spread updates
  textureDecay: 0.995,         // How fast paper texture fades (per frame)
  maxTexture: 3,               // Maximum texture buildup
}

// Create a new spread simulation instance
export const createSpreadSimulation = (config = SPREAD_CONFIG) => {
  const particles = []
  const territory = new Map()      // "gx,gy" -> { color, strength, ownerId, intent }
  const paperTexture = new Map()   // "gx,gy" -> { saturation, lastColor, contested }
  const combatEffects = []         // Visual effects for rendering
  let nextParticleId = 0

  const toGridKey = (x, y) => {
    const gx = Math.floor(x / config.cellSize)
    const gy = Math.floor(y / config.cellSize)
    return `${gx},${gy}`
  }

  const fromGridKey = (key) => {
    const [gx, gy] = key.split(',').map(Number)
    return {
      x: gx * config.cellSize + config.cellSize / 2,
      y: gy * config.cellSize + config.cellSize / 2
    }
  }

  // Spawn particles along a stroke with intent detection
  const spawnFromStroke = (stroke, strokeId) => {
    if (!stroke.points || stroke.points.length < 2) return []
    if (stroke.color === '#ffffff') return []

    // Detect drawing intent
    const { intent, confidence } = detectIntent(stroke)
    const intentParams = getIntentSpreadParams(intent, confidence)

    const spawned = []
    const baseStrength = stroke.size / 10
    const strength = baseStrength * intentParams.resistance

    for (let i = 1; i < stroke.points.length; i++) {
      const p1 = stroke.points[i - 1]
      const p2 = stroke.points[i]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const numParticles = Math.max(1, Math.floor(dist * config.spawnDensity))

      for (let j = 0; j < numParticles; j++) {
        const t = j / numParticles
        const x = p1.x + (p2.x - p1.x) * t
        const y = p1.y + (p2.y - p1.y) * t

        const particle = {
          id: `p${nextParticleId++}`,
          x,
          y,
          color: stroke.color,
          strength,
          baseStrength,
          radius: stroke.size / 2,
          maxRadius: config.maxSpreadRadius * Math.sqrt(baseStrength) * intentParams.maxRadius,
          age: 0,
          sourceStrokeId: strokeId,
          intent,
          intentParams,
          // For directional spreading (attacks go forward)
          direction: i > 0 ? Math.atan2(p2.y - p1.y, p2.x - p1.x) : 0,
          blocked: new Set(),  // Directions blocked by combat
        }

        particles.push(particle)
        spawned.push(particle)

        // Mark initial territory
        const key = toGridKey(x, y)
        const existingCell = territory.get(key)

        if (!existingCell || strength > existingCell.strength) {
          territory.set(key, {
            color: stroke.color,
            strength,
            ownerId: stroke.peerId || null,
            intent,
          })

          // Add to paper texture
          const texture = paperTexture.get(key) || { saturation: 0, contested: 0 }
          texture.saturation = Math.min(config.maxTexture, texture.saturation + 0.5)
          texture.lastColor = stroke.color
          paperTexture.set(key, texture)
        }
      }
    }

    return spawned
  }

  // Update simulation by deltaTime (seconds)
  const update = (deltaTime) => {
    const events = []

    // Decay paper texture over time
    paperTexture.forEach((texture, key) => {
      texture.saturation *= config.textureDecay
      texture.contested *= config.textureDecay
      if (texture.saturation < 0.01 && texture.contested < 0.01) {
        paperTexture.delete(key)
      }
    })

    // Age out old combat effects
    for (let i = combatEffects.length - 1; i >= 0; i--) {
      combatEffects[i].age += deltaTime
      if (combatEffects[i].age > 1) {
        combatEffects.splice(i, 1)
      }
    }

    for (const particle of particles) {
      if (particle.radius >= particle.maxRadius) continue

      particle.age += deltaTime * 1000

      // Spread rate based on intent
      const spreadRate = (config.baseSpreadRate + particle.baseStrength * config.strengthMultiplier)
        * particle.intentParams.spreadRate
      const radiusIncrease = spreadRate * deltaTime

      const oldRadius = particle.radius
      particle.radius = Math.min(particle.maxRadius, particle.radius + radiusIncrease)

      // Claim new territory in expanded ring
      const minGx = Math.floor((particle.x - particle.radius) / config.cellSize)
      const maxGx = Math.ceil((particle.x + particle.radius) / config.cellSize)
      const minGy = Math.floor((particle.y - particle.radius) / config.cellSize)
      const maxGy = Math.ceil((particle.y + particle.radius) / config.cellSize)

      for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gy = minGy; gy <= maxGy; gy++) {
          const cellX = gx * config.cellSize + config.cellSize / 2
          const cellY = gy * config.cellSize + config.cellSize / 2
          const dist = Math.hypot(cellX - particle.x, cellY - particle.y)

          // Skip if outside current radius or inside old radius
          if (dist > particle.radius || dist <= oldRadius - config.cellSize) continue

          // Check if this direction is blocked
          const cellAngle = Math.atan2(cellY - particle.y, cellX - particle.x)
          const angleKey = Math.floor((cellAngle + Math.PI) / (Math.PI / 4))
          if (particle.blocked.has(angleKey)) continue

          const key = `${gx},${gy}`
          const existing = territory.get(key)
          const texture = paperTexture.get(key) || { saturation: 0, contested: 0 }

          // Paper texture makes it harder to claim contested ground
          const textureResistance = 1 + texture.contested * 0.5
          const attackStrength = particle.strength * particle.intentParams.combatBonus / textureResistance

          if (!existing) {
            // Claim empty territory - but texture still matters
            const claimStrength = attackStrength / (1 + texture.saturation * 0.2)
            territory.set(key, {
              color: particle.color,
              strength: claimStrength,
              ownerId: null,
              intent: particle.intent,
            })
            texture.saturation = Math.min(config.maxTexture, texture.saturation + 0.3)
            texture.lastColor = particle.color
            paperTexture.set(key, texture)
            events.push({ type: 'claim', key, color: particle.color, x: cellX, y: cellY })

          } else if (existing.color !== particle.color) {
            // Combat!
            const defenseStrength = existing.strength * (1 + texture.saturation * 0.3)

            if (attackStrength > defenseStrength * config.combatStrengthRatio) {
              // Attacker wins - but weakened
              const newStrength = Math.max(0.1, attackStrength - defenseStrength * 0.6)
              territory.set(key, {
                color: particle.color,
                strength: newStrength,
                ownerId: null,
                intent: particle.intent,
              })

              // Combat damages the paper - future claims are harder
              texture.contested = Math.min(config.maxTexture, texture.contested + 1)
              texture.saturation = Math.min(config.maxTexture, texture.saturation + 0.5)
              texture.lastColor = particle.color
              paperTexture.set(key, texture)

              // Add combat effect for rendering
              combatEffects.push({
                x: cellX,
                y: cellY,
                winner: particle.color,
                loser: existing.color,
                intensity: Math.min(1, attackStrength / 2),
                age: 0,
              })

              events.push({
                type: 'combat',
                key,
                winner: particle.color,
                loser: existing.color,
                x: cellX,
                y: cellY,
              })

            } else if (defenseStrength > attackStrength * config.combatStrengthRatio) {
              // Defender wins - block this direction, spread sideways
              particle.blocked.add(angleKey)

              // Increase texture where blocked
              texture.contested = Math.min(config.maxTexture, texture.contested + 0.5)
              paperTexture.set(key, texture)

              events.push({
                type: 'blocked',
                key,
                attacker: particle.color,
                defender: existing.color,
                x: cellX,
                y: cellY,
              })

            } else {
              // Stalemate - both colors push but neither wins
              // Creates a contested border
              texture.contested = Math.min(config.maxTexture, texture.contested + 0.3)
              paperTexture.set(key, texture)

              events.push({
                type: 'stalemate',
                key,
                colors: [particle.color, existing.color],
                x: cellX,
                y: cellY,
              })
            }
          }
        }
      }
    }

    return events
  }

  // Prune dead particles
  const prune = () => {
    let pruned = 0
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].radius >= particles[i].maxRadius) {
        particles.splice(i, 1)
        pruned++
      }
    }
    return pruned
  }

  const getTerritoryAt = (x, y) => {
    const key = toGridKey(x, y)
    return territory.get(key) || null
  }

  const getTextureAt = (x, y) => {
    const key = toGridKey(x, y)
    return paperTexture.get(key) || null
  }

  const serializeTerritory = () => {
    const result = {}
    territory.forEach((cell, key) => {
      result[key] = cell
    })
    return result
  }

  const loadTerritory = (serialized) => {
    territory.clear()
    for (const [key, cell] of Object.entries(serialized)) {
      territory.set(key, cell)
    }
  }

  const getStats = () => {
    const colorCounts = {}
    const intentCounts = {}
    territory.forEach(cell => {
      if (cell.color) {
        colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1
      }
      if (cell.intent) {
        intentCounts[cell.intent] = (intentCounts[cell.intent] || 0) + 1
      }
    })
    return {
      particleCount: particles.length,
      activeParticles: particles.filter(p => p.radius < p.maxRadius).length,
      territoryCells: territory.size,
      textureCells: paperTexture.size,
      colorBreakdown: colorCounts,
      intentBreakdown: intentCounts,
      combatEffects: combatEffects.length,
    }
  }

  const eraseAt = (x, y, radius) => {
    const erased = []
    const minGx = Math.floor((x - radius) / config.cellSize)
    const maxGx = Math.ceil((x + radius) / config.cellSize)
    const minGy = Math.floor((y - radius) / config.cellSize)
    const maxGy = Math.ceil((y + radius) / config.cellSize)

    for (let gx = minGx; gx <= maxGx; gx++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        const cellX = gx * config.cellSize + config.cellSize / 2
        const cellY = gy * config.cellSize + config.cellSize / 2
        const dist = Math.hypot(cellX - x, cellY - y)

        if (dist <= radius) {
          const key = `${gx},${gy}`
          if (territory.has(key)) {
            erased.push(key)
            territory.delete(key)
          }
          // Erasing also clears texture
          paperTexture.delete(key)
        }
      }
    }

    return erased
  }

  return {
    spawnFromStroke,
    update,
    prune,
    getTerritoryAt,
    getTextureAt,
    serializeTerritory,
    loadTerritory,
    getStats,
    eraseAt,
    getParticles: () => particles,
    getTerritory: () => territory,
    getPaperTexture: () => paperTexture,
    getCombatEffects: () => combatEffects,
    getCellSize: () => config.cellSize,
    fromGridKey,
  }
}

// Process eraser strokes to clear territory
export const processEraserStroke = (sim, stroke) => {
  if (stroke.color !== '#ffffff') return []

  const erased = []
  for (let i = 0; i < stroke.points.length; i++) {
    const p = stroke.points[i]
    const keys = sim.eraseAt(p.x, p.y, stroke.size / 2)
    erased.push(...keys)
  }
  return erased
}

export { StrokeIntent }
