// Collision detection functions

export const pointToLineDistance = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  const nearX = x1 + t * dx
  const nearY = y1 + t * dy
  return Math.hypot(px - nearX, py - nearY)
}

export const collidesWithStroke = (x, y, radius, strokes) => {
  for (const stroke of strokes) {
    if (stroke.color === '#ffffff') continue
    for (let i = 0; i < stroke.points.length - 1; i++) {
      const p1 = stroke.points[i]
      const p2 = stroke.points[i + 1]
      const dist = pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y)
      if (dist < radius + stroke.size / 2) return true
    }
  }
  return false
}
