# Huff native migration status · Milestone 10

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

## Still export completed in Milestone 10

- Native, 1080p, 4K, 8K, and custom PNG output
- Independent export texture and readback
- Smooth and Crisp GPU scaling
- Fit, Crop, and Stretch policies
- Export while the native window is minimized
- No live-render resize, history rebuild, or feedback clear
- Reproducibility sidecar with source and canonical parameter state
- Bounded 35-megapixel allocation policy

## Remaining product systems

1. Frame-driven deterministic video rendering
2. Independent video-export resolution and codec profiles
3. Image sequences and production codecs such as ProRes or FFV1
4. Parameter-by-parameter visual and motion calibration
5. MIDI and OSC map import/edit workflows
6. Expanded automation, sequencing, routing, and project-state support
7. Windows MSVC, Spout receiver, multi-GPU, MSI, and NSIS verification
8. Optional lower-copy platform-specific texture interop research

## Current principle

The live application pipeline, external output, recording, and still capture are native. Offline export should now be built as a frame-driven engine mode rather than by extending wall-clock recording.
