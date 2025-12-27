import { describe, it, expect } from 'vitest'
import { screenToWorld, worldToScreen, worldToMinimap, isInMinimapBounds, getArrowIndicator } from './transforms.js'

describe('screenToWorld', () => {
  it('returns origin when screen matches pan at zoom 1', () => {
    const view = { zoom: 1, panX: 100, panY: 100 }
    expect(screenToWorld(100, 100, view)).toEqual({ x: 0, y: 0 })
  })

  it('scales correctly with zoom', () => {
    const view = { zoom: 2, panX: 0, panY: 0 }
    expect(screenToWorld(100, 100, view)).toEqual({ x: 50, y: 50 })
  })

  it('applies pan offset', () => {
    const view = { zoom: 1, panX: 50, panY: 50 }
    expect(screenToWorld(100, 100, view)).toEqual({ x: 50, y: 50 })
  })
})

describe('worldToScreen', () => {
  it('returns pan position for origin at zoom 1', () => {
    const view = { zoom: 1, panX: 100, panY: 100 }
    expect(worldToScreen(0, 0, view)).toEqual({ x: 100, y: 100 })
  })

  it('scales correctly with zoom', () => {
    const view = { zoom: 2, panX: 0, panY: 0 }
    expect(worldToScreen(50, 50, view)).toEqual({ x: 100, y: 100 })
  })

  it('is inverse of screenToWorld', () => {
    const view = { zoom: 1.5, panX: 200, panY: 150 }
    const world = screenToWorld(300, 250, view)
    const screen = worldToScreen(world.x, world.y, view)
    expect(screen.x).toBeCloseTo(300)
    expect(screen.y).toBeCloseTo(250)
  })
})

describe('worldToMinimap', () => {
  it('returns center when at player position', () => {
    const result = worldToMinimap(100, 100, { x: 100, y: 100 })
    expect(result).toEqual({ x: 70, y: 70 })
  })

  it('offsets from center based on world position', () => {
    const result = worldToMinimap(100, 0, { x: 0, y: 0 })
    expect(result.x).toBeGreaterThan(70)
    expect(result.y).toBe(70)
  })
})

describe('isInMinimapBounds', () => {
  it('returns true for center point', () => {
    expect(isInMinimapBounds(70, 70)).toBe(true)
  })

  it('returns false for point at edge', () => {
    expect(isInMinimapBounds(5, 70)).toBe(false)
  })

  it('respects custom margin', () => {
    expect(isInMinimapBounds(5, 70, 5)).toBe(true)
    expect(isInMinimapBounds(3, 70, 5)).toBe(false)
  })
})

describe('getArrowIndicator', () => {
  it('returns position at edge of minimap', () => {
    const result = getArrowIndicator(1000, 0, { x: 0, y: 0 }, '#ff0000')
    expect(result.x).toBeGreaterThan(70)
    expect(result.y).toBeCloseTo(70, 0)
    expect(result.color).toBe('#ff0000')
  })

  it('calculates rotation pointing toward target', () => {
    const rightResult = getArrowIndicator(1000, 0, { x: 0, y: 0 }, '#ff0000')
    expect(rightResult.rotation).toBeCloseTo(90, 0)

    const downResult = getArrowIndicator(0, 1000, { x: 0, y: 0 }, '#ff0000')
    expect(downResult.rotation).toBeCloseTo(180, 0)
  })
})
