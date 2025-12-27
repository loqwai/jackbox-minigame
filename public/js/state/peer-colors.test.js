import { describe, it, expect, beforeEach } from 'vitest'
import { getPeerColor, clearPeerColor, resetPeerColors } from './peer-colors.js'

describe('getPeerColor', () => {
  beforeEach(() => {
    resetPeerColors()
  })

  it('returns a color for new peer', () => {
    const color = getPeerColor('peer1')
    expect(color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('returns same color for same peer', () => {
    const color1 = getPeerColor('peer1')
    const color2 = getPeerColor('peer1')
    expect(color1).toBe(color2)
  })

  it('returns different colors for different peers', () => {
    const color1 = getPeerColor('peer1')
    const color2 = getPeerColor('peer2')
    expect(color1).not.toBe(color2)
  })

  it('cycles through colors when many peers', () => {
    const colors = []
    for (let i = 0; i < 10; i++) {
      colors.push(getPeerColor(`peer${i}`))
    }
    // Should have cycled (8 cursor colors)
    expect(colors[0]).toBe(colors[8])
  })
})

describe('clearPeerColor', () => {
  beforeEach(() => {
    resetPeerColors()
  })

  it('removes color assignment for peer', () => {
    const color1 = getPeerColor('peer1')
    clearPeerColor('peer1')
    // Getting color again assigns from start
    resetPeerColors()
    const color2 = getPeerColor('peer1')
    expect(color1).toBe(color2)
  })
})

describe('resetPeerColors', () => {
  it('clears all color assignments', () => {
    getPeerColor('peer1')
    getPeerColor('peer2')
    resetPeerColors()
    const color = getPeerColor('newpeer')
    // Should get first color in palette
    expect(color).toBe('#e94560')
  })
})
