# HUFF Classic — Current Status

## Authoritative lineage

- Pass 41A (`huff-08102026.zip`) remains the runtime-accepted Classic foundation.
- Pass 42 Luma Quantize and Pass 43 Fluidity received strong positive runtime feedback and remain protected.
- Pass 44 mode-specific Solarize UI remains retained.
- Passes 45–46 accelerated Solarize GPU paths and added serial timing.
- Target-machine isolation then showed LIVE/COMPOSITE Luma alone at roughly 52 FPS.

## Current candidate

**Pass 47 — LIVE Luma GPU Handoff + Aspect-Safe Scratch Budget.**

Pass 47 gives LIVE/COMPOSITE Luma a self-calibrating bounded WebGL1 path before
the accepted CPU fallback. The accelerator is enabled only after a one-time
WebGL->Canvas2D alpha parity probe passes for X-FADE and SOFT ADD. Successful
GPU frames avoid Luma's normal `getImageData()` / JS pixel transform /
`putImageData()` path. The CPU fallback also gains a final 256-entry key LUT.

Luma workspace sizing is now constrained by long edge and pixel budget, so
portrait sources cannot silently create much larger key workspaces.

## Protected behavior

Luma controls/matte polarity, Solarize THRESHOLD/LUMA QUANTIZE/FLUIDITY,
Feedback/Persistence, frozen Flow, factory presets, serial recipe ordering and
native Tauri/Syphon/Spout runtime remain protected. No frame skipping or playback
cadence changes are introduced.

## Gate

Recreate the isolated Luma test that was ~52 FPS. On an accelerated path the
profiler should show `gpu luma` advancing, `gpu lu fall` at zero, and no ongoing
`luma read/xform/upload` samples. If the parity probe rejects acceleration,
record `gpu lu cal`; CPU fallback is intentional rather than a visual compromise.
