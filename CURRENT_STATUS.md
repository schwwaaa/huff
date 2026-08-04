# HUFF Classic Current Status — Pass 13S

## Authoritative baseline

**HUFF Classic Optimization Pass 13S is the stable Pass 12R / Pass 11 renderer with narrowly scoped lifecycle hardening.**

Rejected Pass 13 scheduling changes are not included.

## Working architecture

```text
controls WebView
  → File input / Blob URL / p5 createVideo decode
  → p5.js + Canvas2D renderer
  → bounded temporal history
  → independent receiver-aware JPEG mirror
  → independent Syphon / Spout output paths
```

## Retained optimization work

- bounded reusable temporal history;
- latest-frame-wins output transport and backpressure;
- receiver-aware mirror and Syphon suspension;
- reusable native Syphon resources and framework packaging checks;
- reduced full-frame copies and pixel allocations;
- typed render-state cache;
- reusable glitch/cluster workspaces;
- consolidated full-resolution scratch buffers;
- in-place canvas resizing;
- cached Flow and Scanline geometry;
- neutral-stage and clean-path bypasses.

## Pass 13S additions

- source-generation guards;
- globally owned readiness polling;
- globally owned autoplay unlock listeners;
- stale camera completion rejection;
- conservative media/audio/Blob retirement;
- idempotent pagehide/beforeunload cleanup;
- mirror shutdown without reconnect;
- profiler-only decode/ring/mirror telemetry.

## Rejected work

- renderer-window decoder ownership;
- native path loading through Tauri asset protocol;
- auxiliary services attached to the end of `draw()`;
- aggressive decoder reset during ordinary source replacement.

## Next optimization boundary

Runtime-test Pass 13S first. After confirmation, return to isolated Canvas2D measurements using the profiler:

1. temporal-ring capture cost;
2. mirror capture pressure with and without a receiver;
3. CPU pixel readback in Solarize and Luma Key;
4. draw-call cost in Glitch, Scanlines, and Flow;
5. long-session memory behavior.

Only one expensive subsystem should change per pass.
