// Main canvas rendering orchestrator
import { drawStrokes, drawCurrentStroke } from './strokes.js'
import { drawEnemies } from './enemies.js'
import { drawPickups } from './pickups.js'
import { drawPlayer } from './player.js'
import { drawRemotePlayers } from './remote-players.js'
import { getPeerColor } from '../state/peer-colors.js'

export const renderCanvas = (ctx, canvas, options) => {
  const {
    view,
    strokes,
    currentPoints,
    currentColor,
    brushSize,
    isEraser,
    enemies,
    pickups,
    playerPos,
    isDrawing,
    remoteCursors
  } = options

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)

  // Draw all strokes
  drawStrokes(ctx, strokes)

  // Draw current stroke in progress
  if (currentPoints.length >= 2) {
    const color = isEraser ? '#ffffff' : currentColor
    drawCurrentStroke(ctx, currentPoints, color, brushSize)
  }

  // Draw enemies
  drawEnemies(ctx, enemies, playerPos, view.zoom, currentColor)

  // Draw pickups
  drawPickups(ctx, pickups, view.zoom)

  // Draw remote players
  drawRemotePlayers(ctx, remoteCursors, view.zoom, getPeerColor)

  // Calculate facing angle from last points
  let facingAngle = 0
  if (currentPoints.length >= 2) {
    const p1 = currentPoints[currentPoints.length - 2]
    const p2 = currentPoints[currentPoints.length - 1]
    facingAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
  }

  // Draw local player
  drawPlayer(ctx, playerPos.x, playerPos.y, view.zoom, currentColor, facingAngle, isDrawing && !isEraser)

  ctx.restore()
}
