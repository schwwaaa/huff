# HUFF Classic — Constrained Pipeline Modularity Audit

**Pass:** HUFF Classic Optimization Pass 23  
**Baseline:** Exact user-supplied Pass 22 archive  
**Runtime-change status:** None  
**Flow status:** Frozen; byte-for-byte identical to Pass 22

## 1. Purpose

This pass establishes the architecture map required before any modular pipeline work is attempted.

The audit does not change rendering, effect order, controls, presets, media ownership, frame scheduling, output capture, or native code. It documents the current Canvas2D pipeline exactly as it exists in Pass 22 and defines the smallest safe modularity boundary.

The rejected Flow experiments are not part of this branch.

## 2. Authoritative runtime resources

```text
gCur
clean decoded source frame

gBuf
persistent active composite and current pipeline output

gScratch
single full-resolution ping-pong / snapshot surface

FrameRing
bounded decoded-frame history used by temporal effects

main canvas
presentation surface only
```

The three full-resolution p5 Graphics surfaces are already near the practical minimum for the current design. Any route requiring two independent processed branches at the same time would require another full-resolution surface, an extra full-frame copy, or repeated rendering.

## 3. Current Pass 22 render order

The active path in `src/canvas.js` is:

```text
1. Decode / camera frame -> gCur
2. Persistent decay on gBuf
3. Front-stage ordered group
   - Glitch
   - Pipeline Luma Key
   - Scanlines
   - Glitch/Scanline ordering selected by layer priority
4. Global Mix: before slot
5. Feedback
   - copy gBuf -> gScratch
   - clear gBuf
   - transform gScratch back into gBuf
6. Global Mix: after slot
7. Flow
   - read gBuf
   - write gScratch
   - swap gBuf / gScratch
8. Global Mix: afterflow slot
9. Symmetry
   - read gBuf
   - write gScratch
   - swap gBuf / gScratch
10. Solarize in place on gBuf
11. Global Mix: final slot
12. Presentation
   - background
   - optional clean base from gCur
   - final gBuf composite
```

This is a constrained serial pipeline with one configurable ordered front-stage group and several named Global Mix insertion points. It is not an unrestricted graph.

## 4. Stage contracts

### Clean-source overlay stages

```text
Glitch
Scanlines
Pipeline Luma Key
Global Mix
```

These stages read the clean source or cached clean-derived data and write into `gBuf` using Canvas2D compositing. They do not produce a separate full-frame output.

Safe modularity potential:

- ordering inside a validated front-stage group;
- enabling or disabling a stage;
- selecting from a small set of named insertion points already supported by the buffer model.

Unsafe without additional storage:

- rendering the same stage into two independent branches;
- preserving pre-stage and post-stage composites simultaneously;
- arbitrary sends and returns.

### Snapshot-transform stage

```text
Feedback
```

Feedback is special. It snapshots the current persistent composite into `gScratch`, clears `gBuf`, then redraws the snapshot with transform and opacity.

Its contract is:

```text
input: persistent gBuf
scratch: gScratch
output: gBuf
stateful: yes
clears destination: yes
```

Feedback cannot be treated as a generic overlay stage.

### Ping-pong transform stages

```text
Flow
Symmetry
```

Their contract is:

```text
input: gBuf
output: gScratch
completion: swap gBuf and gScratch
```

Serial reordering is technically possible only when each stage remains a complete input-to-output transform and default order is preserved. Parallel routing is not possible with the current three-buffer topology.

Flow is explicitly frozen for the next infrastructure passes. No Flow algorithm, control, preset, source selection, or output behavior may be changed as part of modularity work.

### In-place readback stage

```text
Solarize
```

Solarize modifies `gBuf` in place through a bounded readback/cache path. Its cache and source assumptions make it unsuitable for arbitrary duplication or branching.

Safe modularity potential:

- retain as a named late-stage slot;
- optionally permit a very small set of validated serial positions only after exact parity tests exist.

## 5. Safe constrained model

The recommended Classic model is a validated recipe with named serial zones:

```text
SOURCE
  gCur

FRONT OVERLAYS
  Glitch / Luma / Scanlines

PERSISTENT TRANSFORM
  Feedback

PRIMARY TRANSFORM
  Flow

SECONDARY TRANSFORM
  Symmetry

COLOR FINISH
  Solarize

PRESENTATION
  Base mix + final composite
```

A modularity system should expose only legal positions and legal stage types.

It should not expose:

- arbitrary node creation;
- arbitrary cycles;
- parallel branches;
- multiple full-resolution intermediate stores;
- source ownership changes;
- renderer-window migration;
- effect-internal rewrites.

## 6. Proposed stage metadata

A future registry can describe each stage without changing its algorithm:

```text
id
label
enabled predicate
stage class
legal zones
reads
writes
uses scratch?
clears destination?
stateful?
requires clean source?
requires FrameRing?
default order
presettable routing?
live-safe routing?
```

Example contracts:

```text
scanlines
class: clean-overlay
legal zones: front-overlays
reads: gCur
writes: gBuf
scratch: no
stateful: phase only

feedback
class: persistent-transform
legal zones: persistent-transform
reads: gBuf
writes: gBuf
scratch: gScratch
clears destination: yes
stateful: yes

flow
class: ping-pong-transform
legal zones: primary-transform
reads: gBuf + optional FrameRing
writes: gScratch
swap: yes
stateful: phase/cache
frozen: yes
```

## 7. Required validation before runtime modularity

Every structural pass must prove:

1. Default route is exact Pass 22 order.
2. Default route produces identical dispatch count and dispatch order.
3. Flow source, destination, parameters, noise order, tile order, and FrameRing access remain unchanged.
4. Buffer swaps occur at the same points.
5. Feedback still snapshots before clearing.
6. Global Mix named positions remain unchanged.
7. No additional full-resolution p5 Graphics surface is allocated.
8. Media decoder, clocks, mirror, Syphon, Spout, and native tree remain untouched.
9. Presets created before modularity load into the exact default route.
10. Invalid routes are rejected before a frame renders.

## 8. Recommended implementation sequence

### Pass 24 — Stage contract registry

- represent current stages in an internal fixed registry;
- retain the exact hard-coded Pass 22 route as the only recipe;
- add deterministic dispatch-order validation;
- no user controls;
- no visual behavior change;
- no Flow changes.

### Pass 25 — Validated serial recipe foundation

- execute the same default route through a validated recipe;
- retain exact default order;
- reject illegal stage classes or missing scratch ownership;
- no user-facing routing yet;
- no Flow changes.

### Pass 26 — Constrained front-stage ordering

- expose only the already-supported Glitch/Scanline priority relationship;
- formalize existing behavior rather than inventing new behavior;
- migrate presets safely;
- no Flow changes.

### Pass 27 — Infrastructure stabilization

- capability matrix;
- long-session diagnostics;
- output endurance;
- shutdown cleanup;
- platform packaging validation.

Broader feature expansion should resume only after the infrastructure sequence is stable.

## 9. Final conclusion

HUFF Classic can support modest modularity in Canvas2D, but only as a constrained serial recipe system. The current buffer topology supports validated stage ordering and named insertion zones. It does not safely support a general node graph or arbitrary parallel processing.

Pass 23 changes no runtime code. Pass 22 remains the exact behavioral baseline.


## Pass 24 implementation status

Pass 24 implements the proposed registry as detached immutable metadata in `pipeline/stage-contracts.mjs`. It does not load the registry into the renderer. The fixed Pass 22 route and all runtime files remain unchanged. Runtime recipe execution remains deferred to Pass 25.

## Pass 25 implementation status

Pass 25 implements the validated serial recipe foundation. The exact Pass 22 route is now the only compiled runtime recipe. Invalid order, unknown stages, incorrect Global Mix slots, changed front-stage membership, and missing handlers are rejected before rendering. User routing and broader modularity remain deferred.
