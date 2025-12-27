// Player (squid) rendering functions
import { adjustColor } from '../utils/color.js'

export const drawPlayer = (ctx, x, y, zoom, color, facingAngle, isDrawing) => {
  const playerSize = 20 / zoom
  const playerColor = color === '#ffffff' ? '#e94560' : color

  // Squid body gradient
  const bodyGradient = ctx.createRadialGradient(
    x, y - playerSize * 0.2, 0,
    x, y, playerSize * 1.2
  )
  bodyGradient.addColorStop(0, adjustColor(playerColor, 50))
  bodyGradient.addColorStop(0.6, playerColor)
  bodyGradient.addColorStop(1, adjustColor(playerColor, -40))

  ctx.fillStyle = bodyGradient
  ctx.beginPath()
  ctx.ellipse(x, y, playerSize * 0.9, playerSize * 1.1, 0, 0, Math.PI * 2)
  ctx.fill()

  // Tentacles
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 0.3) + (i / 5) * (Math.PI * 0.4)
    const wobble = Math.sin(Date.now() / 150 + i) * playerSize * 0.15
    const tentacleLen = playerSize * 0.8

    const startX = x + Math.cos(angle + Math.PI * 0.5) * playerSize * 0.5
    const startY = y + playerSize * 0.7
    const endX = startX + Math.cos(angle + Math.PI * 0.5) * tentacleLen + wobble
    const endY = startY + Math.sin(Math.PI * 0.5) * tentacleLen

    ctx.strokeStyle = playerColor
    ctx.lineWidth = playerSize * 0.15
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.quadraticCurveTo(startX + wobble * 0.5, startY + tentacleLen * 0.5, endX, endY)
    ctx.stroke()
  }

  // Eyes
  const eyeOffsetX = playerSize * 0.3
  const eyeOffsetY = -playerSize * 0.1
  const eyeSize = playerSize * 0.35

  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.ellipse(x - eyeOffsetX, y + eyeOffsetY, eyeSize, eyeSize * 1.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x + eyeOffsetX, y + eyeOffsetY, eyeSize, eyeSize * 1.2, 0, 0, Math.PI * 2)
  ctx.fill()

  // Pupils
  const pupilOffset = eyeSize * 0.25
  const pupilX = Math.cos(facingAngle) * pupilOffset
  const pupilY = Math.sin(facingAngle) * pupilOffset
  const pupilSize = eyeSize * 0.5

  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(x - eyeOffsetX + pupilX, y + eyeOffsetY + pupilY, pupilSize, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + eyeOffsetX + pupilX, y + eyeOffsetY + pupilY, pupilSize, 0, Math.PI * 2)
  ctx.fill()

  // Eye highlights
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.arc(x - eyeOffsetX - pupilSize * 0.3, y + eyeOffsetY - pupilSize * 0.3, pupilSize * 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + eyeOffsetX - pupilSize * 0.3, y + eyeOffsetY - pupilSize * 0.3, pupilSize * 0.4, 0, Math.PI * 2)
  ctx.fill()

  // Ink splatter when drawing
  if (isDrawing) {
    for (let i = 0; i < 5; i++) {
      const spreadAngle = facingAngle + (Math.random() - 0.5) * 1.2
      const spreadDist = playerSize * (1.5 + Math.random() * 2)
      const spotX = x + Math.cos(spreadAngle) * spreadDist
      const spotY = y + Math.sin(spreadAngle) * spreadDist
      const spotSize = playerSize * (0.1 + Math.random() * 0.2)

      ctx.fillStyle = playerColor
      ctx.globalAlpha = 0.3 + Math.random() * 0.4
      ctx.beginPath()
      ctx.arc(spotX, spotY, spotSize, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // Top of head (pointy squid top)
  ctx.fillStyle = playerColor
  ctx.beginPath()
  ctx.moveTo(x, y - playerSize * 1.4)
  ctx.lineTo(x - playerSize * 0.3, y - playerSize * 0.5)
  ctx.lineTo(x + playerSize * 0.3, y - playerSize * 0.5)
  ctx.closePath()
  ctx.fill()
}
