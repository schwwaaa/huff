# HUFF Classic — Optimization / Augmentation Roadmap

## Current

**Pass 38 — CORRUPT XYZ + Cluster Toggle + Master Speed**

Runtime evaluation is required before another feature pass.

### Immediate decision gates

1. **CORRUPT SPEED** — keep/recalibrate based on playability.
2. **Patch XYZ** — verify X/Y/Z placement and movement are immediately legible.
3. **Clusters** — decide which Shape/XYZ/Dynamics controls survive after direct use.
4. **Luma FPS** — measure LIVE versus STENCIL under controlled Corrupt draw-call loads.

## If Luma remains the bottleneck

Do not add more key features first. Isolate the synchronous LIVE readback cost with profiler evidence and choose between:

- retaining LIVE as a deliberately heavier mode;
- further exact caching/restructuring that preserves behavior;
- emphasizing stored STENCIL for performance-sensitive combinations;
- a more substantial Luma architecture change only if runtime evidence requires it.

Do not silently lower Luma resolution/cadence.

## If Clusters becomes legible

Pare it down. Remove controls that fail the immediacy test rather than adding more simulation variables.

Possible later discussion only:

- explicit group position/pivot if direct movement proves useful;
- additional bounded distribution shapes only if CLOUD/HOLLOW behavior demonstrates a real need;
- stencil-controlled group eligibility using the existing stored mask.

## Protected

- Flow remains frozen.
- Classic remains constrained and Canvas2D-oriented.
- True 3D DVE geometry belongs primarily to the future wgpu/HD architecture.
