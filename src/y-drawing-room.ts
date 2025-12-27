import { YDurableObjects, WSSharedDoc } from "y-durableobjects"
import { Hono } from "hono"
import * as Y from "yjs"

// Environment type
export interface Env {
  Bindings: {
    Y_DRAWING_ROOM: DurableObjectNamespace<YDrawingRoom>
  }
}

// WebRTC signaling types
type RTCSessionDescriptionInit = { type: string; sdp?: string }
type RTCIceCandidateInit = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null }

type SignalingMessage =
  | { type: "offer"; from?: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from?: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from?: string; to: string; candidate: RTCIceCandidateInit }

type GameMessage =
  | { type: "cursor"; x: number; y: number; from: string }
  | SignalingMessage

/**
 * YDrawingRoom - A Durable Object that uses Yjs for state synchronization
 *
 * This replaces the custom sync logic with CRDTs, providing:
 * - Automatic conflict resolution
 * - Offline-first capability
 * - Efficient delta sync
 *
 * The Yjs document structure:
 * - strokes: Y.Array<{points, color, size}>
 * - players: Y.Map<peerId, {x, y, color}>
 * - gameState: Y.Map<{enemies, pickups, paintLevels}>
 */
export class YDrawingRoom extends YDurableObjects<Env> {
  // Track WebSocket to peerId mapping
  private peerSockets = new Map<WebSocket, string>()
  private socketsByPeerId = new Map<string, WebSocket>()

  constructor(state: DurableObjectState, env: Env["Bindings"]) {
    super(state, env)
  }

  // Override fetch to handle both Yjs sync and custom endpoints
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // Handle WebSocket upgrade for Yjs sync
    if (request.headers.get("Upgrade") === "websocket") {
      const peerId = url.searchParams.get("peerId") || Math.random().toString(36).substr(2, 9)

      // Create WebSocket pair
      const [client, server] = Object.values(new WebSocketPair())

      // Accept the WebSocket with Yjs handling
      this.state.acceptWebSocket(server, [peerId])

      // Register for Yjs sync
      this.registerWebSocket(server)

      // Store peer mapping
      this.peerSockets.set(server, peerId)
      this.socketsByPeerId.set(peerId, server)

      // Send peer list to new peer
      const existingPeers = Array.from(this.peerSockets.values()).filter(id => id !== peerId)
      server.send(JSON.stringify({ type: "peers", peerIds: existingPeers }))

      // Notify existing peers about new peer
      this.broadcastMessage({ type: "peer-joined", peerId }, peerId)
      this.broadcastUserCount()

      return new Response(null, { status: 101, webSocket: client })
    }

    // For non-WebSocket requests, use parent handler
    return super.fetch(request)
  }

  // Override webSocketMessage to handle both Yjs and game messages
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Binary messages are Yjs sync messages - let parent handle
    if (message instanceof ArrayBuffer) {
      return super.webSocketMessage(ws, message)
    }

    // String messages could be Yjs or game-specific
    try {
      const data = JSON.parse(message)
      const senderPeerId = this.peerSockets.get(ws) || this.state.getTags(ws)[0]

      // WebRTC signaling - relay to specific peer
      if (data.type === "offer" || data.type === "answer" || data.type === "ice") {
        const targetSocket = this.socketsByPeerId.get(data.to)
        if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
          try {
            targetSocket.send(JSON.stringify({ ...data, from: senderPeerId }))
          } catch {}
        }
        return
      }

      // Cursor updates - broadcast to all except sender
      if (data.type === "cursor") {
        this.broadcastMessage({ ...data, from: senderPeerId }, senderPeerId)
        return
      }

      // Clear canvas - handled via Yjs, but we need to clear the Y.Array
      if (data.type === "clear") {
        const strokes = this.doc.getArray("strokes")
        this.doc.transact(() => {
          strokes.delete(0, strokes.length)
        })
        return
      }

      // Legacy stroke message - convert to Yjs
      // This provides backward compatibility during migration
      if (data.type === "stroke") {
        const strokes = this.doc.getArray("strokes")
        strokes.push([{
          points: data.points,
          color: data.color,
          size: data.size,
          timestamp: Date.now(),
          peerId: senderPeerId
        }])
        return
      }

    } catch {
      // If not valid JSON, might be a Yjs message encoded as string
      // Try to handle as binary
      const encoder = new TextEncoder()
      const binaryMessage = encoder.encode(message)
      return super.webSocketMessage(ws, binaryMessage.buffer as ArrayBuffer)
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const peerId = this.peerSockets.get(ws)

    // Clean up peer tracking
    this.peerSockets.delete(ws)
    if (peerId) {
      this.socketsByPeerId.delete(peerId)
      this.broadcastMessage({ type: "peer-left", peerId }, peerId)
    }

    this.broadcastUserCount()

    // Let parent handle Yjs cleanup
    await super.webSocketClose(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const peerId = this.peerSockets.get(ws)

    // Clean up peer tracking
    this.peerSockets.delete(ws)
    if (peerId) {
      this.socketsByPeerId.delete(peerId)
      this.broadcastMessage({ type: "peer-left", peerId }, peerId)
    }

    this.broadcastUserCount()

    // Let parent handle Yjs cleanup
    await super.webSocketError(ws)
  }

  // Helper to broadcast game messages (not Yjs sync)
  private broadcastMessage(message: object, excludePeerId?: string): void {
    const msg = JSON.stringify(message)
    for (const [socket, peerId] of this.peerSockets) {
      if (peerId === excludePeerId) continue
      if (socket.readyState === WebSocket.OPEN) {
        try { socket.send(msg) } catch {}
      }
    }
  }

  private broadcastUserCount(): void {
    const count = this.peerSockets.size
    this.broadcastMessage({ type: "userCount", count })
  }
}

// Export for wrangler.toml
export default YDrawingRoom
