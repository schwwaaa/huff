# Validation Report — Pass 38

## Pass-specific validation

- `npm run validate:pass38`: **PASS** — 553 structural/performance-boundary checks.
- Master `CORRUPT SPEED` is present and is structurally separate from decoded-frame STROBE / MULTIGRAB timing: **PASS**.
- Patch `POSITION X/Y/Z` and `MOVE X/Y/Z` controls are present with neutral-preserving migration defaults: **PASS**.
- Cluster `ON/OFF` control is present and remains synchronized with the hidden legacy RANDOM/CLUSTER distribution alias: **PASS**.
- Cluster `Z SPREAD` and direct `GROUP MOVE X/Y/Z` are present: **PASS**.
- Cluster placement workspace uses a reusable typed Z array; no per-patch object allocation was introduced: **PASS**.
- Canvas2D depth projection is bounded 2.5D and preserves the exact old destination path when X/Y motion and Z are neutral: **PASS**.
- Corrupt section contains no `getImageData()`, `putImageData()`, or new `createGraphics()` path: **PASS**.
- Existing Corrupt draw-count telemetry remains active: **PASS**.
- Complete `src-tauri/**` tree against the accepted Pass 36 native baseline: **PASS**.
- Protected source files outside the approved Pass 38 browser-runtime boundary: **PASS**.

## Luma performance boundary

Pass 38 intentionally makes **no change** to the accepted Pass 36/37 Pipeline Luma implementation.

- Exact Pipeline Luma source-section SHA-256: **PASS** — `6f3655e25a1a4ac1f820babb6d9f8b96510c7b541828e2ea820e6a15b8a3441e`.
- `src/effects.js` `getImageData()` call count: **5**, unchanged from Pass 37.
- `src/effects.js` `putImageData()` call count: **4**, unchanged from Pass 37.
- Corrupt XYZ / Cluster additions introduce **zero** new synchronous image readbacks or pixel uploads.

Static inspection confirms the current LIVE Luma hot path remains the bounded 640-pixel-wide cached implementation: on a new decoded frame or key-parameter change it performs one bounded source readback, CPU matte transform, one upload, then presentation. At 1920×1080 the bounded working image is 640×360 (230,400 pixels, about 0.879 MiB RGBA). A raw readback+upload estimate at 30 rebuilds/s is roughly 52.7 MiB/s before Canvas synchronization, compositing, and CPU transform cost.

Captured STENCIL remains cheaper during ordinary playback: after capture it reuses stored 8-bit luminance and does not require a new source `getImageData()` on every advancing video frame.

This analysis identifies the likely contention boundary for heavy combinations — many Corrupt `drawImage()` operations plus LIVE Luma synchronous pixel work on the browser render thread — but **does not prove runtime FPS**. Runtime profiler testing is still required.

## Frozen Flow protection

- Exact accepted Flow function SHA-256: **PASS** — `e2a6aeb2969c1f506dd2467561c550cf7af483c79018a4a501884ff1732402c3`.

Pass 38 does not modify Flow.

## Inherited behavior validation

The following applicable historical validators were rerun successfully on the Pass 38 tree:

- Pass 9: **PASS**
- Pass 10: **PASS**
- Pass 11: **PASS**
- Pass 13S: **PASS**
- Pass 14: **PASS**
- Pass 15: **PASS**
- Pass 16: **PASS**
- Pass 16S: **PASS**
- Pass 19: **PASS**
- Pass 20: **PASS**
- Pass 21: **PASS**
- Pass 22: **PASS**

### Historical validator note

`validate:pass18` is **not applicable as a literal source-token validator** after Pass 38. It asserts the exact historical draw statement:

```js
ctx.drawImage(src, cx, cy, w, h, dstX, dstY, w, h);
```

Pass 38 intentionally changes the destination draw signature to permit bounded Z scaling. The validator therefore exits on that missing literal. Pass 38 replaces that obsolete textual assertion with checks for the neutral XYZ legacy branch, bounded depth projection, unchanged draw-count accounting, and no new readback/upload/render-surface path.

Later historical validators that pin superseded whole-file hashes are likewise not used as evidence for Pass 38 when an accepted later pass intentionally changed those files. Pass 38 validates the current protected boundaries directly.

## Syntax / package validation

- JavaScript-family syntax: **PASS** — 46 project `.js`, `.mjs`, and `.cjs` files.
- Inline HTML scripts: **PASS** — 32 scripts.
- JSON parsing: **PASS** — 33 files.
- TOML parsing: **PASS** — 1 file.
- Shell syntax: **PASS** — 8 scripts.
- Static release preflight: **PASS** — 38 passed, 0 warnings, 0 blockers.

## Runtime tests still required

Static validation cannot determine whether the new motion controls are artistically immediate or whether positive-Z raster scaling becomes expensive with very high patch/repeat counts. Runtime review should specifically test:

1. master SPEED from 0 through high values in RANDOM and CLUSTER modes;
2. PATCH POSITION X/Y/Z and MOVE X/Y/Z independently;
3. CLUSTERS OFF versus ON;
4. Z SPREAD and GROUP MOVE Z with visible near/far motion;
5. CLUSTER organic controls at master SPEED 0, 1, and high values;
6. LIVE Luma + dense Corrupt at 720p/1080p while watching `luma read/xform/upload`, `gl tiles`, `gl draws`, and FPS;
7. STENCIL Luma + dense Corrupt as the lower-readback comparison;
8. high positive Z + high REPEATS to identify Canvas2D raster-cost ceilings.

No FPS improvement is claimed until those runtime tests are performed.
