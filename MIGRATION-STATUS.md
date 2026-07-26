# Huff native migration status · Milestone 13

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
- Native through custom-size PNG still export

## Deterministic and production export completed

- Private exact-frame FFmpeg decoder
- Fixed 24/30/60 FPS simulation timeline
- Frozen canonical parameters and control snapshots
- Deterministic procedural/history/feedback reset boundary
- Playback-rate-aware source audio
- H.264, ProRes 422 HQ, ProRes 4444, FFV1, and PNG-sequence profiles
- Optional alpha preservation where supported
- Transactional temporary output and reproducibility metadata
- Complete/cancelled/failed per-attempt lifecycle manifests

## Durable export queue completed in Milestone 13

- Frozen job descriptions captured at enqueue time
- Sequential automatic dispatch
- Queue pause and resume
- Waiting-job reorder and cancellation
- Active-job cancellation
- Per-job progress, ETA, attempt count, error, and history reporting
- Retry from frame zero with stable queue job identity
- Repeat to a new destination with a new queue job identity
- Persistent application-data queue file
- Adjacent `.huff-queue-job.json` descriptors
- Queue-to-lifecycle-manifest `queueJobId` linkage
- Source and destination conflict checks
- Interrupted-session recovery and safe startup handling

## Remaining product systems

1. Automation, keyframe, action, and preset replay inside deterministic export
2. True independent high-resolution graph execution rather than final resampling
3. Parameter-by-parameter visual and motion calibration
4. MIDI and OSC map import/edit workflows
5. Expanded sequencing, routing, scoped recall, and project-state support
6. Windows MSVC, Spout receiver, multi-GPU, MSI, and NSIS verification
7. Optional lower-copy platform-specific texture interop research

## Current principle

Export architecture is now installed before the larger calibration cycle. The next structural milestone should make deterministic exports replay canonical time-varying instrument state without reopening visual tuning yet.
