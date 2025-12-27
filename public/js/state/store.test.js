import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGameStore } from './store.js'

describe('createGameStore', () => {
  let store

  beforeEach(() => {
    store = createGameStore()
  })

  describe('initial state', () => {
    it('has default view at origin with zoom 1', () => {
      const state = store.getState()
      expect(state.view).toEqual({ zoom: 1, panX: 0, panY: 0 })
    })

    it('has empty remote players', () => {
      expect(store.getState().remotePlayers.size).toBe(0)
    })

    it('has default brush settings', () => {
      const state = store.getState()
      expect(state.currentColor).toBe('#000000')
      expect(state.brushSize).toBe(5)
      expect(state.isEraser).toBe(false)
    })
  })

  describe('subscribe', () => {
    it('calls listener when state changes', () => {
      const listener = vi.fn()
      store.subscribe(listener)
      store.setConnected(true)
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('returns unsubscribe function', () => {
      const listener = vi.fn()
      const unsubscribe = store.subscribe(listener)
      unsubscribe()
      store.setConnected(true)
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('setView', () => {
    it('updates view with object', () => {
      store.setView({ zoom: 2, panX: 100, panY: 50 })
      expect(store.getState().view).toEqual({ zoom: 2, panX: 100, panY: 50 })
    })

    it('updates view with function', () => {
      store.setView({ zoom: 1, panX: 0, panY: 0 })
      store.setView(v => ({ ...v, zoom: v.zoom * 2 }))
      expect(store.getState().view.zoom).toBe(2)
    })
  })

  describe('goToPosition', () => {
    it('centers view on world position', () => {
      store.setView({ zoom: 1, panX: 0, panY: 0 })
      store.goToPosition(100, 50, 800, 600)
      const view = store.getState().view
      expect(view.panX).toBe(300) // 800/2 - 100*1
      expect(view.panY).toBe(250) // 600/2 - 50*1
    })

    it('respects zoom level', () => {
      store.setView({ zoom: 2, panX: 0, panY: 0 })
      store.goToPosition(100, 50, 800, 600)
      const view = store.getState().view
      expect(view.panX).toBe(200) // 800/2 - 100*2
      expect(view.panY).toBe(200) // 600/2 - 50*2
    })
  })

  describe('remote players', () => {
    it('adds remote player', () => {
      store.updateRemotePlayer('peer1', { x: 100, y: 200, color: '#ff0000' })
      const player = store.getState().remotePlayers.get('peer1')
      expect(player.x).toBe(100)
      expect(player.y).toBe(200)
      expect(player.color).toBe('#ff0000')
      expect(player.lastSeen).toBeDefined()
    })

    it('updates existing player', () => {
      store.updateRemotePlayer('peer1', { x: 100, y: 200 })
      store.updateRemotePlayer('peer1', { x: 150 })
      const player = store.getState().remotePlayers.get('peer1')
      expect(player.x).toBe(150)
      expect(player.y).toBe(200)
    })

    it('removes remote player', () => {
      store.updateRemotePlayer('peer1', { x: 100, y: 200 })
      store.removeRemotePlayer('peer1')
      expect(store.getState().remotePlayers.has('peer1')).toBe(false)
    })
  })

  describe('goToPlayer', () => {
    it('centers view on player position', () => {
      store.updateRemotePlayer('peer1', { x: 200, y: 100 })
      store.setView({ zoom: 1, panX: 0, panY: 0 })
      store.goToPlayer('peer1', 800, 600)
      const view = store.getState().view
      expect(view.panX).toBe(200) // 800/2 - 200*1
      expect(view.panY).toBe(200) // 600/2 - 100*1
    })

    it('does nothing for unknown player', () => {
      store.setView({ zoom: 1, panX: 0, panY: 0 })
      store.goToPlayer('unknown', 800, 600)
      expect(store.getState().view.panX).toBe(0)
    })
  })

  describe('setMyPosition', () => {
    it('updates position without notifying', () => {
      const listener = vi.fn()
      store.subscribe(listener)
      store.setMyPosition(100, 200)
      expect(store.getState().myPosition).toEqual({ x: 100, y: 200 })
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('brush settings', () => {
    it('sets current color', () => {
      store.setCurrentColor('#ff0000')
      expect(store.getState().currentColor).toBe('#ff0000')
    })

    it('sets brush size', () => {
      store.setBrushSize(20)
      expect(store.getState().brushSize).toBe(20)
    })

    it('sets eraser mode', () => {
      store.setIsEraser(true)
      expect(store.getState().isEraser).toBe(true)
    })
  })

  describe('connection state', () => {
    it('sets connected', () => {
      store.setConnected(true)
      expect(store.getState().connected).toBe(true)
    })

    it('sets peer count', () => {
      store.setPeerCount(5)
      expect(store.getState().peerCount).toBe(5)
    })

    it('sets user count', () => {
      store.setUserCount(10)
      expect(store.getState().userCount).toBe(10)
    })
  })

  describe('draw disabled state', () => {
    it('sets draw disabled', () => {
      store.setDrawDisabled(true)
      expect(store.getState().drawDisabled).toBe(true)
    })

    it('sets disabled timer', () => {
      store.setDisabledTimer(5)
      expect(store.getState().disabledTimer).toBe(5)
    })
  })
})
