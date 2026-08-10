# Current Status

## Product boundary

HUFF Classic is now intentionally **1080p-class maximum**. HUFF HD remains the paid 4K+ path.

## Current candidate

**Pass 41A — Playback Fidelity / 1080p Classic boundary.**

Built directly on Pass 40W. Pass 40W's Scan/Luma/Corrupt behavior remains protected while the playback/source/history layer is cleaned up.

## New playback contract

- PROCESS: AUTO / 720P / 1080P.
- 1080P = maximum-fidelity Classic processing path.
- SOURCE FIT: STRETCH / FIT / FILL / 1:1.
- HISTORY replaces misleading public QUALITY.
- FrameRing is strictly capped at 192 MiB.
- 1080P history maximum is 24 full RGBA snapshots.
- Mirror preview is independent from HISTORY.
- rVFC / browser dropped-frame diagnostics are visible in the profiler.
- scrub = fast while dragging, exact on release.

## Recommended portable source

H.264/AAC MP4 remains the recommended Classic source. MOV/WebM/other codecs are still delegated to the operating-system WebView and must be tested per platform.

## Protected

- Pass 40W Corrupt / Scan / Luma handoff behavior;
- Scan FIELD / panel collage;
- Feedback/Persistence;
- frozen Flow;
- pipeline runtime;
- native Tauri outputs/runtime.

## Acceptance status

Not accepted until runtime confirms existing visuals remain intact and the PROCESS / SOURCE FIT / HISTORY / seek behavior works as documented.
