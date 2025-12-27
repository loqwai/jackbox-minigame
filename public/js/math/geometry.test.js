import { describe, it, expect } from 'vitest'
import { getDistance, getMidpoint } from './geometry.js'

describe('getDistance', () => {
  it('returns 0 for same point', () => {
    expect(getDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0)
  })

  it('calculates horizontal distance', () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10)
  })

  it('calculates vertical distance', () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(10)
  })

  it('calculates diagonal distance (3-4-5 triangle)', () => {
    expect(getDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('works with negative coordinates', () => {
    expect(getDistance({ x: -5, y: -5 }, { x: -5, y: 5 })).toBe(10)
  })
})

describe('getMidpoint', () => {
  it('returns same point when both are equal', () => {
    expect(getMidpoint({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 })
  })

  it('calculates midpoint on horizontal line', () => {
    expect(getMidpoint({ x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ x: 5, y: 0 })
  })

  it('calculates midpoint on vertical line', () => {
    expect(getMidpoint({ x: 0, y: 0 }, { x: 0, y: 10 })).toEqual({ x: 0, y: 5 })
  })

  it('calculates midpoint on diagonal', () => {
    expect(getMidpoint({ x: 0, y: 0 }, { x: 10, y: 10 })).toEqual({ x: 5, y: 5 })
  })

  it('works with negative coordinates', () => {
    expect(getMidpoint({ x: -10, y: -10 }, { x: 10, y: 10 })).toEqual({ x: 0, y: 0 })
  })
})
