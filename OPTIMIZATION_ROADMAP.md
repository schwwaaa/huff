# HUFF Classic — Release Roadmap

## Current phase: Pass 58 pipeline-recipe creative validation

Pass 57 established the frozen release-candidate baseline. The user explicitly authorized one narrow modularity expansion: reuse the existing constrained serial pipeline infrastructure to test additional recipe orders.

Current sequence:

1. Run `npm run regress:pass58`.
2. Run the Pass 58 section of `TESTING_CHECKLIST.md` on the primary macOS target.
3. Compare all seven recipes with the same moving source/effect state.
4. Keep only routes that are clearly useful and stable.
5. Pay special attention to `FEEDBACK FINISH · EXP`.
6. If a recipe is redundant or unstable, remove it with the smallest isolated follow-up.
7. Once recipe selection is settled, return to the broader creative/release review rather than opening a new subsystem.
8. Continue Windows Spout and Linux release validation before public release.

## Deliberately deferred

- New major effects.
- Rewriting protected Flow behavior.
- Rewriting Feedback/Persistence behavior.
- Unrestricted nodes/graphs/parallel branches.
- Additional full-resolution buffers.
- Further Syphon architecture changes without measured regression.
- Factory preset promotion inside the build until recipe behavior is settled.
- HUFF HD / wgpu cross-contamination.

## Current pipeline modularity boundary

HUFF Classic now tests a family of validated **serial** recipes using the same infrastructure:

```text
CLASSIC
CRISP FINISH
TEMPORAL UNDERLAY
SYMMETRY MEMORY
COLOR MEMORY
FLOW FINISH
FEEDBACK FINISH · EXP
```

This is intentionally not a generalized patch graph.

## Accepted lineage summary

- Pass 41A playback fidelity boundary — accepted lineage.
- Passes 42–47 Solarize/Luma augmentation and performance — accepted lineage.
- Pass 48 Layer Priority / Global Mix / Luma fades — retained.
- Pass 49 Syphon Stability Contract — accepted.
- Pass 50 Worker-owned Syphon transport — accepted lineage.
- Pass 51 720p60 bounded Syphon pipeline — runtime accepted.
- Pass 52 Chroma Posterize — retained.
- Pass 52D three-source pipeline awareness — accepted product model.
- Passes 53–56 portable preset/session workflow + keyboard safety — committed lineage.
- Pass 57 release-candidate regression freeze — authoritative baseline for Pass 58.
- Pass 58 constrained pipeline recipe expansion — current runtime candidate; creative acceptance pending.
