# HUFF Classic Optimization Changelog

This changelog tracks the optimization series for the legacy Tauri v1 + p5.js/Canvas2D edition. It intentionally excludes the native-wgpu HUFF project.

## Pass 21 — Flow dynamic-field preparation cache

**Date:** 2026-08-05  
**Status:** implementation and deterministic validation complete; target-runtime Flow comparison pending

- Added Flow grid-generation tracking for deterministic dependent-cache invalidation.
- Cached SPREAD-derived primary and turbulence noise coordinates in persistent Float64 workspaces.
- Cached SWIRL-derived radial sine/cosine values until grid geometry or SWIRL changes.
- Cached per-tile maximum source X/Y clipping bounds.
- Resolved Flow typed-array references once per pass instead of repeatedly walking workspace properties inside the tile loop.
- Preserved p5 noise calls, animated time coordinates, displacement formulas, floating-point association, Math.fround quantization, clipping, temporal source selection, draw count, and paint order.
- Added profiler-only Flow frequency and SWIRL cache rebuild/reuse telemetry.
- Added `npm run validate:pass21` with 32 checks, 5,000 randomized Flow cases, and 4,417,878 exact comparisons.
- Preserved Blob URL decoding, independent clocks, Pass 13S lifecycle cleanup, Pass 16S Syphon bootstrap, Pass 19 Syphon behavior, Spout, Rust/Tauri source, and framework packaging.

## Pass 20 — Direct hot-path range arithmetic and remaining-ceiling telemetry

**Date:** 2026-08-05  
**Status:** implementation and deterministic validation complete; target-runtime comparison against Pass 19 pending

- Removed p5 `map()` dispatch from active persistence decay.
- Removed p5 `map()` dispatch from Scanline per-band shift preparation.
- Removed p5 `map()` dispatch from Glitch smear direction and angle jitter.
- Removed two p5 `map()` calls per accepted Glitch tile from the jitter loop.
- Prepared Scanline and Glitch range spans outside their inner loops.
- Preserved exact p5 arithmetic, noise coordinates, flooring, clipping, temporal selection, and paint order.
- Added profiler-only Scanline band and draw counts.
- Added profiler-only Flow tile, draw, and grid rebuild/reuse counts.
- Added `npm run validate:pass20` with 27 source-boundary checks and 2,500,000 exact arithmetic comparisons.
- Updated README performance notes and cumulative pass summaries.
- Preserved Blob URL decoding, independent clocks, Pass 13S lifecycle cleanup, Pass 16S Syphon bootstrap, Pass 19 Syphon control-plane behavior, Spout, Rust/Tauri source, and framework packaging.

## Pass 18 — Glitch blit hot-path optimization and draw-call telemetry

**Date:** 2026-08-04  
**Status:** implementation and deterministic validation complete; target-runtime visual and performance testing pending

- Removed the per-blit Glitch helper and dispatched base/smear tiles directly through the cached Canvas2D context.
- Added a versioned FrameRing mutation counter and reusable temporal source-reference table.
- Replaced one `frameRing.fromEnd()` call per tile with a cache rebuilt only after ring mutation or requested-depth change.
- Added reusable typed X/Y smear-offset buffers.
- Reduced smear rounding from `2 × tiles × SMEAR` to `2 × SMEAR` operations per Glitch frame while preserving original multiplication order.
- Calculated constant tile span once per Glitch invocation.
- Added profiler-only Glitch tile, draw-call, and ring-cache rebuild/reuse telemetry.
- Preserved tile placement, seeded random/noise order, temporal selection, draw rectangles, paint order, cluster motion, alpha, and artistic draw count.
- Applied Junkpile's persistent-resource, explicit-invalidation, and draw-call-accounting principles without importing WebGL or wgpu.
- Added `npm run validate:pass18` with 4,832 checks and 3,474,837 exact ordered draw-operation comparisons.
- Preserved the stable Blob URL decoder, independent clocks, Pass 16S Syphon bootstrap, Spout, native transport, and framework packaging.

## Pass 17 — One-scratch Pipeline Luma Key acceleration

**Date:** 2026-08-03  
**Status:** implementation and deterministic validation complete; target-runtime parity and performance testing pending

- Removed the second bounded Pipeline Luma Key canvas and context.
- Built the cached clean-area patch directly in the CPU-readable scratch canvas.
- Removed one clean-source copy and one `destination-in` composition from every patch rebuild.
- Added packed little-endian RGBA processing with a byte fallback.
- Preserved source RGB, partial source alpha, threshold behavior, invert behavior, mix, decoded-frame caching, and effect order.
- Preserved the original inverted floating-point operation order after validation caught a one-byte boundary difference from algebraic simplification.
- Added profiler-only Luma Key phase and cache telemetry.
- Added `npm run validate:pass17` with 1,293 checks and 17,715,200 exact pixel comparisons.
- Preserved the Pass 16S Syphon bootstrap repair, stable decoder, independent clocks, Spout, native transport, and framework packaging.

## Pass 16S — Syphon bootstrap publication repair

**Date:** 2026-08-03  
**Status:** implementation and static validation complete; target-runtime OBS confirmation pending

- Superseded Pass 16 after OBS discovered the `huff` Syphon server but displayed black with no advancing frames.
- Identified a deadlock-capable double gate: the browser sender and native publisher both refused work until `hasClients` was already true.
- Added one bounded bootstrap frame per second while no receiver is confirmed.
- Removed the duplicate native no-client return so a newly attaching client receives a current published surface.
- Restored the selected 30/60 fps cap immediately after receiver attachment.
- Retained one-frame-in-flight acknowledgement, WebSocket backpressure, Worker readback, persistent Metal textures, and receiver-aware full-rate pacing.
- Added output-size ImageBitmap capture when supported, with the original full-size Worker fallback.
- Preserved Pass 16 Solarize changes, stable decoder ownership, independent frame clocks, effects, mirror transport, Spout, and framework packaging.
- Added `npm run validate:pass16s`.

## Pass 16 — Solarize readback and presentation optimization

**Date:** 2026-08-03  
**Status:** implementation and deterministic validation complete; target-runtime Solarize comparison pending

- Removed the dedicated full-resolution Solarize output cache canvas.
- Presented the processed bounded Solarize scratch directly into `gBuf`.
- Removed one full-resolution canvas copy from every processed Solarize frame.
- Added a packed little-endian `Uint32Array` pixel path with exact alpha preservation.
- Retained the previous byte-oriented algorithm as an automatic fallback.
- Added pre-shifted packed channel maps and removed temporary channel-map key strings.
- Preserved the 640px scratch bound, Float64 luma formula, strict threshold comparison, channel rounding, and adaptive load-guard cadence.
- Added profiler-only readback, transform, upload, presentation, and processed/reused measurements.
- Added `npm run validate:pass16` with 644 checks and 8,391,032 exact pixel comparisons.
- Preserved Blob URL decoding, independent frame clocks, all other effects, mirror transport, Syphon, Spout, Rust/Tauri code, and framework packaging.

## Pass 15 — Bounded mirror bitmap staging

**Date:** 2026-08-03  
**Status:** implementation and deterministic static validation complete; target-runtime mirror comparison pending

- Requested final bounded mirror dimensions during `createImageBitmap()` capture on supporting WebViews.
- Reduced the normal Worker-transfer bitmap from full render resolution to the established mirror preview dimensions for canvases above 1280 × 1280 bounds.
- Added one-session detection and fallback when ImageBitmap resize options are rejected or ignored.
- Retained the previous full-resolution Worker path and main-thread `toBlob()` fallback.
- Cached mirror target geometry until render-canvas dimensions change.
- Added exact-size Worker copies for pre-sized bitmaps while preserving Worker scaling for legacy input.
- Added profiler-only mirror capture, encode, and resized/full staging telemetry.
- Preserved independent mirror scheduling, receiver-aware suspension, relay acknowledgement, WebSocket backpressure, decoder ownership, effects, Syphon, Spout, and native packaging.
- Added `npm run validate:pass15` with compatibility-state, target-dimension, transfer-reduction, and scheduler-boundary checks.

## Pass 14 — Exact-size canvas copies and temporal-ring release

**Date:** 2026-08-03  
**Status:** implementation and deterministic static validation complete; runtime performance and memory testing pending

- Added exact-size `drawImage(source, 0, 0)` dispatch to shared full-frame Canvas2D copy helpers.
- Retained the scaled destination path only when source and destination dimensions differ.
- Applied the exact-size path to temporal-ring capture and recurring buffer/scratch copies.
- Added explicit retirement of discarded FrameRing canvas backing stores.
- Preserved newest-frame ordering when temporal-ring capacity shrinks.
- Disposed all temporal-ring surfaces during application shutdown.
- Added profiler rows for allocated history slots, configured capacity, and estimated raw MiB.
- Moved clustered-glitch physics updating to one reusable module-level function.
- Preserved cluster random/noise order, movement equations, pulse behavior, and tile state.
- Added `npm run validate:pass14` with ring-order, release, copy-dispatch, scheduler-boundary, and physics-equivalence checks.
- Kept full-rate history capture, the 192 MiB estimated budget, decoder ownership, frame clocks, effects, Syphon, Spout, and native packaging unchanged.

## Pass 13S — Stability-Safe Lifecycle Hardening

**Date:** 2026-08-03  
**Status:** Implementation and static validation complete; runtime testing pending

- Branched from Pass 12R rather than the rejected Pass 13.
- Preserved Blob URL + p5 `createVideo()` media loading.
- Preserved independent p5, transport, mirror, and profiler animation clocks.
- Added source-generation guards to readiness, autoplay, seek, error, and camera callbacks.
- Added explicit ownership and cleanup for readiness intervals and autoplay listeners.
- Rejected stale camera completions and stopped abandoned tracks.
- Added conservative source retirement without clearing `src` or forcing decoder `load()` during ordinary replacement.
- Added idempotent pagehide/beforeunload cleanup for media, audio, Blob URLs, mirror Worker, and mirror WebSocket.
- Prevented mirror reconnect after shutdown begins.
- Added profiler-only decode, temporal-ring, and mirror backpressure telemetry.
- Added `validate:pass13s` to enforce the stable scheduler and decoder boundaries.

## Pass 13 — Scheduler Consolidation Rejected

**Date:** 2026-08-03  
**Status:** Rejected after runtime testing

- Moved transport updates, mirror scheduling, and profiler work behind completed p5 frames.
- Reworked the stable media lifecycle broadly.
- Produced significantly worse frame pacing and playback stability than Pass 12R.
- Must not be used as a baseline or merged.

## Pass 12R — Decode Regression Rollback

### Rejected

- Rejected the Pass 12 direct-renderer migration after it produced a video decode error with media supported by the established HUFF Classic path.
- Rejected native path loading through `convertFileSrc()` and the Tauri asset protocol as an unverified replacement for Blob URL loading.

### Restored

- Restored the complete Pass 11 runtime and native baseline.
- Restored `File` → `URL.createObjectURL()` → p5 `createVideo()` media loading.
- Restored the controls WebView as the authoritative decode/render owner.
- Retained all validated optimization work from Passes 1–11.

### Documented

- Added a video decode incident report with the exact regression boundary and configuration defect.
- Established that future renderer-ownership work must remain experimental until target-platform runtime tests pass.

## Pass 11 — No-op and dirty-state elimination

**Date:** 2026-08-03  
**Status:** Implementation and deterministic static validation complete; runtime visual parity and endurance testing pending

- Added one sealed, reusable effective-stage activity record with no per-frame object allocation.
- Replaced the incomplete `anyFxActive` predicate with stage-specific contribution checks.
- Added a true all-neutral path that copies `gCur` directly to the main canvas without a background fill or persistent-pipeline dispatch.
- Coalesced bypass `gCur → gBuf` synchronization by decoded-frame serial rather than repeated render ticks.
- Skipped zero-strength Flow, invisible/empty Scanlines, zero-mix Luma and Global Mix, identity Feedback, no-region Symmetry, exact-identity Solarize, and zero Base Mix.
- Added internal Solarize identity guards before scratch allocation and synchronous readback.
- Preserved Glitch/Scanline phase and Scanline spin progression while neutral states are bypassed.
- Included Scanline-only and Luma-only states in final pipeline accounting.
- Added `npm run validate:pass11` for no-op predicates, identity proofs, bypass synchronization, and source-path checks.
- Kept Syphon, Spout, Rust relay, Tauri configuration, framework layout, controls, and fixed routing unchanged.

## Pass 10 — Scanline band workspace and static geometry cache

**Date:** 2026-08-03  
**Status:** Implementation and deterministic static validation complete; runtime visual parity and endurance testing pending

- Added one persistent typed `ScanlineBandWorkspace`.
- Cached per-band slow-drift, fast-jitter, and shift noise constants.
- Cached angle radians, trigonometry, rotated coverage span, and cross-axis span by render size and angle.
- Reused complete prepared band rectangles when phase, geometry, and controls are unchanged.
- Invalidated prepared Scanline bands whenever the p5 noise seed changes.
- Added zero-alpha, zero-fast-jitter, and zero-shift shortcuts.
- Assigned Canvas2D alpha once per Scanline pass rather than once per accepted band.
- Preserved Drift, Focus, Roll, Gap, Skew, Shift, Spin, clipping, source sampling, and band draw order.
- Added `npm run validate:pass10` with 2,400 cases and 28,342 exact band comparisons.
- Documented the Junkpile-derived persistent-workspace and invalidation model.
- Kept Syphon, Spout, Rust relay, Tauri configuration, framework layout, effects, controls, and routing unchanged.

## Pass 9 — Flow geometry cache, FrameRing hot path, and receiver-aware mirror

**Date:** 2026-08-03  
**Status:** Implementation and static validation complete; runtime Flow/mirror parity pending

- Added a reusable typed `FlowGridWorkspace` keyed by render width, height, and SCALE.
- Moved static tile positions, edge sizes, normalized coordinates, inward vectors, and radial angles out of normal Flow frames.
- Preserved Flow noise, animation, turbulence, pull, swirl, history pulse, row-major draw order, and `Math.fround()` quantization.
- Kept dedicated FrameRing contexts in Canvas2D `copy` mode between captures.
- Cached FrameRing capacity calculations until resolution or QUALITY changes.
- Added Rust canvas-client count notifications to the controls WebView.
- Stopped mirror `ImageBitmap` capture, JPEG encoding, and WebSocket upload while no canvas receiver is attached.
- Added one relay acknowledgement per accepted JPEG so the browser keeps one mirror frame in flight.
- Added `npm run validate:pass9` with 1,728 cases and 4,385,502 exact Flow tile comparisons.
- Corrected output documentation to describe current role-based raw-RGBA Syphon/Spout transport and legacy packet compatibility.
- Kept Syphon implementation/framework, Spout bridge, controls, effects, and routing behavior unchanged.

## Pass 8 — Shared full-resolution scratch buffer and Canvas2D surface reuse

**Date:** 2026-08-03  
**Status:** Implementation and static validation complete; runtime visual parity, resize, and endurance testing pending

- Consolidated Feedback, Flow Warp, and Symmetry onto one shared full-resolution ping-pong surface.
- Reduced always-resident p5 Graphics surfaces from four to three.
- Removed the separate full-resolution feedback snapshot canvas.
- Reused p5 Graphics objects across window resize instead of constructing an entire replacement set.
- Reused Solarize and Pipeline Luma Key scratch canvas/context objects across size changes.
- Set pixel density before main-canvas allocation and only configured Graphics density once.
- Replaced full-frame p5 wrapper operations in source copy, final presentation, and Symmetry with native Canvas2D operations.
- Cached mirror canvas resolution and QUALITY-derived JPEG/FPS tuning.
- Updated public technical documentation to match the canvas-backed ring, typed render state, and current buffer topology.
- Kept Syphon implementation/framework, Spout, effect order, controls, and routing unchanged.

## Pass 7 — Reusable glitch placement and cluster-offset buffers

**Date:** 2026-08-03  
**Status:** Implementation complete; runtime visual-parity and endurance testing pending

- Replaced per-frame glitch target arrays with reusable typed coordinate buffers.
- Replaced the per-frame Map-of-arrays spatial-gap index with a reusable linked-cell `Int32Array` index.
- Removed temporary `[x, y]` arrays from target insertion and tile blitting.
- Replaced rerolled cluster-offset objects with persistent `Float64Array` angle/radius buffers.
- Preserved seeded-random call order, spatial acceptance order, strict gap comparison, and cluster shrink/regrow semantics.
- Added deterministic equivalence tests for spatial acceptance and cluster-offset state transitions.
- Preserved all renderer routing, controls, Syphon transport, framework packaging, Spout, and Linux paths.

## Pass 6 — Event-driven render state and allocation cleanup

**Date:** 2026-08-03  
**Status:** Implementation complete; runtime parity and stabilization testing pending

- Added a typed event-driven cache for render controls.
- Replaced direct DOM reads and numeric parsing throughout the draw, glitch, and scanline hot paths.
- Used two delegated synchronization listeners rather than per-control cache listeners.
- Preserved previous integer parsing semantics for discrete controls.
- Moved per-frame glitch and Global Mix closures to reusable helpers.
- Removed an unreachable cluster-center helper and an unused scanline local.
- Corrected stale README performance notes.
- Preserved all native Syphon, framework-bundling, and output-transport code from Pass 5.

## Pass 5 — Render and pixel-processing hot paths

**Date:** 2026-08-03  
**Status:** Implementation complete; runtime stabilization pending

- Replaced selected full-frame clear-and-draw pairs with Canvas2D copy compositing.
- Combined Flow Warp calculation and rendering into one traversal.
- Removed Flow Warp displacement arrays while preserving prior Float32 quantization behavior.
- Added cached Solarize luma/channel lookup tables.
- Cached Pipeline Luma Key masks across identical decoded frames and unchanged key settings.
- Reduced feedback snapshot work to one full-frame copy.
- Preserved all Pass 4 Syphon behavior and packaging.

## Pass 4 — Syphon stream and mandatory framework packaging

**Date:** 2026-08-03  
**Status:** Initial runtime test generally okay; extended testing pending

- Added native Syphon `hasClients` detection.
- Paused capture, readback, WebSocket transfer, Metal upload, and publication when no receiver is attached.
- Added one-frame-in-flight acknowledgement to prevent raw RGBA queue growth.
- Added Worker + OffscreenCanvas readback/scaling where supported, with a bounded fallback.
- Added short-lived Objective-C autorelease pools around Syphon and Metal operations.
- Retained persistent Metal device, queue, server, and triple texture ring.
- Made `Syphon.framework` mandatory for macOS compilation.
- Added built-application framework verification.
- Added universal-bundle re-signing and signature verification after `lipo` assembly.
- Preserved the user-supplied working Syphon framework layout.

## Pass 3 — Native-output transport copy reduction

**Status:** Superseded by the current source; historical summary from the delivered pass record

- Introduced dedicated Syphon and Spout socket roles.
- Sent frame dimensions during stream setup instead of rebuilding a per-frame header packet.
- Sent ImageData pixel views directly to reduce an additional full-frame JavaScript copy.
- Added pre-readback backpressure checks.
- Improved native-output socket and readback-surface cleanup.
- Retained legacy packet handling in Rust for compatibility.

## Pass 2 / 2.1 — Mirror transport and workspace isolation

**Status:** Superseded by the current source; historical summary from the delivered pass record

- Moved mirror JPEG scaling/encoding to a Worker where supported.
- Added one-frame-in-flight behavior for mirror encoding.
- Reduced output-window backing-canvas expansion on high-density displays.
- Changed the Rust mirror relay toward latest-frame-wins behavior.
- Reduced repeated source resolution inside the Flow Warp tile loop.
- Reduced Pipeline Luma Key allocation.
- Corrected Tauri launch-page configuration.
- Added a local Cargo workspace boundary to avoid unrelated ancestor-workspace manifests.

## Pass 1 — Memory, queue, resource-reuse, and lifecycle foundation

**Status:** Superseded by the current source; historical summary from the delivered pass record

- Replaced CPU `ImageData` history storage with reusable canvas-backed history surfaces.
- Reduced redundant decoded-video copies.
- Added bounded frame backpressure.
- Reduced Syphon and Spout temporary allocation churn.
- Reused native Syphon Metal textures.
- Improved native cleanup and coordinated application shutdown.
- Coalesced resize work and released obsolete history resources.

## Product boundary maintained throughout

- HUFF Classic only.
- Tauri v1.
- HTML/JavaScript and p5.js/Canvas2D rendering.
- No wgpu renderer.
- No new effects or feature expansion during optimization.
- macOS, Windows, and Linux remain the intended public platforms, with platform-specific output capabilities.


---

## Pass 19 — Syphon control-plane budget and phase telemetry

### Added

- Profiler breakdown for Syphon capture, Worker draw/readback, total pipeline, Metal upload, native publish, backpressure skips, and status UI updates.
- Low-rate sampled native upload/publish timing.
- Deterministic Pass 19 validator.

### Changed

- Coalesced Syphon status DOM updates to four hertz while retaining per-frame acknowledgements.
- Cached selected Syphon output FPS.
- Suspended redundant Tauri state polling during healthy acknowledgement flow.
- Sampled native receiver presence at four hertz while connected.
- Preserved receiver checks on every disconnected bootstrap frame.
- Kept ordinary acknowledgements compact; timing fields appear only on sampled frames.
- Sent the fallback RGBA `ArrayBuffer` directly.

### Preserved

- Pass 16S one-fps bootstrap and black-frame repair.
- Immediate full-rate output after receiver attachment.
- One-frame-in-flight backpressure.
- Blob URL decoder and independent clocks.
- Effects, temporal history, mirror, Spout, and bundled Syphon framework.
