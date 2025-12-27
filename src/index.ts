import { DrawingRoom } from "./drawing-room"
import { YDrawingRoom } from "./y-drawing-room"
import { drawHtml } from "./client/draw"
import { presentHtml } from "./client/present"
import { manifestJson } from "./client/manifest"
import { serviceWorkerJs } from "./client/sw"

// Export both Durable Objects
export { DrawingRoom, YDrawingRoom }

// Environment type with both bindings
interface Env {
  DRAWING_ROOM: DurableObjectNamespace<DrawingRoom>
  Y_DRAWING_ROOM: DurableObjectNamespace<YDrawingRoom>
}

const generateRoomId = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = ""
  for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length))
  return result
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === "/manifest.json") {
      return new Response(manifestJson, {
        headers: { "Content-Type": "application/manifest+json" },
      })
    }

    if (path === "/sw.js") {
      return new Response(serviceWorkerJs, {
        headers: { "Content-Type": "application/javascript" },
      })
    }

    if (path === "/") return Response.redirect(`${url.origin}/room/${generateRoomId()}`, 302)

    const roomMatch = path.match(/^\/room\/([A-Za-z0-9]+)(\/.*)?$/)
    if (!roomMatch) return new Response("Not Found", { status: 404 })

    const roomId = roomMatch[1].toUpperCase()
    const subPath = roomMatch[2] || ""

    // Use Yjs-based room for WebSocket connections
    if (subPath === "/ws") {
      const id = env.Y_DRAWING_ROOM.idFromName(roomId)
      const stub = env.Y_DRAWING_ROOM.get(id)
      return stub.fetch(request)
    }

    // Legacy endpoint (keep for backward compatibility during migration)
    if (subPath === "/ws-legacy") {
      const id = env.DRAWING_ROOM.idFromName(roomId)
      const stub = env.DRAWING_ROOM.get(id)
      return stub.fetch(request)
    }

    if (subPath === "/present") {
      return new Response(presentHtml(roomId), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    }

    if (subPath === "" || subPath === "/") {
      return new Response(drawHtml(roomId), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    }

    return new Response("Not Found", { status: 404 })
  },
}
