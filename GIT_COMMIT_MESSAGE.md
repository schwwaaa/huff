# Git Commit Message — HUFF Classic Optimization Pass 18

## Commit command

```bash
git add . && git commit \
  -m "perf: streamline HUFF Classic glitch blit dispatch" \
  -m "Continue from the committed Pass 17 baseline without changing decoder ownership, frame scheduling, effect behavior, or output transport." \
  -m "Resolve temporal-ring source canvases once per FrameRing generation and requested depth instead of calling fromEnd for every Glitch tile." \
  -m "Precompute exact smear offsets once per smear step in reusable typed buffers rather than rounding X and Y offsets for every tile copy." \
  -m "Dispatch base and smear blits directly through the cached Canvas2D context and calculate the constant tile span once per Glitch invocation." \
  -m "Preserve tile placement, seeded random and noise order, history selection, source and destination rectangles, paint order, alpha, cluster motion, and artistic draw count." \
  -m "Add profiler-only Glitch tile, draw-call, and ring-cache telemetry following Junkpile draw-call diagnostics." \
  -m "Preserve the stable Blob URL decoder, independent clocks, Pass 16S Syphon bootstrap, Spout, Rust transport, and mandatory framework packaging." \
  -m "Add deterministic Pass 18 validation with 3,474,837 exact ordered draw-operation comparisons."
```

## Subject only

```text
perf: streamline HUFF Classic glitch blit dispatch
```
