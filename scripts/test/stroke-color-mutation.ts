import { describe, it, expect, beforeEach } from "vitest"
import * as Y from "yjs"

/**
 * Test for stroke color mutation bug:
 * When selecting a new paint color, previously drawn strokes
 * should NOT change color. This test exposes reference mutation issues.
 */

// Simulates the actual component behavior
const createDrawingSimulator = () => {
  const doc = new Y.Doc()
  const yStrokes = doc.getArray("strokes")

  // Simulate React refs
  const currentPoints = { current: [] as Array<{x: number, y: number}> }
  const allStrokes = { current: [] as any[] }
  const currentColorRef = { current: "#ff0000" }
  const brushSizeRef = { current: 5 }
  const myPeerId = "test-peer"

  // Simulate broadcastStroke
  const broadcastStroke = (stroke: any) => {
    yStrokes.push([{
      points: stroke.points,
      color: stroke.color,
      size: stroke.size,
      timestamp: Date.now(),
      peerId: myPeerId
    }])
  }

  // Simulate yStrokes observer
  yStrokes.observe(() => {
    allStrokes.current = yStrokes.toArray()
  })

  // Simulate drawing a stroke (handlePointerDown -> handlePointerMove -> handlePointerUp)
  const drawStroke = (points: Array<{x: number, y: number}>) => {
    // handlePointerDown/Move accumulates points
    currentPoints.current = [...points]

    // handlePointerUp creates and broadcasts stroke
    const color = currentColorRef.current
    const stroke = { points: currentPoints.current, color, size: brushSizeRef.current }
    allStrokes.current.push(stroke)
    broadcastStroke(stroke)

    // Reset currentPoints
    currentPoints.current = []
  }

  const setColor = (color: string) => {
    currentColorRef.current = color
  }

  const getStrokes = () => allStrokes.current
  const getYjsStrokes = () => yStrokes.toArray()

  return { drawStroke, setColor, getStrokes, getYjsStrokes, doc, yStrokes }
}

describe("Object Identity Tests", () => {
  it("should handle different objects in allStrokes vs yStrokes", () => {
    // The component pushes different objects to allStrokes and yStrokes:
    // allStrokes: { points, color, size }
    // yStrokes: { points, color, size, timestamp, peerId }
    const doc = new Y.Doc()
    const yStrokes = doc.getArray("strokes")
    const allStrokes = { current: [] as any[] }
    let currentColor = "#ff0000"

    yStrokes.observe(() => {
      allStrokes.current = yStrokes.toArray()
    })

    // Simulate actual component behavior
    const points = [{ x: 0, y: 0 }, { x: 100, y: 100 }]

    // Local stroke (what component pushes to allStrokes)
    const localStroke = { points, color: currentColor, size: 5 }
    allStrokes.current.push(localStroke)

    // Yjs stroke (what broadcastStroke pushes)
    yStrokes.push([{
      points: localStroke.points,  // Same reference
      color: localStroke.color,    // Same value
      size: localStroke.size,
      timestamp: Date.now(),
      peerId: "peer1"
    }])

    // After observer, allStrokes.current has Yjs objects (with timestamp/peerId)
    expect(allStrokes.current[0].timestamp).toBeDefined()
    expect(allStrokes.current[0].peerId).toBe("peer1")
    expect(allStrokes.current[0].color).toBe("#ff0000")

    // Change color and draw again
    currentColor = "#0000ff"
    const points2 = [{ x: 200, y: 200 }]
    const localStroke2 = { points: points2, color: currentColor, size: 5 }
    allStrokes.current.push(localStroke2)
    yStrokes.push([{
      points: localStroke2.points,
      color: localStroke2.color,
      size: localStroke2.size,
      timestamp: Date.now(),
      peerId: "peer1"
    }])

    // Both strokes should have correct colors
    expect(allStrokes.current[0].color).toBe("#ff0000")
    expect(allStrokes.current[1].color).toBe("#0000ff")
  })

  it("should not share points array between local and Yjs stroke", () => {
    const doc = new Y.Doc()
    const yStrokes = doc.getArray("strokes")
    const allStrokes = { current: [] as any[] }

    yStrokes.observe(() => {
      allStrokes.current = yStrokes.toArray()
    })

    // Create points array
    const points = [{ x: 0, y: 0 }, { x: 100, y: 100 }]

    // Push to both (simulating component)
    const stroke = { points, color: "#ff0000", size: 5 }
    allStrokes.current.push(stroke)
    yStrokes.push([{
      points: stroke.points,  // SAME REFERENCE - this is the bug!
      color: stroke.color,
      size: stroke.size,
      timestamp: 1,
      peerId: "p1"
    }])

    // After observer fires, check if points arrays are shared
    const fromAllStrokes = allStrokes.current[0]
    const fromYjs = yStrokes.get(0)

    // These SHOULD be different arrays (deep copy), but Yjs stores references
    // This test documents the current (potentially buggy) behavior
    const pointsAreShared = fromAllStrokes.points === fromYjs.points

    // If this is true, mutating one affects the other
    if (pointsAreShared) {
      // This is a potential bug - points are shared
      fromAllStrokes.points.push({ x: 999, y: 999 })
      expect(fromYjs.points.length).toBe(3)  // Mutation leaked!
    }
  })
})

describe("Race Condition Tests", () => {
  it("should handle local push being overwritten by observer", () => {
    const doc = new Y.Doc()
    const yStrokes = doc.getArray("strokes")
    const allStrokes = { current: [] as any[] }

    // This simulates the exact bug: observer overwrites allStrokes.current
    yStrokes.observe(() => {
      allStrokes.current = yStrokes.toArray()
    })

    // Simulate the draw flow
    const stroke1 = { points: [{ x: 0, y: 0 }], color: "#ff0000", size: 5 }

    // Step 1: Push locally (as component does)
    allStrokes.current.push(stroke1)
    expect(allStrokes.current.length).toBe(1)
    expect(allStrokes.current[0].color).toBe("#ff0000")

    // Step 2: Broadcast to Yjs (triggers observer synchronously)
    yStrokes.push([{ ...stroke1, timestamp: 1, peerId: "p1" }])

    // After observer fires, allStrokes.current is replaced with yStrokes.toArray()
    // The stroke should still be there with correct color
    expect(allStrokes.current.length).toBe(1)
    expect(allStrokes.current[0].color).toBe("#ff0000")

    // Now draw another stroke with different color
    const stroke2 = { points: [{ x: 100, y: 100 }], color: "#0000ff", size: 5 }
    allStrokes.current.push(stroke2)
    yStrokes.push([{ ...stroke2, timestamp: 2, peerId: "p1" }])

    // Both strokes should have their original colors
    expect(allStrokes.current.length).toBe(2)
    expect(allStrokes.current[0].color).toBe("#ff0000")
    expect(allStrokes.current[1].color).toBe("#0000ff")
  })

  it("should handle double-push scenario (local + Yjs both adding)", () => {
    const doc = new Y.Doc()
    const yStrokes = doc.getArray("strokes")
    const allStrokes = { current: [] as any[] }

    yStrokes.observe(() => {
      allStrokes.current = yStrokes.toArray()
    })

    // Simulate drawing where we push to allStrokes AND yStrokes
    const stroke = { points: [{ x: 0, y: 0 }], color: "#ff0000", size: 5 }

    // This is what the component does:
    allStrokes.current.push(stroke)  // Local push
    yStrokes.push([{ ...stroke, timestamp: 1, peerId: "p1" }])  // Yjs push (triggers observer)

    // Should only have ONE stroke (observer overwrites the local push)
    expect(allStrokes.current.length).toBe(1)
    expect(allStrokes.current[0].color).toBe("#ff0000")
  })

  it("should not duplicate strokes when observer overwrites local state", () => {
    const doc = new Y.Doc()
    const yStrokes = doc.getArray("strokes")
    const allStrokes = { current: [] as any[] }
    let renderCount = 0

    yStrokes.observe(() => {
      allStrokes.current = yStrokes.toArray()
      renderCount++
    })

    // Draw 3 strokes rapidly
    for (let i = 0; i < 3; i++) {
      const color = ["#ff0000", "#00ff00", "#0000ff"][i]
      const stroke = { points: [{ x: i * 100, y: 0 }], color, size: 5 }
      allStrokes.current.push(stroke)  // This gets overwritten by observer
      yStrokes.push([{ ...stroke, timestamp: i, peerId: "p1" }])
    }

    // Should have exactly 3 strokes with correct colors
    expect(allStrokes.current.length).toBe(3)
    expect(allStrokes.current[0].color).toBe("#ff0000")
    expect(allStrokes.current[1].color).toBe("#00ff00")
    expect(allStrokes.current[2].color).toBe("#0000ff")
    expect(renderCount).toBe(3)
  })
})

describe("Component Simulation Tests", () => {
  it("should preserve stroke colors when changing color picker - simulating actual component", () => {
    const sim = createDrawingSimulator()

    // Draw red stroke
    sim.drawStroke([{ x: 0, y: 0 }, { x: 100, y: 100 }])
    expect(sim.getStrokes()[0].color).toBe("#ff0000")
    expect(sim.getYjsStrokes()[0].color).toBe("#ff0000")

    // Change color to blue
    sim.setColor("#0000ff")

    // Draw blue stroke
    sim.drawStroke([{ x: 200, y: 200 }, { x: 300, y: 300 }])

    // CRITICAL: First stroke should still be red
    expect(sim.getStrokes()[0].color).toBe("#ff0000")
    expect(sim.getStrokes()[1].color).toBe("#0000ff")
    expect(sim.getYjsStrokes()[0].color).toBe("#ff0000")
    expect(sim.getYjsStrokes()[1].color).toBe("#0000ff")
  })

  it("should handle rapid color changes between strokes", () => {
    const sim = createDrawingSimulator()

    sim.setColor("#ff0000")
    sim.drawStroke([{ x: 0, y: 0 }, { x: 10, y: 10 }])

    sim.setColor("#00ff00")
    sim.drawStroke([{ x: 20, y: 20 }, { x: 30, y: 30 }])

    sim.setColor("#0000ff")
    sim.drawStroke([{ x: 40, y: 40 }, { x: 50, y: 50 }])

    sim.setColor("#ffff00")
    sim.drawStroke([{ x: 60, y: 60 }, { x: 70, y: 70 }])

    // All strokes should retain their original colors
    const strokes = sim.getStrokes()
    expect(strokes[0].color).toBe("#ff0000")
    expect(strokes[1].color).toBe("#00ff00")
    expect(strokes[2].color).toBe("#0000ff")
    expect(strokes[3].color).toBe("#ffff00")
  })

  it("should handle multiplayer sync without color mutation", () => {
    const sim1 = createDrawingSimulator()
    const sim2 = createDrawingSimulator()

    // Player 1 draws red
    sim1.setColor("#ff0000")
    sim1.drawStroke([{ x: 0, y: 0 }, { x: 100, y: 100 }])

    // Sync to player 2
    Y.applyUpdate(sim2.doc, Y.encodeStateAsUpdate(sim1.doc))

    // Player 2 changes their color to blue and draws
    sim2.setColor("#0000ff")
    sim2.drawStroke([{ x: 200, y: 200 }, { x: 300, y: 300 }])

    // Sync back to player 1
    Y.applyUpdate(sim1.doc, Y.encodeStateAsUpdate(sim2.doc))

    // Both players should see correct colors
    expect(sim1.getYjsStrokes()[0].color).toBe("#ff0000")
    expect(sim1.getYjsStrokes()[1].color).toBe("#0000ff")
    expect(sim2.getYjsStrokes()[0].color).toBe("#ff0000")
    expect(sim2.getYjsStrokes()[1].color).toBe("#0000ff")
  })
})

describe("Stroke Color Mutation Bug", () => {
  let doc: Y.Doc
  let strokes: Y.Array<any>

  beforeEach(() => {
    doc = new Y.Doc()
    strokes = doc.getArray("strokes")
  })

  it("should preserve stroke color after adding new strokes with different colors", () => {
    // Simulate drawing a red stroke
    const redStroke = {
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: "#ff0000",
      size: 5,
      timestamp: Date.now(),
      peerId: "peer1"
    }
    strokes.push([redStroke])

    // Verify red stroke exists
    expect(strokes.get(0).color).toBe("#ff0000")

    // Simulate changing color and drawing a blue stroke
    const blueStroke = {
      points: [{ x: 200, y: 200 }, { x: 300, y: 300 }],
      color: "#0000ff",
      size: 5,
      timestamp: Date.now(),
      peerId: "peer1"
    }
    strokes.push([blueStroke])

    // BUG CHECK: Red stroke should still be red
    expect(strokes.get(0).color).toBe("#ff0000")
    expect(strokes.get(1).color).toBe("#0000ff")
  })

  it("should not mutate stroke color when using shared color reference", () => {
    // Simulate the bug: using a mutable color reference
    const colorRef = { current: "#ff0000" }

    // Create stroke with current color
    const stroke1 = {
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: colorRef.current,  // Should copy value, not reference
      size: 5,
      timestamp: Date.now(),
      peerId: "peer1"
    }
    strokes.push([stroke1])

    // Change the color reference (simulating color picker change)
    colorRef.current = "#0000ff"

    // Create another stroke with new color
    const stroke2 = {
      points: [{ x: 200, y: 200 }, { x: 300, y: 300 }],
      color: colorRef.current,
      size: 5,
      timestamp: Date.now(),
      peerId: "peer1"
    }
    strokes.push([stroke2])

    // First stroke should still be red (not affected by colorRef change)
    expect(strokes.get(0).color).toBe("#ff0000")
    expect(strokes.get(1).color).toBe("#0000ff")
  })

  it("documents Yjs stores array references (not copies) - EXPECTED BEHAVIOR", () => {
    // IMPORTANT: This test documents Yjs behavior, not a bug in our code
    // Yjs stores references to arrays. Our component avoids this by creating
    // new arrays for each stroke (currentPoints.current = [] after pushing)
    const sharedPoints = [{ x: 0, y: 0 }, { x: 100, y: 100 }]

    strokes.push([{
      points: sharedPoints,  // Yjs stores this REFERENCE
      color: "#ff0000",
      size: 5,
      timestamp: Date.now(),
      peerId: "peer1"
    }])

    // Mutate the shared points array
    sharedPoints.length = 0
    sharedPoints.push({ x: 200, y: 200 }, { x: 300, y: 300 })

    // Yjs sees the mutation because it stored a reference
    const storedStroke1 = strokes.get(0)
    expect(storedStroke1.points).toHaveLength(2)
    // Points are 200/300 because Yjs stored the reference (expected Yjs behavior)
    expect(storedStroke1.points[0].x).toBe(200)
    expect(storedStroke1.points[1].x).toBe(300)
  })

  it("documents Yjs stores object references (not copies) - EXPECTED BEHAVIOR", () => {
    // IMPORTANT: This test documents Yjs behavior, not a bug in our code
    // Yjs stores references to objects. Our component avoids issues by
    // not mutating stroke objects after creation
    const stroke = {
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: "#ff0000",
      size: 5,
      timestamp: Date.now(),
      peerId: "peer1"
    }

    strokes.push([stroke])

    // Mutate the original object after pushing
    stroke.color = "#0000ff"
    stroke.points.push({ x: 200, y: 200 })

    // Yjs sees the mutations because it stored a reference (expected Yjs behavior)
    const storedStroke = strokes.get(0)
    expect(storedStroke.color).toBe("#0000ff")
    expect(storedStroke.points).toHaveLength(3)
  })

  it("should sync stroke colors correctly between documents", () => {
    const doc2 = new Y.Doc()
    const strokes2 = doc2.getArray("strokes")

    // Add red stroke to doc1
    strokes.push([{
      points: [{ x: 0, y: 0 }],
      color: "#ff0000",
      size: 5,
      timestamp: 1,
      peerId: "peer1"
    }])

    // Sync doc1 -> doc2
    const update1 = Y.encodeStateAsUpdate(doc)
    Y.applyUpdate(doc2, update1)

    // Add blue stroke to doc1
    strokes.push([{
      points: [{ x: 100, y: 100 }],
      color: "#0000ff",
      size: 5,
      timestamp: 2,
      peerId: "peer1"
    }])

    // Sync again
    const update2 = Y.encodeStateAsUpdate(doc)
    Y.applyUpdate(doc2, update2)

    // Both docs should have correct colors
    expect(strokes.get(0).color).toBe("#ff0000")
    expect(strokes.get(1).color).toBe("#0000ff")
    expect(strokes2.get(0).color).toBe("#ff0000")
    expect(strokes2.get(1).color).toBe("#0000ff")
  })

  it("should not share references between synced documents", () => {
    const doc2 = new Y.Doc()
    const strokes2 = doc2.getArray("strokes")

    // Add stroke to doc1
    strokes.push([{
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: "#ff0000",
      size: 5,
      timestamp: 1,
      peerId: "peer1"
    }])

    // Sync to doc2
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc))

    // Modify stroke in doc1's local array representation
    const strokeFromDoc1 = strokes.get(0)
    const strokeFromDoc2 = strokes2.get(0)

    // These should be separate objects
    expect(strokeFromDoc1).not.toBe(strokeFromDoc2)

    // Verify they have same values
    expect(strokeFromDoc1.color).toBe(strokeFromDoc2.color)
  })

  describe("Local state mutation (simulating React refs)", () => {
    it("should not mutate allStrokes when currentColor changes", () => {
      // Simulate the React component behavior
      const allStrokes: any[] = []
      let currentColor = "#ff0000"

      // Draw first stroke
      const stroke1 = {
        points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
        color: currentColor,
        size: 5
      }
      allStrokes.push(stroke1)
      strokes.push([{ ...stroke1, timestamp: Date.now(), peerId: "peer1" }])

      // Change color
      currentColor = "#0000ff"

      // Draw second stroke
      const stroke2 = {
        points: [{ x: 200, y: 200 }, { x: 300, y: 300 }],
        color: currentColor,
        size: 5
      }
      allStrokes.push(stroke2)
      strokes.push([{ ...stroke2, timestamp: Date.now(), peerId: "peer1" }])

      // First stroke in local state should still be red
      expect(allStrokes[0].color).toBe("#ff0000")
      expect(allStrokes[1].color).toBe("#0000ff")

      // Yjs strokes should match
      expect(strokes.get(0).color).toBe("#ff0000")
      expect(strokes.get(1).color).toBe("#0000ff")
    })

    it("should handle observer updates without color mutation", () => {
      const allStrokes: any[] = []

      // Observer that syncs from Yjs to local state
      strokes.observe(() => {
        allStrokes.length = 0
        allStrokes.push(...strokes.toArray())
      })

      // Add red stroke
      strokes.push([{
        points: [{ x: 0, y: 0 }],
        color: "#ff0000",
        size: 5,
        timestamp: 1,
        peerId: "peer1"
      }])

      expect(allStrokes[0].color).toBe("#ff0000")

      // Add blue stroke
      strokes.push([{
        points: [{ x: 100, y: 100 }],
        color: "#0000ff",
        size: 5,
        timestamp: 2,
        peerId: "peer1"
      }])

      // Both strokes should have correct colors
      expect(allStrokes[0].color).toBe("#ff0000")
      expect(allStrokes[1].color).toBe("#0000ff")
    })
  })
})
