import { describe, it, expect, beforeEach } from "vitest"
import * as Y from "yjs"

// Test Yjs document and shared types behavior
describe("Yjs Stroke Sync", () => {
  let doc1: Y.Doc
  let doc2: Y.Doc
  let strokes1: Y.Array<any>
  let strokes2: Y.Array<any>

  beforeEach(() => {
    // Create two documents to simulate two clients
    doc1 = new Y.Doc()
    doc2 = new Y.Doc()

    // Get the shared strokes array from each document
    strokes1 = doc1.getArray("strokes")
    strokes2 = doc2.getArray("strokes")
  })

  it("should sync strokes between two documents", () => {
    // Add a stroke in doc1
    const stroke = {
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: "#ff0000",
      size: 5,
      timestamp: Date.now(),
      peerId: "peer1",
    }
    strokes1.push([stroke])

    // Sync doc1 to doc2
    const update = Y.encodeStateAsUpdate(doc1)
    Y.applyUpdate(doc2, update)

    // Verify stroke is in doc2
    expect(strokes2.length).toBe(1)
    expect(strokes2.get(0).color).toBe("#ff0000")
    expect(strokes2.get(0).points.length).toBe(2)
  })

  it("should handle concurrent strokes from multiple clients", () => {
    // Add strokes from both clients before syncing
    strokes1.push([{
      points: [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      color: "#ff0000",
      size: 3,
      timestamp: Date.now(),
      peerId: "peer1",
    }])

    strokes2.push([{
      points: [{ x: 100, y: 100 }, { x: 200, y: 200 }],
      color: "#00ff00",
      size: 5,
      timestamp: Date.now(),
      peerId: "peer2",
    }])

    // Sync both ways
    const update1 = Y.encodeStateAsUpdate(doc1)
    const update2 = Y.encodeStateAsUpdate(doc2)
    Y.applyUpdate(doc2, update1)
    Y.applyUpdate(doc1, update2)

    // Both documents should have both strokes
    expect(strokes1.length).toBe(2)
    expect(strokes2.length).toBe(2)

    // Same content in both
    const colors1 = strokes1.toArray().map(s => s.color).sort()
    const colors2 = strokes2.toArray().map(s => s.color).sort()
    expect(colors1).toEqual(colors2)
  })

  it("should clear strokes with transaction", () => {
    // Add some strokes
    strokes1.push([
      { points: [], color: "#111", size: 1, timestamp: 1, peerId: "p1" },
      { points: [], color: "#222", size: 2, timestamp: 2, peerId: "p2" },
      { points: [], color: "#333", size: 3, timestamp: 3, peerId: "p3" },
    ])
    expect(strokes1.length).toBe(3)

    // Clear using transaction (as done in client)
    doc1.transact(() => {
      strokes1.delete(0, strokes1.length)
    })

    expect(strokes1.length).toBe(0)

    // Sync to doc2
    const update = Y.encodeStateAsUpdate(doc1)
    Y.applyUpdate(doc2, update)
    expect(strokes2.length).toBe(0)
  })

  it("should observe stroke changes", () => {
    let observedCount = 0
    let addedCount = 0

    strokes1.observe((event) => {
      observedCount++
      // Must access changes during the event handler
      addedCount = event.changes.added.size
    })

    strokes1.push([{
      points: [{ x: 10, y: 20 }],
      color: "#abc",
      size: 4,
      timestamp: Date.now(),
      peerId: "test",
    }])

    expect(observedCount).toBe(1)
    expect(addedCount).toBe(1)
  })

  it("should handle late-joining client sync", () => {
    // doc1 has existing strokes
    strokes1.push([
      { points: [{ x: 0, y: 0 }], color: "#a", size: 1, timestamp: 1, peerId: "p1" },
      { points: [{ x: 1, y: 1 }], color: "#b", size: 2, timestamp: 2, peerId: "p1" },
    ])

    // doc2 joins late - receives full state
    const fullState = Y.encodeStateAsUpdate(doc1)
    Y.applyUpdate(doc2, fullState)

    expect(strokes2.length).toBe(2)
    expect(strokes2.get(0).color).toBe("#a")
    expect(strokes2.get(1).color).toBe("#b")
  })

  it("should handle incremental updates", () => {
    // Initial sync
    strokes1.push([{ points: [], color: "#1", size: 1, timestamp: 1, peerId: "p1" }])
    let update = Y.encodeStateAsUpdate(doc1)
    Y.applyUpdate(doc2, update)
    expect(strokes2.length).toBe(1)

    // Get state vector for incremental update
    const stateVector2 = Y.encodeStateVector(doc2)

    // Add more strokes to doc1
    strokes1.push([
      { points: [], color: "#2", size: 2, timestamp: 2, peerId: "p1" },
      { points: [], color: "#3", size: 3, timestamp: 3, peerId: "p1" },
    ])

    // Send only the delta
    const delta = Y.encodeStateAsUpdate(doc1, stateVector2)
    Y.applyUpdate(doc2, delta)

    expect(strokes2.length).toBe(3)
  })
})

describe("Yjs Player State", () => {
  let doc: Y.Doc
  let players: Y.Map<any>

  beforeEach(() => {
    doc = new Y.Doc()
    players = doc.getMap("players")
  })

  it("should track player positions", () => {
    players.set("peer1", { x: 100, y: 200, color: "#ff0000" })
    players.set("peer2", { x: 300, y: 400, color: "#00ff00" })

    expect(players.size).toBe(2)
    expect(players.get("peer1").x).toBe(100)
    expect(players.get("peer2").color).toBe("#00ff00")
  })

  it("should update player positions", () => {
    players.set("peer1", { x: 100, y: 200, color: "#ff0000" })
    players.set("peer1", { x: 150, y: 250, color: "#ff0000" })

    expect(players.size).toBe(1)
    expect(players.get("peer1").x).toBe(150)
    expect(players.get("peer1").y).toBe(250)
  })

  it("should remove players", () => {
    players.set("peer1", { x: 0, y: 0, color: "#000" })
    players.set("peer2", { x: 0, y: 0, color: "#000" })
    expect(players.size).toBe(2)

    players.delete("peer1")
    expect(players.size).toBe(1)
    expect(players.has("peer1")).toBe(false)
    expect(players.has("peer2")).toBe(true)
  })

  it("should observe player changes", () => {
    const changes: string[] = []
    players.observe((event) => {
      event.changes.keys.forEach((change, key) => {
        changes.push(`${change.action}:${key}`)
      })
    })

    players.set("p1", { x: 0, y: 0 })
    players.set("p1", { x: 1, y: 1 })
    players.delete("p1")

    expect(changes).toEqual(["add:p1", "update:p1", "delete:p1"])
  })
})

describe("Yjs Game State", () => {
  let doc: Y.Doc
  let gameState: Y.Map<any>

  beforeEach(() => {
    doc = new Y.Doc()
    gameState = doc.getMap("gameState")
  })

  it("should store complex nested game state", () => {
    gameState.set("enemies", [
      { id: "e1", x: 100, y: 100, type: "chaser" },
      { id: "e2", x: 200, y: 200, type: "patroller" },
    ])
    gameState.set("pickups", [
      { id: "p1", x: 50, y: 50, type: "paint" },
    ])
    gameState.set("paintLevels", { peer1: 100, peer2: 75 })

    const enemies = gameState.get("enemies")
    expect(enemies.length).toBe(2)
    expect(enemies[0].type).toBe("chaser")

    const paint = gameState.get("paintLevels")
    expect(paint.peer1).toBe(100)
  })

  it("should sync game state between clients", () => {
    const doc2 = new Y.Doc()
    const gameState2 = doc2.getMap("gameState")

    gameState.set("score", 1000)
    gameState.set("level", 5)

    const update = Y.encodeStateAsUpdate(doc)
    Y.applyUpdate(doc2, update)

    expect(gameState2.get("score")).toBe(1000)
    expect(gameState2.get("level")).toBe(5)
  })
})
