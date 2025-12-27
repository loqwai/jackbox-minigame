import { YDurableObjects } from "y-durableobjects"

interface Env {
  Bindings: {
    Y_DRAWING_ROOM: DurableObjectNamespace<YDrawingRoom>
  }
}

type RTCSessionDescriptionInit = { type: string; sdp?: string }
type RTCIceCandidateInit = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null }

type SignalingMessage =
  | { type: "offer"; from?: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from?: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from?: string; to: string; candidate: RTCIceCandidateInit }

type GameMessage =
  | { type: "cursor"; x: number; y: number; from: string }
  | SignalingMessage

export class YDrawingRoom extends YDurableObjects<Env> {
  private peerSockets = new Map<WebSocket, string>()
  private socketsByPeerId = new Map<string, WebSocket>()

  constructor(state: DurableObjectState, env: Env["Bindings"]) {
    super(state, env)
    // Restore peer mappings from hibernated WebSockets
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as { peerId?: string } | null
      if (attachment?.peerId) {
        this.peerSockets.set(ws, attachment.peerId)
        this.socketsByPeerId.set(attachment.peerId, ws)
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Let parent handle Yjs sync messages (binary)
    if (message instanceof ArrayBuffer) {
      await super.webSocketMessage(ws, message)
      return
    }

    // Handle JSON messages
    try {
      const data = JSON.parse(message) as GameMessage & { peerId?: string; type?: string }

      // Handle registration message
      if (data.type === 'register' && data.peerId) {
        this.peerSockets.set(ws, data.peerId)
        this.socketsByPeerId.set(data.peerId, ws)
        ws.serializeAttachment({ peerId: data.peerId })
        // Send current count to the new peer
        ws.send(JSON.stringify({ type: 'userCount', count: this.peerSockets.size }))
        this.broadcastUserCount()
        return
      }

      // Track new peer on first message (fallback)
      if (data.peerId && !this.peerSockets.has(ws)) {
        this.peerSockets.set(ws, data.peerId)
        this.socketsByPeerId.set(data.peerId, ws)
        ws.serializeAttachment({ peerId: data.peerId })
        this.broadcastUserCount()
      }

      // Handle signaling messages
      if (data.type === "offer" || data.type === "answer" || data.type === "ice") {
        const targetSocket = this.socketsByPeerId.get(data.to)
        if (targetSocket?.readyState === WebSocket.OPEN) {
          const peerId = this.peerSockets.get(ws)
          targetSocket.send(JSON.stringify({ ...data, from: peerId }))
        }
        return
      }

      // Broadcast other messages (like cursor)
      const peerId = this.peerSockets.get(ws)
      if (peerId) {
        this.broadcastMessage({ ...data, from: peerId }, peerId)
      }
    } catch {
      // Not JSON, let parent handle
      await super.webSocketMessage(ws, message)
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const peerId = this.peerSockets.get(ws)
    if (peerId) {
      this.peerSockets.delete(ws)
      this.socketsByPeerId.delete(peerId)
      this.broadcastUserCount()
    }
    await super.webSocketClose(ws, code, reason, wasClean)
  }

  private broadcastMessage(message: object, excludePeerId?: string): void {
    const msg = JSON.stringify(message)
    for (const [socket, peerId] of this.peerSockets) {
      if (peerId === excludePeerId) continue
      if (socket.readyState !== WebSocket.OPEN) continue
      try { socket.send(msg) } catch {}
    }
  }

  private broadcastUserCount(): void {
    const count = this.peerSockets.size
    this.broadcastMessage({ type: "userCount", count })
  }
}

