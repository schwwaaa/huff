# Git Commit Message — HUFF Classic Optimization Pass 10

## Recommended commit

```text
perf: reuse HUFF Classic scanline band geometry

Add a persistent typed workspace for scanline band rectangles and offsets.
Cache per-band noise seed constants and rotated-span geometry by render size and angle.
Reuse prepared band coordinates when scanline phase and controls are unchanged, with explicit seed invalidation.
Skip zero-contribution alpha, fast-jitter, and shift work while preserving phase behavior.
Set Canvas2D alpha once per scanline pass and preserve band draw order and clipping.
Preserve controls, routing, temporal history, mirror, Syphon, Spout, and mandatory framework packaging.
Add deterministic scanline equivalence validation and a current engine audit.
```

## Ready-to-run command

```bash
git add . && git commit \
  -m "perf: reuse HUFF Classic scanline band geometry" \
  -m "Add a persistent typed workspace for scanline band rectangles and offsets." \
  -m "Cache per-band noise seed constants and rotated-span geometry by render size and angle." \
  -m "Reuse prepared band coordinates when scanline phase and controls are unchanged, with explicit seed invalidation." \
  -m "Skip zero-contribution alpha, fast-jitter, and shift work while preserving phase behavior." \
  -m "Set Canvas2D alpha once per scanline pass and preserve band draw order and clipping." \
  -m "Preserve controls, routing, temporal history, mirror, Syphon, Spout, and mandatory framework packaging." \
  -m "Add deterministic scanline equivalence validation and a current engine audit."
```

## Commit after

- `npm run validate:pass10` passes.
- The application compiles locally.
- Static and spinning Scanlines visually match Pass 9.
- Resize/fullscreen behavior remains correct.
- Syphon remains operational under high-band Scanline load.
