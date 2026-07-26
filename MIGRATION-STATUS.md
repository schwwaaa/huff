# Huff native migration status · Milestone 15

## Proven native foundation

- FFmpeg video decoding and watchdog recovery
- Native synchronized audio playback
- Native camera input
- Metal / Vulkan / DX12 wgpu rendering
- Exclusive camera/video source ownership
- Existing Huff HTML control surface commanding canonical Rust state
- Native presets, undo, MIDI, OSC, and diagnostics foundations

## Native renderer completed

- Independent live render and GPU-history resolutions
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

## Deterministic production export completed

- Private exact-frame FFmpeg decoder
- Fixed 24/30/60 FPS simulation timeline
- Frozen canonical parameter and control snapshots
- Deterministic procedural/history/feedback reset boundary
- Playback-rate-aware source audio
- H.264, ProRes 422 HQ, ProRes 4444, FFV1, and PNG-sequence profiles
- Transactional temporary output and reproducibility metadata
- Complete/cancelled/failed lifecycle manifests
- Canonical automation recording, interpolation, looping, actions, and frame-exact replay

## Full-resolution graph execution completed in Milestone 15

- Private export-sized working graph for every deterministic job
- Source FIT/CROP/STRETCH applied before temporal processing
- SMOOTH/CRISP source sampling applied before the graph
- Export-relative history dimensions and bounded capacity
- Full-resolution glitch, clusters, scanlines, Smoosh, feedback, Luma Key, Global Mix, Flow, and final output
- Direct 1:1 authoritative-output readback with no final export resize
- Topology guard preventing automation from reverting export dimensions
- Graph topology and estimated allocation recorded in metadata and diagnostics
- Explicit maximum-dimension and bounded-memory preflight
- Restoration of live graph, source sampler, output readback, transport, and deferred resize after every exit path

## Provisional export queue retained

- Frozen job descriptions captured at enqueue time
- Sequential dispatch
- Pause, reorder, cancellation, retry, repeat, history, and crash recovery
- Persistent global queue and adjacent job descriptions
- Source/destination conflict checks

The queue remains installed for later evaluation but is not treated as a settled core Huff workflow.

## Remaining product work

1. Parameter-by-parameter visual and motion calibration
2. MIDI and OSC map import/edit workflows
3. Expanded sequencing, routing, scoped recall, and project-state support
4. Windows MSVC, Spout receiver, multi-GPU, MSI, and NSIS verification
5. Optional lower-copy platform-specific texture interop research

## Current principle

The native graph, deterministic timeline, production codecs, automation replay, and independent high-resolution execution are now structurally present. The next phase should tune Huff as an instrument rather than add another broad subsystem before the larger test and calibration cycle.
