# Luma / Scan / Corrupt Handoff Audit — Pass 40V

## Trigger

Pass 40U Scan FIELD was visually successful, but combined use exposed three
interaction problems:

1. CORRUPT + Scan could appear to glitch/flicker depending on front-stage order.
2. Luma had no explicit way to say which front-stage effect it was processing.
3. In Scan FIELD, changing Luma controls—especially `INVERT`—could produce an
   extreme FPS collapse.

## Root-cause review

### 1. Luma was structurally grouped with Corrupt

The validated front-stage contract historically contains:

- `glitch-luma-group`
- `scanline-group`

With `SCAN TOP`, the legacy composite Luma patch is painted before Scan. Scan can
therefore paint over it. With `CORRUPT TOP`, Luma is painted after Scan, but it
still keys the clean source/composite rather than specifically keying Scan.

The result was ambiguous: Luma did not have an explicit process target.

### 2. LIVE Luma source extraction and matte shaping were coupled

In Pass 40U the LIVE path rebuilt when either the decoded frame OR a key-shaping
parameter changed. A rebuild performed:

`copy current source -> getImageData -> CPU luma/alpha transform -> putImageData`

Therefore clicking `INVERT` invalidated the same cache that owned the source
readback. On a heavy Scan FIELD frame this could force an avoidable synchronous
GPU/Canvas-to-CPU handoff at exactly the time the renderer was already doing many
large panel raster operations.

Pass 40V separates:

- decoded-frame luminance source cache;
- matte/object shaping cache.

Changing INVERT/CLIP/GAIN/CLEANUP/DENSITY on the same decoded frame no longer
invalidates the raw source luminance plane.

### 3. Targeted keying does not need a 640px composite mask

A SCAN or CORRUPT process key only needs to decide how strongly each panel/patch
participates. Pass 40V therefore gives targeted LIVE keying its own bounded
320px luminance workspace. It does not build/upload the 640px composite mask.

STENCIL target mode uses the already-stored stencil luminance and requires no
ongoing source readback.

### 4. Scan FIELD was recalculating deterministic identities every render

Pass 40U intentionally used deterministic integer hashes so FIELD would not
consume p5 random/noise state and disturb Corrupt. That was correct, but six
hashes per panel were still recomputed every render. Pass 40V caches those panel
identities in typed arrays and expands the cache only when panel capacity grows.

This is not claimed as a major FPS gain by itself; it simply removes avoidable
CPU work from the simultaneous Scan + Corrupt path.

### 5. `NEUTRAL` was not neutral

The existing `layerPriority=neutral` contract literally alternates:

`SCAN TOP -> CORRUPT TOP -> SCAN TOP -> CORRUPT TOP ...`

on every render frame. That can look exactly like an implementation flicker when
both effects are active. The underlying legacy value and behavior are preserved,
but the visible mode is now `ALTERNATE`, with an explicit warning/status. The two
fixed-order modes are visibly marked stable.

## Luma TARGET

### COMPOSITE

Preserves the established Luma clean-source composite behavior and 640px bounded
workspace. `X-FADE / SOFT ADD` remains meaningful here.

### CORRUPT

Luma modulates Corrupt patch opacity/eligibility from the bounded luminance
plane. Corrupt continues to use FrameRing history; the key is evaluated at the
patch's source-space location.

### SCAN

Luma modulates each Scan panel. Because a FIELD panel can cover a large source
region, Pass 40V uses five luminance samples—center plus four quadrant centers—
and averages their resulting key alpha. This is substantially more representative
than a single center sample while remaining tiny compared with a per-pixel key.

## Explicit Classic tradeoff

Targeted SCAN/CORRUPT keying is **object-level**, not a pixel-perfect matte inside
each panel/patch. That is intentional. A pixel-perfect targeted key would require
a keyed intermediate image or per-object pixel processing and would reintroduce
exactly the kind of bandwidth/synchronization cost that caused the Luma problem.

HUFF HD/wgpu is the appropriate place for fully GPU-resident per-pixel targeted
keys without this Classic Canvas2D compromise.

## Readback boundaries

- COMPOSITE LIVE: max width 640, one raw luminance read per new decoded frame;
  key-shaping edits on that same frame reuse it.
- SCAN/CORRUPT LIVE: max width 320, one object-luma read per new decoded frame;
  no mask `putImageData` in the targeted path.
- SCAN/CORRUPT STENCIL: no ongoing source readback after capture.
- No full-resolution Luma buffer was added.
- No `gBuf.getImageData()` path was added.

## Runtime profiler

Backtick profiler now separates:

- `luma read` / `luma src` — COMPOSITE source read/reuse;
- `luma obj rd` — targeted object source read time;
- `luma obj` — targeted read/reuse/object-sample counts;
- existing transform/upload/present rows.

This makes the reported 1 FPS condition testable rather than inferred.
