import { describe, it, expect, beforeEach } from 'vitest'
import {
  initPaintLevels,
  consumePaint,
  reloadPaint,
  refillColor,
  hasPaint,
  getPaintPercent
} from './paint.js'
import { MAX_PAINT } from '../constants/game.js'

describe('initPaintLevels', () => {
  it('initializes all colors to max paint', () => {
    const levels = initPaintLevels()
    expect(levels['#000000']).toBe(MAX_PAINT)
    expect(levels['#e94560']).toBe(MAX_PAINT)
    expect(levels['#ffffff']).toBe(MAX_PAINT)
  })
})

describe('consumePaint', () => {
  let levels

  beforeEach(() => {
    levels = initPaintLevels()
  })

  it('reduces paint for color used', () => {
    const result = consumePaint(levels, '#000000', 10, 10)
    expect(result['#000000']).toBeLessThan(MAX_PAINT)
  })

  it('does not reduce paint for white (eraser)', () => {
    const result = consumePaint(levels, '#ffffff', 10, 10)
    expect(result['#ffffff']).toBe(MAX_PAINT)
  })

  it('scales consumption with brush size', () => {
    const small = consumePaint(levels, '#000000', 10, 5)
    const large = consumePaint(levels, '#000000', 10, 20)
    expect(small['#000000']).toBeGreaterThan(large['#000000'])
  })

  it('scales consumption with distance', () => {
    const short = consumePaint(levels, '#000000', 5, 10)
    const long = consumePaint(levels, '#000000', 20, 10)
    expect(short['#000000']).toBeGreaterThan(long['#000000'])
  })

  it('clamps to zero', () => {
    levels['#000000'] = 1
    const result = consumePaint(levels, '#000000', 100, 10)
    expect(result['#000000']).toBe(0)
  })
})

describe('reloadPaint', () => {
  it('reloads depleted colors', () => {
    const levels = { '#000000': 50, '#e94560': 100, '#ffffff': 100 }
    const result = reloadPaint(levels, 1)
    expect(result['#000000']).toBeGreaterThan(50)
  })

  it('does not exceed max paint', () => {
    const levels = { '#000000': MAX_PAINT - 1, '#ffffff': MAX_PAINT }
    const result = reloadPaint(levels, 10)
    expect(result['#000000']).toBe(MAX_PAINT)
  })

  it('does not reload white', () => {
    const levels = { '#ffffff': 50 }
    const result = reloadPaint(levels, 1)
    expect(result['#ffffff']).toBe(50)
  })

  it('returns same object if no change', () => {
    const levels = initPaintLevels()
    const result = reloadPaint(levels, 1)
    expect(result).toBe(levels)
  })
})

describe('refillColor', () => {
  it('sets color to max paint', () => {
    const levels = { '#000000': 10 }
    const result = refillColor(levels, '#000000')
    expect(result['#000000']).toBe(MAX_PAINT)
  })
})

describe('hasPaint', () => {
  it('returns true for white always', () => {
    expect(hasPaint({ '#ffffff': 0 }, '#ffffff')).toBe(true)
  })

  it('returns true when paint available', () => {
    expect(hasPaint({ '#000000': 50 }, '#000000')).toBe(true)
  })

  it('returns false when paint empty', () => {
    expect(hasPaint({ '#000000': 0 }, '#000000')).toBe(false)
  })
})

describe('getPaintPercent', () => {
  it('returns 100 for white', () => {
    expect(getPaintPercent({}, '#ffffff')).toBe(100)
  })

  it('returns percentage of max', () => {
    expect(getPaintPercent({ '#000000': MAX_PAINT / 2 }, '#000000')).toBe(50)
    expect(getPaintPercent({ '#000000': MAX_PAINT / 4 }, '#000000')).toBe(25)
  })
})
