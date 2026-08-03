# HUFF Classic Optimization Changelog

This changelog tracks the optimization series for the legacy Tauri v1 + p5.js/Canvas2D edition. It intentionally excludes the native-wgpu HUFF project.

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
