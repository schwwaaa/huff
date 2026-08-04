# HUFF Classic Optimization Pass 13S — Stability-Safe Lifecycle Hardening

**Baseline:** HUFF Classic Pass 12R / Pass 11 runtime  
**Status:** Implementation and static validation complete; target-runtime testing required  
**Supersedes:** Rejected Pass 13 scheduler/lifecycle rewrite

## Purpose

Pass 13S salvages only the low-risk lifecycle improvements from the rejected Pass 13 while preserving the frame pacing and decoder behavior that made Pass 12R significantly more stable.

This is a stability pass, not an effects-performance rewrite. It is intended to prevent hidden source, camera, listener, timer, audio, and mirror resources from accumulating during repeated use without placing additional work in `draw()`.

## Changes

### 1. Source-generation guards

Each file or camera source receives a generation number. Async callbacks verify that their generation and media element are still authoritative before changing playback state.

Guarded callbacks include:

- file readiness events;
- readiness polling;
- delayed `play()` resolution;
- autoplay gesture unlock;
- `seeked` events;
- video errors;
- camera initialization;
- camera metadata readiness.

Late callbacks from replaced sources now exit without restarting playback or creating another frame-pump chain.

### 2. Owned readiness poller

The active source-readiness interval is now stored globally and explicitly cleared when:

- the source becomes ready;
- the poll limit is reached;
- another source replaces it;
- camera mode begins;
- the app shuts down.

This prevents orphaned intervals after rapid source replacement.

### 3. Owned autoplay unlock listeners

The currently installed pointer and keyboard autoplay handlers are tracked and removed on replacement or shutdown. An unlock handler also confirms that its original media element is still current before calling `play()`.

### 4. Stale camera rejection

A camera request that completes after the user has stopped the camera, selected a file, or requested another device is immediately retired. Its tracks are stopped, `srcObject` is cleared, and its capture element is removed.

### 5. Conservative source retirement

Ordinary replacement now:

- invalidates the previous decode callback chain;
- clears the owned poller and gesture listeners;
- pauses the previous media element;
- stops camera tracks;
- clears camera `srcObject`;
- disconnects that element from Web Audio;
- removes the p5 media wrapper;
- revokes the previous Blob URL.

It deliberately does **not** call `removeAttribute('src')` or force `media.load()` during replacement. Those aggressive decoder resets from rejected Pass 13 remain excluded.

### 6. Idempotent shutdown

`pagehide` and `beforeunload` share one guarded cleanup path for media, tracks, Blob URLs, source audio, the AudioContext, mirror worker, and mirror WebSocket.

The mirror no longer schedules a reconnect after shutdown begins.

### 7. Profiler-only telemetry

The existing independent backtick profiler now displays:

- render-loop FPS;
- decoded-frame FPS when `requestVideoFrameCallback` is available;
- temporal-ring capture FPS;
- mirror frames sent and dropped by backpressure.

These counters are enabled only while the profiler is visible and are never sampled from `draw()`.

## Explicitly unchanged

- File → Blob URL → p5 `createVideo()` decoding
- controls WebView decoder ownership
- p5 `draw()` scheduling
- independent transport animation loop
- independent mirror animation loop
- independent profiler animation loop
- mirror encoding format and target rate
- effect formulas and effect order
- Canvas2D buffer topology
- temporal-history semantics
- MIDI, OSC, presets, and undo
- Syphon, Spout, Rust relay, and Tauri configuration
- bundled `Syphon.framework`

## Why this meets the current goal

Pass 12R demonstrated that frame pacing is more important than consolidating small scheduler callbacks. Pass 13S therefore changes ownership and cleanup only at source transitions and shutdown. It does not move transport, mirror, diagnostics, or source lifecycle work behind each rendered frame.
