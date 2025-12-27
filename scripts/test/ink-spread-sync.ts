import { describe, it, expect, beforeEach } from "vitest"
import * as Y from "yjs"

// Types mirroring the game
type Point = { x: number; y: number }

type Stroke = {
  points: Point[]
  color: string
  size: number
  timestamp: number
  peerId: string
}

type TerritoryCell = {
  color: string | null
  strength: number
  ownerId: string | null
}

// Simplified spread simulation for testing sync behavior
const createSpreadSimulation = () => {
  const territory = new Map<string, TerritoryCell>()
  let particleId = 0

  const toGridKey = (x: number, y: number, cellSize = 8) => {
    const gx = Math.floor(x / cellSize)
    const gy = Math.floor(y / cellSize)
    return `${gx},${gy}`
  }

  const spawnFromStroke = (stroke: Stroke) => {
    if (stroke.color === '#ffffff') return // Eraser

    const strength = stroke.size / 10
    for (const point of stroke.points) {
      const key = toGridKey(point.x, point.y)
      if (!territory.has(key)) {
        territory.set(key, {
          color: stroke.color,
          strength,
          ownerId: stroke.peerId,
        })
      }
    }
    particleId++
  }

  const update = (deltaTime: number) => {
    // Simplified: just expand each territory cell slightly
    const newCells: Array<[string, TerritoryCell]> = []

    territory.forEach((cell, key) => {
      const [gx, gy] = key.split(',').map(Number)
      // Expand to neighbors
      const neighbors = [
        `${gx - 1},${gy}`,
        `${gx + 1},${gy}`,
        `${gx},${gy - 1}`,
        `${gx},${gy + 1}`,
      ]

      for (const nKey of neighbors) {
        if (!territory.has(nKey)) {
          newCells.push([nKey, { ...cell, strength: cell.strength * 0.9 }])
        }
      }
    })

    // Apply expansions
    for (const [key, cell] of newCells) {
      if (!territory.has(key)) {
        territory.set(key, cell)
      }
    }
  }

  const serializeTerritory = () => {
    const result: Record<string, TerritoryCell> = {}
    territory.forEach((cell, key) => {
      result[key] = cell
    })
    return result
  }

  const loadTerritory = (data: Record<string, TerritoryCell>) => {
    territory.clear()
    for (const [key, cell] of Object.entries(data)) {
      territory.set(key, cell)
    }
  }

  return {
    spawnFromStroke,
    update,
    serializeTerritory,
    loadTerritory,
    getTerritory: () => territory,
    getTerritorySize: () => territory.size,
  }
}

// Mock client with Yjs document and simulation
const createClient = (peerId: string) => {
  const doc = new Y.Doc()
  const strokes = doc.getArray<Stroke>("strokes")
  const yTerritory = doc.getMap("territory")
  const sim = createSpreadSimulation()
  let isHost = false

  // Process strokes into simulation
  let processedStrokeCount = 0
  strokes.observe(() => {
    while (processedStrokeCount < strokes.length) {
      const stroke = strokes.get(processedStrokeCount)
      sim.spawnFromStroke(stroke)
      processedStrokeCount++
    }
  })

  // Sync territory from Yjs (non-hosts)
  yTerritory.observe((event, transaction) => {
    if (transaction.local) return
    if (isHost) return
    const data: Record<string, TerritoryCell> = {}
    yTerritory.forEach((value, key) => {
      data[key] = value as TerritoryCell
    })
    sim.loadTerritory(data)
  })

  return {
    doc,
    strokes,
    yTerritory,
    sim,
    peerId,
    setHost: (h: boolean) => { isHost = h },
    isHost: () => isHost,
    // Simulate game loop tick
    tick: (deltaTime: number) => {
      if (isHost) {
        sim.update(deltaTime)
        // Sync territory to Yjs
        doc.transact(() => {
          const data = sim.serializeTerritory()
          for (const [key, cell] of Object.entries(data)) {
            if (!yTerritory.has(key)) {
              yTerritory.set(key, cell)
            }
          }
        })
      }
    },
    draw: (x: number, y: number, color: string, size = 10) => {
      strokes.push([{
        points: [{ x, y }],
        color,
        size,
        timestamp: Date.now(),
        peerId,
      }])
    },
  }
}

type Client = ReturnType<typeof createClient>

// Connect clients via Yjs updates
const connectClients = (clients: Client[]) => {
  for (const client of clients) {
    client.doc.on("update", (update: Uint8Array) => {
      for (const other of clients) {
        if (other === client) continue
        Y.applyUpdate(other.doc, update)
      }
    })
  }
}

describe("Ink Spreading Multiplayer Sync", () => {
  describe("when host draws", () => {
    let host: Client
    let player: Client

    beforeEach(() => {
      host = createClient("host")
      player = createClient("player")
      host.setHost(true)
      connectClients([host, player])
    })

    it("stroke syncs to player", () => {
      host.draw(100, 100, "#ff0000")

      expect(host.strokes.length).toBe(1)
      expect(player.strokes.length).toBe(1)
      expect(player.strokes.get(0).color).toBe("#ff0000")
    })

    it("territory spreads on host", () => {
      host.draw(100, 100, "#ff0000")
      host.tick(0.1)

      expect(host.sim.getTerritorySize()).toBeGreaterThan(1)
    })

    it("territory syncs to player after tick", () => {
      host.draw(100, 100, "#ff0000")
      host.tick(0.1)

      // Give Yjs time to sync
      expect(player.yTerritory.size).toBeGreaterThan(0)
    })

    it("multiple strokes create expanding territory", () => {
      host.draw(0, 0, "#ff0000")
      host.draw(50, 50, "#00ff00")
      host.tick(0.1)
      host.tick(0.1)
      host.tick(0.1)

      const hostTerritory = host.sim.serializeTerritory()
      const colors = new Set(Object.values(hostTerritory).map(c => c.color))

      expect(colors.has("#ff0000")).toBe(true)
      expect(colors.has("#00ff00")).toBe(true)
    })
  })

  describe("when player draws", () => {
    let host: Client
    let player: Client

    beforeEach(() => {
      host = createClient("host")
      player = createClient("player")
      host.setHost(true)
      connectClients([host, player])
    })

    it("stroke syncs to host", () => {
      player.draw(100, 100, "#0000ff")

      expect(player.strokes.length).toBe(1)
      expect(host.strokes.length).toBe(1)
    })

    it("host processes player stroke into territory", () => {
      player.draw(100, 100, "#0000ff")
      host.tick(0.1)

      const hostTerritory = host.sim.serializeTerritory()
      const hasBlue = Object.values(hostTerritory).some(c => c.color === "#0000ff")

      expect(hasBlue).toBe(true)
    })

    it("player receives territory from host", () => {
      player.draw(100, 100, "#0000ff")
      host.tick(0.1)

      expect(player.yTerritory.size).toBeGreaterThan(0)
    })
  })

  describe("combat between players", () => {
    let host: Client
    let player1: Client
    let player2: Client

    beforeEach(() => {
      host = createClient("host")
      player1 = createClient("player1")
      player2 = createClient("player2")
      host.setHost(true)
      connectClients([host, player1, player2])
    })

    it("both colors appear in territory", () => {
      player1.draw(0, 0, "#ff0000", 10)
      player2.draw(10, 0, "#0000ff", 10)
      host.tick(0.1)

      const hostTerritory = host.sim.serializeTerritory()
      const colors = new Set(Object.values(hostTerritory).map(c => c.color))

      expect(colors.has("#ff0000")).toBe(true)
      expect(colors.has("#0000ff")).toBe(true)
    })

    it("strokes from all players sync to all clients", () => {
      player1.draw(0, 0, "#ff0000")
      player2.draw(100, 100, "#0000ff")

      expect(host.strokes.length).toBe(2)
      expect(player1.strokes.length).toBe(2)
      expect(player2.strokes.length).toBe(2)
    })
  })

  describe("late joiner", () => {
    let host: Client
    let player: Client

    beforeEach(() => {
      host = createClient("host")
      host.setHost(true)
    })

    it("receives existing strokes on join", () => {
      host.draw(100, 100, "#ff0000")
      host.draw(200, 200, "#00ff00")
      host.tick(0.1)

      // Late joiner connects
      player = createClient("player")
      Y.applyUpdate(player.doc, Y.encodeStateAsUpdate(host.doc))

      expect(player.strokes.length).toBe(2)
    })

    it("receives existing territory on join", () => {
      host.draw(100, 100, "#ff0000")
      host.tick(0.1)
      host.tick(0.1)

      // Late joiner connects
      player = createClient("player")
      Y.applyUpdate(player.doc, Y.encodeStateAsUpdate(host.doc))

      expect(player.yTerritory.size).toBeGreaterThan(0)
    })
  })

  describe("performance", () => {
    let host: Client
    let player: Client

    beforeEach(() => {
      host = createClient("host")
      player = createClient("player")
      host.setHost(true)
      connectClients([host, player])
    })

    it("handles rapid drawing", () => {
      const start = performance.now()

      for (let i = 0; i < 50; i++) {
        host.draw(i * 10, i * 10, `#${(i * 5).toString(16).padStart(6, "0")}`)
      }

      for (let i = 0; i < 10; i++) {
        host.tick(0.1)
      }

      const elapsed = performance.now() - start

      expect(host.strokes.length).toBe(50)
      expect(player.strokes.length).toBe(50)
      expect(elapsed).toBeLessThan(1000)
    })

    it("territory size grows over time", () => {
      host.draw(0, 0, "#ff0000")

      const sizeAfterDraw = host.sim.getTerritorySize()
      host.tick(0.1)
      host.tick(0.1)
      host.tick(0.1)

      const sizeAfterTicks = host.sim.getTerritorySize()

      // Territory should grow from spreading
      expect(sizeAfterTicks).toBeGreaterThan(sizeAfterDraw)
    })
  })
})

describe("Eraser Behavior", () => {
  let host: Client

  beforeEach(() => {
    host = createClient("host")
    host.setHost(true)
  })

  it("eraser strokes do not create territory", () => {
    host.draw(100, 100, "#ffffff")  // Eraser
    host.tick(0.1)

    expect(host.sim.getTerritorySize()).toBe(0)
  })

  it("colored strokes create territory while eraser does not", () => {
    host.draw(100, 100, "#ff0000")
    host.tick(0.1)
    const sizeAfterRed = host.sim.getTerritorySize()
    expect(sizeAfterRed).toBeGreaterThan(0)

    // Eraser stroke in different location doesn't add territory
    host.draw(500, 500, "#ffffff")

    // Territory from red should still exist
    const territory = host.sim.serializeTerritory()
    const hasRed = Object.values(territory).some(c => c.color === "#ff0000")
    expect(hasRed).toBe(true)
  })
})

describe("Wall Mechanics", () => {
  let host: Client

  beforeEach(() => {
    host = createClient("host")
    host.setHost(true)
  })

  it("thicker strokes have higher strength", () => {
    host.draw(0, 0, "#ff0000", 5)    // Thin
    host.draw(100, 0, "#00ff00", 20) // Thick

    const territory = host.sim.serializeTerritory()
    const redCell = Object.values(territory).find(c => c.color === "#ff0000")
    const greenCell = Object.values(territory).find(c => c.color === "#00ff00")

    expect(greenCell!.strength).toBeGreaterThan(redCell!.strength)
  })
})
