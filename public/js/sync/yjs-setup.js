// Yjs document and sync setup
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

// Message types for Yjs protocol
export const messageSync = 0
export const messageAwareness = 1

// Create Yjs document - single source of truth
export const ydoc = new Y.Doc()

// Shared types for collaborative state
export const yStrokes = ydoc.getArray('strokes')
export const yPlayers = ydoc.getMap('players')
export const yGameState = ydoc.getMap('gameState')
export const yEnemies = ydoc.getArray('enemies')
export const yPickups = ydoc.getArray('pickups')
export const yTerritory = ydoc.getMap('territory')

// Awareness for ephemeral state (cursors, presence)
export const awareness = new Awareness(ydoc)

// Host detection - lowest clientID is the host
export const isHost = () => {
  const states = awareness.getStates()
  if (states.size === 0) return true
  const clientIds = Array.from(states.keys())
  return Math.min(...clientIds) === awareness.clientID
}

// Track sync state
let yjsSynced = false
export const isSynced = () => yjsSynced

// Setup Yjs sync over WebSocket
export const setupYjsSync = (websocket, peerId, onSynced) => {
  // Register peerId with server
  if (peerId) {
    websocket.send(JSON.stringify({ type: 'register', peerId }))
  }

  // Send sync step 1 when connected
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, messageSync)
  syncProtocol.writeSyncStep1(encoder, ydoc)
  websocket.send(encoding.toUint8Array(encoder))

  // Fallback: consider synced after 500ms
  const syncTimeout = setTimeout(() => {
    if (!yjsSynced) {
      yjsSynced = true
      onSynced?.()
    }
  }, 500)

  // Handle incoming Yjs messages
  const handleMessage = (event) => {
    if (!(event.data instanceof ArrayBuffer)) return

    const decoder = decoding.createDecoder(new Uint8Array(event.data))
    const messageType = decoding.readVarUint(decoder)

    if (messageType === messageSync) {
      const responseEncoder = encoding.createEncoder()
      encoding.writeVarUint(responseEncoder, messageSync)
      syncProtocol.readSyncMessage(decoder, responseEncoder, ydoc, null)
      if (encoding.length(responseEncoder) > 1) {
        websocket.send(encoding.toUint8Array(responseEncoder))
      }
      if (!yjsSynced) {
        yjsSynced = true
        clearTimeout(syncTimeout)
        onSynced?.()
      }
    }

    if (messageType === messageAwareness) {
      awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), null)
    }
  }

  websocket.addEventListener('message', handleMessage)

  // Send local updates to server
  const updateHandler = (update, origin) => {
    if (origin === 'remote') return
    if (websocket.readyState !== WebSocket.OPEN) return
    const updateEncoder = encoding.createEncoder()
    encoding.writeVarUint(updateEncoder, messageSync)
    syncProtocol.writeUpdate(updateEncoder, update)
    websocket.send(encoding.toUint8Array(updateEncoder))
  }
  ydoc.on('update', updateHandler)

  // Send awareness updates
  const awarenessHandler = ({ added, updated, removed }) => {
    if (websocket.readyState !== WebSocket.OPEN) return
    const changedClients = added.concat(updated).concat(removed)
    const awarenessEncoder = encoding.createEncoder()
    encoding.writeVarUint(awarenessEncoder, messageAwareness)
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
    )
    websocket.send(encoding.toUint8Array(awarenessEncoder))
  }
  awareness.on('update', awarenessHandler)

  // Return cleanup function
  return () => {
    clearTimeout(syncTimeout)
    websocket.removeEventListener('message', handleMessage)
    ydoc.off('update', updateHandler)
    awareness.off('update', awarenessHandler)
    yjsSynced = false
  }
}

// Reset sync state (for reconnection)
export const resetSyncState = () => {
  yjsSynced = false
}
