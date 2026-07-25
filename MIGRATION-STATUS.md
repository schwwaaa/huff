# Huff native migration status · Milestone 09

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

## Native live output completed

- Authoritative render-resolution RGBA8 output texture
- Native-window presentation separated from output resolution
- Bounded triple-buffer wgpu readback bridge
- Persistent Metal texture Syphon publisher on macOS
- Statically linked SpoutDX publisher on Windows
- DirectX adapter enumeration and selection
- External output while presentation is unavailable

## Native recording completed in Milestone 09

- 30/60 FPS CFR recording
- Native MP4 save dialog and safe finalization
- H.264 with compatible fallback
- AAC audio muxing
- Video-audio, microphone, automatic, and silent modes
- Timestamped audio alignment with silence padding and overlap trimming
- Latest-frame recording slot instead of an unbounded frame queue
- Duplicate-frame CFR recovery under renderer/encoder load
- Recording diagnostics and estimated temporary size
- Recording while Syphon/Spout are active
- Recording while the presentation window is minimized

## Remaining product systems

1. High-resolution still export
2. Offline deterministic video rendering
3. Independent export resolution and codec profiles
4. Parameter-by-parameter visual and motion calibration
5. MIDI and OSC map import/edit workflows
6. Expanded automation, sequencing, routing, and project-state support
7. Windows MSVC, Spout receiver, multi-GPU, MSI, and NSIS verification
8. Optional lower-copy platform-specific texture interop research

## Current principle

The live application pipeline is native. The remaining work should stay separated into:

- structural product systems such as export and sequencing;
- runtime defects that block reliability;
- artistic parameter parity and calibration.
