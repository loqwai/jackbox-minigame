// Paint system logic
import { MAX_PAINT, PAINT_RELOAD_RATE, PAINT_USE_RATE } from '../constants/game.js'
import { COLORS } from '../constants/colors.js'

export const initPaintLevels = () => {
  const levels = {}
  COLORS.forEach(c => { levels[c] = MAX_PAINT })
  return levels
}

export const consumePaint = (levels, color, distance, brushSize, zoom) => {
  if (color === '#ffffff') return levels
  const screenDist = distance * zoom
  const paintUsed = screenDist * PAINT_USE_RATE * (brushSize / 10)
  return {
    ...levels,
    [color]: Math.max(0, levels[color] - paintUsed)
  }
}

export const reloadPaint = (levels, deltaTime) => {
  const next = { ...levels }
  let changed = false
  COLORS.forEach(c => {
    if (c !== '#ffffff' && next[c] < MAX_PAINT) {
      next[c] = Math.min(MAX_PAINT, next[c] + PAINT_RELOAD_RATE * deltaTime)
      changed = true
    }
  })
  return changed ? next : levels
}

export const refillColor = (levels, color) => ({
  ...levels,
  [color]: MAX_PAINT
})

export const hasPaint = (levels, color) => {
  if (color === '#ffffff') return true
  return (levels[color] || 0) > 0
}

export const getPaintPercent = (levels, color) => {
  if (color === '#ffffff') return 100
  return ((levels[color] || 0) / MAX_PAINT) * 100
}
