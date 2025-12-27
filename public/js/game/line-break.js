// Enemy line breaking logic
import { LINE_BREAK_CHANCE } from '../constants/game.js'

export const findNearbyStrokes = (enemyPos, strokes, maxDistance = 200) => {
  const nearby = []

  strokes.forEach((stroke, idx) => {
    if (stroke.color === '#ffffff') return

    for (const point of stroke.points) {
      const dist = Math.hypot(point.x - enemyPos.x, point.y - enemyPos.y)
      if (dist < maxDistance) {
        nearby.push({ idx, dist })
        break
      }
    }
  })

  return nearby.sort((a, b) => a.dist - b.dist)
}

export const selectStrokesToBreak = (enemies, strokes) => {
  const toDelete = new Set()

  for (const enemy of enemies) {
    if (Math.random() > LINE_BREAK_CHANCE) continue

    const nearby = findNearbyStrokes(enemy, strokes)
    if (nearby.length > 0 && !toDelete.has(nearby[0].idx)) {
      toDelete.add(nearby[0].idx)
    }
  }

  return Array.from(toDelete).sort((a, b) => b - a)
}

export const shouldBreakLine = () => Math.random() <= LINE_BREAK_CHANCE
