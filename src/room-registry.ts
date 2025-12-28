import { DurableObject } from "cloudflare:workers"

interface RoomInfo {
  id: string
  userCount: number
  lastActivity: number
  createdAt: number
}

export class RoomRegistry extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === "GET" && path === "/rooms")
      return this.listRooms(request)

    if (request.method === "POST" && path === "/activity")
      return this.updateActivity(request)

    return new Response("Not Found", { status: 404 })
  }

  private listRooms = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const host = url.searchParams.get("host") || "unknown"
    const prefix = `${host}:room:`

    const rooms = await this.ctx.storage.list<RoomInfo>({ prefix })
    const now = Date.now()
    const staleThreshold = 24 * 60 * 60 * 1000 // 24 hours

    const activeRooms = [...rooms.values()]
      .filter(room => now - room.lastActivity < staleThreshold)
      .sort((a, b) => {
        // Sort by user count (desc), then by last activity (desc)
        if (b.userCount !== a.userCount) return b.userCount - a.userCount
        return b.lastActivity - a.lastActivity
      })

    return Response.json(activeRooms)
  }

  private updateActivity = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const host = url.searchParams.get("host") || "unknown"
    const { roomId, userCount } = await request.json() as { roomId: string; userCount: number }
    const key = `${host}:room:${roomId}`
    const now = Date.now()

    const existing = await this.ctx.storage.get<RoomInfo>(key)

    if (userCount === 0 && existing) {
      // Room is empty - keep it but update activity
      await this.ctx.storage.put(key, { ...existing, userCount: 0, lastActivity: now })
    } else if (userCount > 0) {
      const room: RoomInfo = {
        id: roomId,
        userCount,
        lastActivity: now,
        createdAt: existing?.createdAt ?? now,
      }
      await this.ctx.storage.put(key, room)
    }

    return new Response("OK")
  }
}
