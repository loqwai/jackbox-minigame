// Stroke intent detection - analyzes drawing behavior to determine purpose
// Walls: frantic scribbling, direction reversals, overlapping
// Territory: smooth sweeping strokes, consistent direction

export const StrokeIntent = {
  TERRITORY: 'territory',  // Normal expansion - spreads fast, moderate resistance
  WALL: 'wall',            // Defensive barrier - spreads slow, high resistance
  ATTACK: 'attack',        // Aggressive push - spreads fast toward enemies, low resistance
}

// Analyze a stroke's points to determine intent
export const detectIntent = (stroke) => {
  if (!stroke.points || stroke.points.length < 3) {
    return { intent: StrokeIntent.TERRITORY, confidence: 0.5, metrics: {} }
  }

  const points = stroke.points
  const metrics = {
    directionReversals: countDirectionReversals(points),
    angularVariance: calculateAngularVariance(points),
    selfOverlap: calculateSelfOverlap(points, stroke.size),
    avgSpeed: estimateSpeed(points),
    strokeLength: calculateStrokeLength(points),
    boundingBoxRatio: calculateBoundingBoxRatio(points),
  }

  // Wall detection: high reversals, high angular variance, or high overlap
  const wallScore =
    (metrics.directionReversals / Math.max(1, points.length - 2)) * 3 +
    (metrics.angularVariance / Math.PI) * 2 +
    metrics.selfOverlap * 4 +
    (metrics.boundingBoxRatio < 0.3 ? 1 : 0)  // Compact scribbles

  // Attack detection: fast, straight, directional
  const attackScore =
    (metrics.avgSpeed > 500 ? 1 : 0) +
    (metrics.angularVariance < 0.3 ? 1 : 0) +
    (metrics.boundingBoxRatio > 0.7 ? 1 : 0)

  // Determine intent based on scores
  if (wallScore > 2.5) {
    return {
      intent: StrokeIntent.WALL,
      confidence: Math.min(1, wallScore / 5),
      metrics
    }
  }

  if (attackScore > 2) {
    return {
      intent: StrokeIntent.ATTACK,
      confidence: Math.min(1, attackScore / 3),
      metrics
    }
  }

  return {
    intent: StrokeIntent.TERRITORY,
    confidence: 0.7,
    metrics
  }
}

// Count how many times the stroke reverses direction
const countDirectionReversals = (points) => {
  if (points.length < 3) return 0

  let reversals = 0
  let prevAngle = Math.atan2(
    points[1].y - points[0].y,
    points[1].x - points[0].x
  )

  for (let i = 2; i < points.length; i++) {
    const angle = Math.atan2(
      points[i].y - points[i - 1].y,
      points[i].x - points[i - 1].x
    )

    // Check if direction reversed (angle changed by more than 90 degrees)
    const angleDiff = Math.abs(normalizeAngle(angle - prevAngle))
    if (angleDiff > Math.PI * 0.6) {
      reversals++
    }
    prevAngle = angle
  }

  return reversals
}

// Calculate variance in stroke direction
const calculateAngularVariance = (points) => {
  if (points.length < 3) return 0

  const angles = []
  for (let i = 1; i < points.length; i++) {
    angles.push(Math.atan2(
      points[i].y - points[i - 1].y,
      points[i].x - points[i - 1].x
    ))
  }

  // Calculate circular variance
  let sinSum = 0, cosSum = 0
  angles.forEach(a => {
    sinSum += Math.sin(a)
    cosSum += Math.cos(a)
  })

  const r = Math.sqrt(sinSum * sinSum + cosSum * cosSum) / angles.length
  return 1 - r  // 0 = all same direction, 1 = random directions
}

// Calculate how much the stroke overlaps itself
const calculateSelfOverlap = (points, brushSize) => {
  if (points.length < 5) return 0

  const radius = brushSize / 2
  let overlaps = 0
  let checks = 0

  // Sample points and check if they're near earlier parts of the stroke
  for (let i = 4; i < points.length; i += 2) {
    for (let j = 0; j < i - 3; j += 2) {
      const dist = Math.hypot(
        points[i].x - points[j].x,
        points[i].y - points[j].y
      )
      if (dist < radius * 2) {
        overlaps++
      }
      checks++
    }
  }

  return checks > 0 ? overlaps / checks : 0
}

// Estimate drawing speed (pixels per point, higher = faster drawing)
const estimateSpeed = (points) => {
  if (points.length < 2) return 0

  let totalDist = 0
  for (let i = 1; i < points.length; i++) {
    totalDist += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y
    )
  }

  return totalDist / (points.length - 1)
}

// Calculate total stroke length
const calculateStrokeLength = (points) => {
  let length = 0
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y
    )
  }
  return length
}

// Calculate ratio of stroke length to bounding box diagonal
// Low ratio = compact scribble, high ratio = sweeping stroke
const calculateBoundingBoxRatio = (points) => {
  if (points.length < 2) return 1

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  points.forEach(p => {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  })

  const diagonal = Math.hypot(maxX - minX, maxY - minY)
  if (diagonal < 1) return 1

  const length = calculateStrokeLength(points)
  // Ratio > 1 means stroke is longer than bbox diagonal (lots of back-and-forth)
  // Normalize to 0-1 range where 1 = straight line
  return Math.min(1, diagonal / length)
}

// Normalize angle to -PI to PI
const normalizeAngle = (angle) => {
  while (angle > Math.PI) angle -= 2 * Math.PI
  while (angle < -Math.PI) angle += 2 * Math.PI
  return angle
}

// Get spread parameters based on intent
export const getIntentSpreadParams = (intent, confidence) => {
  const blend = (a, b) => a + (b - a) * confidence

  switch (intent) {
    case StrokeIntent.WALL:
      return {
        spreadRate: blend(1, 0.3),       // Walls spread slower
        resistance: blend(1, 4),          // Walls resist 4x more
        maxRadius: blend(1, 0.5),         // Walls don't spread as far
        combatBonus: blend(1, 2),         // Walls fight harder
      }

    case StrokeIntent.ATTACK:
      return {
        spreadRate: blend(1, 1.8),        // Attacks spread faster
        resistance: blend(1, 0.6),        // But are fragile
        maxRadius: blend(1, 1.5),         // Reach further
        combatBonus: blend(1, 1.3),       // Slight combat advantage
      }

    case StrokeIntent.TERRITORY:
    default:
      return {
        spreadRate: 1,
        resistance: 1,
        maxRadius: 1,
        combatBonus: 1,
      }
  }
}
