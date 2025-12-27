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

