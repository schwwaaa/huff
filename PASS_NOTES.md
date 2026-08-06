# HUFF Classic Optimization Pass 26 — Pass Notes

**Date:** 2026-08-05  
**Authoritative behavioral baseline:** user-supplied Pass 22 archive  
**Immediate predecessor:** user-confirmed working Pass 25 package  
**Scope:** existing front-stage priority formalization  
**User-facing controls:** unchanged  
**Flow changes:** none

## Work completed

- formalized the existing Glitch/Luma and Scanline ordering groups inside `src/pipeline-runtime.js`;
- encoded the exact four existing priority modes: `scan`, `glitch`, `neutral`, and `pulse`;
- preserved the original 60fps pulse timing basis, minimum speed clamp, frame rounding, and alternating phase;
- compiled the two front-stage group handlers once outside `draw()`;
- replaced the inline `glitchOnTop` branch with a validated immutable order resolver;
- retained the original paint order in every mode;
- retained unknown/empty priority fallback behavior as SCAN TOP;
- kept the priority resolver inactive when neither front-stage group contributes;
- extended `pipeline/stage-contracts.mjs` with the existing timing and fallback constants;
- added deterministic comparison against the exact Pass 22 calculation across 46,880 cases;
- retained the one accepted 12-zone serial recipe and every existing buffer ownership rule;
- added a Pass 25 source manifest to constrain allowed runtime changes.

## Runtime files changed

```text
src/pipeline-runtime.js  formalized immutable front-stage contract and compiled resolver
src/canvas.js            dispatches the existing front groups through the compiled plan
```

No effect implementation, control, preset, media path, output path, or native file changed.

## Flow freeze

`src/effects.js` remains exact Pass 22. Flow parameters, noise sampling, FrameRing use, tile order, source/destination rectangles, draw order, and `gBuf`/`gScratch` swap remain unchanged.

## Result

Pass 26 makes the already-existing limited front-stage modularity explicit and validated. It does not broaden the routing model. HUFF Classic still accepts one serial recipe and only the priority behavior already present in Pass 22.
