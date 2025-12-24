import { DurableObject } from "cloudflare:workers"

export interface Env {
  DRAWING_ROOM: DurableObjectNamespace<DrawingRoom>
}

// WebRTC types (not available in Workers runtime, but needed for signaling relay)
type RTCSessionDescriptionInit = { type: string; sdp?: string }
type RTCIceCandidateInit = { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null }

type Point = { x: number; y: number }
type Stroke = { points: Point[]; color: string; size: number }

type SignalingMessage =
  | { type: "join"; peerId: string }
  | { type: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }

type DrawMessage =
  | { type: "stroke"; points: Point[]; color: string; size: number }
  | { type: "clear" }

type ServerMessage =
  | { type: "stroke"; points: Point[]; color: string; size: number }
  | { type: "clear" }
  | { type: "sync"; strokes: Stroke[] }
  | { type: "userCount"; count: number }
  | { type: "peers"; peerIds: string[] }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | SignalingMessage

export class DrawingRoom extends DurableObject {
  private strokes: Stroke[] = []

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade")
    if (upgradeHeader !== "websocket") return new Response("Expected WebSocket", { status: 426 })

    const url = new URL(request.url)
    const peerId = url.searchParams.get("peerId") || Math.random().toString(36).substr(2, 9)

    // Load strokes from storage if not already loaded
    if (this.strokes.length === 0) {
      const stored = await this.ctx.storage.get<Stroke[]>("strokes")
      if (stored) this.strokes = stored
    }

    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server, [peerId])

    // Send existing drawing state to new peer
    if (this.strokes.length > 0) {
      server.send(JSON.stringify({ type: "sync", strokes: this.strokes }))
    }

    // Send existing peer list to new peer
    const existingPeers = this.ctx.getWebSockets()
      .map(s => this.ctx.getTags(s)[0])
      .filter(id => id && id !== peerId)
    server.send(JSON.stringify({ type: "peers", peerIds: existingPeers }))

    // Notify existing peers about new peer
    this.broadcast({ type: "peer-joined", peerId }, peerId)
    this.broadcastUserCount()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return

    try {
      const data = JSON.parse(message)
      const senderPeerId = this.ctx.getTags(ws)[0]

      // WebRTC signaling - relay to specific peer
      if (data.type === "offer" || data.type === "answer" || data.type === "ice") {
        const targetSocket = this.ctx.getWebSockets()
          .find(s => this.ctx.getTags(s)[0] === data.to)
        if (targetSocket) {
          try { targetSocket.send(JSON.stringify({ ...data, from: senderPeerId })) } catch {}
        }
        return
      }

      // Stroke message - store and broadcast to others
      if (data.type === "stroke") {
        const stroke: Stroke = { points: data.points, color: data.color, size: data.size }
        this.strokes.push(stroke)
        this.ctx.storage.put("strokes", this.strokes)
        this.broadcast({ type: "stroke", ...stroke }, senderPeerId)
        return
      }

      // Clear message - clear storage and broadcast to others
      if (data.type === "clear") {
        this.strokes = []
        this.ctx.storage.delete("strokes")
        this.broadcast({ type: "clear" }, senderPeerId)
        return
      }
    } catch {}
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const peerId = this.ctx.getTags(ws)[0]
    ws.close(code, reason)
    if (peerId) this.broadcast({ type: "peer-left", peerId }, peerId)
    this.broadcastUserCount()
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const peerId = this.ctx.getTags(ws)[0]
    ws.close(1011, "WebSocket error")
    if (peerId) this.broadcast({ type: "peer-left", peerId }, peerId)
    this.broadcastUserCount()
  }

  private broadcast = (message: ServerMessage, excludePeerId?: string): void => {
    const msg = JSON.stringify(message)
    const sockets = this.ctx.getWebSockets()
    for (const socket of sockets) {
      const peerId = this.ctx.getTags(socket)[0]
      if (peerId === excludePeerId) continue
      try { socket.send(msg) } catch {}
    }
  }

  private broadcastUserCount = (): void => {
    const count = this.ctx.getWebSockets().length
    this.broadcast({ type: "userCount", count })
  }
}
