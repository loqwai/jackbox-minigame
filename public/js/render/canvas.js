// Main canvas rendering orchestrator
import { drawStrokes, drawCurrentStroke } from './strokes.js'
import { drawEnemies } from './enemies.js'
import { drawPickups } from './pickups.js'
import { drawPlayer } from './player.js'
import { drawRemotePlayers } from './remote-players.js'
import { getPeerColor } from '../state/peer-colors.js'
import { drawAllTerritoryEffects } from './territory.js'

// Renaissance-style graph paper background
const drawGraphPaperBackground = (ctx, canvas, view) => {
  // Warm parchment base color
  ctx.fillStyle = '#fdf8f3'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Calculate grid parameters in world space
  const gridSize = 50  // Base grid spacing in world units
  const subGridSize = 10  // Minor grid spacing

  // Transform to world coordinates
  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)

  // Calculate visible world bounds
  const worldLeft = -view.panX / view.zoom
  const worldTop = -view.panY / view.zoom
  const worldRight = worldLeft + canvas.width / view.zoom
  const worldBottom = worldTop + canvas.height / view.zoom

  // Snap to grid
  const startX = Math.floor(worldLeft / subGridSize) * subGridSize
  const startY = Math.floor(worldTop / subGridSize) * subGridSize
  const endX = Math.ceil(worldRight / subGridSize) * subGridSize
  const endY = Math.ceil(worldBottom / subGridSize) * subGridSize

  // Minor grid lines - very subtle
  ctx.strokeStyle = 'rgba(220, 180, 140, 0.15)'
  ctx.lineWidth = 0.5 / view.zoom
  ctx.beginPath()

  for (let x = startX; x <= endX; x += subGridSize) {
    if (x % gridSize === 0) continue  // Skip major lines
    ctx.moveTo(x, worldTop)
    ctx.lineTo(x, worldBottom)
  }
  for (let y = startY; y <= endY; y += subGridSize) {
    if (y % gridSize === 0) continue
    ctx.moveTo(worldLeft, y)
    ctx.lineTo(worldRight, y)
  }
  ctx.stroke()

  // Major grid lines - slightly more visible
  ctx.strokeStyle = 'rgba(200, 150, 100, 0.25)'
  ctx.lineWidth = 1 / view.zoom
  ctx.beginPath()

  const majorStartX = Math.floor(worldLeft / gridSize) * gridSize
  const majorStartY = Math.floor(worldTop / gridSize) * gridSize

  for (let x = majorStartX; x <= endX; x += gridSize) {
    ctx.moveTo(x, worldTop)
    ctx.lineTo(x, worldBottom)
  }
  for (let y = majorStartY; y <= endY; y += gridSize) {
    ctx.moveTo(worldLeft, y)
    ctx.lineTo(worldRight, y)
  }
  ctx.stroke()

  // Origin cross - subtle compass rose hint
  if (worldLeft < 0 && worldRight > 0 && worldTop < 0 && worldBottom > 0) {
    ctx.strokeStyle = 'rgba(180, 120, 80, 0.4)'
    ctx.lineWidth = 2 / view.zoom
    ctx.beginPath()
    ctx.moveTo(0, worldTop)
    ctx.lineTo(0, worldBottom)
    ctx.moveTo(worldLeft, 0)
    ctx.lineTo(worldRight, 0)
    ctx.stroke()

    // Origin marker - small compass rose
    const roseSize = 20
    ctx.fillStyle = 'rgba(180, 120, 80, 0.3)'
    ctx.beginPath()
    ctx.moveTo(0, -roseSize)
    ctx.lineTo(roseSize / 3, 0)
    ctx.lineTo(0, roseSize)
    ctx.lineTo(-roseSize / 3, 0)
    ctx.closePath()
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(-roseSize, 0)
    ctx.lineTo(0, -roseSize / 3)
    ctx.lineTo(roseSize, 0)
    ctx.lineTo(0, roseSize / 3)
    ctx.closePath()
    ctx.fill()
  }

  // Subtle parchment texture noise (only if zoomed in enough)
  if (view.zoom > 0.5) {
    ctx.globalAlpha = 0.02
    const noiseSpacing = 20
    ctx.fillStyle = '#8b7355'

    for (let x = startX; x <= endX; x += noiseSpacing) {
      for (let y = startY; y <= endY; y += noiseSpacing) {
        // Pseudo-random based on position
        const noise = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.5 + 0.5
        if (noise > 0.6) {
          ctx.beginPath()
          ctx.arc(x + noise * 5, y + noise * 5, 1 + noise, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

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
    remoteCursors,
    spreadSim
  } = options

  // Draw renaissance-style graph paper background
  drawGraphPaperBackground(ctx, canvas, view)

  ctx.save()
  ctx.translate(view.panX, view.panY)
  ctx.scale(view.zoom, view.zoom)

  // Draw territory (spreading ink) with combat effects
  if (spreadSim) {
    drawAllTerritoryEffects(ctx, spreadSim, view)
  }

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
