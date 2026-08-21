# Pass 58 — Constrained Pipeline Recipe Expansion

## Added
- Five new validated serial pipeline recipes:
  - TEMPORAL UNDERLAY
  - SYMMETRY MEMORY
  - COLOR MEMORY
  - FLOW FINISH
  - FEEDBACK FINISH · EXP
- Dynamic mini routing diagram under the Pipeline recipe selector.
- Recipe diagram metadata validated against executable route order.
- Pass 58 structural/regression validator and runner.

## Changed
- Preset recipe-ID validation now reads the built-in runtime recipe registry instead of a hard-coded two-route set.
- Global Mix/Solarize fusion is limited to CLASSIC and CRISP FINISH; reordered recipes use explicit serial Global Mix execution.

## Preserved
- Exact CLASSIC Pass 22 route.
- Existing CRISP FINISH route.
- Feedback, Flow, Symmetry, Solarize, Presentation implementations.
- Corrupt / Scanlines / Luma image-feed algorithms and Layer Priority.
- Existing three full-resolution graphics surfaces.
- Syphon / Spout / native preset I/O.
- HUFF Classic non-wgpu architecture.

## Status
Runtime candidate; target-machine creative acceptance pending.

# Pass 57 — Release Candidate Regression Freeze

### Release hardening
- Added a unified release-candidate regression validator and runner.
- Added exact Pass 56 runtime hash protection.
- Added duplicate HTML ID detection.
- Added current-contract checks for presets, keyboard focus, three-source pipeline awareness, and 720p Syphon profiles.
- Added an integrated cross-platform manual test matrix.
- Added a controlled workflow for capturing future factory-preset candidate JSONs during regression without baking them into the build.

### Runtime
- No rendering, effect, pipeline, preset-runtime, Syphon, Spout, or native runtime behavior changed.

---

## Pass 56 — Preset Save + Session Recall

- Fixed SAVE FILE… so a successful local JSON save also registers that exact preset in the current session dropdown.
- Newly saved presets can be recalled immediately without reloading the JSON.
- Session group now covers both saved and loaded files.
- Same-path saves refresh instead of duplicating session slots.
- Preserved temporary session lifetime and user-owned JSON persistence.
- No creative pipeline or output changes.

# Changelog

## Pass 55 — Keyboard Focus Safety

### Fixed
- Preset names can contain `p` and `P` without hiding the HUFF controls.
- Editable controls now own keyboard input before global HUFF shortcuts.
- Typing `f/F` in a preset name no longer toggles fullscreen.
- Ctrl/Cmd+Z inside editable controls is left to normal text/control undo behavior.

### Preserved
- Pass 54 session preset bank and JSON workflow.
- Pass 52D image pipeline contract.
- Pass 51 720p60 Syphon transport.
- All effect/render behavior.

## Pass 54 — Session Preset Bank

### Preset workflow
- Loaded JSON presets now remain recallable in the preset dropdown for the lifetime of the current HUFF process.
- Added `SESSION — LOADED FILES` group.
- Multiple user files accumulate into one temporary performance bank.
- Same-path reload refreshes an existing slot; different same-named files are disambiguated visually.
- Legacy exported banks now populate the same session bank without clearing earlier loads.

### Persistence boundary
- No session preset is persisted inside HUFF.
- No new localStorage or sessionStorage writes.
- Portable JSON files remain the user's durable preset storage.

### Protected
- Pass 53 native Save/Open + JSON commands.
- Pass 52D image pipeline awareness and exact render-stage behavior.
- Pass 51 720p60 Syphon transport.

## Pass 52D — Three-Source Pipeline Awareness

### UI / product contract
- Added explicit `IMAGE FEED` indicators for Corrupt, Scanlines, and Luma/Composite.
- Added `DOWNSTREAM` labels and state badges to Symmetry and Solarize.
- Added immediate `NEEDS IMAGE FEED` warning when either downstream stage is enabled without a primary feed.
- Added active-feed reporting and CLASSIC / CRISP FINISH quick-route disclosure.
- Luma/Composite is considered active only with nonzero Mix.

### Protected
- No new CLEAN source route.
- No automatic source enabling.
- Exact Pass 52B render-stage functions remain hash-identical.
- Pass 52 effect algorithms, pipeline-runtime recipe definitions, Pass 51 Syphon worker, and native output remain unchanged.

### Historical correction
- Target-machine tests did not validate the intended standalone Symmetry/Solarize behavior from 52A/52B/52C. Pass 52D stops presenting standalone operation as a release requirement and instead makes the real constrained pipeline legible.

## Pass 52B — Standalone Symmetry / Solarize Repair

- Fixed Symmetry operating on stale persistent `gBuf` when used as the only spatial effect.
- Fixed Pass 52A Solarize isolation logic incorrectly treating disabled Feedback as an active image owner when the historical Feedback amount remained non-zero.
- Added explicit actual-Feedback ownership test without changing Persistence behavior.
- Added live-source ownership for standalone Symmetry and preserved Symmetry -> Solarize chaining.
- Preserved Pass 52 Posterize algorithms and Pass 51 Syphon transport byte-for-byte in protected files.

## Pass 52 — Chroma Posterize

- Added Magic-DaVE-inspired chroma posterization as a third Solarize-family mode.
- Added LEVEL / SOFT / PHASE controls with mode-specific visibility.
- Reused existing bounded colour GPU accelerator and CPU fallback.
- Preserved Pass 51 Syphon and all protected creative behavior.

## Pass 51 — Syphon 720p60 Bounded Pipeline

### Product boundary
- Classic Syphon is now fixed at 1280×720.
- 60 fps is primary/default; 30 fps is safe/manual and automatic fallback.
- 1080p Syphon output is removed from Classic.

### Optimized
- Worker-direct transport now owns two native frame credits instead of waiting for every native ACK before the next browser capture.
- Worker caps outstanding native depth at two and bounds local WebSocket buffering.
- Native ACKs release credits in the Worker; controls receive sampled status/profiling rather than using ACKs as the frame scheduler.
- Direct ACK timeout recovery moves into the Worker.

### Protected
- Pass 49 lifecycle/bootstrap/main-socket fallback.
- Pass 50 Worker-owned WebSocket.
- native Rust/Metal/Syphon protocol and publisher.
- effects, Luma, Solarize, Feedback/Persistence, frozen Flow and Spout.

## Pass 50 — Syphon Worker-Owned Transport

### Optimized
- Worker now owns the preferred Syphon WebSocket and sends raw RGBA directly to Rust.
- Removed the full-frame Worker -> controls ArrayBuffer transfer from the preferred path.
- Added bounded Worker transport negotiation with automatic Pass 49 main-socket fallback.
- Added transport-route/fallback profiler telemetry.

### Protected
- Pass 49 Syphon profiles/lifecycle/bootstrap/one-frame gate.
- native Rust/Metal/Syphon protocol and publisher.
- effects, Luma, Solarize, Feedback/Persistence, Flow and Spout.

## Pass 49 — Syphon Stability Contract

### Stabilized
- narrowed Syphon UI to CLASSIC 720p30, 1080p30 and experimental 720p60 profiles.
- replaced ambiguous transport booleans with explicit lifecycle states.
- strengthened start/stop/restart/shutdown cleanup while retaining 1 fps bootstrap and one-frame-in-flight behavior.

## Pass 48 — Stable Layer Priority + Mix/Fade Vocabulary

### Layer Priority
- Reduced Layer Priority to two explicit stable choices: `SCAN TOP` and `CORRUPT TOP`.
- Removed the old frame-alternating Neutral mode.
- Removed Pulse ordering and Pulse Speed.
- Added deterministic migration of old dynamic priority values to `SCAN TOP`.

### Global Mix
- Added `CURVE`: `LINEAR`, `SMOOTH`, `PUNCH`.
- `LINEAR` is exact legacy Mix behavior.
- Curves reshape the existing amount only and are shared by the normal and Solarize-fused Global Mix paths.
- No new render stage, scratch surface, or feedback route is added.

### Luma Key
- Preserved `X-FADE` and `SOFT ADD`.
- Added `LIGHTEN`, `DARKEN`, `MULTIPLY`, `OVERLAY`, `HARD LIGHT`, and `DIFFERENCE` for `TARGET=COMPOSITE`.
- Expanded fades operate on the existing keyed clean patch and do not change key extraction or shaping.

### Protected
- Pass 47 LIVE Luma acceleration and fallback behavior.
- Solarize family and Fluidity.
- Feedback/Persistence and frozen Flow.
- Playback/native output architecture.

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

## Pass 52A — Solarize Solo Source-Ownership Repair

- Fixed Solarize-family standalone operation by giving isolated Solarize direct ownership of the current clean `gCur` image.
- Preserved `gBuf` ownership for every combined-effect path involving Glitch, Scanlines, Luma, Global Mix, Feedback, Flow, or Symmetry.
- Added no full-resolution source copy; the existing bounded Solarize processor consumes the direct source canvas.
- Added `sol live` profiler telemetry.
- Preserved Pass 52 Chroma Posterize and Pass 51 Syphon behavior.

## Pass 53 — Preset File Workflow Repair

- Replaced new named localStorage saves with native Save/Open file workflow.
- Added versioned single-preset JSON documents.
- Added built-in preset registry with Classic Default.
- Added read-only migration for old localStorage presets and old exported preset banks.
- Removed ambiguous Delete/Export/Import local-bank controls and duplicate hidden file-input ID.
- Added JSON-only 1 MiB native preset read/write commands.
- Enabled Tauri v1 dialog open/save allowlist.
- Preserved exact Pass 52D/52B render-stage behavior and Pass 51 Syphon Worker.
