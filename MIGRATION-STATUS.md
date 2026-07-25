# Huff native migration status

## Proven foundation

- Native FFmpeg video decoding
- Native audio playback and transport
- Native camera input
- Metal / Vulkan / DX12 wgpu output
- Exclusive camera/video source ownership
- HTML Huff control surface commanding canonical Rust state
- Native presets, undo, MIDI, OSC, and diagnostics foundations

## Native renderer completed through Milestone 07

- Independent render and GPU-history resolutions
- GPU temporal texture-array history
- Corrected persistent flying-frame-buffer model
- Historical glitch tiles and smear instances
- Persistent cluster physics and biased placement
- Native scanline-band compositor
- Layer Priority: Scan, Glitch, Neutral, Pulse
- Smoosh blend compositor
- Luma Key
- Global Mix with four insertion positions
- Flow warp, pulse, target routing, and bounded Carry behavior
- Non-additive feedback translation, scale, and rotation
- Clean base, background, brightness, and contrast

## Remaining product systems

1. Direct native Syphon output from the authoritative GPU result
2. Direct native Spout output from the authoritative GPU result
3. Native recording with synchronized audio
4. High-resolution still/offline export
5. Parameter-by-parameter visual and motion calibration against original Huff
6. Expanded automation and project-state support

## Current principle

The native feature pipeline is now broadly complete. Remaining work should preserve this architecture while separating:

- structural defects or missing behavior, which block progression;
- parameter calibration and subtle visual parity, which can be handled in a dedicated pass.
