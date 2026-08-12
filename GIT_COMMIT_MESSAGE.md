perf: accelerate live Luma key in HUFF Classic

- add self-calibrating bounded WebGL1 path for LIVE/COMPOSITE Luma
- verify WebGL-to-Canvas2D alpha behavior against CPU X-FADE and SOFT ADD reference
- lazily test an unpremultiplied Luma context if the existing GPU context fails parity
- avoid Luma getImageData, JS pixel transform and putImageData on GPU success
- cache the bounded GPU keyed patch per decoded source frame and key state
- add final 256-entry Clip/Gain/Invert/Cleanup/Density LUT to CPU fallback
- bound Luma workspaces by long edge and total pixel budget for portrait safety
- add GPU Luma calibration/build/reuse/fallback profiler telemetry
- preserve Luma controls, Solarize, Feedback/Persistence, frozen Flow, presets and native runtime
- add no frame skipping, sample/hold, playback-rate changes or wgpu

HUFF Classic Pass 47
