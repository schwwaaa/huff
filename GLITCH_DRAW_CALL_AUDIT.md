# HUFF Classic Pass 18 — Glitch Draw-Call Audit

## Current Glitch cost model

For each active Glitch frame, HUFF issues approximately:

```text
accepted tiles × (1 + SMEAR)
```

Canvas2D `drawImage()` calls.

Examples:

| Accepted tiles | SMEAR | Draw calls/frame |
|---:|---:|---:|
| 100 | 0 | 100 |
| 100 | 6 | 700 |
| 250 | 6 | 1,750 |
| 250 | 20 | 5,250 |
| 500 | 20 | 10,500 |

The exact accepted tile count depends on resolution, BLOCK, CORRUPT, CORRUPT DRIFT, SPATIAL GAP, and cluster placement.

## What Pass 18 removes

### Ring lookup overhead

Before:

```text
one FrameRing.fromEnd() lookup per accepted tile
```

After:

```text
up to maxBack FrameRing.fromEnd() lookups per decoded-ring generation
zero per-tile ring lookups
```

At 250 tiles and `maxBack = 60`, this changes source lookup work from 250 calls per render frame to 60 calls when a new decoded frame enters the ring, followed by cache reuse on repeated renderer frames.

### Smear offset arithmetic

Before:

```text
2 × accepted tiles × SMEAR Math.round() calls
```

After:

```text
2 × SMEAR Math.round() calls
```

At 250 tiles and SMEAR 20:

```text
before: 10,000 round operations/frame
after:      40 round operations/frame
```

These are structural operation counts, not measured target-platform speedups.

### Per-blit helper dispatch

Before every tile and smear draw:

```text
helper call
→ p5.Graphics drawingContext property lookup
→ Canvas2D drawImage
```

After:

```text
cached Canvas2D context drawImage
```

## What remains irreducible in Canvas2D

The following work remains because changing it would change the visual result:

- one base draw for every accepted tile;
- one draw for every configured smear step;
- strict paint order;
- per-tile jitter noise;
- per-tile temporal-frame selection;
- per-tile clipping and destination calculation;
- separate source rectangles and temporal canvases.

Reordering draws by history source or merging tiles would alter overlap and source-over compositing. Pass 18 deliberately avoids that.

## Profiler interpretation

Toggle the profiler with the backtick key.

```text
gl tiles
```

Average accepted tile count for active Glitch frames in the reporting interval.

```text
gl draws
```

Average base-plus-smear Canvas2D draw calls for active Glitch frames.

```text
gl ring
```

Temporal source-reference cache rebuilds versus reuses. With 30 fps video and a 60 Hz renderer, reuse should ordinarily appear between decoded-frame updates.

Compare `applyGlitch` time against `gl draws`:

- Rising time proportional to draw count indicates the Canvas2D raster ceiling.
- High time at low draw count indicates remaining JavaScript, history, or source-canvas overhead.
- Stable Glitch time but falling total FPS points to another stage or output capture.

## Junkpile comparison

Junkpile's WebGL examples use persistent textures/framebuffers and report per-frame draw counts. HUFF Classic cannot inherit their GPU batching without becoming a different renderer, but it can apply the same discipline:

- persistent workspaces;
- explicit invalidation;
- no per-frame resource recreation;
- direct measurement of rendering pressure;
- clear separation between CPU preparation and unavoidable draw dispatch.
