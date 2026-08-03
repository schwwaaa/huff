# HUFF Classic Optimization Pass 12R — Decode Regression Rollback

## Purpose

Withdraw the rejected Pass 12 direct-renderer migration and restore the last working HUFF Classic runtime baseline.

## Runtime code

The runtime code in this package is restored to Pass 11:

- controls WebView remains the authoritative decoder and renderer;
- file loading remains `File` → Blob URL → p5 `createVideo()`;
- the existing canvas mirror remains receiver-aware and one-frame-in-flight;
- Syphon and Spout remain unchanged;
- all Passes 1–11 canvas, buffer, state-cache, Flow, Scanline, and no-op optimizations remain present.

## Removed from the active baseline

The following rejected Pass 12 changes are not included:

- native-dialog path loading through `convertFileSrc()`;
- Tauri asset-protocol video decoding;
- renderer-window ownership of the video element and audio graph;
- role-targeted state/action bridge introduced for that migration;
- direct-renderer shutdown and source-lifecycle code tied to the new architecture.

## Documentation added

- `VIDEO_DECODE_INCIDENT_REPORT.md`
- updated cumulative `CHANGELOG.md`
- updated `CURRENT_STATUS.md`
- updated `TESTING_CHECKLIST.md`
- rollback-ready `GIT_COMMIT_MESSAGE.md`

## Baseline rule going forward

Do not change the video loading/decoding path during ordinary canvas optimization passes. Any future direct-renderer experiment must be isolated from the release baseline and must pass codec, seeking, autoplay, audio, camera, Syphon, Spout, and shutdown tests before replacement is considered.
