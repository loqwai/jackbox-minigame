// Canvas setup and resize hook
import { useRef, useEffect, useCallback } from 'preact/hooks'

export const useCanvas = (onResize) => {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const ctxRef = useRef(null)

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height
    canvas.style.width = rect.width + 'px'
    canvas.style.height = rect.height + 'px'
    ctxRef.current = canvas.getContext('2d')
    ctxRef.current.lineCap = 'round'
    ctxRef.current.lineJoin = 'round'
    onResize?.()
  }, [onResize])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  return { canvasRef, containerRef, ctxRef }
}
