# HUFF Classic Optimization Pass 27 — Testing Checklist

## Completed deterministic validation

- [x] four immutable capability profiles validated
- [x] light, moderate, and worst-case scene definitions validated
- [x] timing remains disabled while the profiler is hidden
- [x] render/source/pipeline accumulation and maximum tracking validated
- [x] lifecycle and resize counters validated
- [x] optional heap snapshot handles unsupported WebViews safely
- [x] instrumentation adds no animation loop, interval, render surface, or control
- [x] Spout draw/read/send and sent/skip markers validated
- [x] exact Pass 22 `src/effects.js` hash preserved
- [x] exact Pass 26 `src/pipeline-runtime.js` hash preserved
- [x] complete `src-tauri/` tree preserved
- [x] no additional full-resolution p5 Graphics surface added
- [x] rejected Melt and Sort-Mosh code remains absent
- [x] Pass 9–22 behavior validators passed
- [x] Pass 25 serial recipe validator passed
- [x] Pass 26 priority validator passed
- [x] Pass 27 instrumentation validator passed

## Required target-runtime checks

### Profiler behavior

- [ ] backtick opens and closes the profiler
- [ ] hidden profiler has no visible frame-pacing regression
- [ ] profile label follows 720p/1080p canvas changes
- [ ] waiting, bypass, and active path counts advance correctly
- [ ] optional heap line is absent when unsupported

### Capability matrix

- [ ] 720p30 light scene
- [ ] 720p30 moderate scene
- [ ] 720p30 worst-case scene
- [ ] 720p60 light scene
- [ ] 720p60 moderate scene
- [ ] 720p60 worst-case scene
- [ ] 1080p30 light scene
- [ ] 1080p30 moderate scene
- [ ] 1080p30 worst-case scene
- [ ] 1080p60 light scene
- [ ] 1080p60 moderate scene
- [ ] 1080p60 worst-case scene

### Lifecycle and long-session

- [ ] repeated file-to-file replacement increments replacement/ready without errors
- [ ] file-to-camera and camera-to-file replacement
- [ ] camera start/stop/restart
- [ ] repeated resize and fullscreen cycles show paired request/commit counts
- [ ] buffer dimension changes occur only when dimensions actually change
- [ ] one-hour moderate-scene playback
- [ ] one-hour worst-case playback where practical
- [ ] FrameRing slots and estimated memory remain bounded

### Outputs

- [ ] mirror sent/drop and capture/encode values update with a receiver
- [ ] Syphon phase values update with a receiver
- [ ] Spout draw/read/send values update on Windows
- [ ] output instrumentation does not change selected output FPS

### Visual parity

- [ ] Pass 26 visual comparison with profiler hidden
- [ ] Pass 26 visual comparison with profiler visible
- [ ] all four front-stage priority modes
- [ ] Flow character remains exact Pass 22

## Not available in this environment

- [ ] `cargo check` — Cargo/Rust are not installed; native source is unchanged
- [ ] target Tauri v1 WebView runtime
- [ ] macOS Syphon receiver
- [ ] Windows Spout receiver
