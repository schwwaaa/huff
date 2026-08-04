# HUFF Classic Pass 15 — Mirror Capture Staging Audit

## Current mirror topology

```text
HUFF render canvas
  → independent mirror scheduler
  → receiver/backpressure checks
  → bounded ImageBitmap capture when supported
  → transferable ImageBitmap
  → persistent Worker OffscreenCanvas
  → JPEG encode
  → transferable ArrayBuffer
  → local Rust WebSocket relay
  → canvas output window
```

The mirror is an operator preview. It is not the authoritative HUFF render surface and is independent of Syphon and Spout.

## Pass 14 Worker path

```text
1920 × 1080 or 3840 × 2160 render canvas
  → full-resolution createImageBitmap()
  → full-resolution bitmap transfer
  → Worker scales to at most 1280 × 1280
  → JPEG encode
```

The encoded result was already bounded, but the capture and Worker-transfer boundary was not.

## Pass 15 Worker path

```text
large render canvas
  → createImageBitmap() requests final bounded dimensions
  → bounded bitmap transfer
  → Worker performs exact-size copy
  → JPEG encode
```

For canvases already inside the mirror bounds, HUFF retains an exact-size full bitmap without upscaling.

## Compatibility state machine

```text
resized capture initially enabled
        │
        ├─ requested dimensions honored
        │      → keep bounded capture enabled
        │
        ├─ resize options throw
        │      → disable bounded capture for session
        │      → use full bitmap immediately
        │
        └─ resize options ignored
               → detect returned dimensions
               → disable bounded capture for session
               → Worker scales returned full bitmap
```

HUFF does not repeatedly probe a WebView that has already demonstrated incompatibility.

## Backpressure boundary

Capture does not begin unless all of the following are true:

- the local relay connection is open;
- at least one canvas receiver is attached;
- no prior mirror frame is awaiting relay acknowledgement;
- the WebSocket buffered amount is below the configured ceiling;
- the Worker or fallback encoder is not already processing a frame.

The mirror remains latest-frame-wins and cannot create an unbounded queue.

## Scheduler boundary

Pass 15 preserves the stable independent mirror scheduler:

```text
p5 draw loop              authoritative rendering
transport rAF             transport UI
mirror rAF                preview capture pacing
profiler rAF              optional diagnostics
requestVideoFrameCallback decoded-source ownership
```

No mirror capture is called from `draw()` and no `_afterRenderFrame()` hook exists.

## Measurement procedure

Use the same source, window dimensions, QUALITY, and effect state for Pass 14 and Pass 15.

### Mirror disconnected

Expected result: Pass 14 and Pass 15 should be effectively identical because receiver-aware suspension prevents capture.

### Mirror connected at 1280 × 720 render

Expected structural result: no bitmap-size reduction because source and mirror target already match.

### Mirror connected at 1920 × 1080 render

Expected structural result: bounded 1280 × 720 bitmap capture on supporting WebViews.

### Mirror connected at 3840 × 2160 render

Expected structural result: bounded 1280 × 720 bitmap capture on supporting WebViews, with the largest reduction in transferred pixel count.

### Profiler fields

```text
mir cap
```

Average main-WebView capture/staging time while the profiler is visible.

```text
mir enc
```

Average Worker or fallback scaling/JPEG/ArrayBuffer time while the profiler is visible.

```text
mir stage
```

`scaled/full` capture counts during the current report interval.

A supporting WebView at 1080p or above should normally show scaled captures. A full count indicates a source already within bounds or a compatibility fallback.

## Acceptance criteria

Pass 15 should be retained only when:

- normal playback remains as stable as Pass 14 with the mirror disconnected;
- mirror-connected frame pacing is equal or better at 1080p and above;
- mirror dimensions and aspect ratio remain unchanged;
- mirror reconnect and relay acknowledgement remain reliable;
- no effect, Syphon, Spout, decoder, or shutdown regression appears.

If target-runtime tests show worse pacing, Pass 14 remains the authoritative baseline and the resized bitmap path should be rejected.
