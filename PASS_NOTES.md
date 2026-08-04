# HUFF Classic Optimization Pass 14 — Canvas Copy and Temporal-Ring Resource Pass

**Baseline:** committed HUFF Classic Pass 13S  
**Status:** implementation and static validation complete; target-runtime testing required  
**Runtime files changed:** `src/canvas.js`, `src/effects.js`

## Purpose

Pass 14 returns to isolated Canvas2D and buffer work after Pass 13S stabilized source lifecycle handling. It does not change the decoder, frame clocks, effect routing, or temporal-history cadence.

The pass targets two recurring costs:

1. full-frame canvas copies that were always expressed as scaling operations, even when source and destination dimensions were identical;
2. large temporal-history canvas backing stores that could remain allocated after history-capacity reduction, render-size changes, or application shutdown.

It also removes one function/closure allocation from every active clustered-glitch frame.

## Changes

### 1. Exact-size Canvas2D copy path

The shared full-frame copy helpers now inspect the source dimensions.

When source and destination match, HUFF uses:

```javascript
ctx.drawImage(source, 0, 0);
```

Only genuinely scaled copies use:

```javascript
ctx.drawImage(source, 0, 0, width, height);
```

This affects recurring copies such as:

- decoded frame to `gCur` when render and source dimensions match;
- `gCur` to `gBuf` synchronization;
- feedback and shared scratch snapshots;
- Solarize and luma scratch copies;
- decoded-frame capture into the temporal ring.

The visual result and Canvas2D `copy` compositing semantics are unchanged.

### 2. Temporal-ring exact-size capture

`FrameRing.pushFrom()` now uses the non-scaling draw path for the current `gCur` canvas, which is already the same size as each history slot.

History is still captured:

- once per genuine decoded frame under `requestVideoFrameCallback`;
- at the existing compatibility cadence when rVFC is unavailable;
- at full render resolution;
- with the same capacity formula and 192 MiB estimated budget;
- in the same newest-to-oldest order.

No demand-driven capture, frame skipping, reduced-resolution history, or history warm-up behavior was introduced.

### 3. Explicit temporal-ring backing-store release

Retired history canvases are collapsed before references are discarded. This happens when:

- ring capacity shrinks after a QUALITY or memory-budget change;
- render resolution changes and history is released;
- application shutdown disposes the ring.

When capacity shrinks, the newest valid history frames are retained in the same order. Only discarded slots are released.

This is intended to reduce WebKit backing-store retention and transient memory pressure. It does not reduce the configured history depth while normal playback continues.

### 4. Temporal-ring profiler rows

The existing backtick profiler now reports:

- allocated history slots versus configured capacity;
- estimated raw history backing memory in MiB.

The values are calculated only while the profiler is visible. The memory figure is an estimate of `width × height × 4` per allocated slot, not a claim about total WebView memory.

### 5. Reused cluster-physics updater

The clustered-glitch physics routine was previously declared inside `applyGlitch()`, recreating a function and closure on every active glitch frame.

It is now a module-level function using positional arguments. The following remain unchanged:

- random-call order;
- noise-call order;
- center creation order;
- pulse behavior;
- steering, inertia, drift, bounce, and wrap equations;
- tile-offset state;
- call position within the seeded glitch path.

## Junkpile influence

Pass 14 continues the resource-discipline demonstrated by the Junkpile Tauri v1 examples:

- the feedback and video-texture examples retain ping-pong resources instead of allocating them every frame;
- framebuffer size changes explicitly retire old GPU resources;
- recording and switching examples delay large transfers and revoke owned resources at clear lifecycle boundaries.

HUFF Classic remains Canvas2D. This pass imports the resource-ownership principle, not the Junkpile WebGL renderer.

## Explicitly unchanged

- File → Blob URL → p5 `createVideo()` decoding
- controls-window decoder ownership
- p5 render scheduling
- independent transport loop
- independent mirror loop
- independent profiler loop
- temporal capture cadence and capacity formula
- temporal sample selection
- effect formulas and fixed order
- controls, presets, MIDI, OSC, and undo
- Syphon and Spout client code
- Rust/Tauri native code
- bundled `Syphon.framework`

## Expected benefit

The expected improvements are:

- less Canvas2D scaling setup for exact-size full-frame copies;
- lower allocation pressure during clustered glitch rendering;
- more deterministic release of large history surfaces after resize, quality reduction, or exit;
- clearer measurement of actual temporal-ring allocation.

No FPS or memory improvement is claimed until measured in the target macOS application.
