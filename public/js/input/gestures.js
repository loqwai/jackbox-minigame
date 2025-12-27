// Gesture state management for multi-touch

export const createGestureState = () => ({
  active: false,
  lastMid: null,
  lastDist: null
})

export const resetGestureState = () => ({
  active: false,
  lastMid: null,
  lastDist: null
})

export const activateGesture = (state, mid, dist) => ({
  active: true,
  lastMid: mid,
  lastDist: dist
})

export const updateGesture = (state, mid, dist) => ({
  ...state,
  lastMid: mid,
  lastDist: dist
})
