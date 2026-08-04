# HUFF Classic Optimization Pass 16S

**Status:** Syphon black-frame hotfix; supersedes Pass 16  
**Baseline:** HUFF Classic Optimization Pass 16  
**Scope:** Repair Syphon startup/publication without altering the stable media decoder, render clocks, Canvas2D effects, Solarize optimization, Spout, or packaging.

## Reported failure

The HUFF Syphon server started and appeared as a selectable source in OBS, but the source remained black and the native frame counter did not advance.

## Investigation result

Pass 16 did not directly modify the Syphon JavaScript, Rust publisher, WebSocket protocol, or bundled framework. Its runtime changes were limited to Solarize and profiler reporting.

The existing Syphon transport nevertheless contained a deadlock-capable startup policy:

```text
Browser Syphon sender
  waits for native hasClients == true

Native Syphon publisher
  refuses to publish until hasClients == true
```

A receiver can discover the server before it fully attaches to a current published surface. Under that sequence, HUFF advertises the source but publishes zero frames, so the receiver remains black.

## Repair

Pass 16S makes the receiver-aware optimization bootstrap-safe:

- While no receiver is confirmed, the browser sends one frame per second.
- The native publisher accepts and publishes those bounded bootstrap frames instead of applying a second `hasClients` gate.
- Once `hasClients` becomes true, the browser immediately switches to the selected Syphon frame rate.
- The normal one-frame-in-flight acknowledgement, WebSocket backpressure, persistent Metal textures, and receiver-aware full-rate pacing remain.
- Syphon ImageBitmap capture now requests the selected Syphon output dimensions when supported, retaining the original full-size fallback.

## Runtime files changed

- `src/index.html`
- `src-tauri/src/syphon.rs`
- `package.json`
- `scripts/validate-pass16s.mjs`

## Explicitly unchanged

- `src/canvas.js`
- `src/effects.js`
- Blob URL + p5 `createVideo()` decoding
- p5 render clock
- transport clock
- canvas mirror clock
- profiler clock
- temporal history
- all visual effect formulas and ordering
- Spout
- Syphon framework binary and bundle location

## Replacement rule

Do not use the original Pass 16 package for release testing. Pass 16S contains the same Solarize optimization plus the Syphon publication repair.
