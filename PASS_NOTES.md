## Pass 47 — LIVE Luma GPU Handoff / Scratch Budget

- Triggered by target-machine isolation: LIVE/COMPOSITE Luma alone could reduce ~60 FPS to ~52 FPS.
- Adds a bounded WebGL1 keyed-patch path for `TARGET=COMPOSITE`, `KEY SRC=LIVE`.
- Adds a one-time runtime WebGL->Canvas2D alpha parity probe for X-FADE and SOFT ADD.
- Tests the existing premultiplied Solarize context first and lazily tests an unpremultiplied Luma-only context only if required.
- Successful GPU frames perform no `getImageData()`, `putImageData()` or `readPixels()`.
- Keeps the accepted CPU path as automatic fallback and replaces per-pixel key shaping math with a final 256-entry LUT.
- Replaces width-only Luma scratch sizing with long-edge + pixel-budget sizing.
- No frame skipping, playback-rate changes, Feedback/Persistence changes, Flow changes or Solarize transfer changes.

# HUFF Classic Pass Notes

## Pass 46 — Threshold Solarize GPU Acceleration / Stage Timing

- Triggered by the Pass 45 runtime screenshot at ~48 FPS, which showed Solarize was actually running **THRESHOLD**, not LUMA QUANTIZE.
- Extends the existing <=640px WebGL 1 Solarize accelerator to THRESHOLD.
- Successful THRESHOLD GPU frames avoid Solarize's Canvas2D readback, JavaScript pixel loop and pixel upload.
- The exact CPU THRESHOLD algorithm remains present as fallback/reference.
- Adds profiler wall-clock timings at the real serial recipe stages plus separate `gpu thresh` / `gpu quant` counters.
- Pipeline Luma remains CPU after the earlier GPU-Luma parity failure; no unsafe alpha shortcut is reintroduced.
- No frame skipping, sample/hold, playback-rate changes, Feedback/Persistence changes or Flow changes.
## Pass 45 — Solarize Quantize GPU Acceleration / Luma Traversal Merge

- Runtime report: Luma + LUMA QUANTIZE could still fall to ~40 FPS in Pass 44.
- Adds a <=640px WebGL 1 assist only for Solarize LUMA QUANTIZE; Classic remains Tauri v1 + p5.js / Canvas2D.
- Removes Quantize's synchronous `getImageData()` / JavaScript pixel transform / `putImageData()` from the successful GPU path.
- Calculates LEVEL -> quantization steps once outside the fragment shader; reuses texture allocation with `texSubImage2D()`.
- Merges LIVE / COMPOSITE Luma luma-capture + source-alpha + keyed-alpha work into one exact CPU traversal on new source frames.
- Explicitly rejects and removes a tested GPU Luma prototype because final Canvas2D compositing did not preserve visual parity.
- No frame skipping, playback-rate changes or sample/hold optimization.
- Flow remains frozen and byte-identical.

## Pass 44 — Solarize Active Parameters / Performance Repair

- THRESHOLD displays THRESH + SOL R/G/B; LUMA QUANTIZE displays LEVEL + SOFT + INVERT.
- ON / MODE / AMOUNT / FLUIDITY stay visible in both modes.
- Removes Solarize's older adaptive every-N-render reuse behavior.
- Optimizes LIVE/COMPOSITE Luma by directly reusing the already-read source pixels.
- Fuses safe pre-Solarize Global Mix positions into Solarize's 640px scratch when no intervening transform is active.
- Flow remains frozen and byte-identical.

# Pass Notes

## Pass 43 — Solarize Fluidity

- Built directly from Pass 42 HUFF Classic.
- Adds Solarize FLUIDITY; 100% is exact compatibility behavior.
- Lower values continuously slew Solarize state rather than changing media FPS or adding a new frame gate.
- Uses one optional bounded low-resolution history canvas only when active.
- Flow and Feedback/Persistence equations remain untouched.
- Runtime acceptance pending.

## Pass 42 — Solarize Luma Quantize

- Built from accepted Pass 41A.
- Existing Solarize is retained as MODE = THRESHOLD and remains the default.
- Added MODE = LUMA QUANTIZE with LEVEL / SOFT / INVERT.
- New algorithm shares the existing bounded Solarize readback/scratch path.
- Flow remains frozen/protected.
- Runtime acceptance pending.

## Pass 41A — Playback Fidelity / 1080p Classic boundary

Pass 41A follows the decision that HUFF Classic may top out at **1920×1080** while
HUFF HD owns 4K+ processing. The pass repairs media-path ambiguity rather than
replacing the proven WebView decoder architecture.

Key changes:
- explicit `AUTO / 720P / 1080P` processing resolution;
- explicit `STRETCH / FIT / FILL / 1:1` source mapping;
- public `HISTORY` control instead of misleading `QUALITY`;
- strict 192 MiB FrameRing ceiling with the unsafe four-frame floor removed;
- mirror preview fully decoupled from temporal history;
- requestVideoFrameCallback / dropped-frame playback diagnostics;
- fast seek while dragging + exact seek on release;
- clearer MP4/MOV/WebM container messaging.

Pass 40W front-stage behavior is protected exactly outside `src/canvas.js` and the
source-control UI. No decoder backend, Flow, Luma, Scan FIELD, Corrupt, Feedback,
or native output architecture is redesigned here.
