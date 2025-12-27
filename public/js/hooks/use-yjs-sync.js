// Yjs synchronization hooks
import { useEffect } from 'preact/hooks'
import { yStrokes, yEnemies, yPickups, awareness } from '../sync/yjs-setup.js'

export const useStrokesSync = (onStrokesChange) => {
  useEffect(() => {
    const observer = () => {
      onStrokesChange(yStrokes.toArray())
    }
    yStrokes.observe(observer)
    onStrokesChange(yStrokes.toArray())
    return () => yStrokes.unobserve(observer)
  }, [onStrokesChange])
}

export const useEnemiesSync = (onEnemiesChange) => {
  useEffect(() => {
    const observer = (event, transaction) => {
      if (transaction.local) return
      onEnemiesChange(yEnemies.toArray())
    }
    yEnemies.observe(observer)
    if (yEnemies.length > 0) {
      onEnemiesChange(yEnemies.toArray())
    }
    return () => yEnemies.unobserve(observer)
  }, [onEnemiesChange])
}

export const usePickupsSync = (onPickupsChange) => {
  useEffect(() => {
    const observer = () => {
      onPickupsChange(yPickups.toArray())
    }
    yPickups.observe(observer)
    if (yPickups.length > 0) {
      onPickupsChange(yPickups.toArray())
    }
    return () => yPickups.unobserve(observer)
  }, [onPickupsChange])
}

export const useAwarenessSync = (peerId, onCursorsChange) => {
  useEffect(() => {
    const handleChange = ({ }) => {
      const states = awareness.getStates()
      const cursors = new Map()

      states.forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        if (!state?.cursor) return
        const id = state.peerId || String(clientId)
        cursors.set(id, {
          x: state.cursor.x,
          y: state.cursor.y,
          clientId,
          color: state.cursor.color
        })
      })

      onCursorsChange(cursors)
    }

    awareness.on('change', handleChange)
    awareness.setLocalStateField('peerId', peerId)

    return () => awareness.off('change', handleChange)
  }, [peerId, onCursorsChange])
}

export const broadcastCursor = (x, y, color) => {
  awareness.setLocalStateField('cursor', { x, y, color })
}
