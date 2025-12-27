# Kingdom Drawing - Playtesting Notes

## Session Date: 2025-12-27

### Overview
Comprehensive gameplay testing using Chrome DevTools to interact with the game running at `localhost:8787`.

---

## Visual Design

### Graph Paper Background
- **Warm parchment base color** (`#fdf8f3`) - evokes renaissance-era feel
- **Minor grid lines** - subtle, 10px spacing, very light orange
- **Major grid lines** - slightly more visible, 50px spacing
- **Origin compass rose** - star pattern marks (0,0) coordinate
- **Overall impression**: Elegant, professional, gives sense of place to infinite canvas

### Player Character
- Cute blob with **googly eyes** and optional hat/cap
- **Color changes** to match selected paint color
- Smooth rendering at all zoom levels

### Enemy Design
- Blob creatures with **googly eyes** - adorable yet threatening
- Color varies (observed purple, orange) - may be random or based on game state
- Fluid movement animation
- Active chase behavior toward player

### Paint Can Pickups
- Rendered as **paint cans** with:
  - Color-matched bucket body
  - Metallic rim highlight
  - Paint drip effect
  - Sparkle/shine indicator
- Clear visual distinction from enemies

---

## Core Mechanics Verified

### 1. Drawing System
- **Pointer events** correctly captured for drawing
- **Smooth strokes** render immediately
- **Brush size slider** works (range 2-40)
- **Color selection** via paint bucket toolbar
- **Eraser mode** available via button

### 2. Ink Spreading ✓ WORKING BEAUTIFULLY
- Strokes spawn **spreading particles**
- Territory expands in **semi-circular dome pattern**
- **Cell-based grid** (8px cells) visible at edges
- **Multiple colors** create distinct territory zones
- **Combat zones** form where territories meet
- Spreading continues over time autonomously

### 3. Territory Visualization
- Semi-transparent **colored fills** show claimed territory
- **Purple territory** from purple strokes
- **Green territory** from green strokes
- **Gray/black territory** from black strokes
- Overlapping territories create **contested boundaries**

### 4. Enemy Behavior ✓ AGGRESSIVE
- **Active pursuit** - enemies chase player position
- **Collision detection** works reliably
- **Respawn mechanic** - enemies reposition after collision
- **Multiple enemies** (3 observed) create challenging gameplay
- Getting hit frequently demonstrates enemies are **working as intended**

### 5. Drawing Disabled State
- **5-second cooldown** after enemy collision
- **Visual overlay** with countdown timer
- **Prevents drawing** during disabled state
- Timer displayed prominently

### 6. Paint System ✓ WORKING
- **Paint levels** displayed as fill bars under each bucket
- **Consumption** visible when drawing (bars decrease)
- **Reload over time** - depleted colors gradually refill
- **MAX_PAINT: 250** provides generous capacity
- **PAINT_RELOAD_RATE: 8** enables reasonable recovery
- **Empty paint** prevents drawing with that color

### 7. Pickups ✓ SPAWNING
- Paint can pickups **spawn periodically** around player
- Multiple pickups observed (up to 5 max)
- **Color-coded** to match paint colors
- Positioned **200-600 pixels** from player
- Collection refills that color to MAX_PAINT

### 8. Navigation ✓ SMOOTH
- **Zoom controls** (-/+/Reset buttons work)
- **Zoom range**: Tested 24% to 100%+
- **Pan** follows cursor movement
- **Infinite canvas** - coords tested up to X:9000+, Y:3000+
- **Minimap** shows player position, enemies, and other elements

---

## UI Elements

### Header
- Room ID display (e.g., "5ZQZ")
- Player count indicator
- Connection status

### Coords Display
- Real-time X, Y coordinates
- Zoom percentage
- Semi-transparent overlay

### Minimap
- Dark background panel
- **White circle** = player position
- **Red triangles/dots** = enemies
- Clickable for navigation

### Toolbar
- 7 paint bucket colors (+ black, + eraser colors)
- **Paint level indicators** under each
- Brush size slider
- Control buttons: Erase, Clear, -/+, Reset, Host

---

## Performance Observations

- **Smooth rendering** even with multiple territories spreading
- **No visible lag** during gameplay
- **Particle effects** render cleanly
- **Enemy movement** fluid at all zoom levels

---

## Potential Improvements Noted

1. **Pickup collection feedback** - No obvious visual/audio feedback when collecting
2. **Enemy collision feedback** - Could use screen shake or flash
3. **Territory combat effects** - Implemented but hard to observe during rapid play
4. **Intent detection** (wall vs territory) - Not easily distinguishable visually yet

---

## Bugs/Issues Observed

1. **Yjs double-import warning** in console (non-critical)
2. **404 resource** error (likely favicon, non-critical)
3. **Frequent enemy collisions** - Enemies may be too aggressive for new players

---

## Conclusion

The core game mechanics are **fully functional**:
- Ink spreading creates beautiful, dynamic territory
- Enemy AI provides active challenge
- Paint resource management adds strategic depth
- Pickups provide recovery mechanic
- Visual design is polished and cohesive

The game successfully captures the "kingdom drawing" RTS concept where **drawing is the primary interaction**.
