# Pass 42 Runtime Checklist — Solarize Luma Quantize

1. Confirm baseline launch/playback still matches accepted Pass 41A with Solarize OFF.
2. Solarize ON + MODE THRESHOLD: compare known material/preset against Pass 41A; THRESH/AMOUNT/SOL R/G/B must be unchanged.
3. Switch MODE to LUMA QUANTIZE. LEVEL 75 / SOFT 0 should visibly contour luminance immediately.
4. Sweep LEVEL: 0, 25, 50, 75, 90, 99, 100. Confirm increasing coarseness; 99 should be two-level luma; 100 should remove brightness structure while retaining chroma residual.
5. Sweep SOFT 0→100 at LEVEL 90. Contours should progressively dissolve toward unquantized luma.
6. Toggle INVERT at multiple LEVEL/SOFT settings. Dark/light structure should reverse without a deliberate hue rotation.
7. Sweep AMOUNT 0→1. 0 must be a true no-op.
8. Combine LUMA QUANTIZE with Feedback, Corrupt, Scanlines, Luma Key and Flow. Flow itself must remain unchanged.
9. Open profiler (`). Compare sol read/xform/upload/present/cache with THRESHOLD at the same source/process resolution.
10. Test preset save/load. An old Pass 41A preset must reopen in THRESHOLD; a new Pass 42 preset must restore mode/level/soft/invert.
11. Verify Syphon/Spout/mirror output if available.

---

# Testing Checklist — Pass 41A

## 1. Existing visual regression first

Load the same file/preset used in Pass 40W with:
- PROCESS = AUTO
- SOURCE FIT = STRETCH

Expected: Corrupt, Scan FIELD, Luma targeting, Feedback and Flow retain Pass 40W visual behavior. If not, reject the pass before testing new playback controls.

## 2. Processing-resolution separation

On a display/window larger than 1920×1080:
- PROCESS = AUTO -> source-status pill must report a processing size no larger than the 1080p-class ceiling.
- PROCESS = 1080P -> must report exactly 1920×1080.
- Resize the app window while PROCESS = 1080P -> processing dimensions must remain 1920×1080.
- PROCESS = 720P -> must report 1280×720.

Open the backtick profiler and confirm its `process` row matches the source-status pill.

## 3. Higher-resolution source

Load a 4K source if available.
Expected at PROCESS = 1080P:
- source row reports 3840×2160 (or the file's real dimensions);
- process row reports 1920×1080;
- the source-status pill clearly shows source -> process;
- playback remains delegated to the WebView decoder; no 4K processing allocation occurs.

## 4. SOURCE FIT

Use a non-16:9 file if possible, ideally 4:3.
- STRETCH: legacy full-canvas stretch.
- FIT: complete undistorted source with black bars.
- FILL: undistorted full canvas with center crop.
- 1:1: native pixels centered, with crop/border as needed.

Changing SOURCE FIT while paused should repaint immediately.

## 5. HISTORY

At PROCESS = 1080P:
- HISTORY max should show 24 frames / about 190 MiB.
- reducing HISTORY should release retired ring slots over subsequent resize/capture behavior and the profiler should report the lower ring capacity.
- changing HISTORY must not change mirror preview FPS/JPEG tuning.

At PROCESS = 720P:
- HISTORY maximum should increase (currently 54 frames under the 192 MiB budget).

## 6. Scrubbing

While playing:
- drag seek quickly; response should remain fast;
- release at a recognizable position;
- final position should settle on the exact requested timestamp rather than only a nearby keyframe;
- playback should resume if it was playing before the drag.

## 7. Profiler playback diagnostics

Press backtick and confirm rows exist for:
- source
- process
- src fit
- src scale
- rvfc
- presented
- rvfc gaps
- video drop
- dec proc
- media time

Do not interpret `rvfc gaps` alone as proven dropped frames; use the browser `video drop` row as the stronger drop counter where available.

## 8. Format sanity

Test at minimum:
- known-good H.264/AAC MP4;
- a MOV or WebM available on the target machine.

Expected: unsupported codec/container combinations fail with a clearer decode message recommending H.264/AAC MP4 rather than silently implying all `.mov`/`.webm` files are guaranteed.
