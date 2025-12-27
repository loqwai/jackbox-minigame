import { YDurableObjects } from "y-durableobjects"

export interface Env {
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
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get("Upgrade") !== "websocket") return super.fetch(request)

    const peerId = url.searchParams.get("peerId") || Math.random().toString(36).substr(2, 9)
    const [client, server] = Object.values(new WebSocketPair())

    this.state.acceptWebSocket(server, [peerId])
    this.registerWebSocket(server)

    this.peerSockets.set(server, peerId)
    this.socketsByPeerId.set(peerId, server)

    const existingPeers = Array.from(this.peerSockets.values()).filter(id => id !== peerId)
    server.send(JSON.stringify({ type: "peers", peerIds: existingPeers }))

    this.broadcastMessage({ type: "peer-joined", peerId }, peerId)
    this.broadcastUserCount()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message instanceof ArrayBuffer) return super.webSocketMessage(ws, message)

    try {
      const data = JSON.parse(message)
      const senderPeerId = this.peerSockets.get(ws) || this.state.getTags(ws)[0]

      if (data.type === "offer" || data.type === "answer" || data.type === "ice") {
        const targetSocket = this.socketsByPeerId.get(data.to)
        if (targetSocket?.readyState === WebSocket.OPEN) {
          try { targetSocket.send(JSON.stringify({ ...data, from: senderPeerId })) } catch {}
        }
        return
      }

      if (data.type === "cursor") {
        this.broadcastMessage({ ...data, from: senderPeerId }, senderPeerId)
        return
      }

      if (data.type === "clear") {
        const strokes = this.doc.getArray("strokes")
        this.doc.transact(() => strokes.delete(0, strokes.length))
        return
      }

      if (data.type === "stroke") {
        const strokes = this.doc.getArray("strokes")
        strokes.push([{
          points: data.points,
          color: data.color,
          size: data.size,
          timestamp: Date.now(),
          peerId: senderPeerId,
        }])
        return
      }

    } catch {
      const encoder = new TextEncoder()
      const binaryMessage = encoder.encode(message)
      return super.webSocketMessage(ws, binaryMessage.buffer as ArrayBuffer)
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const peerId = this.peerSockets.get(ws)

    this.peerSockets.delete(ws)
    if (peerId) {
      this.socketsByPeerId.delete(peerId)
      this.broadcastMessage({ type: "peer-left", peerId }, peerId)
    }

    this.broadcastUserCount()
    await super.webSocketClose(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const peerId = this.peerSockets.get(ws)

    this.peerSockets.delete(ws)
    if (peerId) {
      this.socketsByPeerId.delete(peerId)
      this.broadcastMessage({ type: "peer-left", peerId }, peerId)
    }

    this.broadcastUserCount()
    await super.webSocketError(ws)
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

export default YDrawingRoom
