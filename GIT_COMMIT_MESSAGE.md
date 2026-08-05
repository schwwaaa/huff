# HUFF Classic Pass 20 — Git Commit Message

```text
perf: remove p5 map dispatch from HUFF Classic hot paths

Continue from the runtime-confirmed Pass 19 baseline without changing decoder ownership, frame scheduling, effect order, or output transport.

Replace p5 map() calls in persistence decay, Scanline shift preparation, Glitch smear direction, and per-tile Glitch jitter with the exact unit-range arithmetic used by p5 after validation.

Prepare Scanline and Glitch mapping spans outside their inner loops while preserving noise coordinates, flooring, clipping, random order, temporal selection, and draw order.

Add profiler-only Scanline band/draw counts and Flow tile/draw/grid-cache counts so the remaining Canvas2D ceiling can be ranked from target-runtime evidence.

Preserve the stable Blob URL decoder, independent clocks, Pass 13S lifecycle, Pass 16S Syphon bootstrap, Pass 19 Syphon control-plane changes, Spout, Rust transport, and mandatory framework packaging.

Add deterministic Pass 20 validation with 2,500,000 exact arithmetic comparisons.
```

## Ready-to-run command

```bash
git add . && git commit \
  -m "perf: remove p5 map dispatch from HUFF Classic hot paths" \
  -m "Continue from the runtime-confirmed Pass 19 baseline without changing decoder ownership, frame scheduling, effect order, or output transport." \
  -m "Replace p5 map() calls in persistence decay, Scanline shift preparation, Glitch smear direction, and per-tile Glitch jitter with the exact unit-range arithmetic used by p5 after validation." \
  -m "Prepare Scanline and Glitch mapping spans outside their inner loops while preserving noise coordinates, flooring, clipping, random order, temporal selection, and draw order." \
  -m "Add profiler-only Scanline band/draw counts and Flow tile/draw/grid-cache counts so the remaining Canvas2D ceiling can be ranked from target-runtime evidence." \
  -m "Preserve the stable Blob URL decoder, independent clocks, Pass 13S lifecycle, Pass 16S Syphon bootstrap, Pass 19 Syphon control-plane changes, Spout, Rust transport, and mandatory framework packaging." \
  -m "Add deterministic Pass 20 validation with 2,500,000 exact arithmetic comparisons."
```
