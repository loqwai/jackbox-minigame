import { describe, it, expect, beforeEach } from 'vitest'
import { moveEnemy, spawnEnemy, checkPlayerCollision, respawnEnemyAwayFromPlayer } from './enemies.js'

describe('moveEnemy', () => {
  describe('when path is clear', () => {
    it('moves toward target', () => {
      const enemy = { x: 0, y: 0, id: 1 }
      const target = { x: 100, y: 0 }
      const result = moveEnemy(enemy, target, 0.1, [])
      expect(result.x).toBeGreaterThan(0)
      expect(result.y).toBe(0)
    })

    it('clears wallFollowDir when moving freely', () => {
      const enemy = { x: 0, y: 0, id: 1, wallFollowDir: 1 }
      const result = moveEnemy(enemy, { x: 100, y: 0 }, 0.1, [])
      expect(result.wallFollowDir).toBeNull()
    })
  })

  describe('when close to target', () => {
    it('does not move when very close', () => {
      const enemy = { x: 100, y: 100, id: 1 }
      const target = { x: 105, y: 100 }
      const result = moveEnemy(enemy, target, 0.1, [])
      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
    })
  })

  describe('when blocked by stroke', () => {
    let strokes

    beforeEach(() => {
      strokes = [{
        points: [{ x: 50, y: -100 }, { x: 50, y: 100 }],
        size: 10,
        color: '#000000'
      }]
    })

    it('tries to move around obstacle', () => {
      const enemy = { x: 0, y: 0, id: 1 }
      const target = { x: 100, y: 0 }
      const result = moveEnemy(enemy, target, 0.1, strokes)
      // Should not be at original position (found a way around)
      expect(result.x !== 0 || result.y !== 0).toBe(true)
    })
  })
})

describe('spawnEnemy', () => {
  it('spawns enemy at distance from position', () => {
    const enemy = spawnEnemy({ x: 0, y: 0 }, [], 1)
    const distance = Math.hypot(enemy.x, enemy.y)
    expect(distance).toBeGreaterThanOrEqual(400)
    expect(distance).toBeLessThanOrEqual(700)
  })

  it('includes the provided id', () => {
    const enemy = spawnEnemy({ x: 0, y: 0 }, [], 42)
    expect(enemy.id).toBe(42)
  })
})

describe('checkPlayerCollision', () => {
  it('returns true when player is near enemy', () => {
    const playerPos = { x: 100, y: 100 }
    const enemies = [{ x: 110, y: 100, id: 1 }]
    expect(checkPlayerCollision(playerPos, enemies)).toBe(true)
  })

  it('returns false when player is far from enemies', () => {
    const playerPos = { x: 100, y: 100 }
    const enemies = [{ x: 200, y: 200, id: 1 }]
    expect(checkPlayerCollision(playerPos, enemies)).toBe(false)
  })

  it('checks all enemies', () => {
    const playerPos = { x: 100, y: 100 }
    const enemies = [
      { x: 0, y: 0, id: 1 },
      { x: 105, y: 100, id: 2 }
    ]
    expect(checkPlayerCollision(playerPos, enemies)).toBe(true)
  })

  it('returns false for empty enemies', () => {
    expect(checkPlayerCollision({ x: 0, y: 0 }, [])).toBe(false)
  })
})

describe('respawnEnemyAwayFromPlayer', () => {
  it('respawns enemy that is too close', () => {
    const enemy = { x: 105, y: 100, id: 1 }
    const playerPos = { x: 100, y: 100 }
    const result = respawnEnemyAwayFromPlayer(enemy, playerPos)
    const distance = Math.hypot(result.x - playerPos.x, result.y - playerPos.y)
    expect(distance).toBeGreaterThan(400)
  })

  it('does not respawn enemy that is far enough', () => {
    const enemy = { x: 200, y: 200, id: 1 }
    const playerPos = { x: 100, y: 100 }
    const result = respawnEnemyAwayFromPlayer(enemy, playerPos)
    expect(result).toEqual(enemy)
  })
})
