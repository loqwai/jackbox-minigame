// Enemy rendering functions
import { ENEMY_SIZE } from '../constants/game.js'
import { adjustColor } from '../utils/color.js'

export const drawEnemy = (ctx, enemy, playerPos, zoom, color) => {
  const scaledSize = ENEMY_SIZE / zoom
  const enemyColor = color === '#ffffff' ? '#e94560' : color

  // Enemy body with gradient
  const gradient = ctx.createRadialGradient(enemy.x, enemy.y, 0, enemy.x, enemy.y, scaledSize)
  gradient.addColorStop(0, adjustColor(enemyColor, 60))
  gradient.addColorStop(0.7, enemyColor)
  gradient.addColorStop(1, adjustColor(enemyColor, -40))
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(enemy.x, enemy.y, scaledSize, 0, Math.PI * 2)
  ctx.fill()

  // Eyes looking toward player
  const dx = playerPos.x - enemy.x
  const dy = playerPos.y - enemy.y
  const angle = Math.atan2(dy, dx)
  const eyeOffset = 8 / zoom
  const eyeRadius = 5 / zoom
  const pupilRadius = 2.5 / zoom
  const pupilOffset = 2 / zoom

  // Left eye
  const leftEyeX = enemy.x + Math.cos(angle - 0.4) * eyeOffset
  const leftEyeY = enemy.y + Math.sin(angle - 0.4) * eyeOffset
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(leftEyeX, leftEyeY, eyeRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(leftEyeX + Math.cos(angle) * pupilOffset, leftEyeY + Math.sin(angle) * pupilOffset, pupilRadius, 0, Math.PI * 2)
  ctx.fill()

  // Right eye
  const rightEyeX = enemy.x + Math.cos(angle + 0.4) * eyeOffset
  const rightEyeY = enemy.y + Math.sin(angle + 0.4) * eyeOffset
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(rightEyeX, rightEyeY, eyeRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(rightEyeX + Math.cos(angle) * pupilOffset, rightEyeY + Math.sin(angle) * pupilOffset, pupilRadius, 0, Math.PI * 2)
  ctx.fill()
}

export const drawEnemies = (ctx, enemies, playerPos, zoom, color) => {
  enemies.forEach(enemy => drawEnemy(ctx, enemy, playerPos, zoom, color))
}
