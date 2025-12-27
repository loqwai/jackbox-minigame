// Pointer event handling logic
import { screenToWorld } from '../math/transforms.js'
import { getDistance, getMidpoint } from '../math/geometry.js'

export const getWorldCoordsFromEvent = (e, canvasRect, view) => {
  const screenX = e.clientX - canvasRect.left
  const screenY = e.clientY - canvasRect.top
  return screenToWorld(screenX, screenY, view)
}

export const isMultiTouch = (activePointers) => activePointers.size >= 2

export const calculatePinchZoom = (pointers, lastMid, lastDist, currentView) => {
  if (pointers.length < 2) return null

  const mid = getMidpoint(pointers[0], pointers[1])
  const dist = getDistance(pointers[0], pointers[1])

  if (!lastMid || lastDist <= 0) return { mid, dist, view: currentView }

  const scale = dist / lastDist
  const dx = mid.x - lastMid.x
  const dy = mid.y - lastMid.y

  const newZoom = Math.max(0.01, Math.min(100, currentView.zoom * scale))
  const zoomRatio = newZoom / currentView.zoom

  return {
    mid,
    dist,
    view: {
      zoom: newZoom,
      panX: mid.x - (mid.x - currentView.panX) * zoomRatio + dx,
      panY: mid.y - (mid.y - currentView.panY) * zoomRatio + dy
    }
  }
}

export const calculateScreenDistance = (p1, p2, zoom) => {
  const worldDist = getDistance(p1, p2)
  return worldDist * zoom
}
