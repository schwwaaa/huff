# HUFF Classic Current Status

**Current package:** HUFF Classic Optimization Pass 6  
**Date:** 2026-08-03  
**Authoritative lineage:** user-supplied `huff-08022026.zip` → Pass 4 → Pass 5 → Pass 6

## Product definition

HUFF Classic is the free legacy edition intended for public release on macOS, Windows, and Linux. It remains:

- Tauri v1.
- HTML/CSS/JavaScript control surface.
- p5.js and Canvas2D renderer.
- Existing HUFF Classic effects and fixed routing.
- Native platform bridges where required, including bundled Syphon on macOS and Spout on Windows.

HUFF Classic is not the native-wgpu HUFF edition and does not use that edition’s milestone numbering or renderer architecture.

## Current optimization state

### Completed implementation areas

- Canvas-backed temporal history and reduced history allocation.
- Bounded/latest-frame mirror and native-output behavior.
- Worker-assisted mirror encoding where supported.
- Reduced native-output packet copying.
- Client-aware, bounded Syphon publication.
- Mandatory Syphon framework validation and bundle verification.
- Persistent Metal resource reuse and autorelease-pool cleanup.
- Reduced full-frame clear/draw operations.
- One-pass Flow Warp grid processing.
- Cached Solarize lookup tables.
- Decoded-frame-aware Pipeline Luma Key caching.
- Event-driven typed render state.
- Removal of per-frame DOM parsing in draw, glitch, and scanline processing.
- Removal of per-frame draw-loop closures and unreachable cluster helper code.

### Runtime status

- Pass 4: reported generally okay; additional packet-loss, endurance, and reconnect testing needed.
- Pass 5: runtime parity and endurance testing not yet fully reported.
- Pass 6: implementation packaged; runtime parity and control-path testing pending.
- Overall release state: optimization in progress, not stabilized.

## Known architectural ceilings

### Canvas2D

The renderer remains sensitive to:

- full-resolution canvas copies;
- large numbers of tile draw calls;
- CPU pixel readback for Solarize and Pipeline Luma Key;
- browser/WebView implementation differences across platforms.

Pass 6 reduces control and JavaScript bookkeeping overhead. It does not remove the fundamental Canvas2D pixel and draw-call ceilings.

### Syphon

The current Classic path necessarily crosses the browser/native boundary:

```text
WebView canvas → CPU RGBA → WebSocket/native bridge → Metal texture → Syphon
```

Backpressure, client awareness, workers, resource reuse, and caching reduce overhead, but the path is not zero-copy.

### High resolution

- 720p is the safest cross-platform performance target.
- 1080p requires effect-combination and target-hardware testing.
- 4K should not be promised as a dependable HUFF Classic capability.
- High-resolution and high-frame-rate guarantees belong more naturally to the native HUFF edition.

## Immediate next work

1. Runtime-test Pass 6 control synchronization and visual parity.
2. Continue sustained Syphon packet-loss, latency, and memory testing.
3. Use the built-in profiler to identify the next measured bottleneck.
4. Optimize the glitch tile-placement allocation path only after parity is confirmed.
5. Begin cross-platform packaging hardening after render behavior stabilizes.

## Release blockers still open

- Extended macOS Syphon endurance results.
- Full Pass 5/6 visual-parity confirmation.
- Windows Spout verification.
- Linux playback and codec verification.
- Cross-platform memory and shutdown soak tests.
- Developer ID signing and notarization for public macOS distribution.
- Final version alignment and public release documentation.

## Development rule

Any code that changes a control programmatically must dispatch `input` or `change` after assigning `.value` or `.checked`. All current built-in HUFF paths already follow this rule.
