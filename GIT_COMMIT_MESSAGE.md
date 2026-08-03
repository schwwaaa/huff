# Git Commit Message — HUFF Classic Optimization Pass 7

## Recommended commit

```text
perf: reuse HUFF Classic glitch placement buffers

- replace per-frame glitch target arrays with reusable typed coordinate buffers
- replace the Map-of-arrays gap index with a linked-cell Int32 workspace
- remove temporary coordinate-pair and occupied-cell allocations
- store persistent cluster angles and radii in reusable Float64 buffers
- preserve seeded random order, gap acceptance, cluster coherence, and tile draw order
- add deterministic equivalence coverage for placement and cluster offset state
- preserve existing Syphon transport and mandatory framework packaging
```

## Ready-to-run command

```bash
git add . && git commit \
  -m "perf: reuse HUFF Classic glitch placement buffers" \
  -m "Replace per-frame glitch target arrays with reusable typed coordinate buffers." \
  -m "Replace the Map-of-arrays gap index with a linked-cell Int32 workspace." \
  -m "Remove temporary coordinate-pair, occupied-cell, and rerolled-offset object allocations." \
  -m "Store persistent cluster angles and radii in reusable Float64 buffers." \
  -m "Preserve seeded random order, gap acceptance, cluster coherence, and tile draw order." \
  -m "Add deterministic equivalence coverage for placement and cluster offset state." \
  -m "Preserve existing Syphon transport and mandatory framework packaging."
```

## Accuracy note

This message describes implemented code changes without claiming that Pass 7, earlier renderer passes, or the Syphon path is fully stabilized. Target-machine runtime testing remains in progress.
