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

// Fluid simulation config - Worldbox-style water physics (top-down, no gravity)
export const FLUID_CONFIG = {
  maxVolume: 1.0,              // Normal cell capacity
  minVolume: 0.001,            // Below this = empty
  compression: 0.8,            // Extra volume allowed under pressure (against walls)
  flowRate: 0.12,              // Max volume transferred per tick
  surfaceTension: 0.06,        // Min volume diff to trigger flow
  settleThreshold: 0.002,      // Volume change below which cell is "settled"
  blobAttractionRadius: 6,     // Cells to search for blob center
  blobAttractionStrength: 0.04, // How strongly isolated cells attract to blobs
  sourceDecay: 0.997,          // How fast "source" cells lose their generating power
  sourceStrength: 0.02,        // Volume generated per tick by source cells
  pressureMultiplier: 1.5,     // Extra flow rate when blocked by walls
}

// Create a new spread simulation instance
export const createSpreadSimulation = (config = SPREAD_CONFIG, fluidConfig = FLUID_CONFIG) => {
  const particles = []             // Keep for backwards compat, but unused in fluid mode
  const territory = new Map()      // "gx,gy" -> { color, volume, strength, ownerId, intent, settled }
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

  const parseGridKey = (key) => {
    const [gx, gy] = key.split(',').map(Number)
    return { gx, gy }
  }

  // Get all 4-connected neighbors (not diagonals for flow)
  const getNeighbors = (gx, gy) => [
    { gx: gx, gy: gy - 1, key: `${gx},${gy - 1}`, dy: -1, dx: 0 },     // up
    { gx: gx, gy: gy + 1, key: `${gx},${gy + 1}`, dy: 1, dx: 0 },      // down
    { gx: gx - 1, gy: gy, key: `${gx - 1},${gy}`, dy: 0, dx: -1 },     // left
    { gx: gx + 1, gy: gy, key: `${gx + 1},${gy}`, dy: 0, dx: 1 },      // right
  ]

  // Add ink volume to a cell - handles combat if different color
  const addInkVolume = (gx, gy, volumeToAdd, color, ownerId, intentParams) => {
    const key = `${gx},${gy}`
    const existing = territory.get(key)
    const texture = paperTexture.get(key) || { saturation: 0, contested: 0 }

    if (!existing) {
      territory.set(key, {
        color,
        volume: volumeToAdd,
        strength: volumeToAdd,
        ownerId,
        intent: intentParams?.intent || 'TERRITORY',
        settled: false,
        source: 1.0,
        pressure: 0,
      })
      texture.saturation = Math.min(config.maxTexture, texture.saturation + 0.3)
      texture.lastColor = color
      paperTexture.set(key, texture)
      return true
    }

    if (existing.color === color) {
      const maxVol = fluidConfig.maxVolume * (1 + fluidConfig.compression)
      existing.volume = Math.min(maxVol, existing.volume + volumeToAdd)
      existing.strength = existing.volume
      existing.settled = false
      existing.source = Math.min(1, (existing.source || 0) + 0.5)
      return true
    }

    // Different color - combat!
    const combatBonus = intentParams?.combatBonus || 1
    const textureResistance = 1 + texture.contested * 0.5
    const attackStrength = volumeToAdd * combatBonus / textureResistance
    const defenseStrength = existing.volume * (1 + texture.saturation * 0.3)

    if (attackStrength > defenseStrength * config.combatStrengthRatio) {
      const stolen = Math.min(existing.volume * 0.3, volumeToAdd)
      const newVolume = Math.max(0.1, attackStrength - defenseStrength * 0.4 + stolen * 0.5)

      territory.set(key, {
        color,
        volume: newVolume,
        strength: newVolume,
        ownerId,
        intent: intentParams?.intent || 'TERRITORY',
        settled: false,
        source: 0.3,
        pressure: 0,
      })

      texture.contested = Math.min(config.maxTexture, texture.contested + 1)
      texture.saturation = Math.min(config.maxTexture, texture.saturation + 0.5)
      texture.lastColor = color
      paperTexture.set(key, texture)

      const pos = fromGridKey(key)
      combatEffects.push({
        x: pos.x,
        y: pos.y,
        winner: color,
        loser: existing.color,
        intensity: Math.min(1, attackStrength / 2),
        age: 0,
      })

      return true
    }

    // Defender wins or stalemate
    texture.contested = Math.min(config.maxTexture, texture.contested + 0.3)
    paperTexture.set(key, texture)
    return false
  }

  // Pour ink from stroke - replaces particle spawning
  const spawnFromStroke = (stroke, strokeId) => {
    if (!stroke.points || stroke.points.length < 2) return []
    if (stroke.color === '#ffffff') return []

    // Detect drawing intent
    const { intent, confidence } = detectIntent(stroke)
    const intentParams = getIntentSpreadParams(intent, confidence)

    const baseVolume = (stroke.size / 10) * intentParams.resistance
    const affectedCells = new Set()

    for (let i = 1; i < stroke.points.length; i++) {
      const p1 = stroke.points[i - 1]
      const p2 = stroke.points[i]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const steps = Math.max(1, Math.floor(dist / (config.cellSize * 0.5)))

      for (let j = 0; j <= steps; j++) {
        const t = j / steps
        const x = p1.x + (p2.x - p1.x) * t
        const y = p1.y + (p2.y - p1.y) * t
        const gx = Math.floor(x / config.cellSize)
        const gy = Math.floor(y / config.cellSize)
        const key = `${gx},${gy}`

        // Pour volume into this cell (spread across stroke length)
        const volumePerStep = baseVolume / steps
        addInkVolume(gx, gy, volumePerStep, stroke.color, stroke.peerId || null, { ...intentParams, intent })
        affectedCells.add(key)

        // Also affect brush radius for thicker strokes
        if (stroke.size > config.cellSize) {
          const brushRadius = Math.floor(stroke.size / config.cellSize / 2)
          for (let dx = -brushRadius; dx <= brushRadius; dx++) {
            for (let dy = -brushRadius; dy <= brushRadius; dy++) {
              if (dx === 0 && dy === 0) continue
              if (Math.hypot(dx, dy) > brushRadius) continue
              const nkey = `${gx + dx},${gy + dy}`
              const falloff = 1 - Math.hypot(dx, dy) / (brushRadius + 1)
              addInkVolume(gx + dx, gy + dy, volumePerStep * falloff * 0.5, stroke.color, stroke.peerId || null, { ...intentParams, intent })
              affectedCells.add(nkey)
            }
          }
        }
      }
    }

    return Array.from(affectedCells)
  }

  const update = (deltaTime) => {
    const events = []

    paperTexture.forEach((texture, key) => {
      texture.saturation *= config.textureDecay
      texture.contested *= config.textureDecay
      if (texture.saturation < 0.01 && texture.contested < 0.01) paperTexture.delete(key)
    })

    for (let i = combatEffects.length - 1; i >= 0; i--) {
      combatEffects[i].age += deltaTime
      if (combatEffects[i].age > 1) combatEffects.splice(i, 1)
    }

    simulateFlow(deltaTime, events)
    applySurfaceTension(deltaTime)
    cleanupEmptyCells()

    return events
  }

  const simulateFlow = (deltaTime, events) => {
    const flowUpdates = []
    const volumeSnapshot = new Map()
    const dt = deltaTime * 60

    territory.forEach((cell, key) => {
      volumeSnapshot.set(key, cell.volume)

      if (cell.source > fluidConfig.minVolume) {
        cell.volume += cell.source * fluidConfig.sourceStrength * dt
        cell.source *= fluidConfig.sourceDecay
        cell.settled = false
      }
    })

    territory.forEach((cell, key) => {
      if (cell.settled && cell.source < fluidConfig.minVolume) return
      if (cell.volume < fluidConfig.minVolume) return

      const { gx, gy } = parseGridKey(key)
      const neighbors = getNeighbors(gx, gy)

      let blockedCount = 0
      const openNeighbors = []

      neighbors.forEach(n => {
        const nCell = territory.get(n.key)
        if (nCell && nCell.color !== cell.color) {
          blockedCount++
          return
        }
        openNeighbors.push({ ...n, cell: nCell })
      })

      cell.pressure = blockedCount > 0 ? Math.min(1, cell.pressure + blockedCount * 0.1 * dt) : cell.pressure * 0.95

      const pressureBoost = 1 + cell.pressure * (fluidConfig.pressureMultiplier - 1)
      const flowPerNeighbor = fluidConfig.flowRate * dt * pressureBoost / Math.max(1, openNeighbors.length)

      openNeighbors.forEach(n => {
        const nVolume = n.cell?.volume ?? 0
        const diff = cell.volume - nVolume

        if (diff <= fluidConfig.surfaceTension) return

        const toFlow = Math.min(diff * 0.3 * pressureBoost, flowPerNeighbor)
        if (toFlow > fluidConfig.minVolume) {
          flowUpdates.push({ from: key, to: n.key, amount: toFlow, color: cell.color, ownerId: cell.ownerId })
        }
      })
    })

    flowUpdates.forEach(({ from, to, amount, color, ownerId }) => {
      const fromCell = territory.get(from)
      if (!fromCell) return
      if (fromCell.volume < amount) amount = fromCell.volume

      fromCell.volume -= amount
      fromCell.strength = fromCell.volume
      fromCell.settled = false

      const toCell = territory.get(to)
      if (toCell) {
        toCell.volume += amount
        toCell.strength = toCell.volume
        toCell.settled = false
        return
      }

      territory.set(to, {
        color,
        volume: amount,
        strength: amount,
        ownerId,
        intent: 'TERRITORY',
        settled: false,
        source: 0,
        pressure: 0,
      })
    })

    territory.forEach((cell, key) => {
      const prevVolume = volumeSnapshot.get(key) ?? 0
      if (cell.source < fluidConfig.minVolume) {
        cell.settled = Math.abs(prevVolume - cell.volume) < fluidConfig.settleThreshold
      }
    })
  }

  const applySurfaceTension = (deltaTime) => {
    const attractions = []

    territory.forEach((cell, key) => {
      if (cell.volume < fluidConfig.minVolume * 10) return

      const { gx, gy } = parseGridKey(key)
      const neighbors = getNeighbors(gx, gy)
      const sameColorCount = neighbors.filter(n => {
        const nc = territory.get(n.key)
        return nc?.color === cell.color
      }).length

      if (sameColorCount >= 2) return

      const blobCenter = findNearestBlobCenter(gx, gy, cell.color)
      if (!blobCenter) return

      const dx = Math.sign(blobCenter.gx - gx)
      const dy = Math.sign(blobCenter.gy - gy)
      if (dx === 0 && dy === 0) return

      const targetKey = `${gx + dx},${gy + dy}`
      const targetCell = territory.get(targetKey)
      if (targetCell && targetCell.color !== cell.color) return

      const toFlow = cell.volume * fluidConfig.blobAttractionStrength * deltaTime * 60
      if (toFlow > fluidConfig.minVolume) {
        attractions.push({ from: key, to: targetKey, amount: toFlow, color: cell.color, ownerId: cell.ownerId })
      }
    })

    attractions.forEach(({ from, to, amount, color, ownerId }) => {
      const fromCell = territory.get(from)
      if (!fromCell) return

      fromCell.volume -= amount
      fromCell.strength = fromCell.volume
      fromCell.settled = false

      const toCell = territory.get(to)
      if (toCell) {
        toCell.volume += amount
        toCell.strength = toCell.volume
        toCell.settled = false
        return
      }

      territory.set(to, {
        color,
        volume: amount,
        strength: amount,
        ownerId,
        intent: 'TERRITORY',
        settled: false,
      })
    })
  }

  const findNearestBlobCenter = (gx, gy, color) => {
    const radius = fluidConfig.blobAttractionRadius
    let totalX = 0
    let totalY = 0
    let totalVolume = 0

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx === 0 && dy === 0) continue
        const key = `${gx + dx},${gy + dy}`
        const cell = territory.get(key)
        if (!cell || cell.color !== color) continue

        totalX += (gx + dx) * cell.volume
        totalY += (gy + dy) * cell.volume
        totalVolume += cell.volume
      }
    }

    if (totalVolume < fluidConfig.minVolume * 5) return null

    return {
      gx: Math.round(totalX / totalVolume),
      gy: Math.round(totalY / totalVolume),
    }
  }

  const cleanupEmptyCells = () => {
    const toDelete = []
    territory.forEach((cell, key) => {
      if (cell.volume < fluidConfig.minVolume) toDelete.push(key)
    })
    toDelete.forEach(key => territory.delete(key))
  }

  const prune = () => 0

  const getTerritoryAt = (x, y) => territory.get(toGridKey(x, y)) || null

  const getTextureAt = (x, y) => paperTexture.get(toGridKey(x, y)) || null

  const serializeTerritory = () => {
    const result = {}
    territory.forEach((cell, key) => { result[key] = cell })
    return result
  }

  const loadTerritory = (serialized) => {
    territory.clear()
    Object.entries(serialized).forEach(([key, cell]) => territory.set(key, cell))
  }

  const getStats = () => {
    const colorCounts = {}
    const intentCounts = {}
    let totalVolume = 0
    let activeCells = 0

    territory.forEach(cell => {
      if (cell.color) colorCounts[cell.color] = (colorCounts[cell.color] || 0) + 1
      if (cell.intent) intentCounts[cell.intent] = (intentCounts[cell.intent] || 0) + 1
      totalVolume += cell.volume || 0
      if (!cell.settled) activeCells++
    })

    return {
      territoryCells: territory.size,
      activeCells,
      totalVolume,
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
