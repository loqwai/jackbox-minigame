// Basic geometric functions

export const getDistance = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y)

export const getMidpoint = (p1, p2) => ({
  x: (p1.x + p2.x) / 2,
  y: (p1.y + p2.y) / 2
})
