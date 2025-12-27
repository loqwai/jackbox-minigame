import { describe, it, expect } from 'vitest'
import { adjustColor } from './color.js'

describe('adjustColor', () => {
  describe('when lightening colors', () => {
    it('lightens black by adding to RGB values', () => {
      const result = adjustColor('#000000', 50)
      expect(result).toBe('#323232')
    })

    it('lightens a color by the specified amount', () => {
      const result = adjustColor('#808080', 32)
      expect(result).toBe('#a0a0a0')
    })
  })

  describe('when darkening colors', () => {
    it('darkens white by subtracting from RGB values', () => {
      const result = adjustColor('#ffffff', -50)
      expect(result).toBe('#cdcdcd')
    })

    it('darkens a color by the specified amount', () => {
      const result = adjustColor('#808080', -32)
      expect(result).toBe('#606060')
    })
  })

  describe('when clamping values', () => {
    it('clamps to white when exceeding 255', () => {
      const result = adjustColor('#ffffff', 100)
      expect(result).toBe('#ffffff')
    })

    it('clamps to black when below 0', () => {
      const result = adjustColor('#000000', -100)
      expect(result).toBe('#000000')
    })

    it('clamps individual channels independently', () => {
      const result = adjustColor('#ff0000', 100)
      expect(result).toBe('#ff6464')
    })
  })

  describe('with game colors', () => {
    it('handles the primary red color', () => {
      const result = adjustColor('#e94560', 40)
      expect(result).toBe('#ff6d88')
    })

    it('handles darkening for gradients', () => {
      const result = adjustColor('#e94560', -40)
      expect(result).toBe('#c11d38')
    })
  })
})
