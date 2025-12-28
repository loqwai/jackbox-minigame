import { YDurableObjects } from "y-durableobjects"
import { RoomRegistry } from "./room-registry"

interface Env {
  Bindings: {
    Y_DRAWING_ROOM: DurableObjectNamespace<YDrawingRoom>
    ROOM_REGISTRY: DurableObjectNamespace<RoomRegistry>
  }
}

type RTCSessionDescriptionInit = { type: string; sdp?: string }
type RTCIceCandidateInit = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null }

type SignalingMessage =
  | { type: "offer"; from?: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from?: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from?: string; to: string; candidate: RTCIceCandidateInit }

export class YDrawingRoom extends YDurableObjects<Env> {
  private peerSockets = new Map<WebSocket, string>()
  private socketsByPeerId = new Map<string, WebSocket>()
  private roomId: string | null = null
  private host: string | null = null
  private bindings: Env["Bindings"]

  constructor(state: DurableObjectState, env: Env["Bindings"]) {
    super(state, env)
    this.bindings = env
    // Restore peer mappings from hibernated WebSockets
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as { peerId?: string; roomId?: string; host?: string } | null
      if (attachment?.peerId) {
        this.peerSockets.set(ws, attachment.peerId)
        this.socketsByPeerId.set(attachment.peerId, ws)
      }
      if (attachment?.roomId) this.roomId = attachment.roomId
      if (attachment?.host) this.host = attachment.host
    }
  }

  async fetch(request: Request): Promise<Response> {
    // Extract room ID and host from URL: /rooms/:roomId?host=...
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/rooms\/([A-Za-z0-9]+)/)
    if (match) this.roomId = match[1]
    this.host = url.searchParams.get("host") || this.host
    return super.fetch(request)
  }

  private reportActivity = async (): Promise<void> => {
    if (!this.roomId || !this.host) return
    const registry = this.bindings.ROOM_REGISTRY.get(this.bindings.ROOM_REGISTRY.idFromName("global"))
    await registry.fetch(new Request(`https://internal/activity?host=${this.host}`, {
      method: "POST",
      body: JSON.stringify({ roomId: this.roomId, userCount: this.peerSockets.size }),
    })).catch(() => {}) // Fire and forget
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Let parent handle Yjs binary sync messages
    if (message instanceof ArrayBuffer) return super.webSocketMessage(ws, message)

    try {
      const data = JSON.parse(message as string)

      if (data.type === "register") {
        const peerId = data.peerId as string
        this.peerSockets.set(ws, peerId)
        this.socketsByPeerId.set(peerId, ws)
        ws.serializeAttachment({ peerId, roomId: this.roomId, host: this.host })

        // Send peer list to new peer
        const peerIds = [...this.peerSockets.values()]
        ws.send(JSON.stringify({ type: "peers", peerIds }))

        // Notify others of new peer
        this.broadcastMessage({ type: "peer-joined", peerId }, peerId)
        this.broadcastUserCount()
        return
      }

      // Relay signaling messages
      if (data.type === "offer" || data.type === "answer" || data.type === "ice") {
        const targetSocket = this.socketsByPeerId.get(data.to)
        if (targetSocket?.readyState === WebSocket.OPEN) {
          const fromPeerId = this.peerSockets.get(ws)
          targetSocket.send(JSON.stringify({ ...data, from: fromPeerId }))
        }
        return
      }
    } catch {}

    // Forward unknown messages to parent
    return super.webSocketMessage(ws, message)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const peerId = this.peerSockets.get(ws)
    if (peerId) {
      this.peerSockets.delete(ws)
      this.socketsByPeerId.delete(peerId)
      this.broadcastMessage({ type: "peer-left", peerId })
      this.broadcastUserCount()
    }
    return super.webSocketClose(ws)
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
    this.reportActivity()
  }
}

