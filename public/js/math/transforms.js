// Coordinate transformation functions
import { MINIMAP_SIZE, MINIMAP_WORLD_RADIUS } from '../constants/game.js'

export const screenToWorld = (screenX, screenY, view) => ({
  x: (screenX - view.panX) / view.zoom,
  y: (screenY - view.panY) / view.zoom
})

export const worldToScreen = (worldX, worldY, view) => ({
  x: worldX * view.zoom + view.panX,
  y: worldY * view.zoom + view.panY
})

export const worldToMinimap = (worldX, worldY, myPos) => {
  const center = MINIMAP_SIZE / 2
  const scale = center / MINIMAP_WORLD_RADIUS
  return {
    x: center + (worldX - myPos.x) * scale,
    y: center + (worldY - myPos.y) * scale
  }
}

export const isInMinimapBounds = (mx, my, margin = 10) =>
  mx >= margin && mx <= MINIMAP_SIZE - margin &&
  my >= margin && my <= MINIMAP_SIZE - margin

export const getArrowIndicator = (worldX, worldY, myPos, color) => {
  const center = MINIMAP_SIZE / 2
  const dx = worldX - myPos.x
  const dy = worldY - myPos.y
  const angle = Math.atan2(dy, dx)
  const edgeMargin = 14
  const radius = center - edgeMargin
  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
    rotation: (angle * 180 / Math.PI) + 90,
    color
  }
}
