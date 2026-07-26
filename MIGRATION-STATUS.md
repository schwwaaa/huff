# Huff native migration status · Milestone 12

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

## Deterministic render foundation completed in Milestone 11

- Private exact-frame FFmpeg decoder
- Fixed 24/30/60 FPS simulation timeline
- One decoded source frame and one native render step per output frame
- Frozen canonical parameter and external-control snapshots
- Deterministic procedural/history/feedback reset boundary
- Bounded three-frame source decode queue
- Synchronous bounded GPU export readback
- Playback-rate-aware source audio
- Native, 1080p, 4K, 8K, and custom output sizes
- Cancellation, shutdown cleanup, and live transport restoration
- Reproducibility sidecar

## Production export completed in Milestone 12

- Profile-driven encoder selection
- H.264 MP4
- ProRes 422 HQ MOV
- ProRes 4444 MOV
- FFV1 lossless MKV
- Numbered PNG image sequences
- Optional separate 24-bit WAV for PNG sequences
- Profile-specific AAC, PCM, and FLAC audio handling
- Optional alpha preservation for ProRes 4444, FFV1, and PNG
- Transparent FIT bars when alpha is enabled
- Transactional temporary video and sequence outputs
- Durable running/complete/cancelled/failed export-job manifests
- Artifact lists, frame patterns, audio paths, and complete reproducibility metadata

## Remaining product systems

1. Export queue, retry/repeat, durable pending jobs, and job history
2. Automation/keyframe/sequence replay inside deterministic export
3. True independent high-resolution graph execution rather than final resampling
4. Parameter-by-parameter visual and motion calibration
5. MIDI and OSC map import/edit workflows
6. Expanded sequencing, routing, scoped recall, and project-state support
7. Windows MSVC, Spout receiver, multi-GPU, MSI, and NSIS verification
8. Optional lower-copy platform-specific texture interop research

## Current principle

Huff now has separate modes for live performance recording and deterministic production rendering. The export path is format-aware and transaction-safe. The next structural work should make export jobs queueable and repeatable without reopening effect calibration yet.
