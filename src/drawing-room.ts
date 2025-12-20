import { DurableObject } from "cloudflare:workers"

export interface Env {
  DRAWING_ROOM: DurableObjectNamespace<DrawingRoom>
}

type Point = { x: number; y: number }
type DrawMessage =
  | { type: "stroke"; points: Point[]; color: string; size: number }
  | { type: "clear" }

type ServerMessage =
  | { type: "stroke"; points: Point[]; color: string; size: number }
  | { type: "clear" }
  | { type: "userCount"; count: number }

export class DrawingRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade")
    if (upgradeHeader !== "websocket") return new Response("Expected WebSocket", { status: 426 })

    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)

    const count = this.ctx.getWebSockets().length
    server.send(JSON.stringify({ type: "userCount", count } as ServerMessage))
    this.broadcastUserCount()

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return

    try {
      JSON.parse(message) as DrawMessage
      const sockets = this.ctx.getWebSockets()
      for (const socket of sockets) {
        try { socket.send(message) } catch {}
      }
    } catch {}
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason)
    this.broadcastUserCount()
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "WebSocket error")
    this.broadcastUserCount()
  }

  private broadcastUserCount = (): void => {
    const sockets = this.ctx.getWebSockets()
    const message = JSON.stringify({ type: "userCount", count: sockets.length } as ServerMessage)
    for (const socket of sockets) {
      try { socket.send(message) } catch {}
    }
  }
}
