// Pickup spawning and collection logic
import { PICKUP_SIZE, MAX_PICKUPS } from '../constants/game.js'
import { COLORS } from '../constants/colors.js'

export const spawnPickup = (aroundPos, existingPickups) => {
  if (existingPickups.length >= MAX_PICKUPS) return null

  const angle = Math.random() * Math.PI * 2
  const distance = 200 + Math.random() * 400
  const x = aroundPos.x + Math.cos(angle) * distance
  const y = aroundPos.y + Math.sin(angle) * distance

  const colorOptions = COLORS.filter(c => c !== '#ffffff')
  const color = colorOptions[Math.floor(Math.random() * colorOptions.length)]

  return { x, y, id: Date.now() + Math.random(), color }
}

export const checkPickupCollision = (playerPos, pickups) => {
  const collected = []
  const remaining = []

  for (const pickup of pickups) {
    const dx = playerPos.x - pickup.x
    const dy = playerPos.y - pickup.y
    if (Math.hypot(dx, dy) < PICKUP_SIZE + 15) {
      collected.push(pickup)
    } else {
      remaining.push(pickup)
    }
  }

  return { collected, remaining }
}

export const getPickupsByColor = (pickups) => {
  const byColor = {}
  for (const pickup of pickups) {
    if (!byColor[pickup.color]) byColor[pickup.color] = []
    byColor[pickup.color].push(pickup)
  }
  return byColor
}
