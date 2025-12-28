# Jackbox Minigame

A **Splatoon-inspired collaborative drawing game** built on Cloudflare Workers with real-time multiplayer sync via Yjs CRDTs.

Players draw on an infinite canvas while dodging enemies, managing limited paint, and competing for resources. All strokes, enemies, and pickups sync instantly across all connected players.

**Live at:** [draw.hypnodroid.com](https://draw.hypnodroid.com)

## Features

- **Infinite Canvas** - Pan and zoom with mouse, touch, or pinch gestures
- **Real-time Multiplayer** - All players see the same strokes, enemies, and pickups
- **Splatoon-style Characters** - Animated squid cursors with unique colors per player
- **Limited Paint System** - 8 colors that deplete while drawing and slowly reload
- **Enemy AI** - Creatures chase players and destroy nearby drawings
- **Paint Pickups** - Collect to instantly refill a color
- **Spectator Mode** - Read-only view with QR code for sharing
- **PWA Support** - Installable, works offline (local drawing)

## Quick Start

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Deploy to Cloudflare
npm run deploy

# Run tests
npm test
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Cloudflare Workers |
| State | Durable Objects + Yjs CRDTs |
| Sync | WebSocket + y-durableobjects |
| UI | Preact + htm (via ESM) |
| Canvas | HTML5 Canvas 2D |
| Fluid Sim | WebGL 2 Fragment Shaders |
| Signaling | WebRTC DataChannels |
| Testing | Vitest |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Yjs Document                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Y.Array     │  │ Y.Array     │  │ Awareness       │  │
│  │ strokes     │  │ enemies     │  │ cursors         │  │
│  │ [{points,   │  │ pickups     │  │ presence        │  │
│  │   color}]   │  │             │  │                 │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    WebSocket      y-durableobjects   Awareness
    (reliable)      (persistence)    (ephemeral)
```

**Key Design Decisions:**

- **Yjs CRDTs** - Conflict-free sync without "last write wins" issues
- **Host-based Enemy AI** - Lowest client ID controls enemies to prevent desync
- **Awareness Protocol** - Cursor positions auto-cleanup on disconnect
- **Throttled Broadcasts** - Cursors at 20fps, enemies at 10fps

## Project Structure

```
src/
├── index.ts              # Worker entry, routing
├── y-drawing-room.ts     # Yjs Durable Object (main)
├── drawing-room.ts       # Legacy DO (deprecated)
└── client/
    ├── draw.ts           # Main app (2200 lines)
    ├── present.ts        # Spectator view
    ├── manifest.ts       # PWA manifest
    └── sw.ts             # Service worker

scripts/test/
├── yjs-sync.ts           # Sync tests
├── multiplayer-sync.ts   # Multi-client tests
├── state-desync.ts       # Desync detection
└── stroke-color-mutation.ts
```

## Fluid Ink System

The game features a **Worldbox-style fluid simulation** where paint spreads organically across the canvas. Drawing creates ink that pools, flows, and claims territory.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   WebGL 2 Fluid System                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Chunk Mgr   │  │ Flow Shader │  │ Render Shader   │  │
│  │ 128x128     │  │ 8-neighbor  │  │ Color palette   │  │
│  │ sparse grid │  │ simulation  │  │ + glow effects  │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `public/js/gpu/webgl-fluid.js` | WebGL 2 fluid simulation system |
| `public/js/gpu/chunk-manager.js` | Sparse chunk allocation for infinite canvas |

### How It Works

1. **Chunked Architecture** - Canvas is divided into 128×128 cell chunks (1024px each). Only active chunks are simulated, enabling infinite canvas with bounded memory.

2. **Flow Simulation (GLSL)** - Each frame, a fragment shader runs cellular automata:
   - 8-directional flow (cardinal + diagonal)
   - Impedance terrain from FBM noise creates organic shapes
   - Pressure builds when blocked, causing ink to find alternate paths
   - Colors fight when they meet (volume-based combat)

3. **Ping-Pong Rendering** - Two textures per chunk swap each frame:
   - Read from texture A → simulate → write to texture B → swap

4. **Accumulating Ink** - Drawing over the same area reads back GPU state and adds volume, creating pooling effects.

### Performance Optimizations

- **Single iteration per frame** - Reduced from 4 for mobile
- **2-octave FBM noise** - Simplified from 4 octaves
- **128-cell chunks** - Smaller textures for faster uploads
- **Per-cell uploads** - Avoids full texture reads when possible

### Fluid Parameters

```javascript
{
  flowRate: 0.35,          // Flow speed between cells
  surfaceTension: 0.008,   // Minimum diff to trigger flow
  sourceDecay: 0.98,       // How fast sources stop generating
  sourceStrength: 0.06,    // Volume generated per frame
  pressureMultiplier: 2.0, // Pressure boost when blocked
  evaporation: 0.9995,     // Ink dries out over time
  restlessness: 0.002,     // Subtle time-varying motion
}
```

For full technical details, see [docs/FLUID_INK_SYSTEM.md](docs/FLUID_INK_SYSTEM.md).

## Game Mechanics

### Drawing
- Click/touch to draw strokes
- Each color has limited paint (100 units)
- Paint depletes based on brush size
- Paint reloads at 3 units/second

### Enemies
- 3 enemies spawn around the player
- Chase at 140 pixels/second
- Avoid drawn lines with pathfinding
- Hit = drawing disabled for 5 seconds
- Periodically destroy nearby strokes

### Pickups
- Spawn every 10 seconds (max 5)
- Random color (not eraser)
- Collect to instantly refill that color

### Controls

| Action | Mouse | Touch |
|--------|-------|-------|
| Draw | Click + drag | Touch + drag |
| Pan | Right-click + drag | Two-finger drag |
| Zoom | Scroll wheel | Pinch |
| Erase | Hold Shift | Toggle button |

## Multiplayer Sync

All state syncs via Yjs:

| Data | Yjs Type | Sync Rate |
|------|----------|-----------|
| Strokes | Y.Array | Immediate |
| Cursors | Awareness | 20 fps |
| Enemies | Y.Array | 10 fps |
| Pickups | Y.Array | Immediate |

The player with the lowest Yjs client ID is the "host" and controls enemy AI. All other players receive enemy positions via Yjs sync.

## Routes

| Path | Description |
|------|-------------|
| `/` | Redirect to random room |
| `/room/:id` | Drawing canvas |
| `/room/:id/present` | Spectator view |
| `/room/:id/ws` | WebSocket endpoint |

## Code Style

This project follows a minimalist "Code as Haiku" style:

```typescript
// Arrow functions, no semicolons, no braces for one-liners
const getName = (user) => user?.profile?.name ?? "Unknown"

// Early returns, no else
const process = (data) => {
  if (!data) return null
  if (!data.valid) return { error: "invalid" }
  return transform(data)
}

// Functional over imperative
const activeUsers = users.filter(u => u.active).map(u => u.name)
```

See [STYLE_GUIDE.md](./STYLE_GUIDE.md) for full conventions.

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Type check
npm run typecheck
```

Tests cover:
- Yjs stroke synchronization
- Multiplayer sync scenarios
- State desynchronization detection
- Color data integrity

## Configuration

**wrangler.toml:**
```toml
name = "jackbox-drawing"
main = "src/index.ts"

[[durable_objects.bindings]]
name = "Y_DRAWING_ROOM"
class_name = "YDrawingRoom"

routes = [
  { pattern = "draw.hypnodroid.com", custom_domain = true }
]
```

## Browser Support

- Modern browsers with WebSocket, WebRTC, Canvas 2D, Pointer Events
- Mobile supported (touch gestures)
- PWA installable

## Known Limitations

- Enemies chase the host player only (by design)
- Spectator view uses legacy sync (not Yjs)
- Large canvases may have performance issues
- WebSocket required for multiplayer (offline = local only)

## License

MIT
