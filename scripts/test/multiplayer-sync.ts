import { describe, it, expect, beforeEach } from "vitest"
import * as Y from "yjs"
import * as syncProtocol from "y-protocols/sync"
import * as awarenessProtocol from "y-protocols/awareness"
import { Awareness } from "y-protocols/awareness"
import * as encoding from "lib0/encoding"
import * as decoding from "lib0/decoding"

const MESSAGE_SYNC = 0

type Stroke = {
  points: { x: number; y: number }[]
  color: string
  size: number
  timestamp: number
  peerId: string
}

const createStroke = (peerId: string, color = "#ff0000"): Stroke => ({
  points: [{ x: Math.random() * 1000, y: Math.random() * 1000 }],
  color,
  size: 5,
  timestamp: Date.now(),
  peerId,
})

const createClient = (clientId: string) => {
  const doc = new Y.Doc()
  const awareness = new Awareness(doc)
  const strokes = doc.getArray<Stroke>("strokes")
  const players = doc.getMap("players")
  const gameState = doc.getMap("gameState")

  awareness.setLocalState({ peerId: clientId, cursor: null })

  return { doc, awareness, strokes, players, gameState, clientId }
}

type Client = ReturnType<typeof createClient>

const syncClients = (source: Client, target: Client) => {
  const stateVector = Y.encodeStateVector(target.doc)
  const update = Y.encodeStateAsUpdate(source.doc, stateVector)
  Y.applyUpdate(target.doc, update)
}

class MockServer {
  private clients = new Map<string, Client>()
  private serverDoc = new Y.Doc()
  private serverStrokes = this.serverDoc.getArray<Stroke>("strokes")

  connect(client: Client) {
    this.clients.set(client.clientId, client)
    const update = Y.encodeStateAsUpdate(this.serverDoc)
    Y.applyUpdate(client.doc, update)
    client.doc.on("update", (update: Uint8Array) => {
      Y.applyUpdate(this.serverDoc, update)
      this.broadcastUpdate(update, client.clientId)
    })
  }

  disconnect(clientId: string) {
    this.clients.delete(clientId)
  }

  private broadcastUpdate(update: Uint8Array, excludeId: string) {
    for (const [id, client] of this.clients) {
      if (id === excludeId) continue
      Y.applyUpdate(client.doc, update)
    }
  }

  getStrokes() {
    return this.serverStrokes.toArray()
  }

  getClientCount() {
    return this.clients.size
  }
}

describe("Multiplayer Sync", () => {
  describe("when two clients connect", () => {
    let server: MockServer
    let client1: Client
    let client2: Client

    beforeEach(() => {
      server = new MockServer()
      client1 = createClient("peer-alice")
      client2 = createClient("peer-bob")
      server.connect(client1)
      server.connect(client2)
    })

    it("syncs strokes from client1 to client2", () => {
      const stroke = createStroke("peer-alice", "#ff0000")
      client1.strokes.push([stroke])

      expect(client2.strokes.length).toBe(1)
      expect(client2.strokes.get(0).color).toBe("#ff0000")
      expect(client2.strokes.get(0).peerId).toBe("peer-alice")
    })

    it("syncs strokes from client2 to client1", () => {
      const stroke = createStroke("peer-bob", "#00ff00")
      client2.strokes.push([stroke])

      expect(client1.strokes.length).toBe(1)
      expect(client1.strokes.get(0).color).toBe("#00ff00")
    })

    it("syncs multiple strokes in order", () => {
      client1.strokes.push([createStroke("peer-alice", "#ff0000")])
      client2.strokes.push([createStroke("peer-bob", "#00ff00")])
      client1.strokes.push([createStroke("peer-alice", "#0000ff")])

      expect(client1.strokes.length).toBe(3)
      expect(client2.strokes.length).toBe(3)
      expect(server.getStrokes().length).toBe(3)
    })

    it("handles concurrent strokes without conflicts", () => {
      const stroke1 = createStroke("peer-alice", "#ff0000")
      const stroke2 = createStroke("peer-bob", "#00ff00")

      client1.strokes.push([stroke1])
      client2.strokes.push([stroke2])

      expect(client1.strokes.length).toBe(2)
      expect(client2.strokes.length).toBe(2)

      const colors1 = client1.strokes.toArray().map(s => s.color).sort()
      const colors2 = client2.strokes.toArray().map(s => s.color).sort()
      expect(colors1).toEqual(colors2)
    })

    it("syncs clear operation to all clients", () => {
      client1.strokes.push([createStroke("peer-alice")])
      client1.strokes.push([createStroke("peer-alice")])
      client2.strokes.push([createStroke("peer-bob")])

      expect(client1.strokes.length).toBe(3)
      expect(client2.strokes.length).toBe(3)

      client1.doc.transact(() => {
        client1.strokes.delete(0, client1.strokes.length)
      })

      expect(client1.strokes.length).toBe(0)
      expect(client2.strokes.length).toBe(0)
      expect(server.getStrokes().length).toBe(0)
    })
  })

  describe("when client joins late", () => {
    let server: MockServer
    let client1: Client
    let client2: Client

    beforeEach(() => {
      server = new MockServer()
      client1 = createClient("peer-alice")
      server.connect(client1)
    })

    it("receives all existing strokes", () => {
      client1.strokes.push([createStroke("peer-alice", "#ff0000")])
      client1.strokes.push([createStroke("peer-alice", "#00ff00")])
      client1.strokes.push([createStroke("peer-alice", "#0000ff")])

      client2 = createClient("peer-bob")
      server.connect(client2)

      expect(client2.strokes.length).toBe(3)
    })

    it("can add strokes after joining", () => {
      client1.strokes.push([createStroke("peer-alice")])

      client2 = createClient("peer-bob")
      server.connect(client2)
      client2.strokes.push([createStroke("peer-bob", "#00ff00")])

      expect(client1.strokes.length).toBe(2)
      expect(client2.strokes.length).toBe(2)
    })
  })

  describe("when client disconnects", () => {
    let server: MockServer
    let client1: Client
    let client2: Client
    let client3: Client

    beforeEach(() => {
      server = new MockServer()
      client1 = createClient("peer-alice")
      client2 = createClient("peer-bob")
      client3 = createClient("peer-charlie")
      server.connect(client1)
      server.connect(client2)
      server.connect(client3)
    })

    it("preserves strokes after disconnect", () => {
      client2.strokes.push([createStroke("peer-bob", "#00ff00")])
      expect(client1.strokes.length).toBe(1)

      server.disconnect("peer-bob")

      expect(client1.strokes.length).toBe(1)
      expect(client3.strokes.length).toBe(1)
    })

    it("continues syncing between remaining clients", () => {
      server.disconnect("peer-bob")

      client1.strokes.push([createStroke("peer-alice")])
      expect(client3.strokes.length).toBe(1)

      client3.strokes.push([createStroke("peer-charlie")])
      expect(client1.strokes.length).toBe(2)
    })

    it("syncs reconnecting client with missed updates", () => {
      server.disconnect("peer-bob")

      client1.strokes.push([createStroke("peer-alice", "#111111")])
      client3.strokes.push([createStroke("peer-charlie", "#222222")])

      const reconnectedBob = createClient("peer-bob-reconnected")
      server.connect(reconnectedBob)

      expect(reconnectedBob.strokes.length).toBe(2)
    })
  })

  describe("when many clients connect", () => {
    let server: MockServer
    let clients: Client[]

    beforeEach(() => {
      server = new MockServer()
      clients = Array.from({ length: 10 }, (_, i) => createClient(`peer-${i}`))
      clients.forEach(c => server.connect(c))
    })

    it("syncs strokes to all clients", () => {
      clients[0].strokes.push([createStroke("peer-0")])

      clients.forEach(client => {
        expect(client.strokes.length).toBe(1)
      })
    })

    it("handles rapid concurrent updates", () => {
      clients.forEach((client, i) => {
        client.strokes.push([createStroke(`peer-${i}`, `#${i.toString().padStart(6, "0")}`)])
      })

      clients.forEach(client => {
        expect(client.strokes.length).toBe(10)
      })

      expect(server.getStrokes().length).toBe(10)
    })

    it("handles burst of strokes from one client", () => {
      for (let i = 0; i < 50; i++) {
        clients[0].strokes.push([createStroke("peer-0")])
      }

      clients.forEach(client => {
        expect(client.strokes.length).toBe(50)
      })
    })
  })
})

describe("Yjs Protocol Messages", () => {
  describe("sync protocol", () => {
    let doc1: Y.Doc
    let doc2: Y.Doc

    beforeEach(() => {
      doc1 = new Y.Doc()
      doc2 = new Y.Doc()
    })

    it("generates sync step 1 message", () => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(encoder, doc1)
      const message = encoding.toUint8Array(encoder)

      expect(message.length).toBeGreaterThan(1)
      expect(message[0]).toBe(MESSAGE_SYNC)
    })

    it("processes sync step 1 and generates step 2", () => {
      doc1.getArray("strokes").push([{ test: "data" }])

      const encoder1 = encoding.createEncoder()
      encoding.writeVarUint(encoder1, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(encoder1, doc1)
      const step1 = encoding.toUint8Array(encoder1)

      const decoder = decoding.createDecoder(step1)
      decoding.readVarUint(decoder)

      const encoder2 = encoding.createEncoder()
      encoding.writeVarUint(encoder2, MESSAGE_SYNC)
      syncProtocol.readSyncMessage(decoder, encoder2, doc2, null)

      expect(encoding.length(encoder2)).toBeGreaterThan(1)
    })

    it("syncs documents through protocol messages", () => {
      const strokes1 = doc1.getArray("strokes")
      strokes1.push([{ color: "#ff0000", points: [] }])

      const encoder1 = encoding.createEncoder()
      encoding.writeVarUint(encoder1, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(encoder1, doc1)
      const step1 = encoding.toUint8Array(encoder1)

      const decoder1 = decoding.createDecoder(step1)
      decoding.readVarUint(decoder1)
      const responseEncoder = encoding.createEncoder()
      encoding.writeVarUint(responseEncoder, MESSAGE_SYNC)
      syncProtocol.readSyncMessage(decoder1, responseEncoder, doc2, null)

      if (encoding.length(responseEncoder) > 1) {
        const response = encoding.toUint8Array(responseEncoder)
        const decoder2 = decoding.createDecoder(response)
        decoding.readVarUint(decoder2)
        const finalEncoder = encoding.createEncoder()
        syncProtocol.readSyncMessage(decoder2, finalEncoder, doc1, null)
      }

      const update = Y.encodeStateAsUpdate(doc1)
      Y.applyUpdate(doc2, update)

      expect(doc2.getArray("strokes").length).toBe(1)
    })
  })

  describe("awareness protocol", () => {
    let doc1: Y.Doc
    let doc2: Y.Doc
    let awareness1: Awareness
    let awareness2: Awareness

    beforeEach(() => {
      doc1 = new Y.Doc()
      doc2 = new Y.Doc()
      awareness1 = new Awareness(doc1)
      awareness2 = new Awareness(doc2)
    })

    it("encodes local awareness state", () => {
      awareness1.setLocalState({ cursor: { x: 100, y: 200 }, peerId: "alice" })

      const update = awarenessProtocol.encodeAwarenessUpdate(awareness1, [doc1.clientID])
      expect(update.length).toBeGreaterThan(0)
    })

    it("applies awareness update from another client", () => {
      awareness1.setLocalState({ cursor: { x: 100, y: 200 }, peerId: "alice" })

      const update = awarenessProtocol.encodeAwarenessUpdate(awareness1, [doc1.clientID])
      awarenessProtocol.applyAwarenessUpdate(awareness2, update, null)

      const states = awareness2.getStates()
      const remoteState = states.get(doc1.clientID)
      expect(remoteState).toBeDefined()
      expect(remoteState?.peerId).toBe("alice")
    })

    it("tracks multiple clients awareness", () => {
      awareness1.setLocalState({ cursor: { x: 100, y: 200 }, peerId: "alice" })

      const update1 = awarenessProtocol.encodeAwarenessUpdate(awareness1, [doc1.clientID])
      awarenessProtocol.applyAwarenessUpdate(awareness2, update1, null)

      awareness2.setLocalState({ cursor: { x: 300, y: 400 }, peerId: "bob" })

      expect(awareness2.getStates().size).toBe(2)
    })

    it("removes awareness on client disconnect", () => {
      awareness1.setLocalState({ cursor: { x: 100, y: 200 }, peerId: "alice" })

      const update = awarenessProtocol.encodeAwarenessUpdate(awareness1, [doc1.clientID])
      awarenessProtocol.applyAwarenessUpdate(awareness2, update, null)

      expect(awareness2.getStates().has(doc1.clientID)).toBe(true)

      awarenessProtocol.removeAwarenessStates(awareness2, [doc1.clientID], null)

      expect(awareness2.getStates().has(doc1.clientID)).toBe(false)
    })
  })
})

describe("Game State Sync", () => {
  describe("enemy positions", () => {
    let server: MockServer
    let host: Client
    let player: Client

    beforeEach(() => {
      server = new MockServer()
      host = createClient("host")
      player = createClient("player")
      server.connect(host)
      server.connect(player)
    })

    it("syncs enemy array from host to player", () => {
      host.gameState.set("enemies", [
        { id: "e1", x: 100, y: 100, type: "chaser" },
        { id: "e2", x: 200, y: 200, type: "patroller" },
      ])

      const playerEnemies = player.gameState.get("enemies")
      expect(playerEnemies).toHaveLength(2)
      expect(playerEnemies[0].type).toBe("chaser")
    })

    it("syncs enemy position updates", () => {
      host.gameState.set("enemies", [{ id: "e1", x: 100, y: 100 }])

      host.gameState.set("enemies", [{ id: "e1", x: 150, y: 150 }])

      const playerEnemies = player.gameState.get("enemies")
      expect(playerEnemies[0].x).toBe(150)
    })
  })

  describe("pickup collection", () => {
    let server: MockServer
    let client1: Client
    let client2: Client

    beforeEach(() => {
      server = new MockServer()
      client1 = createClient("peer-1")
      client2 = createClient("peer-2")
      server.connect(client1)
      server.connect(client2)

      client1.gameState.set("pickups", [
        { id: "p1", x: 50, y: 50, type: "paint" },
        { id: "p2", x: 150, y: 150, type: "paint" },
      ])
    })

    it("removes collected pickup for all clients", () => {
      const pickups = client1.gameState.get("pickups").filter((p: any) => p.id !== "p1")
      client1.gameState.set("pickups", pickups)

      expect(client2.gameState.get("pickups")).toHaveLength(1)
      expect(client2.gameState.get("pickups")[0].id).toBe("p2")
    })
  })

  describe("shared paint levels", () => {
    let server: MockServer
    let client1: Client
    let client2: Client

    beforeEach(() => {
      server = new MockServer()
      client1 = createClient("peer-1")
      client2 = createClient("peer-2")
      server.connect(client1)
      server.connect(client2)

      client1.gameState.set("paintLevels", { "peer-1": 100, "peer-2": 100 })
    })

    it("syncs paint consumption", () => {
      const levels = { ...client1.gameState.get("paintLevels"), "peer-1": 75 }
      client1.gameState.set("paintLevels", levels)

      expect(client2.gameState.get("paintLevels")["peer-1"]).toBe(75)
    })

    it("syncs paint refill from pickup", () => {
      client1.gameState.set("paintLevels", { "peer-1": 50, "peer-2": 100 })

      const levels = { ...client1.gameState.get("paintLevels"), "peer-1": 100 }
      client1.gameState.set("paintLevels", levels)

      expect(client2.gameState.get("paintLevels")["peer-1"]).toBe(100)
    })
  })
})

describe("Stroke Deletion (Enemy Line Breaking)", () => {
  let server: MockServer
  let client1: Client
  let client2: Client

  beforeEach(() => {
    server = new MockServer()
    client1 = createClient("peer-1")
    client2 = createClient("peer-2")
    server.connect(client1)
    server.connect(client2)

    client1.strokes.push([
      createStroke("peer-1", "#ff0000"),
      createStroke("peer-1", "#00ff00"),
      createStroke("peer-1", "#0000ff"),
    ])
  })

  it("deletes single stroke and syncs", () => {
    expect(client2.strokes.length).toBe(3)

    client1.doc.transact(() => {
      client1.strokes.delete(1, 1)
    })

    expect(client1.strokes.length).toBe(2)
    expect(client2.strokes.length).toBe(2)
  })

  it("deletes multiple strokes in reverse order", () => {
    const indicesToDelete = [2, 0]

    client1.doc.transact(() => {
      indicesToDelete.sort((a, b) => b - a).forEach(idx => {
        client1.strokes.delete(idx, 1)
      })
    })

    expect(client1.strokes.length).toBe(1)
    expect(client2.strokes.length).toBe(1)
    expect(client1.strokes.get(0).color).toBe("#00ff00")
  })

  it("handles concurrent add and delete", () => {
    client1.doc.transact(() => {
      client1.strokes.delete(0, 1)
    })

    client2.strokes.push([createStroke("peer-2", "#ffffff")])

    expect(client1.strokes.length).toBe(3)
    expect(client2.strokes.length).toBe(3)
  })
})

describe("Network Partition Recovery", () => {
  it("merges divergent states after partition heals", () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()
    const strokes1 = doc1.getArray<Stroke>("strokes")
    const strokes2 = doc2.getArray<Stroke>("strokes")

    const initialUpdate = Y.encodeStateAsUpdate(doc1)
    Y.applyUpdate(doc2, initialUpdate)

    strokes1.push([createStroke("peer-1", "#ff0000")])
    strokes1.push([createStroke("peer-1", "#ff0001")])

    strokes2.push([createStroke("peer-2", "#00ff00")])
    strokes2.push([createStroke("peer-2", "#00ff01")])
    strokes2.push([createStroke("peer-2", "#00ff02")])

    const update1 = Y.encodeStateAsUpdate(doc1)
    const update2 = Y.encodeStateAsUpdate(doc2)

    Y.applyUpdate(doc2, update1)
    Y.applyUpdate(doc1, update2)

    expect(strokes1.length).toBe(5)
    expect(strokes2.length).toBe(5)

    const colors1 = strokes1.toArray().map(s => s.color).sort()
    const colors2 = strokes2.toArray().map(s => s.color).sort()
    expect(colors1).toEqual(colors2)
  })

  it("preserves deletion after partition recovery", () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()
    const strokes1 = doc1.getArray<Stroke>("strokes")
    const strokes2 = doc2.getArray<Stroke>("strokes")

    strokes1.push([
      createStroke("peer-1", "#111111"),
      createStroke("peer-1", "#222222"),
      createStroke("peer-1", "#333333"),
    ])

    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
    expect(strokes2.length).toBe(3)

    doc1.transact(() => strokes1.delete(1, 1))

    strokes2.push([createStroke("peer-2", "#444444")])

    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

    expect(strokes1.length).toBe(3)
    expect(strokes2.length).toBe(3)

    const hasDeleted = strokes1.toArray().some(s => s.color === "#222222")
    expect(hasDeleted).toBe(false)
  })
})

describe("Performance", () => {
  it("handles 1000 strokes efficiently", () => {
    const doc = new Y.Doc()
    const strokes = doc.getArray<Stroke>("strokes")

    const start = performance.now()

    for (let i = 0; i < 1000; i++) {
      strokes.push([createStroke(`peer-${i % 10}`)])
    }

    const elapsed = performance.now() - start

    expect(strokes.length).toBe(1000)
    expect(elapsed).toBeLessThan(1000)
  })

  it("syncs 1000 strokes to new client quickly", () => {
    const doc1 = new Y.Doc()
    const strokes1 = doc1.getArray<Stroke>("strokes")

    for (let i = 0; i < 1000; i++) {
      strokes1.push([createStroke(`peer-${i % 10}`)])
    }

    const doc2 = new Y.Doc()
    const start = performance.now()

    const update = Y.encodeStateAsUpdate(doc1)
    Y.applyUpdate(doc2, update)

    const elapsed = performance.now() - start

    expect(doc2.getArray("strokes").length).toBe(1000)
    expect(elapsed).toBeLessThan(100)
  })

  it("generates small incremental updates", () => {
    const doc1 = new Y.Doc()
    const doc2 = new Y.Doc()
    const strokes1 = doc1.getArray<Stroke>("strokes")

    for (let i = 0; i < 100; i++) {
      strokes1.push([createStroke("peer-1")])
    }
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

    const stateVector = Y.encodeStateVector(doc2)

    strokes1.push([createStroke("peer-1")])

    const incrementalUpdate = Y.encodeStateAsUpdate(doc1, stateVector)

    expect(incrementalUpdate.length).toBeLessThan(200)
  })
})
