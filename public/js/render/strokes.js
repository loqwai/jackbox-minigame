// Stroke rendering functions

export const drawStroke = (ctx, stroke) => {
  if (stroke.points.length < 2) return

  ctx.strokeStyle = stroke.color
  ctx.lineWidth = stroke.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  ctx.stroke()
}

export const drawStrokes = (ctx, strokes) => {
  strokes.forEach(stroke => drawStroke(ctx, stroke))
}

export const drawCurrentStroke = (ctx, points, color, size) => {
  if (points.length < 2) return

  ctx.strokeStyle = color
  ctx.lineWidth = size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.stroke()
}
