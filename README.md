# Huff Native wgpu · Milestone 06

Milestone 06 ports Huff's native **scanline-band compositor and layer-priority system** while preserving the corrected flying-frame-buffer, GPU history, glitch, and cluster behavior from Milestones 04.1–05.

The control interface remains HTML/CSS. Video, audio, camera, temporal history, glitch/cluster generation, scanline generation, feedback, and rendering are native Rust + wgpu.

## Native render model

```text
Native video or camera frame
        ↓
Clean GPU temporal-history ring
        ↓
Persistent flying frame buffer
        ↓
Glitch tiles and scanline bands
        ├── GLITCH TOP
        ├── SCAN TOP
        ├── NEUTRAL frame interleave
        └── PULSE timed layer swap
        ↓
Non-additive FB X / Y / Z / rotation
        ↓
Optional clean base underneath
        ↓
Brightness / contrast
        ↓
Metal / Vulkan / DX12 output
```

## Scanline controls now active

- On
- Angle
- Spin Left / Spin Right
- Spin Speed
- Band Count
- Band Radius
- Focus
- Shift
- Skew
- Drift
- Place X / Y
- Zoom
- Zoom Mode: Content / Pattern / Both
- Speed
- Gap
- Alpha

The implementation follows the original Canvas2D behavior:

- Scan phase advances independently from glitch speed.
- Right spin wins when both spin toggles are enabled.
- Spin begins from the current manual angle without jumping.
- Rotated-band coverage uses the full projected canvas span.
- Gap defines the even comb spacing.
- Drift wanders bands relative to their own thickness rather than scattering them across the entire frame.
- Focus pulls the comb toward the selected region.
- Pattern Zoom transforms the band field; Content Zoom magnifies the sampled video within each band.
- Source regions outside the clean frame are clipped rather than edge-clamped.

## Layer Priority now active

- Scan Top
- Glitch Top
- Neutral
- Pulse
- Pulse Speed

As in original Huff, glitch and scanlines draw into the same persistent effect buffer. Layer Priority chooses paint order; it does not change either layer's opacity.

## Retained behavior

- Native FFmpeg video and audio
- Native camera and exclusive source ownership
- GPU temporal history
- Corrected p5-compatible glitch engine
- Persistent cluster bodies and cluster-biased placement
- Destination-out persistence
- Non-additive flying frame-buffer feedback
- Independent render/history resolution
- Base/background, brightness, contrast, presets, MIDI, and OSC foundations

## Pending

- Smoosh
- Luma key
- Global mix positions and blend modes
- Flow warp, carry, pulse, and target routing
- Direct Syphon and Spout texture output
- Recording and export

## Run

```bash
npm install
npm run dev:metal
```

Automatic backend selection:

```bash
npm run dev
```

Use `TESTING.md` for the Milestone 06 runtime checklist. Fine parameter calibration can remain for the planned dedicated parity pass; major pipeline/order differences should be reported immediately.
