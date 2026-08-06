# HUFF Classic Pass 27 — Capability and Stability Instrumentation Audit

## Purpose

Pass 27 adds measurement structure for answering four release questions:

1. What resolution and frame-rate combinations remain stable on a given machine?
2. Which phase consumes the frame budget: decode, render, mirror, Syphon, or Spout?
3. Does repeated source replacement or resize leave accumulating state behind?
4. Does a long session remain bounded and recover cleanly?

This pass does not change effect behavior or attempt to claim performance improvements.

## Capability profiles

| Profile | Working dimensions | Target | Frame budget |
|---|---:|---:|---:|
| `720p30` | 1280×720 | 30 fps | 33.333 ms |
| `720p60` | 1280×720 | 60 fps | 16.667 ms |
| `1080p30` | 1920×1080 | 30 fps | 33.333 ms |
| `1080p60` | 1920×1080 | 60 fps | 16.667 ms |

The profiler identifies the nearest profile from the current canvas dimensions. This label is diagnostic only; it does not resize the application or alter pacing.

## Effect-load scenes

The scene registry defines test intent only. It never writes to controls or loads presets.

### Light

```text
Glitch only
Outputs disabled
```

Purpose: establish the basic renderer and decoder cost with one front-stage effect.

### Moderate

```text
Glitch
Scanlines
Feedback
```

Purpose: represent a normal layered HUFF Classic performance scene.

### Worst case

```text
Glitch
Pipeline Luma Key
Scanlines
Global Mix
Feedback
Flow
Symmetry
Solarize
```

Purpose: exercise every expensive visual stage and the synchronous pixel-processing paths.

## Measured phases

### Decode and source state

- genuine decoded-frame rate;
- FrameRing capture rate;
- `_syncGCur` and `_pushToRing` cost from the existing profiler;
- source ready/error/replacement counts;
- stale camera completion rejection count;
- current source type and dimensions.

### Render

- complete `draw()` time while the profiler is visible;
- source-synchronization stage time;
- active validated-pipeline time;
- maximum observed render time;
- waiting, clean-bypass, and active-path counts.

### Mirror

- sent and dropped frames;
- canvas/ImageBitmap capture time;
- JPEG encoding time;
- bounded scaled versus full-size staging.

### Syphon

- browser capture;
- Worker draw and readback;
- browser-to-native end-to-end time;
- native Metal upload and publish samples;
- in-flight and buffered skips;
- coalesced status updates.

### Spout

- staging-canvas draw time;
- synchronous RGBA readback time;
- WebSocket send-call time;
- sent frames and buffered skips;
- socket misses;
- output-surface rebuilds;
- current output dimensions and running state.

### Long-session state

- session uptime;
- file loads and camera starts/stops;
- source retirements and replacements;
- source readiness and errors;
- resize requests and committed resize operations;
- buffer-allocation passes and actual dimension changes;
- clear-buffer operations;
- FrameRing slot count and estimated memory;
- optional JavaScript heap usage where the WebView exposes `performance.memory`.

## Overhead boundary

When the profiler is hidden:

- phase timing does not call `performance.now()`;
- no snapshot object is created per frame;
- no new animation loop or interval exists;
- no render surface is allocated;
- lifecycle counters use only numeric increments on existing events;
- Spout timing is disabled while sent/skip counters remain low-cost.

When the profiler is visible, snapshots are generated on the profiler's existing half-second reporting interval.

## How to use

Press the backtick key to show the profiler. Test each capability profile with each effect-load scene and record:

```text
render average / maximum
source sync
active pipeline
actual render fps
decode fps
ring fps and memory
mirror sent/drop
Syphon phase cost and skips
Spout draw/read/send and skips
source/resize lifecycle counts
session uptime
```

The overlay remains a DOM element and is not included in the canvas, mirror, Syphon, or Spout image.

## Non-claims

Pass 27 does not prove a specific machine supports 1080p60. It provides the instrumentation needed to establish that capability through runtime testing.
