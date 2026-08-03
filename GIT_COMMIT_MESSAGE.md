# Git Commit Message — HUFF Classic Optimization Pass 6

## Recommended commit

```text
perf: cache HUFF Classic render controls outside the frame loop

- mirror UI controls into a typed event-driven render state
- remove repeated DOM reads and numeric parsing from draw, glitch, and scanline paths
- synchronize normal UI, MIDI, OSC, preset, reset, and undo control events
- preserve integer behavior for discrete tile, count, gap, and flow controls
- reuse draw-loop helpers instead of allocating effect closures every frame
- remove unreachable cluster-center code and stale performance documentation
- preserve existing Syphon transport and mandatory framework packaging
```

## Ready-to-run command

```bash
git add . && git commit \
  -m "perf: cache HUFF Classic render controls outside the frame loop" \
  -m "Mirror UI controls into a typed event-driven render state." \
  -m "Remove repeated DOM reads and numeric parsing from draw, glitch, and scanline paths." \
  -m "Synchronize normal UI, MIDI, OSC, preset, reset, and undo control events." \
  -m "Preserve integer behavior for discrete tile, count, gap, and flow controls." \
  -m "Reuse draw-loop helpers instead of allocating effect closures every frame." \
  -m "Remove unreachable cluster-center code and correct stale performance documentation." \
  -m "Preserve existing Syphon transport and mandatory framework packaging."
```

## Accuracy note

This message describes implemented code changes without claiming that Pass 6, Pass 5, or the Syphon path is fully stabilized. Runtime testing remains in progress.
