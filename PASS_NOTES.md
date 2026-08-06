# HUFF Classic Optimization Pass 25 — Pass Notes

**Date:** 2026-08-05  
**Authoritative behavioral baseline:** user-supplied Pass 22 archive  
**Immediate predecessor:** confirmed-working Pass 24 Stage Contract Registry package  
**Scope:** validated serial recipe foundation  
**User-facing controls:** none  
**Flow changes:** none

## Work completed

- added `src/pipeline-runtime.js`, a browser-compatible immutable recipe validator and compiler;
- represented the exact existing 12-zone Pass 22 route as the only accepted runtime recipe;
- validated the recipe at script startup before the renderer can execute an affected frame;
- compiled stage handlers once, outside `draw()`, with no per-frame closure creation;
- moved existing active-stage dispatch through the compiled recipe;
- retained the direct clean bypass path;
- retained the exact front-stage priority calculation;
- retained all four Global Mix named positions;
- retained Feedback snapshot-before-clear behavior;
- retained Flow and Symmetry `gBuf`/`gScratch` swap points;
- retained Solarize and presentation placement;
- added deterministic rejection tests for illegal order, unknown stages, invalid Global Mix placement, and missing handlers;
- added a Pass 24 source manifest to prove that only the declared runtime files changed.

## Runtime files changed

```text
src/pipeline-runtime.js  new validated recipe runtime
src/canvas.js            existing stage bodies dispatched through the compiled recipe
src/index.html            loads pipeline-runtime.js before effects.js and canvas.js
```

No controls, presets, effect algorithms, media paths, output paths, or native files changed.

## Flow freeze

Flow remains the original Pass 22 implementation in `src/effects.js`. Its parameters, noise sampling, FrameRing use, source/destination buffers, tile order, draw order, and ping-pong swap are unchanged.

## Result

Pass 25 establishes the runtime foundation for constrained modularity without exposing routing or changing the accepted route. The application still has one legal recipe: the Pass 22 route.
