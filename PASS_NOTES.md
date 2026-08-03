# HUFF Classic Optimization Pass 10 — Scanline Engine Workspace

**Date:** 2026-08-03  
**Scope:** HUFF Classic only — Tauri v1 + HTML/JavaScript + p5.js/Canvas2D  
**Baseline:** HUFF Classic Optimization Pass 9  
**Status:** Implementation and deterministic static validation complete; runtime visual parity and endurance testing pending

## Objective

Optimize the existing Scanline effect without changing its appearance, controls, phase behavior, layer order, temporal source, or cross-platform Canvas2D implementation.

This pass applies the same resource-management principles proven throughout the Junkpile examples and earlier Classic passes:

- retain reusable workspaces instead of constructing transient per-frame structures;
- separate static geometry from animated state;
- invalidate caches only when an input affecting the cached result changes;
- preserve deterministic effect ordering and explicit resource ownership;
- avoid touching native output code when the optimization is entirely inside the web renderer.

## Implementation changes

### 1. Reusable typed scanline workspace

Added one persistent `ScanlineBandWorkspace` in `src/effects.js`.

It owns reusable typed arrays for:

- prepared band start positions;
- prepared band lengths;
- source offsets;
- destination offsets;
- drawable cross-axis lengths;
- slow-drift noise seeds;
- fast-jitter noise seeds;
- shift-noise seeds.

The arrays grow geometrically only when a larger band count is requested. Ordinary frames reuse the existing allocation.

### 2. Cached per-band constants

The previous loop recalculated these constants every frame:

```text
n × 3.7
n × 11.3
n × 2.3
```

They are now calculated once when workspace capacity grows and retained in `Float64Array` storage.

The animated phase terms and `noise()` calls remain unchanged when the state is moving.

### 3. Cached rotated-span geometry

The following values are retained until render width, render height, or scanline angle changes:

- angle in radians;
- absolute sine and cosine;
- full rotated band span (`dim`);
- cross-axis displacement span (`cross`).

Static scanline angles therefore avoid repeated trigonometric and span calculations. Spin still updates the geometry each rendered frame because its angle changes each frame.

### 4. Prepared-band state reuse

The workspace caches the complete prepared band list when all inputs are identical:

- band count and band size;
- gap, skew, focus, roll, shift, and drift;
- scanline X/Y phases;
- rotated span and cross span.

This is most useful when Scanline SPEED is zero and spin is disabled. The video source can continue changing while the band coordinates are reused. Changing the HUFF seed explicitly invalidates the prepared-band cache before the next frame.

### 5. Neutral-state shortcuts

- Scanlines with zero effective alpha now return before context setup or band calculation.
- Fast-jitter noise is skipped when DRIFT is exactly zero because its contribution is exactly zero.
- Shift noise is skipped when SHIFT and SKEW are both exactly zero because the resulting displacement is exactly zero.

These shortcuts do not alter phase accumulation, source playback, or other effects.

### 6. Reduced Canvas2D state changes

`globalAlpha` is now assigned once before the band draw loop rather than once for every visible band.

The transform, clipping coverage, `drawImage()` order, and source/destination rectangles are unchanged.

## Preserved behavior

The following are intentionally unchanged:

- Scanline ON/OFF semantics through the existing `clusters` control.
- Use of `clusterCount` and `clusterRadius` for band count and band size.
- Independent scanline phase accumulation in `canvas.js`.
- Static angle and left/right spin behavior.
- Drift and fast-jitter formulas.
- Focus bias formula and multiplication order.
- Roll offset formula.
- Gap quantization.
- Skew and shift calculations.
- Rotated canvas coverage.
- Source sampling from `gCur`.
- Canvas2D band blit order.
- Glitch/Scanline layer priority behavior.
- Feedback, Flow, Symmetry, Solarize, Luma Key, Global Mix, and temporal history.
- Canvas mirror, Syphon, Spout, Rust relay, Tauri configuration, and packaging.
- Mandatory bundled `Syphon.framework` layout.

## Files changed

```text
src/effects.js
scripts/validate-pass10.mjs
package.json
README.md
docs/docs/how-it-works.html
docs/docs/architecture.html
docs-v1/docs/how-it-works.html
docs-v1/docs/architecture.html
PASS_NOTES.md
SCANLINE_ENGINE_AUDIT.md
CHANGELOG.md
TESTING_CHECKLIST.md
CURRENT_STATUS.md
GIT_COMMIT_MESSAGE.md
DOCUMENTATION_INDEX.md
HUFF_CLASSIC_OPTIMIZATION_PASS_10.txt
```

## Validation completed

Run:

```bash
npm run validate:pass10
```

The deterministic validator completed:

- 2,400 scanline parameter/resolution cases;
- 28,342 exact prepared-band comparisons;
- exact angle, rotated-span, cross-span, position, length, offset, clipping, and draw-order data comparisons;
- static-state cache reuse verification;
- cache invalidation verification after phase changes;
- source-marker verification that seed changes invalidate prepared Scanline geometry;
- source-marker checks for the workspace, early exit, one-pass alpha state, and cached noise constants.

All comparisons passed in the artifact-generation environment.

## Runtime work still required

Static equivalence cannot verify browser rendering or WebView performance. Test:

- horizontal, vertical, diagonal, and arbitrary angles;
- left and right spin;
- SPEED at zero and nonzero values;
- DRIFT zero and maximum;
- SHIFT/SKEW neutral and extreme combinations;
- FOCUS and ROLL extremes;
- high band counts and large radius values;
- Scanlines above and below Glitch;
- Scanlines during Syphon output;
- repeated resize/fullscreen cycles;
- sustained playback and memory behavior.

## Result

Pass 10 removes repeated scanline setup work and workspace churn while preserving the existing Canvas2D effect model. The irreducible cost remains one Canvas2D `drawImage()` per accepted visible band.
