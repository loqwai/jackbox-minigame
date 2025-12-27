// Paint system logic
import { MAX_PAINT, PAINT_RELOAD_RATE, PAINT_USE_RATE } from '../constants/game.js'
import { COLORS } from '../constants/colors.js'

export const initPaintLevels = () => {
  const levels = {}
  COLORS.forEach(c => { levels[c] = MAX_PAINT })
  return levels
}

export const consumePaint = (levels, color, distance, brushSize) => {
  if (color === '#ffffff') return levels
  const currentLevel = levels[color] ?? MAX_PAINT
  const paintUsed = distance * PAINT_USE_RATE * (brushSize / 10)
  return {
    ...levels,
    [color]: Math.max(0, currentLevel - paintUsed)
  }
}

export const reloadPaint = (levels, deltaTime) => {
  const next = { ...levels }
  let changed = false
  COLORS.forEach(c => {
    if (c === '#ffffff') return
    const current = next[c]
    // Fix NaN or undefined values
    if (current === undefined || Number.isNaN(current)) {
      next[c] = MAX_PAINT
      changed = true
      return
    }
    if (current < MAX_PAINT) {
      next[c] = Math.min(MAX_PAINT, current + PAINT_RELOAD_RATE * deltaTime)
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
