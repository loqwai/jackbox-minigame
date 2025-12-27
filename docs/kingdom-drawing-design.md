# Kingdom Drawing - Game Design

A real-time strategy game where **drawing is the only interaction**. Build kingdoms, expand territory, and invade rivals - all through ink that bleeds and spreads like watercolor on paper.

## Core Vision

- **RTS meets drawing**: No clicks on units or buildings. You draw, and the ink does the rest.
- **Competitive + Cooperative**: Ally with family members or betray them. Defend together against AI threats or go to war.
- **Persistent worlds**: Kingdoms remain between sessions. Come back next week and your castle is still there.
- **Phone-per-player**: Everyone draws on their own phone, watching the shared world evolve.

## The Ink Spreading Mechanic

This is the heart of the game.

### Drawing = Seeding

When you draw a stroke, that's not the end - it's the beginning. Your ink is alive.

### Spreading = Conquering

Ink slowly bleeds outward from your strokes, like watercolor on wet paper. This spreading ink *is* your territory. This spreading ink *is* your army.

- Thicker lines → faster, stronger spread
- Thin quick scribbles → rapid but weak expansion
- The spread is visible - you watch your kingdom grow in real-time

### Collision = Combat

When your spreading ink meets another player's:

- The colors push against each other at the border
- Stronger source (thicker line, more paint invested) wins
- The winning color pushes forward, consuming the weaker ink
- Creates organic, shifting frontlines

### Walls = Dams

A thick deliberate line:

- Spreads slowly outward
- But *resists* enemy ink trying to push through
- Acts as a defensive fortification
- Enemy must "erode" through - time proportional to thickness

## Territory

**Your territory = everywhere your ink has spread.**

No polygon detection. No "closing shapes". Just: what color is this pixel? That's who owns it.

- Simple to understand
- Visually obvious
- Naturally handles any shape

## Hidden Kingdoms

Players can teleport to any point on the infinite canvas.

- Jump to coordinates far from anyone else
- Start drawing - your ink spreads from there
- Build a secret kingdom in isolation
- No requirement to connect to your "main" base
- Multiple disconnected outposts are valid strategy

Eventually, spreading ink from different kingdoms may meet. Or not. The infinite canvas is big.

## Two Playstyles

### The Builder

> "I just want to draw my castle in peace."

- Teleport somewhere remote
- Spend hours drawing elaborate structures
- Your ink spreads slowly, claiming peaceful territory
- Defend against AI enemies when they find you

### The Invader

> "I'm coming for your kingdom."

- Find other players on the map
- Draw aggressive lines toward their territory
- Your ink spreads into theirs, consuming it
- Breach their walls, steal their land

Both are valid. Both interact.

## The Feel

```
You draw a quick line →
    ink bleeds outward like watercolor on wet paper →
        your territory slowly grows →
            it meets their ink →
                the colors push and blend at the border →
                    whoever drew thicker wins that front
```

## Existing Systems to Leverage

Already built:

- Real-time multiplayer via Yjs sync
- Infinite canvas with pan/zoom
- Paint resource system (limited ink per color)
- Phone-based drawing with touch support
- Room codes for easy joining
- Enemy AI that chases and destroys

## Open Questions

### Spread Rate
How fast does ink spread? Needs to be:
- Fast enough to feel alive and responsive
- Slow enough to make defensive walls matter
- Visible - you should see the bleeding happen

### Idle Spreading
Does ink spread forever or stop after a while?
- Forever: eventually covers everything (performance concern)
- Limited: stops after X radius (more strategic, need to keep drawing to expand)

### AI Enemies
What do the existing chase-enemies become?
- "Ink erasers" - monsters that eat through everyone's ink
- Create voids in territory that must be re-filled
- Shared threat that forces temporary cooperation

### Visibility / Fog of War
Can you see where others are on the infinite canvas?
- Full visibility: minimap shows all ink everywhere
- Fog of war: only see areas your ink has spread to
- Hybrid: see rough "blobs" on minimap, details only where you've explored

### Paint Economy
Drawing costs paint (already exists). But:
- Does spreading cost ongoing paint? Or fire-and-forget?
- If fire-and-forget: thick lines are strictly better
- If ongoing cost: must choose between expanding and reserves

### Color Meaning
Currently 8 colors. Do they have different properties?
- All same: color is just team identity
- Different: blue spreads faster, red fights harder, green holds ground
- Player choice: pick your color at game start

## Next Steps

1. **Prototype the spreading mechanic** - this is everything. Get ink bleeding working and see how it feels.
2. **Tune the spread rate** - find the sweet spot between responsive and strategic.
3. **Add ink collision** - when two colors meet, make them fight.
4. **Test with family** - is this fun? What's missing?
