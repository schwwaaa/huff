# HUFF Classic Current Status

**Current package:** HUFF Classic Optimization Pass 7  
**Date:** 2026-08-03  
**Authoritative lineage:** user-supplied `huff-08022026.zip` → Pass 4 → Pass 5 → Pass 6 → Pass 7

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
- Reusable typed glitch target buffers.
- Reusable linked-cell spatial-gap index.
- Persistent typed cluster-offset buffers.

### Runtime status

- Pass 4: reported generally okay; additional packet-loss, endurance, and reconnect testing needed.
- Pass 5: runtime parity and endurance testing not yet fully reported.
- Pass 6: runtime control-cache and visual-parity testing pending.
- Pass 7: deterministic bookkeeping equivalence passed; complete visual and endurance testing pending.
- Overall release state: optimization in progress, not stabilized.

## Known architectural ceilings

### Canvas2D

The renderer remains sensitive to:

- full-resolution canvas copies;
- large numbers of tile draw calls;
- CPU pixel readback for Solarize and Pipeline Luma Key;
- browser/WebView implementation differences across platforms.

Pass 7 reduces JavaScript allocation and spatial-index overhead around glitch placement. It does not reduce the number of Canvas2D tile blits selected by the existing controls.

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

1. Runtime-test Pass 6/7 control synchronization and visual parity.
2. Continue sustained Syphon packet-loss, latency, and memory testing.
3. Compare profiler results and memory behavior with glitch-heavy presets.
4. Audit remaining per-frame Canvas2D state changes and repeated calculations only after parity is confirmed.
5. Begin cross-platform packaging hardening after renderer behavior stabilizes.

## Release blockers still open

- Extended macOS Syphon endurance results.
- Full Pass 5–7 visual-parity confirmation.
- Windows Spout verification.
- Linux playback and codec verification.
- Cross-platform memory and shutdown soak tests.
- Developer ID signing and notarization for public macOS distribution.
- Final version alignment and public release documentation.

## Development rules

- Any code that changes a control programmatically must dispatch `input` or `change` after assigning `.value` or `.checked`.
- Glitch placement scratch buffers are intentionally retained and grown geometrically; they should not be replaced with per-frame arrays.
- Syphon.framework remains mandatory and must stay in the verified canonical bundle path.
