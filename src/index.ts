import { DrawingRoom } from "./drawing-room"
import { YDrawingRoom } from "./y-drawing-room"
import { RoomRegistry } from "./room-registry"
import { manifestJson } from "./client/manifest"
import { serviceWorkerJs } from "./client/sw"

// DrawingRoom exported for wrangler.toml compatibility (deprecated, will be removed)
export { DrawingRoom, YDrawingRoom, RoomRegistry }

interface Env {
  Y_DRAWING_ROOM: DurableObjectNamespace<YDrawingRoom>
  ROOM_REGISTRY: DurableObjectNamespace<RoomRegistry>
  ASSETS: Fetcher
}

const generateRoomId = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 4 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("")
}

const json = (content: string, type = "application/json") => new Response(content, {
  headers: { "Content-Type": type },
})

/** @public Cloudflare Workers entry point */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const host = request.headers.get("Host") || url.host

    if (path === "/manifest.json") return json(manifestJson, "application/manifest+json")
    if (path === "/sw.js") return json(serviceWorkerJs, "application/javascript")
    if (path === "/") return env.ASSETS.fetch(new Request(`${url.origin}/index.html`))

    // API routes
    if (path === "/api/rooms") {
      const registry = env.ROOM_REGISTRY.get(env.ROOM_REGISTRY.idFromName("global"))
      if (request.method === "GET")
        return registry.fetch(new Request(`https://internal/rooms?host=${host}`))
      if (request.method === "POST") {
        const roomId = generateRoomId()
        await registry.fetch(new Request(`https://internal/activity?host=${host}`, {
          method: "POST",
          body: JSON.stringify({ roomId, userCount: 0 }),
        }))
        return Response.json({ roomId, url: `/room/${roomId}` })
      }
    }

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
      internalUrl.searchParams.set("host", host)
      return stub.fetch(new Request(internalUrl, request))
    }
    // Legacy /ws-legacy route removed - all sync now via Yjs

    if (subPath === "/present") return env.ASSETS.fetch(new Request(`${url.origin}/present.html`))
    if (subPath === "" || subPath === "/") return env.ASSETS.fetch(new Request(`${url.origin}/draw.html`))

    return new Response("Not Found", { status: 404 })
  },
}
