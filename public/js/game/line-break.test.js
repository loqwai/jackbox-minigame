import { describe, it, expect, beforeEach, vi } from 'vitest'
import { findNearbyStrokes, selectStrokesToBreak, shouldBreakLine } from './line-break.js'

describe('findNearbyStrokes', () => {
  let strokes

  beforeEach(() => {
    strokes = [
      { points: [{ x: 50, y: 50 }], color: '#000000' },
      { points: [{ x: 200, y: 200 }], color: '#ff0000' },
      { points: [{ x: 500, y: 500 }], color: '#00ff00' },
      { points: [{ x: 60, y: 60 }], color: '#ffffff' }
    ]
  })

  it('finds strokes within max distance', () => {
    const result = findNearbyStrokes({ x: 0, y: 0 }, strokes)
    expect(result.length).toBe(1)
    expect(result[0].idx).toBe(0)
  })

  it('ignores eraser strokes', () => {
    const result = findNearbyStrokes({ x: 60, y: 60 }, strokes)
    expect(result.some(r => r.idx === 3)).toBe(false)
  })

  it('sorts by distance', () => {
    strokes = [
      { points: [{ x: 150, y: 0 }], color: '#000' },
      { points: [{ x: 50, y: 0 }], color: '#000' }
    ]
    const result = findNearbyStrokes({ x: 0, y: 0 }, strokes, 200)
    expect(result[0].idx).toBe(1)
    expect(result[1].idx).toBe(0)
  })

  it('respects custom max distance', () => {
    const result = findNearbyStrokes({ x: 0, y: 0 }, strokes, 100)
    expect(result.length).toBe(1)

    const resultLarger = findNearbyStrokes({ x: 0, y: 0 }, strokes, 300)
    expect(resultLarger.length).toBe(2)
  })
})

describe('selectStrokesToBreak', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random')
  })

  it('returns indices in descending order', () => {
    Math.random.mockReturnValue(0)
    const strokes = [
      { points: [{ x: 10, y: 0 }], color: '#000' },
      { points: [{ x: 20, y: 0 }], color: '#000' }
    ]
    const enemies = [{ x: 0, y: 0 }, { x: 15, y: 0 }]
    const result = selectStrokesToBreak(enemies, strokes)
    if (result.length > 1) {
      expect(result[0]).toBeGreaterThan(result[1])
    }
  })

  it('returns empty when chance fails', () => {
    Math.random.mockReturnValue(1)
    const strokes = [{ points: [{ x: 10, y: 0 }], color: '#000' }]
    const enemies = [{ x: 0, y: 0 }]
    expect(selectStrokesToBreak(enemies, strokes)).toEqual([])
  })
})

describe('shouldBreakLine', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random')
  })

  it('returns true when random is below chance', () => {
    Math.random.mockReturnValue(0.3)
    expect(shouldBreakLine()).toBe(true)
  })

  it('returns false when random is above chance', () => {
    Math.random.mockReturnValue(0.8)
    expect(shouldBreakLine()).toBe(false)
  })
})
