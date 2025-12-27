// Game loop hook
import { useEffect, useRef } from 'preact/hooks'

export const useGameLoop = (onTick) => {
  const lastTimeRef = useRef(performance.now())
  const animationIdRef = useRef(null)

  useEffect(() => {
    const gameLoop = (currentTime) => {
      const deltaTime = (currentTime - lastTimeRef.current) / 1000
      lastTimeRef.current = currentTime

      onTick(deltaTime, currentTime)

      animationIdRef.current = requestAnimationFrame(gameLoop)
    }

    animationIdRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
    }
  }, [onTick])
}
