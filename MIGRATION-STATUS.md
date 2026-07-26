# Huff native migration status · Milestone 11

## Proven native foundation

- FFmpeg video decoding and watchdog recovery
- Native synchronized audio playback
- Native camera input
- Metal / Vulkan / DX12 wgpu rendering
- Exclusive camera/video source ownership
- Existing Huff HTML control surface commanding canonical Rust state
- Native presets, undo, MIDI, OSC, and diagnostics foundations

## Native renderer completed

- Independent render and GPU-history resolutions
- GPU temporal texture-array history
- Persistent flying-frame-buffer model
- Historical glitch tiles and smear instances
- Persistent cluster physics and biased placement
- Scanline bands and Layer Priority
- Smoosh, Luma Key, Global Mix, Flow, and pulse routing
- Non-additive feedback transform
- Clean base, background, brightness, and contrast

## Live output and capture completed

- Native-window output
- Syphon on macOS
- SpoutDX path on Windows
- Bounded triple-buffer readback for live external output
- 30/60 FPS CFR MP4 recording
- Synchronized source-video audio or microphone capture
- Safe recording finalization
- Native, 1080p, 4K, 8K, and custom PNG still export
- GPU Smooth/Crisp and Fit/Crop/Stretch export policies

## Deterministic export completed in Milestone 11

- Private exact-frame FFmpeg decoder
- Fixed 24/30/60 FPS simulation timeline
- One decoded source frame and one native render step per output frame
- Frozen canonical parameter and external-control snapshots
- Deterministic procedural/history/feedback reset boundary
- Bounded three-frame source decode queue
- Synchronous bounded GPU export readback
- H.264 MP4 with MPEG-4 fallback
- Playback-rate-aware source-audio AAC mux
- Native, 1080p, 4K, 8K, and custom output sizes
- Cancellation, shutdown cleanup, and live transport restoration
- Reproducibility sidecar

## Remaining product systems

1. PNG image sequences and production codec profiles such as ProRes or FFV1
2. Alpha-capable or lossless export paths where the final graph supports alpha
3. Export-job manifests and queued jobs
4. Automation/keyframe/sequence replay inside deterministic export
5. True independent high-resolution graph execution rather than final resampling
6. Parameter-by-parameter visual and motion calibration
7. MIDI and OSC map import/edit workflows
8. Expanded sequencing, routing, scoped recall, and project-state support
9. Windows MSVC, Spout receiver, multi-GPU, MSI, and NSIS verification
10. Optional lower-copy platform-specific texture interop research

## Current principle

Huff now has separate modes for live performance recording and frame-driven rendering. The next work should deepen export formats and job structure without reopening effect calibration until the pipeline migration is complete.
