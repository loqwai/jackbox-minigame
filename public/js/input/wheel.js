// Mouse wheel zoom handling

export const calculateWheelZoom = (deltaY, focalX, focalY, currentView) => {
  const scale = deltaY > 0 ? 0.85 : 1.15
  const newZoom = Math.max(0.01, Math.min(100, currentView.zoom * scale))
  const zoomRatio = newZoom / currentView.zoom

  return {
    zoom: newZoom,
    panX: focalX - (focalX - currentView.panX) * zoomRatio,
    panY: focalY - (focalY - currentView.panY) * zoomRatio
  }
}

export const calculateButtonZoom = (zoomIn, containerWidth, containerHeight, currentView) => {
  const scale = zoomIn ? 1.25 : (1 / 1.25)
  const cx = containerWidth / 2
  const cy = containerHeight / 2
  const newZoom = Math.max(0.01, Math.min(100, currentView.zoom * scale))
  const ratio = newZoom / currentView.zoom

  return {
    zoom: newZoom,
    panX: cx - (cx - currentView.panX) * ratio,
    panY: cy - (cy - currentView.panY) * ratio
  }
}

export const resetViewToOrigin = (containerWidth, containerHeight) => ({
  zoom: 1,
  panX: containerWidth / 2,
  panY: containerHeight / 2
})
