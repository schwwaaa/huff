## Pass 47 — LIVE Luma GPU Acceleration + Scratch Budget Repair

### Optimized
- Added bounded WebGL1 acceleration for LIVE/COMPOSITE Pipeline Luma.
- Added runtime alpha/premultiplication calibration against the accepted Canvas2D composite.
- Added lazy alternate unpremultiplied WebGL context if the existing Solarize context fails Luma parity.
- Removed `getImageData()` / JS pixel transform / `putImageData()` from successful GPU LIVE Luma frames.
- Added final 256-entry Clip/Gain/Invert/Cleanup/Density key LUT to CPU fallback/object sampling.
- Bounded COMPOSITE and object Luma workspaces by both long edge and total pixels.

### Diagnostics
- Added `gpu luma`, `gpu lu fall`, `gpu lu cal`, and `luma gpu` profiler lines.

### Protected
- Luma controls and matte polarity;
- Solarize family and Fluidity;
- Feedback/Persistence and frozen Flow;
- serial pipeline recipe, presets and native runtime;
- no frame skipping or cadence manipulation.

# Changelog

## Pass 46 — Threshold Solarize GPU Acceleration + Serial Stage Timing

### Optimized
- Extended the existing bounded WebGL 1 Solarize helper to legacy THRESHOLD mode.
- Removed THRESHOLD's synchronous `getImageData()` / JavaScript pixel transform / `putImageData()` from the successful GPU path.
- Retained the same <=640px Solarize working ceiling and reusable WebGL texture path.
- Preserved Pass 44 Global Mix fusion, so eligible pre-Solarize mixes still occur in the bounded staging domain.

### Diagnostics
- Added actual serial-stage wall-clock timing for persistence, front stage, direct Global Mix, Feedback, Flow, Symmetry, Solarize and presentation.
- Added separate `gpu thresh` and `gpu quant` counters.

### Protected
- accepted CPU THRESHOLD transfer helpers remain byte-identical;
- accepted LUMA QUANTIZE helpers and FLUIDITY remain byte-identical;
- Pipeline Luma remains on the accepted CPU path;
- Feedback/Persistence, frozen Flow, presets and native runtime remain unchanged;
- no frame skipping or playback-cadence change.
## Pass 45 — Solarize Quantize GPU Acceleration + Merged Luma CPU Traversal

### Optimized
- Added a bounded WebGL 1 fragment path for Solarize LUMA QUANTIZE only.
- Removed the successful GPU path's synchronous Canvas2D pixel readback and CPU pixel loop.
- Reused WebGL texture allocation via `texSubImage2D()`.
- Moved LEVEL's exponential quantization-level calculation out of the per-pixel shader.
- Merged LIVE / COMPOSITE Luma's new-source luma extraction and keyed-alpha construction into one CPU traversal.

### Compatibility / fallback
- THRESHOLD Solarize remains on the accepted CPU path.
- LUMA QUANTIZE automatically falls back to the Pass 44 CPU implementation when WebGL is unavailable or lost.
- Same-frame Luma parameter edits retain the established cached rebuild path.
- STENCIL Luma is unchanged.
- No new full-resolution buffers.
- No frame skipping or playback cadence change.

### Rejected
- A GPU Luma prototype was tested and removed after final-composite parity failed because of WebGL alpha/premultiplication differences.

### Protected
- accepted Solarize transfer functions and Fluidity;
- Feedback/Persistence;
- frozen Flow;
- pipeline order, presets and native runtime.

## Pass 44 — Solarize UI + Luma/Global Mix performance repair

### Added / changed
- Solarize now shows only the parameters owned by the selected mode.
- LIVE/COMPOSITE Luma reuses its existing source readback to build the RGB+alpha patch directly.
- Eligible Global Mix work is fused into Solarize's existing bounded scratch domain.
- Profiler counters expose Global Mix fusion and Luma fast-patch use.
- Solarize now processes every render call; the older 2nd/3rd-render reuse guard is removed.

### Preserved
- THRESHOLD, LUMA QUANTIZE and FLUIDITY algorithms.
- Feedback/Persistence and frozen Flow.
- Pipeline recipe order and FINAL Global Mix semantics.
- Existing three full-resolution buffers; no new full-resolution buffer.


## Pass 43 — Solarize Fluidity

### Added
- `FLUIDITY` 0–100% in the Solarize group.
- Solarize-local continuous temporal slew using one lazily allocated max-640px history canvas.
- Time-normalized blend coefficient so viscosity is not intentionally tied to source FPS.
- Pass 43 validator and runtime checklist.

### Compatibility
- FLUIDITY defaults to 100%, which bypasses the new history path and uses exact Pass 42 Solarize presentation.
- Old presets migrate to FLUIDITY=100%.
- Existing THRESHOLD and LUMA QUANTIZE transforms are unchanged.

### Explicitly not added
- no playback-speed change;
- no new every-N-frame update gate;
- no Solarize strobe/sample-and-hold;
- no changes to Feedback/Persistence or Flow.

### Performance boundary
- no additional getImageData()/putImageData();
- no full-resolution temporal surface;
- optional history resource exists only below FLUIDITY=100%.

## Pass 42 — Solarize Luma Quantize

### Added
- Solarize MODE selector: THRESHOLD / LUMA QUANTIZE.
- DaVE-inspired LUMA QUANTIZE controls: LEVEL, SOFT, INVERT.
- Chroma-preserving luminance-delta pixel transform in the existing Solarize scratch pass.
- Pass 42 structural and deterministic pixel validator.

### Compatibility
- THRESHOLD remains the default and retains the accepted Pass 41A algorithm.
- Old presets migrate explicitly to THRESHOLD.
- Factory presets are unchanged.
- AMOUNT remains the stable shared Solarize strength control.

### Performance boundary
- No new getImageData()/putImageData() pair.
- No new full-resolution surface.
- Existing 640px scratch and adaptive Solarize load guard are reused.

### Protected
- Flow, Feedback/Persistence, Corrupt, Scan, Luma Key, playback/source/history, pipeline runtime, capability instrumentation, native Tauri runtime.

## Pass 41A — Playback Fidelity / 1080p Classic

### Added
- `PROCESS`: AUTO / 720P / 1080P.
- `SOURCE FIT`: STRETCH / FIT / FILL / 1:1.
- `HISTORY`: explicit decoded-frame history depth with live frame/MiB readout.
- Source/process/container/fit status pill.
- rVFC mediaTime, presentedFrames, callback-gap, and processingDuration telemetry.
- Browser dropped/total video-frame telemetry in the profiler.
- Playback-resolution/source-fit/history deterministic simulation.

### Fixed
- Classic processing can no longer accidentally scale to 4K/5K/8K simply because the app window is large.
- Fixed-resolution 720P/1080P processing no longer follows UI-window resize.
- Removed the unsafe unconditional four-frame minimum from FrameRing capacity enforcement.
- HISTORY no longer changes mirror JPEG quality or mirror FPS.
- Scrub release now performs an exact seek after responsive keyframe-oriented dragging.
- Source aspect distortion is now optional instead of unavoidable.

### Compatibility
- STRETCH remains the default source mapping.
- AUTO remains the default processing mode for old presets/current behavior.
- Hidden `quality` remains a working legacy preset/MIDI/OSC alias to HISTORY.
- Existing File -> Blob URL -> p5/HTMLVideoElement decode architecture is preserved.

### Protected
- Pass 40W Corrupt/Scan/Luma handoff behavior.
- Pass 40U Scan FIELD/panel collage geometry.
- Feedback/Persistence.
- Flow.
- pipeline runtime.
- capability instrumentation.
- all 211 native `src-tauri/**` files.
