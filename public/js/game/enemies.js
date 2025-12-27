// Enemy AI and spawning logic
import { ENEMY_SIZE, ENEMY_SPEED } from '../constants/game.js'
import { collidesWithStroke } from '../math/collision.js'

export const moveEnemy = (enemy, targetPos, deltaTime, strokes) => {
  const dx = targetPos.x - enemy.x
  const dy = targetPos.y - enemy.y
  const dist = Math.hypot(dx, dy)

  if (dist < ENEMY_SIZE) return enemy

  const dirX = dx / dist
  const dirY = dy / dist
  const moveSpeed = ENEMY_SPEED * deltaTime
  let newX = enemy.x + dirX * moveSpeed
  let newY = enemy.y + dirY * moveSpeed

  if (!collidesWithStroke(newX, newY, ENEMY_SIZE, strokes)) {
    return { ...enemy, x: newX, y: newY, wallFollowDir: null }
  }

  // Try moving only in X
  if (!collidesWithStroke(newX, enemy.y, ENEMY_SIZE, strokes)) {
    return { ...enemy, x: newX, wallFollowDir: enemy.wallFollowDir || 1 }
  }

  // Try moving only in Y
  if (!collidesWithStroke(enemy.x, newY, ENEMY_SIZE, strokes)) {
    return { ...enemy, y: newY, wallFollowDir: enemy.wallFollowDir || 1 }
  }

  // Wall following - try perpendicular directions
  const perpDir = enemy.wallFollowDir || (Math.random() > 0.5 ? 1 : -1)
  const perpX = -dirY * perpDir
  const perpY = dirX * perpDir
  const slideX = enemy.x + perpX * moveSpeed * 1.5
  const slideY = enemy.y + perpY * moveSpeed * 1.5

  if (!collidesWithStroke(slideX, slideY, ENEMY_SIZE, strokes)) {
    return { ...enemy, x: slideX, y: slideY, wallFollowDir: perpDir }
  }

  // Try opposite perpendicular
  const oppSlideX = enemy.x - perpX * moveSpeed * 1.5
  const oppSlideY = enemy.y - perpY * moveSpeed * 1.5
  if (!collidesWithStroke(oppSlideX, oppSlideY, ENEMY_SIZE, strokes)) {
    return { ...enemy, x: oppSlideX, y: oppSlideY, wallFollowDir: -perpDir }
  }

  // Still stuck - try random direction
  const randAngle = Math.random() * Math.PI * 2
  const randX = enemy.x + Math.cos(randAngle) * moveSpeed
  const randY = enemy.y + Math.sin(randAngle) * moveSpeed
  if (!collidesWithStroke(randX, randY, ENEMY_SIZE, strokes)) {
    return { ...enemy, x: randX, y: randY }
  }

  return enemy
}

export const spawnEnemy = (aroundPos, strokes, id) => {
  const angle = Math.random() * Math.PI * 2
  const distance = 400 + Math.random() * 300
  let x = aroundPos.x + Math.cos(angle) * distance
  let y = aroundPos.y + Math.sin(angle) * distance

  let attempts = 0
  while (collidesWithStroke(x, y, ENEMY_SIZE, strokes) && attempts < 10) {
    const newAngle = Math.random() * Math.PI * 2
    x = aroundPos.x + Math.cos(newAngle) * distance
    y = aroundPos.y + Math.sin(newAngle) * distance
    attempts++
  }

  return { x, y, id }
}

export const checkPlayerCollision = (playerPos, enemies) => {
  for (const enemy of enemies) {
    const dx = playerPos.x - enemy.x
    const dy = playerPos.y - enemy.y
    if (Math.hypot(dx, dy) < ENEMY_SIZE + 10) return true
  }
  return false
}

export const respawnEnemyAwayFromPlayer = (enemy, playerPos) => {
  const dx = playerPos.x - enemy.x
  const dy = playerPos.y - enemy.y
  if (Math.hypot(dx, dy) >= ENEMY_SIZE + 15) return enemy

  const angle = Math.random() * Math.PI * 2
  const distance = 500 + Math.random() * 300
  return {
    ...enemy,
    x: playerPos.x + Math.cos(angle) * distance,
    y: playerPos.y + Math.sin(angle) * distance
  }
}
