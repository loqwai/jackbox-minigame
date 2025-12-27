// Pickup rendering functions
import { PICKUP_SIZE } from '../constants/game.js'
import { adjustColor } from '../utils/color.js'

export const drawPickup = (ctx, pickup, zoom) => {
  const scaledSize = PICKUP_SIZE / zoom

  // Paint can body gradient
  const canGradient = ctx.createLinearGradient(
    pickup.x - scaledSize, pickup.y,
    pickup.x + scaledSize, pickup.y
  )
  canGradient.addColorStop(0, adjustColor(pickup.color, -30))
  canGradient.addColorStop(0.5, pickup.color)
  canGradient.addColorStop(1, adjustColor(pickup.color, -30))

  // Can body
  ctx.fillStyle = canGradient
  ctx.beginPath()
  ctx.roundRect(
    pickup.x - scaledSize * 0.7,
    pickup.y - scaledSize * 0.5,
    scaledSize * 1.4,
    scaledSize * 1.2,
    scaledSize * 0.2
  )
  ctx.fill()

  // Can rim
  ctx.fillStyle = adjustColor(pickup.color, 40)
  ctx.beginPath()
  ctx.ellipse(pickup.x, pickup.y - scaledSize * 0.5,
    scaledSize * 0.8, scaledSize * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()

  // Paint drip
  ctx.fillStyle = pickup.color
  ctx.beginPath()
  ctx.ellipse(pickup.x + scaledSize * 0.5, pickup.y,
    scaledSize * 0.2, scaledSize * 0.4, 0.3, 0, Math.PI * 2)
  ctx.fill()

  // Sparkle effect
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(pickup.x - scaledSize * 0.3, pickup.y - scaledSize * 0.3,
    scaledSize * 0.15, 0, Math.PI * 2)
  ctx.fill()
}

export const drawPickups = (ctx, pickups, zoom) => {
  pickups.forEach(pickup => drawPickup(ctx, pickup, zoom))
}
