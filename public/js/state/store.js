// Centralized game state store

export const createGameStore = () => {
  const listeners = new Set()

  const state = {
    view: { zoom: 1, panX: 0, panY: 0 },
    myPosition: { x: 0, y: 0 },
    remotePlayers: new Map(),
    strokes: [],
    enemies: [],
    pickups: [],
    currentColor: '#000000',
    brushSize: 5,
    isEraser: false,
    drawDisabled: false,
    disabledTimer: 0,
    connected: false,
    peerCount: 0,
    userCount: 0
  }

  const notify = () => listeners.forEach(fn => fn(state))

  return {
    getState: () => state,

    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },

    setView: (view) => {
      state.view = typeof view === 'function' ? view(state.view) : view
      notify()
    },

    goToPosition: (worldX, worldY, containerWidth, containerHeight) => {
      state.view = {
        ...state.view,
        panX: containerWidth / 2 - worldX * state.view.zoom,
        panY: containerHeight / 2 - worldY * state.view.zoom
      }
      notify()
    },

    goToPlayer: (peerId, containerWidth, containerHeight) => {
      const player = state.remotePlayers.get(peerId)
      if (!player) return
      state.view = {
        ...state.view,
        panX: containerWidth / 2 - player.x * state.view.zoom,
        panY: containerHeight / 2 - player.y * state.view.zoom
      }
      notify()
    },

    setMyPosition: (x, y) => {
      state.myPosition = { x, y }
    },

    updateRemotePlayer: (peerId, data) => {
      const existing = state.remotePlayers.get(peerId) || {}
      state.remotePlayers.set(peerId, {
        ...existing,
        ...data,
        lastSeen: Date.now()
      })
      notify()
    },

    removeRemotePlayer: (peerId) => {
      state.remotePlayers.delete(peerId)
      notify()
    },

    setConnected: (connected) => { state.connected = connected; notify() },
    setPeerCount: (count) => { state.peerCount = count; notify() },
    setUserCount: (count) => { state.userCount = count; notify() },
    setCurrentColor: (color) => { state.currentColor = color; notify() },
    setBrushSize: (size) => { state.brushSize = size; notify() },
    setIsEraser: (isEraser) => { state.isEraser = isEraser; notify() },
    setDrawDisabled: (disabled) => { state.drawDisabled = disabled; notify() },
    setDisabledTimer: (timer) => { state.disabledTimer = timer; notify() }
  }
}
