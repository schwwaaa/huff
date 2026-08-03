# HUFF Classic Current Status — After Pass 12R

## Authoritative baseline

**HUFF Classic Optimization Pass 12R is Pass 11 runtime code plus rollback documentation.**

Pass 12 direct-renderer code is rejected and must not be merged or used for further optimization.

## Working architecture retained

```text
controls WebView
  → File input / Blob URL video decode
  → p5.js + Canvas2D renderer
  → bounded temporal history
  → receiver-aware JPEG canvas mirror
  → Syphon / Spout output paths
```

## Completed optimization work retained

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

## Rejected work

- renderer-window decode ownership;
- native path loading via Tauri asset protocol;
- replacement of the working Blob URL media path.

## Next optimization boundary

Continue inside the existing working architecture. The next pass should focus on decode/render cadence and repeated-frame elimination without changing how files are loaded or which WebView owns the decoder.
