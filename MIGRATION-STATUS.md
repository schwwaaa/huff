# HUFF native migration status · Milestone 18

## Proven native foundation

- FFmpeg video decoding and watchdog recovery
- Native synchronized audio playback
- Native camera input
- Metal / Vulkan / DX12 wgpu rendering
- Exclusive camera/video source ownership
- Existing HUFF HTML control surface commanding canonical Rust state
- Native presets, undo, MIDI, OSC, and diagnostics foundations

## Native renderer integrated

- Independent live render and GPU-history resolutions
- GPU temporal texture-array history
- Persistent flying-frame-buffer model
- Historical glitch tiles and smear instances
- Persistent cluster physics and biased placement
- Scanline bands and Layer Priority
- Smoosh, Luma Key, Global Mix, Flow, and pulse routing
- Non-additive feedback transform
- Clean base, background, brightness, and contrast

## Live output and capture integrated

- Native-window output
- Syphon on macOS
- SpoutDX path on Windows
- Bounded triple-buffer readback for live external output
- 30/60 FPS CFR MP4 recording
- Synchronized source-video audio or microphone capture
- Safe recording finalization
- Native through custom-size PNG still export

## Deterministic production export integrated

- Private exact-frame FFmpeg decoder
- Fixed 24/30/60 FPS simulation timeline
- Frozen canonical parameter and control snapshots
- Deterministic procedural/history/feedback reset boundary
- Playback-rate-aware source audio
- H.264, ProRes 422 HQ, ProRes 4444, FFV1, and PNG-sequence profiles
- Transactional temporary output and reproducibility metadata
- Complete/cancelled/failed lifecycle manifests
- Canonical automation recording, interpolation, looping, actions, and frame-exact replay
- Private export-resolution graph for history, glitch, clusters, scanlines, feedback, keying, Flow, and final output

Milestone 15’s full-resolution graph has produced both successful and unsuccessful local tests. It remains integrated, with focused diagnosis deferred until the larger refinement and production-verification cycle.

## Parameter contract and parity tooling completed in Milestone 16

- Embedded legacy contract extracted from the supplied HUFF web/Tauri interface
- 87 mapped legacy controls checked for ID, kind, default, range, step, and options
- 87/87 exact native contract match at packaging time
- Eleven native-only render, color, and history controls identified separately
- Reproducible Legacy, Glitch, Cluster, Scanline, Feedback, and Flow calibration profiles
- Automatic persistent-buffer clearing at profile boundaries
- Current-state delta reporting against legacy defaults
- Machine-readable parity report export
- Standalone `npm run validate:parity` source validator
- Authoritative `MILESTONES.md` carried forward in all future packages

## Provisional export queue retained

- Frozen job descriptions captured at enqueue time
- Sequential dispatch
- Pause, reorder, cancellation, retry, repeat, history, and crash recovery
- Persistent global queue and adjacent job descriptions
- Source/destination conflict checks

The queue remains installed for later evaluation but is not treated as a settled core HUFF workflow.

## Remaining ordered product work

1. Constrained routing and named buses
2. Cross-platform production verification and deferred Milestone 15 failure analysis
3. Optional lower-copy platform-specific texture interop research
4. Hands-on visual calibration using the Milestone 16 Parity Lab throughout the refinement cycle

## Current principle

The broad native architecture is being completed before a long refinement pass. Milestone 16 makes that strategy safer by preserving the original control semantics and creating repeatable visual test states without pretending that static source comparison can replace hands-on image and motion judgment.


## Canonical controller mapping completed in Milestone 17

MIDI and OSC now map directly to canonical Rust parameters and actions instead of remaining isolated demonstration inputs. Learn, edit, conflict warnings, behavior modes, scaling, curves, smoothing, factory restoration, and portable map files are integrated. Real-device and sender-specific testing remains part of the later refinement cycle.


## Formal state documents completed in Milestone 18

- Preset, Snapshot, Sequence, and Project are separate typed documents
- `huff-state/v1` portable schema
- explicit Look, Source, Temporal, Routing, Render, Transport, Automation, and Control Map scopes
- scope-intersection recall prevents accidental broad state changes
- source-file and transport references with missing-file warnings
- active automation and MIDI/OSC map project storage
- all 98 canonical parameters classified for preset, snapshot, sequence, interpolation, project, and live safety
- persistent GPU pixel stores explicitly remain separate and are not silently embedded

The earlier browser-local quick presets remain available for compatibility and rapid tests. The formal State Library is now the authoritative portable state workflow.
