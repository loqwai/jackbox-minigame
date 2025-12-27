import { DrawingRoom } from "./drawing-room"
import { YDrawingRoom } from "./y-drawing-room"
import { drawHtml } from "./client/draw"
import { presentHtml } from "./client/present"
import { manifestJson } from "./client/manifest"
import { serviceWorkerJs } from "./client/sw"

export { DrawingRoom, YDrawingRoom }

interface Env {
  DRAWING_ROOM: DurableObjectNamespace<DrawingRoom>
  Y_DRAWING_ROOM: DurableObjectNamespace<YDrawingRoom>
}

const generateRoomId = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 4 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("")
}

const html = (content: string) => new Response(content, {
  headers: { "Content-Type": "text/html; charset=utf-8" },
})

const json = (content: string, type = "application/json") => new Response(content, {
  headers: { "Content-Type": type },
})

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === "/manifest.json") return json(manifestJson, "application/manifest+json")
    if (path === "/sw.js") return json(serviceWorkerJs, "application/javascript")
    if (path === "/") return Response.redirect(`${url.origin}/room/${generateRoomId()}`, 302)

    const roomMatch = path.match(/^\/room\/([A-Za-z0-9]+)(\/.*)?$/)
    if (!roomMatch) return new Response("Not Found", { status: 404 })

    const roomId = roomMatch[1].toUpperCase()
    const subPath = roomMatch[2] || ""

    if (subPath === "/ws") {
      const id = env.Y_DRAWING_ROOM.idFromName(roomId)
      return env.Y_DRAWING_ROOM.get(id).fetch(request)
    }

    if (subPath === "/ws-legacy") {
      const id = env.DRAWING_ROOM.idFromName(roomId)
      return env.DRAWING_ROOM.get(id).fetch(request)
    }

    if (subPath === "/present") return html(presentHtml(roomId))
    if (subPath === "" || subPath === "/") return html(drawHtml(roomId))

    return new Response("Not Found", { status: 404 })
  },
}
