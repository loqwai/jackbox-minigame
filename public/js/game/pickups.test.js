import { describe, it, expect } from 'vitest'
import { spawnPickup, checkPickupCollision, getPickupsByColor } from './pickups.js'

describe('spawnPickup', () => {
  it('spawns pickup at distance from position', () => {
    const pickup = spawnPickup({ x: 0, y: 0 }, [])
    const distance = Math.hypot(pickup.x, pickup.y)
    expect(distance).toBeGreaterThanOrEqual(200)
    expect(distance).toBeLessThanOrEqual(600)
  })

  it('assigns a non-white color', () => {
    const pickup = spawnPickup({ x: 0, y: 0 }, [])
    expect(pickup.color).not.toBe('#ffffff')
    expect(pickup.color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('assigns unique id', () => {
    const p1 = spawnPickup({ x: 0, y: 0 }, [])
    const p2 = spawnPickup({ x: 0, y: 0 }, [p1])
    expect(p1.id).not.toBe(p2.id)
  })

  it('returns null when at max pickups', () => {
    const existing = Array(5).fill(null).map((_, i) => ({ x: i * 100, y: 0, id: i, color: '#000' }))
    expect(spawnPickup({ x: 0, y: 0 }, existing)).toBeNull()
  })
})

describe('checkPickupCollision', () => {
  it('collects pickup when player is close', () => {
    const pickups = [{ x: 105, y: 100, id: 1, color: '#000' }]
    const result = checkPickupCollision({ x: 100, y: 100 }, pickups)
    expect(result.collected).toHaveLength(1)
    expect(result.remaining).toHaveLength(0)
  })

  it('does not collect distant pickups', () => {
    const pickups = [{ x: 200, y: 200, id: 1, color: '#000' }]
    const result = checkPickupCollision({ x: 100, y: 100 }, pickups)
    expect(result.collected).toHaveLength(0)
    expect(result.remaining).toHaveLength(1)
  })

  it('handles multiple pickups', () => {
    const pickups = [
      { x: 105, y: 100, id: 1, color: '#000' },
      { x: 200, y: 200, id: 2, color: '#fff' },
      { x: 110, y: 100, id: 3, color: '#f00' }
    ]
    const result = checkPickupCollision({ x: 100, y: 100 }, pickups)
    expect(result.collected).toHaveLength(2)
    expect(result.remaining).toHaveLength(1)
  })
})

describe('getPickupsByColor', () => {
  it('groups pickups by color', () => {
    const pickups = [
      { x: 0, y: 0, id: 1, color: '#000000' },
      { x: 1, y: 0, id: 2, color: '#ff0000' },
      { x: 2, y: 0, id: 3, color: '#000000' }
    ]
    const result = getPickupsByColor(pickups)
    expect(result['#000000']).toHaveLength(2)
    expect(result['#ff0000']).toHaveLength(1)
  })

  it('returns empty object for empty pickups', () => {
    expect(getPickupsByColor([])).toEqual({})
  })
})
