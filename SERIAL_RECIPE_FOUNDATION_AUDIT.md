# HUFF Classic — Validated Serial Recipe Foundation Audit

**Pass:** HUFF Classic Optimization Pass 25  
**Baseline behavior:** Pass 22  
**Runtime recipe count:** one  
**User-facing routing:** none  
**Additional full-resolution buffers:** none  
**Flow status:** frozen

## 1. Purpose

Pass 24 made the current pipeline ownership rules machine-readable but deliberately kept them outside the application. Pass 25 loads a matching browser-side recipe runtime and dispatches the existing stage implementations through that validated structure.

This is infrastructure work. It does not make the renderer freely patchable.

## 2. Runtime route

The only accepted recipe remains:

```text
source-sync
persistent-decay
front-overlays
Global Mix: before
feedback
Global Mix: after
flow
Global Mix: afterflow
symmetry
solarize
Global Mix: final
presentation
```

The route matches `PASS22_ROUTE_SKELETON` in `pipeline/stage-contracts.mjs`.

## 3. Startup validation

`src/pipeline-runtime.js` validates the built-in route while the script loads. `src/canvas.js` refuses to initialize the compiled plan when the validated runtime is unavailable.

Validation rejects:

```text
missing or extra route steps
zone reordering
unknown stage IDs
stages placed in illegal zones
incorrect Global Mix conditional positions
front-stage member changes
missing stage handlers
```

Because the route is immutable and compiled before `draw()` runs, an invalid recipe cannot partially execute for one frame.

## 4. Compiled dispatch

The renderer declares one stable handler per stage class and compiles those handlers once:

```text
source synchronization
persistent decay
front-stage priority group
Global Mix slot
Feedback
Flow
Symmetry
Solarize
presentation
```

`draw()` reuses one sealed frame context. It does not allocate a new recipe, handler array, closure, or route object per frame.

The active route executes in three segments so the original sequencing is preserved:

```text
1. source synchronization
2. existing phase/activity/bypass/seed logic
3. persistent decay
4. existing front-priority decision
5. remaining effects and presentation
```

The clean bypass remains direct and does not run unnecessary active stages.

## 5. Resource ownership preservation

### Feedback

```text
copy gBuf -> gScratch
clear gBuf
redraw transformed gScratch -> gBuf
no swap
```

### Flow

```text
read gBuf + FrameRing
write gScratch
swap gBuf / gScratch
```

### Symmetry

```text
read gBuf
write gScratch
swap gBuf / gScratch
```

### Solarize

```text
modify gBuf in place
```

No additional p5 Graphics surface is allocated. The active topology remains `gCur`, `gBuf`, and `gScratch`.

## 6. What remains fixed

```text
one serial recipe
effect order
front-stage priority behavior
Global Mix positions
Flow placement
Feedback placement
Symmetry placement
Solarize placement
presentation behavior
```

There is no route UI, preset schema change, arbitrary stage movement, parallel branch, send/return, or graph cycle.

## 7. Validation boundary

Deterministic checks prove route identity, handler order, invalid-route rejection, untouched Flow/effects source, untouched native source, unchanged non-declared runtime files, and unchanged full-resolution buffer count.

Actual visual and pacing equivalence still requires running the packaged application because this environment cannot reproduce the target Tauri WebView, media decoder, Syphon, or Spout runtime.

## 8. Next step

Pass 26 can formalize the existing front-stage priority relationship as validated recipe metadata. It must preserve the current `scan`, `glitch`, `neutral`, and `pulse` behavior and must not introduce new visual routing or Flow changes.
