# Changelog

## Pass 41A — Playback Fidelity / 1080p Classic

### Added
- `PROCESS`: AUTO / 720P / 1080P.
- `SOURCE FIT`: STRETCH / FIT / FILL / 1:1.
- `HISTORY`: explicit decoded-frame history depth with live frame/MiB readout.
- Source/process/container/fit status pill.
- rVFC mediaTime, presentedFrames, callback-gap, and processingDuration telemetry.
- Browser dropped/total video-frame telemetry in the profiler.
- Playback-resolution/source-fit/history deterministic simulation.

### Fixed
- Classic processing can no longer accidentally scale to 4K/5K/8K simply because the app window is large.
- Fixed-resolution 720P/1080P processing no longer follows UI-window resize.
- Removed the unsafe unconditional four-frame minimum from FrameRing capacity enforcement.
- HISTORY no longer changes mirror JPEG quality or mirror FPS.
- Scrub release now performs an exact seek after responsive keyframe-oriented dragging.
- Source aspect distortion is now optional instead of unavoidable.

### Compatibility
- STRETCH remains the default source mapping.
- AUTO remains the default processing mode for old presets/current behavior.
- Hidden `quality` remains a working legacy preset/MIDI/OSC alias to HISTORY.
- Existing File -> Blob URL -> p5/HTMLVideoElement decode architecture is preserved.

### Protected
- Pass 40W Corrupt/Scan/Luma handoff behavior.
- Pass 40U Scan FIELD/panel collage geometry.
- Feedback/Persistence.
- Flow.
- pipeline runtime.
- capability instrumentation.
- all 211 native `src-tauri/**` files.
