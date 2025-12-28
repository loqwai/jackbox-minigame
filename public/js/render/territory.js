// Territory rendering - draws spread ink with combat effects and paper texture

import { StrokeIntent, FLUID_CONFIG } from '../game/ink-spread.js'

export const drawTerritory = (ctx, sim, view) => {
  const territory = sim.getTerritory()
  if (territory.size === 0) return

  const cellSize = sim.getCellSize()
  const paperTexture = sim.getPaperTexture()

  const colorGroups = new Map()
  territory.forEach((cell, key) => {
    if (!cell.color) return
    if (!colorGroups.has(cell.color)) colorGroups.set(cell.color, [])
    colorGroups.get(cell.color).push({ key, cell })
  })

  colorGroups.forEach((cells, color) => {
    ctx.fillStyle = color

    cells.forEach(({ key, cell }) => {
      const pos = sim.fromGridKey(key)
      const texture = paperTexture.get(key)

      const volume = cell.volume ?? cell.strength ?? 0.5
      const volumeRatio = Math.min(1, volume / FLUID_CONFIG.maxVolume)

      let alpha = 0.25 + volumeRatio * 0.55

      if (cell.intent === StrokeIntent.WALL) alpha = Math.min(0.85, alpha + 0.15)

      if (texture?.contested > 0.5) {
        alpha *= 0.85 + Math.sin(Date.now() / 200 + pos.x + pos.y) * 0.08
      }

      ctx.globalAlpha = alpha

      const sizeMultiplier = 0.85 + volumeRatio * 0.25
      const size = cellSize * sizeMultiplier

      const radius = size * 0.25
      roundedRect(ctx, pos.x - size / 2, pos.y - size / 2, size, size, radius)
      ctx.fill()
    })
  })

  ctx.globalAlpha = 1
}

const roundedRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export const drawParticles = (ctx, sim, view) => {
  // Particles deprecated in fluid mode - volume cells handle spreading visuals
}

// Draw combat effects (sparks, splashes when colors collide)
export const drawCombatEffects = (ctx, sim, view) => {
  const effects = sim.getCombatEffects()
  if (effects.length === 0) return

  effects.forEach(effect => {
    const progress = effect.age  // 0 to 1
    const fadeOut = 1 - progress

    // Splash effect - expanding ring of mixed colors
    const splashRadius = 5 + progress * 20

    // Winner color expanding outward
    ctx.globalAlpha = fadeOut * 0.6 * effect.intensity
    ctx.strokeStyle = effect.winner
    ctx.lineWidth = 3 - progress * 2
    ctx.beginPath()
    ctx.arc(effect.x, effect.y, splashRadius, 0, Math.PI * 2)
    ctx.stroke()

    // Loser color contracting inward
    ctx.globalAlpha = fadeOut * 0.4 * effect.intensity
    ctx.strokeStyle = effect.loser
    ctx.lineWidth = 2 - progress * 1.5
    ctx.beginPath()
    ctx.arc(effect.x, effect.y, splashRadius * 0.5 * fadeOut, 0, Math.PI * 2)
    ctx.stroke()

    // Spark particles
    const numSparks = Math.floor(effect.intensity * 4)
    for (let i = 0; i < numSparks; i++) {
      const angle = (i / numSparks) * Math.PI * 2 + progress * 2
      const sparkDist = splashRadius * (0.5 + progress * 0.5)
      const sparkX = effect.x + Math.cos(angle) * sparkDist
      const sparkY = effect.y + Math.sin(angle) * sparkDist

      ctx.globalAlpha = fadeOut * 0.8
      ctx.fillStyle = i % 2 === 0 ? effect.winner : effect.loser
      ctx.beginPath()
      ctx.arc(sparkX, sparkY, 2 * fadeOut, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  ctx.globalAlpha = 1
}

// Draw paper texture overlay (shows where combat has happened)
export const drawPaperTexture = (ctx, sim, view) => {
  const texture = sim.getPaperTexture()
  if (texture.size === 0) return

  const cellSize = sim.getCellSize()

  texture.forEach((tex, key) => {
    if (tex.contested < 0.3) return  // Only show significant texture

    const pos = sim.fromGridKey(key)

    // Draw contested areas with a rough texture effect
    ctx.globalAlpha = Math.min(0.15, tex.contested * 0.05)
    ctx.fillStyle = '#000000'

    // Noise-like pattern
    const noiseScale = 3
    for (let i = 0; i < 3; i++) {
      const offsetX = Math.sin(pos.x * noiseScale + i) * 2
      const offsetY = Math.cos(pos.y * noiseScale + i) * 2
      ctx.beginPath()
      ctx.arc(pos.x + offsetX, pos.y + offsetY, 1 + tex.contested, 0, Math.PI * 2)
      ctx.fill()
    }
  })

  ctx.globalAlpha = 1
}

// Draw territory borders (edges between different colors)
export const drawTerritoryBorders = (ctx, sim, view) => {
  const territory = sim.getTerritory()
  if (territory.size === 0) return

  const cellSize = sim.getCellSize()
  const borderCells = []

  territory.forEach((cell, key) => {
    if (!cell.color) return

    const pos = sim.fromGridKey(key)
    const gx = Math.floor(pos.x / cellSize)
    const gy = Math.floor(pos.y / cellSize)

    // Check neighbors for different colors
    const neighbors = [
      { key: `${gx - 1},${gy}`, dir: 'left' },
      { key: `${gx + 1},${gy}`, dir: 'right' },
      { key: `${gx},${gy - 1}`, dir: 'up' },
      { key: `${gx},${gy + 1}`, dir: 'down' },
    ]

    neighbors.forEach(n => {
      const neighbor = territory.get(n.key)
      if (neighbor && neighbor.color !== cell.color) {
        borderCells.push({ pos, cell, neighborColor: neighbor.color, dir: n.dir })
      }
    })
  })

  // Draw border effects
  ctx.globalAlpha = 0.6
  borderCells.forEach(({ pos, cell, neighborColor, dir }) => {
    // Gradient between the two colors
    const gradient = ctx.createLinearGradient(
      pos.x - cellSize / 2,
      pos.y - cellSize / 2,
      pos.x + cellSize / 2,
      pos.y + cellSize / 2
    )
    gradient.addColorStop(0, cell.color)
    gradient.addColorStop(1, neighborColor)

    ctx.strokeStyle = gradient
    ctx.lineWidth = 2
    ctx.beginPath()

    switch (dir) {
      case 'left':
        ctx.moveTo(pos.x - cellSize / 2, pos.y - cellSize / 2)
        ctx.lineTo(pos.x - cellSize / 2, pos.y + cellSize / 2)
        break
      case 'right':
        ctx.moveTo(pos.x + cellSize / 2, pos.y - cellSize / 2)
        ctx.lineTo(pos.x + cellSize / 2, pos.y + cellSize / 2)
        break
      case 'up':
        ctx.moveTo(pos.x - cellSize / 2, pos.y - cellSize / 2)
        ctx.lineTo(pos.x + cellSize / 2, pos.y - cellSize / 2)
        break
      case 'down':
        ctx.moveTo(pos.x - cellSize / 2, pos.y + cellSize / 2)
        ctx.lineTo(pos.x + cellSize / 2, pos.y + cellSize / 2)
        break
    }

    ctx.stroke()
  })

  ctx.globalAlpha = 1
}

// Main drawing function - combines all layers
export const drawAllTerritoryEffects = (ctx, sim, view) => {
  drawTerritory(ctx, sim, view)
  drawParticles(ctx, sim, view)
  drawPaperTexture(ctx, sim, view)
  drawCombatEffects(ctx, sim, view)
}

export const drawTerritoryStats = (ctx, sim, x, y) => {
  const stats = sim.getStats()

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.fillRect(x, y, 220, 140)

  ctx.fillStyle = '#ffffff'
  ctx.font = '11px monospace'

  let line = 1
  const lineHeight = 14
  const drawLine = (text) => {
    ctx.fillText(text, x + 8, y + line * lineHeight)
    line++
  }

  drawLine(`Territory: ${stats.territoryCells} cells`)
  drawLine(`Active: ${stats.activeCells || 0} flowing`)
  drawLine(`Total volume: ${(stats.totalVolume || 0).toFixed(1)}`)
  drawLine(`Combat FX: ${stats.combatEffects}`)
  drawLine(`---`)

  for (const [color, count] of Object.entries(stats.colorBreakdown)) {
    ctx.fillStyle = color
    ctx.fillRect(x + 8, y + line * lineHeight - 8, 10, 10)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`${count}`, x + 22, y + line * lineHeight)
    line++
  }

  ctx.restore()
}
