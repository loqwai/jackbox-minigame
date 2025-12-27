import { describe, it, expect, beforeEach } from 'vitest'
import { collidesWithStroke, pointToLineDistance } from './collision.js'

describe('pointToLineDistance', () => {
  it('returns distance to point when line has zero length', () => {
    expect(pointToLineDistance(5, 5, 0, 0, 0, 0)).toBeCloseTo(7.07, 1)
  })

  it('returns 0 when point is on the line', () => {
    expect(pointToLineDistance(5, 0, 0, 0, 10, 0)).toBe(0)
  })

  it('returns perpendicular distance to horizontal line', () => {
    expect(pointToLineDistance(5, 5, 0, 0, 10, 0)).toBe(5)
  })

  it('returns perpendicular distance to vertical line', () => {
    expect(pointToLineDistance(5, 5, 0, 0, 0, 10)).toBe(5)
  })

  it('returns distance to nearest endpoint when past segment end', () => {
    expect(pointToLineDistance(15, 0, 0, 0, 10, 0)).toBe(5)
  })

  it('returns distance to start when before segment', () => {
    expect(pointToLineDistance(-5, 0, 0, 0, 10, 0)).toBe(5)
  })
})

describe('collidesWithStroke', () => {
  let strokes

  describe('with horizontal stroke', () => {
    beforeEach(() => {
      strokes = [{
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        size: 10,
        color: '#000000'
      }]
    })

    it('detects collision when point is on stroke', () => {
      expect(collidesWithStroke(50, 0, 5, strokes)).toBe(true)
    })

    it('detects collision when within radius of stroke', () => {
      expect(collidesWithStroke(50, 10, 10, strokes)).toBe(true)
    })

    it('returns false when outside stroke', () => {
      expect(collidesWithStroke(50, 50, 5, strokes)).toBe(false)
    })

    it('considers stroke size in collision', () => {
      // stroke.size/2 = 5, radius = 5, so threshold = 10
      // point at y=9 is 9 units away, should collide
      expect(collidesWithStroke(50, 9, 5, strokes)).toBe(true)
      // point at y=11 is 11 units away, should not collide
      expect(collidesWithStroke(50, 11, 5, strokes)).toBe(false)
    })
  })

  describe('with eraser strokes', () => {
    beforeEach(() => {
      strokes = [{
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        size: 10,
        color: '#ffffff'
      }]
    })

    it('ignores eraser strokes', () => {
      expect(collidesWithStroke(50, 0, 5, strokes)).toBe(false)
    })
  })

  describe('with multiple strokes', () => {
    beforeEach(() => {
      strokes = [
        { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], size: 10, color: '#000000' },
        { points: [{ x: 200, y: 0 }, { x: 300, y: 0 }], size: 10, color: '#ff0000' }
      ]
    })

    it('detects collision with first stroke', () => {
      expect(collidesWithStroke(50, 0, 5, strokes)).toBe(true)
    })

    it('detects collision with second stroke', () => {
      expect(collidesWithStroke(250, 0, 5, strokes)).toBe(true)
    })

    it('returns false when between strokes', () => {
      expect(collidesWithStroke(150, 0, 5, strokes)).toBe(false)
    })
  })

  describe('with empty strokes', () => {
    it('returns false for empty array', () => {
      expect(collidesWithStroke(50, 50, 10, [])).toBe(false)
    })
  })
})
