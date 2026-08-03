# HUFF Classic Optimization Pass 6

**Date:** 2026-08-03  
**Scope:** Render-control hot path and per-frame allocation reduction  
**Baseline:** HUFF Classic Optimization Pass 5  
**Feature policy:** No new features, effects, controls, routing changes, or native-renderer migration

## Purpose

Pass 6 removes repeated DOM access and numeric parsing from the 60 fps render/effect path. The HTML controls remain the authoritative public interface, but their values are mirrored into a typed render-state object whenever a control emits an `input` or `change` event.

The existing HUFF Classic interaction paths already emit those events:

- mouse and keyboard control changes;
- MIDI mappings;
- OSC mappings;
- preset application;
- form reset;
- scan-angle and feedback reset buttons.

This allows the renderer to use ordinary JavaScript numbers, booleans, and strings without querying and parsing dozens of DOM elements on every frame.

## Exact code changes

### `src/canvas.js`

- Added `renderState`, exposed as `window.HUFF_RENDER_STATE` for diagnostics.
- Added typed control conversion:
  - checkboxes become booleans;
  - range and number inputs become numbers;
  - selects and text inputs remain strings.
- Added one-time initial synchronization after the control-element registry is built.
- Added delegated document-level `input` and `change` listeners instead of attaching synchronization listeners to every control.
- Changed `_pushToRing()` to read the cached quality value.
- Changed `draw()` to read cached values for the entire rendering pipeline.
- Moved glitch-group and Global Mix emitters out of `draw()` so they are not recreated as closures every frame.
- Passed the cached state explicitly to glitch and scanline processing.
- Preserved integer-control behavior with explicit truncation where the previous implementation used `parseInt()`.

### `src/effects.js`

- Changed `applyGlitch()` and `applyScanlines()` to consume the cached render state.
- Removed direct DOM lookups and repeated `parseFloat()` / `parseInt()` calls from those effect hot paths.
- Preserved integer semantics for block size, smear length, scan counts, gaps, cluster counts, and related controls.
- Removed the unreachable `getStaticCenters()` helper, which was recreated each frame but never called.
- Removed an unused scanline local variable.

### `README.md`

- Corrected stale performance documentation about the frame-ring representation and Solarize scheduling.
- Added the Pass 6 optimization summary.

## Static hot-path reduction

Comparing the active draw/effect path in Pass 5 with Pass 6:

```text
Direct els.* references: 94 -> 0
parseFloat calls:        54 -> 0
parseInt calls:          16 -> 0
Per-frame arrow closures in draw(): 3 -> 0
```

These counts describe the code path, not measured frame-rate improvement. Actual performance still depends on footage, resolution, active effects, WebView implementation, and Syphon/Spout usage.

## Behavioral invariants

Pass 6 is intended to preserve:

- all control names, ranges, defaults, and labels;
- MIDI and OSC mappings;
- preset and reset behavior;
- existing effect order and layer-priority behavior;
- glitch history selection;
- feedback, flow, symmetry, Solarize, luma-key, and Global Mix behavior;
- Pass 4/5 Syphon transport, mandatory framework layout, and bundle verification;
- Spout and Linux code paths.

## Important synchronization rule

Built-in HUFF control paths dispatch `input` or `change` events and therefore update the cache automatically. Any future custom script that directly assigns `element.value` or `element.checked` must also dispatch the corresponding event. Direct assignment without an event will update the visible DOM control but not the render cache.

## Files changed relative to Pass 5

- `src/canvas.js`
- `src/effects.js`
- `README.md`
- root documentation suite

No Rust, Tauri configuration, native Syphon bridge, bundled framework, Spout bridge, UI layout, preset files, MIDI maps, OSC maps, or build scripts were changed.
