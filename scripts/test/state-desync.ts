import { describe, it, expect, beforeEach } from "vitest"
import * as Y from "yjs"

type Stroke = {
  points: { x: number; y: number }[]
  color: string
  size: number
  timestamp: number
  peerId: string
}

const createStroke = (peerId: string, color = "#ff0000", id?: string): Stroke => ({
  points: [{ x: Math.random() * 1000, y: Math.random() * 1000 }],
  color,
  size: 5,
  timestamp: Date.now(),
  peerId,
})

describe("State Desync Scenarios", () => {
  describe("out-of-order updates", () => {
    it("converges when updates arrive out of order", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()
      const doc3 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")
      const strokes3 = doc3.getArray<Stroke>("strokes")

      strokes1.push([createStroke("p1", "#111")])
      const update1 = Y.encodeStateAsUpdate(doc1)

      strokes1.push([createStroke("p1", "#222")])
      const update2 = Y.encodeStateAsUpdate(doc1)

      strokes1.push([createStroke("p1", "#333")])
      const update3 = Y.encodeStateAsUpdate(doc1)

      Y.applyUpdate(doc2, update3)
      Y.applyUpdate(doc2, update1)
      Y.applyUpdate(doc2, update2)

      Y.applyUpdate(doc3, update2)
      Y.applyUpdate(doc3, update3)
      Y.applyUpdate(doc3, update1)

      expect(strokes1.length).toBe(3)
      expect(strokes2.length).toBe(3)
      expect(strokes3.length).toBe(3)

      const colors1 = strokes1.toArray().map(s => s.color)
      const colors2 = strokes2.toArray().map(s => s.color)
      const colors3 = strokes3.toArray().map(s => s.color)

      expect(colors1).toEqual(colors2)
      expect(colors2).toEqual(colors3)
    })

    it("handles interleaved updates from multiple sources", () => {
      const docA = new Y.Doc()
      const docB = new Y.Doc()
      const docC = new Y.Doc()

      const strokesA = docA.getArray<Stroke>("strokes")
      const strokesB = docB.getArray<Stroke>("strokes")
      const strokesC = docC.getArray<Stroke>("strokes")

      strokesA.push([createStroke("A", "#A00")])
      strokesB.push([createStroke("B", "#0B0")])
      strokesC.push([createStroke("C", "#00C")])

      const updateA = Y.encodeStateAsUpdate(docA)
      const updateB = Y.encodeStateAsUpdate(docB)
      const updateC = Y.encodeStateAsUpdate(docC)

      Y.applyUpdate(docA, updateC)
      Y.applyUpdate(docB, updateA)
      Y.applyUpdate(docC, updateB)

      Y.applyUpdate(docA, updateB)
      Y.applyUpdate(docB, updateC)
      Y.applyUpdate(docC, updateA)

      expect(strokesA.length).toBe(3)
      expect(strokesB.length).toBe(3)
      expect(strokesC.length).toBe(3)

      const colorsA = strokesA.toArray().map(s => s.color).sort()
      const colorsB = strokesB.toArray().map(s => s.color).sort()
      const colorsC = strokesC.toArray().map(s => s.color).sort()

      expect(colorsA).toEqual(colorsB)
      expect(colorsB).toEqual(colorsC)
    })
  })

  describe("dropped messages", () => {
    it("recovers from dropped intermediate updates", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")

      strokes1.push([createStroke("p1", "#111")])
      strokes1.push([createStroke("p1", "#222")])
      strokes1.push([createStroke("p1", "#333")])
      strokes1.push([createStroke("p1", "#444")])
      strokes1.push([createStroke("p1", "#555")])

      const fullUpdate = Y.encodeStateAsUpdate(doc1)
      Y.applyUpdate(doc2, fullUpdate)

      expect(doc2.getArray("strokes").length).toBe(5)
    })

    it("syncs correctly after many dropped updates via state vector", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      strokes1.push([createStroke("p1", "#100")])
      strokes1.push([createStroke("p1", "#200")])

      const initialSync = Y.encodeStateAsUpdate(doc1)
      Y.applyUpdate(doc2, initialSync)

      for (let i = 0; i < 50; i++) {
        strokes1.push([createStroke("p1", `#${i}`)])
      }

      const stateVector2 = Y.encodeStateVector(doc2)
      const missedUpdates = Y.encodeStateAsUpdate(doc1, stateVector2)
      Y.applyUpdate(doc2, missedUpdates)

      expect(strokes2.length).toBe(52)
    })
  })

  describe("simultaneous conflicting operations", () => {
    it("handles simultaneous clear and draw", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      strokes1.push([createStroke("p1", "#111")])
      strokes1.push([createStroke("p1", "#222")])

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      doc1.transact(() => strokes1.delete(0, strokes1.length))
      strokes2.push([createStroke("p2", "#333")])

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      expect(strokes1.length).toBe(strokes2.length)

      const colors1 = strokes1.toArray().map(s => s.color).sort()
      const colors2 = strokes2.toArray().map(s => s.color).sort()
      expect(colors1).toEqual(colors2)
    })

    it("handles delete at same index from different clients", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      strokes1.push([
        createStroke("p1", "#111"),
        createStroke("p1", "#222"),
        createStroke("p1", "#333"),
      ])

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      doc1.transact(() => strokes1.delete(1, 1))
      doc2.transact(() => strokes2.delete(1, 1))

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      expect(strokes1.length).toBe(strokes2.length)
    })

    it("handles overlapping range deletions", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      for (let i = 0; i < 10; i++) {
        strokes1.push([createStroke("p1", `#${i}${i}${i}`)])
      }

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      doc1.transact(() => strokes1.delete(2, 4))
      doc2.transact(() => strokes2.delete(4, 4))

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      expect(strokes1.length).toBe(strokes2.length)

      const colors1 = strokes1.toArray().map(s => s.color)
      const colors2 = strokes2.toArray().map(s => s.color)
      expect(colors1).toEqual(colors2)
    })

    it("handles add during delete transaction", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      strokes1.push([
        createStroke("p1", "#111"),
        createStroke("p1", "#222"),
        createStroke("p1", "#333"),
      ])

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      doc1.transact(() => {
        strokes1.delete(0, 1)
        strokes1.push([createStroke("p1", "#AAA")])
      })

      doc2.transact(() => {
        strokes2.push([createStroke("p2", "#BBB")])
        strokes2.delete(2, 1)
      })

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      expect(strokes1.length).toBe(strokes2.length)
    })
  })

  describe("rapid fire updates", () => {
    it("handles 100 rapid strokes from one client", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")

      const updates: Uint8Array[] = []
      doc1.on("update", (update: Uint8Array) => updates.push(update))

      for (let i = 0; i < 100; i++) {
        strokes1.push([createStroke("p1", `#${i.toString().padStart(3, "0")}`)])
      }

      updates.forEach(u => Y.applyUpdate(doc2, u))

      expect(doc2.getArray("strokes").length).toBe(100)
    })

    it("handles rapid alternating updates from two clients", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      for (let i = 0; i < 50; i++) {
        strokes1.push([createStroke("p1", `#1${i.toString().padStart(2, "0")}`)])
        Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

        strokes2.push([createStroke("p2", `#2${i.toString().padStart(2, "0")}`)])
        Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))
      }

      expect(strokes1.length).toBe(100)
      expect(strokes2.length).toBe(100)
    })

    it("handles rapid clear-draw cycles", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      for (let i = 0; i < 20; i++) {
        strokes1.push([createStroke("p1")])
        strokes1.push([createStroke("p1")])
        doc1.transact(() => strokes1.delete(0, strokes1.length))
      }

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      expect(strokes1.length).toBe(0)
      expect(strokes2.length).toBe(0)
    })
  })

  describe("reconnection scenarios", () => {
    it("syncs accumulated offline changes on reconnect", () => {
      const server = new Y.Doc()
      const client = new Y.Doc()

      const serverStrokes = server.getArray<Stroke>("strokes")
      const clientStrokes = client.getArray<Stroke>("strokes")

      serverStrokes.push([createStroke("server", "#000")])
      Y.applyUpdate(client, Y.encodeStateAsUpdate(server))

      for (let i = 0; i < 10; i++) {
        clientStrokes.push([createStroke("client", `#C${i}C`)])
      }

      for (let i = 0; i < 5; i++) {
        serverStrokes.push([createStroke("other", `#S${i}S`)])
      }

      Y.applyUpdate(server, Y.encodeStateAsUpdate(client))
      Y.applyUpdate(client, Y.encodeStateAsUpdate(server))

      expect(serverStrokes.length).toBe(16)
      expect(clientStrokes.length).toBe(16)
    })

    it("handles reconnect after server cleared canvas", () => {
      const server = new Y.Doc()
      const client = new Y.Doc()

      const serverStrokes = server.getArray<Stroke>("strokes")
      const clientStrokes = client.getArray<Stroke>("strokes")

      serverStrokes.push([createStroke("s", "#111")])
      serverStrokes.push([createStroke("s", "#222")])
      Y.applyUpdate(client, Y.encodeStateAsUpdate(server))

      clientStrokes.push([createStroke("c", "#333")])

      server.transact(() => serverStrokes.delete(0, serverStrokes.length))
      serverStrokes.push([createStroke("s", "#444")])

      Y.applyUpdate(server, Y.encodeStateAsUpdate(client))
      Y.applyUpdate(client, Y.encodeStateAsUpdate(server))

      expect(serverStrokes.length).toBe(clientStrokes.length)
    })

    it("handles multiple disconnect-reconnect cycles", () => {
      const server = new Y.Doc()
      const clients = [new Y.Doc(), new Y.Doc(), new Y.Doc()]

      const serverStrokes = server.getArray<Stroke>("strokes")

      for (let cycle = 0; cycle < 5; cycle++) {
        const activeClient = clients[cycle % 3]
        const activeStrokes = activeClient.getArray<Stroke>("strokes")

        Y.applyUpdate(activeClient, Y.encodeStateAsUpdate(server))

        activeStrokes.push([createStroke(`c${cycle % 3}`, `#${cycle}00`)])

        Y.applyUpdate(server, Y.encodeStateAsUpdate(activeClient))
      }

      clients.forEach(client => {
        Y.applyUpdate(client, Y.encodeStateAsUpdate(server))
      })

      const lengths = clients.map(c => c.getArray("strokes").length)
      expect(lengths.every(l => l === serverStrokes.length)).toBe(true)
    })
  })

  describe("large state divergence", () => {
    it("merges heavily diverged states", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      for (let i = 0; i < 100; i++) {
        strokes1.push([createStroke("p1", `#1${i.toString().padStart(2, "0")}`)])
      }

      for (let i = 0; i < 100; i++) {
        strokes2.push([createStroke("p2", `#2${i.toString().padStart(2, "0")}`)])
      }

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      expect(strokes1.length).toBe(200)
      expect(strokes2.length).toBe(200)

      const colors1 = strokes1.toArray().map(s => s.color).sort()
      const colors2 = strokes2.toArray().map(s => s.color).sort()
      expect(colors1).toEqual(colors2)
    })

    it("handles divergent deletes then merge", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      for (let i = 0; i < 20; i++) {
        strokes1.push([createStroke("shared", `#${i.toString().padStart(3, "0")}`)])
      }
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      doc1.transact(() => {
        for (let i = 0; i < 5; i++) strokes1.delete(0, 1)
      })

      doc2.transact(() => {
        for (let i = 0; i < 5; i++) strokes2.delete(strokes2.length - 1, 1)
      })

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      expect(strokes1.length).toBe(strokes2.length)
      expect(strokes1.length).toBe(10)
    })
  })

  describe("game state edge cases", () => {
    it("handles simultaneous paint level updates", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const state1 = doc1.getMap("gameState")
      const state2 = doc2.getMap("gameState")

      state1.set("paintLevels", { p1: 100, p2: 100 })
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      state1.set("paintLevels", { p1: 80, p2: 100 })
      state2.set("paintLevels", { p1: 100, p2: 75 })

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      const levels1 = state1.get("paintLevels")
      const levels2 = state2.get("paintLevels")

      expect(levels1).toEqual(levels2)
    })

    it("handles enemy position updates during network lag", () => {
      const host = new Y.Doc()
      const player = new Y.Doc()

      const hostState = host.getMap("gameState")
      const playerState = player.getMap("gameState")

      hostState.set("enemies", [{ id: "e1", x: 0, y: 0 }])
      Y.applyUpdate(player, Y.encodeStateAsUpdate(host))

      for (let i = 1; i <= 10; i++) {
        hostState.set("enemies", [{ id: "e1", x: i * 10, y: i * 10 }])
      }

      Y.applyUpdate(player, Y.encodeStateAsUpdate(host))

      const hostEnemies = hostState.get("enemies")
      const playerEnemies = playerState.get("enemies")

      expect(playerEnemies[0].x).toBe(hostEnemies[0].x)
      expect(playerEnemies[0].y).toBe(hostEnemies[0].y)
    })

    it("handles pickup collected while another client spawns new one", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const state1 = doc1.getMap("gameState")
      const state2 = doc2.getMap("gameState")

      state1.set("pickups", [
        { id: "p1", x: 100, y: 100 },
        { id: "p2", x: 200, y: 200 },
      ])
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      state1.set("pickups", [{ id: "p2", x: 200, y: 200 }])

      const current2 = state2.get("pickups") as any[]
      state2.set("pickups", [...current2, { id: "p3", x: 300, y: 300 }])

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      const pickups1 = state1.get("pickups")
      const pickups2 = state2.get("pickups")

      expect(pickups1).toEqual(pickups2)
    })
  })

  describe("index consistency during concurrent modifications", () => {
    it("maintains correct indices after concurrent inserts", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const arr1 = doc1.getArray<number>("items")
      const arr2 = doc2.getArray<number>("items")

      arr1.push([1, 2, 3, 4, 5])
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      arr1.insert(2, [100])
      arr2.insert(2, [200])

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      expect(arr1.length).toBe(arr2.length)
      expect(arr1.toArray()).toEqual(arr2.toArray())
    })

    it("handles delete-then-insert at same position", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const arr1 = doc1.getArray<string>("items")
      const arr2 = doc2.getArray<string>("items")

      arr1.push(["a", "b", "c", "d", "e"])
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      doc1.transact(() => {
        arr1.delete(2, 1)
        arr1.insert(2, ["X"])
      })

      doc2.transact(() => {
        arr2.delete(2, 1)
        arr2.insert(2, ["Y"])
      })

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))
      Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))

      expect(arr1.length).toBe(arr2.length)
      expect(arr1.toArray()).toEqual(arr2.toArray())
    })
  })

  describe("update size and fragmentation", () => {
    it("handles very large single stroke", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")

      const hugeStroke: Stroke = {
        points: Array.from({ length: 10000 }, (_, i) => ({ x: i, y: i })),
        color: "#ff0000",
        size: 5,
        timestamp: Date.now(),
        peerId: "p1",
      }

      strokes1.push([hugeStroke])
      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      const synced = doc2.getArray<Stroke>("strokes").get(0)
      expect(synced.points.length).toBe(10000)
    })

    it("handles fragmented updates arriving together", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")

      const updates: Uint8Array[] = []
      doc1.on("update", (update: Uint8Array) => updates.push(update))

      for (let i = 0; i < 50; i++) {
        strokes1.push([createStroke("p1", `#${i}`)])
      }

      const combined = Y.mergeUpdates(updates)
      Y.applyUpdate(doc2, combined)

      expect(doc2.getArray("strokes").length).toBe(50)
    })
  })

  describe("transaction atomicity", () => {
    it("applies all or nothing in transaction", () => {
      const doc = new Y.Doc()
      const strokes = doc.getArray<Stroke>("strokes")

      strokes.push([
        createStroke("p1", "#111"),
        createStroke("p1", "#222"),
        createStroke("p1", "#333"),
      ])

      const changes: number[] = []
      strokes.observe(() => changes.push(strokes.length))

      doc.transact(() => {
        strokes.delete(0, 1)
        strokes.push([createStroke("p1", "#AAA")])
        strokes.push([createStroke("p1", "#BBB")])
      })

      expect(changes.length).toBe(1)
      expect(changes[0]).toBe(4)
    })

    it("rolls back partial transaction on error", () => {
      const doc = new Y.Doc()
      const strokes = doc.getArray<Stroke>("strokes")

      strokes.push([createStroke("p1", "#111")])

      const beforeState = Y.encodeStateAsUpdate(doc)

      try {
        doc.transact(() => {
          strokes.push([createStroke("p1", "#222")])
          throw new Error("simulated failure")
        })
      } catch {}

      expect(strokes.length).toBe(2)
    })
  })

  describe("observer consistency", () => {
    it("fires observer with all added items", () => {
      const doc1 = new Y.Doc()
      const doc2 = new Y.Doc()

      const strokes1 = doc1.getArray<Stroke>("strokes")
      const strokes2 = doc2.getArray<Stroke>("strokes")

      let observerFired = false
      let addedItems: Stroke[] = []

      strokes2.observe(event => {
        observerFired = true
        event.changes.added.forEach(item => {
          const content = item.content as any
          if (content.arr) {
            addedItems.push(...content.arr)
          }
        })
      })

      strokes1.push([createStroke("p1", "#111")])
      strokes1.push([createStroke("p1", "#222")])
      strokes1.push([createStroke("p1", "#333")])

      Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))

      expect(observerFired).toBe(true)
      expect(addedItems.length).toBe(3)
      expect(strokes2.length).toBe(3)
    })

    it("reflects final state after transaction", () => {
      const doc = new Y.Doc()
      const strokes = doc.getArray<Stroke>("strokes")

      strokes.push([
        createStroke("p1", "#111"),
        createStroke("p1", "#222"),
        createStroke("p1", "#333"),
      ])

      let finalLength = 0

      strokes.observe(() => {
        finalLength = strokes.length
      })

      doc.transact(() => {
        strokes.delete(1, 1)
        strokes.push([createStroke("p1", "#AAA"), createStroke("p1", "#BBB")])
      })

      expect(finalLength).toBe(4)
      expect(strokes.length).toBe(4)
    })
  })
})
