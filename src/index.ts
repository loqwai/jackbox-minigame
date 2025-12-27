import { DrawingRoom } from "./drawing-room"
import { YDrawingRoom } from "./y-drawing-room"
import { manifestJson } from "./client/manifest"
import { serviceWorkerJs } from "./client/sw"

// DrawingRoom exported for wrangler.toml compatibility (deprecated, will be removed)
export { DrawingRoom, YDrawingRoom }

interface Env {
  Y_DRAWING_ROOM: DurableObjectNamespace<YDrawingRoom>
  ASSETS: Fetcher
}

const generateRoomId = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 4 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("")
}

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

    // Serve static assets from /js/
    if (path.startsWith("/js/")) return env.ASSETS.fetch(request)

    const roomMatch = path.match(/^\/room\/([A-Za-z0-9]+)(\/.*)?$/)
    if (!roomMatch) return new Response("Not Found", { status: 404 })

    const roomId = roomMatch[1].toUpperCase()
    const subPath = roomMatch[2] || ""

    if (subPath === "/ws") {
      const id = env.Y_DRAWING_ROOM.idFromName(roomId)
      const stub = env.Y_DRAWING_ROOM.get(id)
      // y-durableobjects expects /rooms/:id internally
      const internalUrl = new URL(`/rooms/${roomId}`, url.origin)
      internalUrl.search = url.search
      return stub.fetch(new Request(internalUrl, request))
    }
    // Legacy /ws-legacy route removed - all sync now via Yjs

    if (subPath === "/present") return env.ASSETS.fetch(new Request(`${url.origin}/present.html`))
    if (subPath === "" || subPath === "/") return env.ASSETS.fetch(new Request(`${url.origin}/draw.html`))

    return new Response("Not Found", { status: 404 })
  },
}
