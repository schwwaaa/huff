# HUFF Classic Current Status

**Current package:** HUFF Classic Optimization Pass 8  
**Date:** 2026-08-03  
**Authoritative lineage:** user-supplied `huff-08022026.zip` → Pass 4 → Pass 5 → Pass 6 → Pass 7 → Pass 8

## Product definition

HUFF Classic is the free legacy edition intended for public release on macOS, Windows, and Linux. It remains:

- Tauri v1.
- HTML/CSS/JavaScript control surface.
- p5.js + Canvas2D renderer.
- Existing HUFF Classic effects and fixed routing.
- Native platform output bridges where required, including bundled Syphon on macOS and Spout on Windows.

HUFF Classic is not the native-wgpu HUFF edition and does not use that edition's milestone numbering or architecture.

## Current optimization state

### Completed implementation areas

- Canvas-backed temporal history with bounded capacity.
- Reduced redundant decoded-frame copying.
- Bounded/latest-frame mirror and native-output transport.
- Worker-assisted mirror encoding where supported.
- Client-aware, one-frame-in-flight Syphon publication.
- Mandatory Syphon framework validation and application-bundle verification.
- Persistent native Metal resource reuse and autorelease-pool cleanup.
- Reduced full-frame clear/draw pairs.
- One-pass Flow Warp grid processing.
- Cached Solarize lookup tables and adaptive processing result.
- Decoded-frame-aware Pipeline Luma Key caching.
- Event-driven typed render state with no DOM parsing in the main effect path.
- Reusable typed glitch-placement and cluster-offset workspaces.
- Shared `gScratch` surface for Feedback, Flow Warp, and Symmetry.
- Reduction from four to three full-resolution p5 Graphics surfaces.
- Removal of the separate full-resolution Feedback snapshot canvas.
- In-place p5 Graphics and CPU-pixel scratch-canvas resize reuse.
- Direct Canvas2D main presentation and native Symmetry operations.
- Event-cached mirror quality and frame-period tuning.

### Runtime status

- Pass 4: user reported generally okay; extended packet-loss and endurance testing still pending.
- Pass 5–7: implementation/static validation complete; comprehensive runtime parity not yet closed.
- Pass 8: symbolic buffer-ownership equivalence and syntax/config validation passed; visual parity, resize, memory, mirror, and Syphon regression testing pending.
- Overall release state: active optimization, not yet stabilized.

## Current full-resolution topology

```text
main output canvas
      ↑
    gBuf  ↔  gScratch
      ↑
    gCur
```

- `gCur`: clean source.
- `gBuf`: active effect/persistent state.
- `gScratch`: shared sequential destination/snapshot.
- FrameRing: independent canvas-backed temporal history.
- Solarize: optional full-resolution cached output plus downsampled pixel canvas.
- Syphon: independent worker/fallback readback surface plus native triple Metal texture ring.

See `CANVAS_BUFFER_AUDIT.md` for full ownership and memory analysis.

## Known architectural ceilings

### Canvas2D draw-call ceiling

Glitch, scanlines, Flow Warp, and temporal effects can issue many Canvas2D `drawImage()` calls. Passes 5–8 reduce surrounding bookkeeping, allocation, and full-frame surface overhead, but the selected number of tile/band blits remains a central cost.

### CPU pixel-readback ceiling

Solarize and Pipeline Luma Key still require downsampled `getImageData()` pixel loops. Their caching and adaptive behavior reduce frequency, but Canvas2D cannot turn those operations into zero-copy GPU passes.

### Native-output ceiling

Classic Syphon/Spout still crosses:

```text
WebView canvas → CPU RGBA → local transport → native GPU texture
```

The path is bounded and client-aware, but it is not zero-copy.

### High resolution

- 720p remains the safest cross-platform target.
- 1080p requires effect-combination and hardware testing.
- 4K should not be promised as a dependable HUFF Classic real-time mode.
- High-resolution guarantees belong to native HUFF.

## Immediate next optimization work

After basic Pass 8 parity is confirmed:

1. Use the built-in profiler to identify remaining highest-cost effect combinations on the target Mac.
2. Audit neutral/no-op stages so they do not perform full-frame work when their output would be identical.
3. Measure actual FrameRing process-memory cost against the estimated raw RGBA budget.
4. Audit scanline and glitch `drawImage()` counts and repeated noise/math calculations without changing seeded visual behavior.
5. Continue Syphon packet-loss, latency, and memory endurance tests while heavy effect combinations run.
6. Begin Windows WebView2 and Linux WebKitGTK parity testing before release freeze.

## Release blockers still open

- Full Pass 5–8 visual-parity confirmation.
- Extended macOS Syphon endurance results.
- Repeated resize/source-switch memory soak results.
- Windows Spout verification.
- Linux playback and codec verification.
- Cross-platform packaging and shutdown soak tests.
- Developer ID signing and notarization for public macOS distribution.
- Final version alignment and public release documentation.

## Development rules

- HUFF Classic remains Tauri v1 + web rendering; no wgpu changes in this branch.
- Any code that changes a control programmatically must dispatch `input` or `change`.
- `gBuf` and `gScratch` must always remain distinct references.
- Any stage using `gScratch` must completely clear or replace its destination before swapping.
- Glitch placement typed workspaces must not regress to per-frame arrays/Maps.
- `Syphon.framework` remains mandatory and must stay in the working canonical layout supplied by the user.
- Every future ZIP must include the complete documentation suite and commit message.
