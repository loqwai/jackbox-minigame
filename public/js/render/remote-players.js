// Remote player rendering functions
import { adjustColor } from '../utils/color.js'

export const drawRemotePlayer = (ctx, x, y, zoom, color, peerId) => {
  const remoteSize = 18 / zoom

  // Squid body gradient
  const remoteGradient = ctx.createRadialGradient(
    x, y - remoteSize * 0.2, 0,
    x, y, remoteSize * 1.2
  )
  remoteGradient.addColorStop(0, adjustColor(color, 50))
  remoteGradient.addColorStop(0.6, color)
  remoteGradient.addColorStop(1, adjustColor(color, -40))

  ctx.fillStyle = remoteGradient
  ctx.beginPath()
  ctx.ellipse(x, y, remoteSize * 0.9, remoteSize * 1.1, 0, 0, Math.PI * 2)
  ctx.fill()

  // Tentacles
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 0.3) + (i / 5) * (Math.PI * 0.4)
    const wobble = Math.sin(Date.now() / 150 + i + (peerId?.charCodeAt(0) || 0)) * remoteSize * 0.15
    const tentacleLen = remoteSize * 0.8

    const startX = x + Math.cos(angle + Math.PI * 0.5) * remoteSize * 0.5
    const startY = y + remoteSize * 0.7
    const endX = startX + Math.cos(angle + Math.PI * 0.5) * tentacleLen + wobble
    const endY = startY + Math.sin(Math.PI * 0.5) * tentacleLen

    ctx.strokeStyle = color
    ctx.lineWidth = remoteSize * 0.15
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.quadraticCurveTo(startX + wobble * 0.5, startY + tentacleLen * 0.5, endX, endY)
    ctx.stroke()
  }

  // Eyes
  const rEyeOffsetX = remoteSize * 0.3
  const rEyeOffsetY = -remoteSize * 0.1
  const rEyeSize = remoteSize * 0.35

  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.ellipse(x - rEyeOffsetX, y + rEyeOffsetY, rEyeSize, rEyeSize * 1.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x + rEyeOffsetX, y + rEyeOffsetY, rEyeSize, rEyeSize * 1.2, 0, 0, Math.PI * 2)
  ctx.fill()

  // Pupils
  const rPupilSize = rEyeSize * 0.5
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(x - rEyeOffsetX, y + rEyeOffsetY, rPupilSize, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + rEyeOffsetX, y + rEyeOffsetY, rPupilSize, 0, Math.PI * 2)
  ctx.fill()

  // Squid top
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - remoteSize * 1.4)
  ctx.lineTo(x - remoteSize * 0.3, y - remoteSize * 0.5)
  ctx.lineTo(x + remoteSize * 0.3, y - remoteSize * 0.5)
  ctx.closePath()
  ctx.fill()

  // Player ID label
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.font = (12 / zoom) + 'px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('P-' + (peerId?.slice(0, 4) || '????'), x, y - remoteSize * 2)
}

export const drawRemotePlayers = (ctx, remoteCursors, zoom, getPeerColor) => {
  remoteCursors.forEach((cursor, peerId) => {
    const color = getPeerColor(peerId)
    drawRemotePlayer(ctx, cursor.x, cursor.y, zoom, color, peerId)
  })
}
