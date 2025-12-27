// WebSocket connection hook
import { useEffect, useRef } from 'preact/hooks'
import { setupYjsSync, resetSyncState } from '../sync/yjs-setup.js'
import { cleanupAllPeers } from '../sync/webrtc.js'

export const useWebSocket = (roomId, peerId, onOpen, onClose, onMessage) => {
  const wsRef = useRef(null)
  const callbacksRef = useRef({ onOpen, onClose, onMessage })

  // Update callbacks ref on each render (no reconnect needed)
  callbacksRef.current = { onOpen, onClose, onMessage }

  useEffect(() => {
    let reconnectTimeout = null

    const connect = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${location.host}/room/${roomId}/ws?peerId=${peerId}`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        callbacksRef.current.onOpen?.()
        setupYjsSync(ws, peerId, () => {})
      }

      ws.onclose = () => {
        callbacksRef.current.onClose?.()
        resetSyncState()
        cleanupAllPeers()
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          reconnectTimeout = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => ws.close()

      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) return
        try {
          callbacksRef.current.onMessage?.(JSON.parse(e.data))
        } catch {}
      }
    }

    connect()

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (wsRef.current) wsRef.current.close()
      cleanupAllPeers()
    }
  }, [roomId, peerId])

  return wsRef
}
