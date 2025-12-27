# Jackbox Minigame - State Management Migration Plan

## Current Architecture Problems

The current state management has critical synchronization issues:

1. **Dual broadcast (WS + WebRTC)** - Same messages sent twice, causing duplicates and ordering issues
2. **Paint levels are LOCAL ONLY** - Each player has independent paint, no shared resource tension, cheating possible
3. **Enemies/pickups are LOCAL ONLY** - Each player sees different positions, no gameplay consistency
4. **Cursors via WebRTC only** - Fails silently when P2P connections fail
5. **No message ordering** - Race conditions everywhere, sync-request causes both peers to send full state
6. **No conflict resolution** - Last write wins silently

## Solution: Yjs + y-durableobjects

We're already using Cloudflare Durable Objects, so `y-durableobjects` is the perfect fit.

### Why Yjs?
- **CRDTs** handle conflicts automatically (no more "last write wins")
- **y-durableobjects** integrates directly with our existing Durable Object infrastructure
- **y-webrtc** provides P2P optimization with automatic fallback
- **Offline-first** - players can draw offline and sync later
- **Battle-tested** - used by Notion, Figma, etc.

### Packages to Install

```bash
npm install yjs y-webrtc @syncedstore/core @syncedstore/react y-durableobjects
```

Note: Since we use Preact, we may need to alias React or use the Yjs primitives directly.

## Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Yjs Document                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Y.Array     │  │ Y.Map       │  │ Y.Map           │  │
│  │ strokes     │  │ players     │  │ gameState       │  │
│  │ [{points,   │  │ {oderId: {  │  │ {enemies: [...],│  │
│  │   color,    │  │   x, y,     │  │  pickups: [...],│  │
│  │   size}]    │  │   color}}   │  │  paintLevels}   │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   y-webrtc         y-websocket     y-durableobjects
   (P2P fast)       (fallback)      (persistence)
```

## Migration Phases

### Phase 1: Stroke Synchronization (Start Here)
**Goal**: Replace custom stroke sync with Yjs Y.Array

1. Create `src/client/store.ts` with Yjs document and Y.Array for strokes
2. Update `drawing-room.ts` to use `YDurableObjects` from y-durableobjects
3. Update `draw.ts` to:
   - Remove `allStrokes.current` ref
   - Remove `broadcastStroke()` function
   - Remove stroke handling from `handleMessage()`
   - Use Y.Array.push() to add strokes
   - Use Y.Array.observe() to render on changes
4. Remove duplicate WS+WebRTC stroke broadcasting

**Files to modify**:
- `src/drawing-room.ts` - Replace with YDurableObjects
- `src/client/draw.ts` - Use Yjs for strokes
- New: `src/client/store.ts` - Yjs document setup

### Phase 2: Player Cursors via Awareness
**Goal**: Use Yjs Awareness protocol for ephemeral player state

1. Add Awareness to the Yjs provider
2. Move cursor positions to Awareness (not persisted, just synced)
3. Remove custom cursor broadcast code
4. Each player updates their own awareness state

**Benefits**:
- Automatic cleanup when player disconnects
- Built-in presence detection
- No need for manual peer tracking

### Phase 3: Shared Game State
**Goal**: Sync enemies, pickups, and paint levels

1. Add `gameState` Y.Map to store
2. Define authoritative game host (first player or server-side logic)
3. Sync:
   - `enemies: Y.Array` - positions updated by host
   - `pickups: Y.Array` - spawned by host, collected by anyone
   - `paintLevels: Y.Map` - shared resource pool

**Design decision**: One player (or server) should be authoritative for enemy AI to prevent desync.

### Phase 4: Cleanup
**Goal**: Remove all legacy sync code

1. Remove custom WebSocket message handlers for strokes/clear
2. Remove custom WebRTC data channel setup for sync
3. Remove `sync-request`/`sync` message handling
4. Simplify `drawing-room.ts` to just use YDurableObjects
5. Remove `gameStore` (replaced by Yjs)

## Code Examples

### Store Setup (Phase 1)
```typescript
// src/client/store.ts
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'

export const createStore = (roomId: string) => {
  const doc = new Y.Doc()

  // Shared types
  const strokes = doc.getArray('strokes')
  const players = doc.getMap('players')
  const gameState = doc.getMap('gameState')

  // Connect via WebRTC for P2P sync
  const provider = new WebrtcProvider(`room-${roomId}`, doc, {
    signaling: ['wss://your-server/signaling'] // or use y-durableobjects
  })

  return { doc, strokes, players, gameState, provider }
}
```

### Using in Component
```typescript
// In draw.ts App component
const { strokes, players } = createStore(ROOM_ID)

// Add stroke - automatically syncs!
const addStroke = (stroke) => {
  strokes.push([stroke])
}

// Observe changes
strokes.observe(event => {
  renderCanvas()
})

// Clear canvas
const clearCanvas = () => {
  strokes.delete(0, strokes.length)
}
```

### Server Setup with y-durableobjects
```typescript
// src/drawing-room.ts
import { YDurableObjects, yRoute } from 'y-durableobjects'
import { Hono } from 'hono'

const app = new Hono()
app.route('/room/:id', yRoute((env) => env.Y_DURABLE_OBJECTS))

export default app
export { YDurableObjects }
```

## Key Files Reference

- `src/client/draw.ts` - Main client UI (~1900 lines, needs refactoring)
- `src/drawing-room.ts` - Current Durable Object implementation
- `src/index.ts` - Worker entry point
- `wrangler.toml` - Cloudflare Worker config

## Notes

- The app uses **Preact** via ESM imports, not bundled React
- All client code is in a single template string in `draw.ts` (inline HTML/JS)
- Current paint system uses local state only - needs to be shared
- Enemies chase the local player - need to decide on authority model
