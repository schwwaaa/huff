# Huff native migration status · Milestone 08.1

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
- Scanline bands
- Layer Priority
- Smoosh
- Luma Key
- Global Mix
- Flow, pulse, and target routing
- Non-additive feedback transform
- Clean base, background, brightness, and contrast

## Native output completed in Milestones 08–08.1

- Authoritative render-resolution RGBA8 output texture
- Native-window presentation separated from output resolution
- Bounded triple-buffer wgpu readback bridge
- Shared latest-frame delivery to external outputs
- Persistent Metal texture Syphon publisher on macOS
- SpoutDX publisher on Windows
- Static Spout bridge linked into the executable
- DirectX adapter enumeration and selection
- Single-thread SpoutDX lifecycle ownership
- Output FPS limiting, busy-frame dropping, and diagnostics
- External output continues when the presentation surface is unavailable

## Remaining product systems

1. Native video recording with synchronized audio
2. High-resolution still export
3. Offline deterministic video rendering
4. Parameter-by-parameter visual and motion calibration
5. MIDI and OSC map import/edit workflows
6. Expanded automation and project-state support
7. Windows MSVC, receiver, multi-GPU, MSI, and NSIS verification for the statically linked Spout path
8. Optional direct platform-texture sharing research after the stable bridge is proven

## Current principle

The major live rendering pipeline is now native. Future work should distinguish between:

- **structural/product systems** such as recording and export;
- **runtime defects** that block reliable use;
- **parameter parity and artistic tuning**, which should happen in a dedicated pass without destabilizing the pipeline.
