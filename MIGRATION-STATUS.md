# Huff native migration status · Milestone 14

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

## Provisional durable export queue retained from Milestone 13

- Frozen job descriptions captured at enqueue time
- Sequential automatic dispatch
- Queue pause, reorder, cancellation, retry, repeat, history, and crash recovery
- Persistent global queue and adjacent job descriptions
- Source/destination conflict checks

This remains installed for later evaluation but is not currently treated as a settled core Huff workflow.

## Deterministic automation completed in Milestone 14

- Canonical automation clip schema with stable IDs, names, duration, sequence order, and versioning
- Initial-state capture at record start
- Individual parameter event recording with short-interval coalescing
- Atomic parameter-batch events for preset recall and reset
- Recorded clear-buffer and Flow-pulse actions
- Linear, smooth, ease-in, ease-out, and step numeric interpolation
- Forced step behavior for Boolean and select parameters
- Exact evaluation from offline frame time rather than wall-clock time
- Optional clip looping across an export
- Immutable automation copies frozen into queued jobs
- Automation identity and complete clip data embedded in reproducibility metadata
- JSON import/export and local active-clip restoration
- Validation limits of 100,000 events and 24 hours
- Resource-topology parameters explicitly excluded from replay

## Remaining product systems

1. True independent high-resolution graph execution rather than final resampling
2. Parameter-by-parameter visual and motion calibration
3. MIDI and OSC map import/edit workflows
4. Expanded sequencing, routing, scoped recall, and project-state support
5. Windows MSVC, Spout receiver, multi-GPU, MSI, and NSIS verification
6. Optional lower-copy platform-specific texture interop research

## Current principle

The fixed offline timeline can now reproduce changing instrument state as well as static state. The next structural step is to run the full graph at export resolution before beginning the larger visual calibration cycle.
