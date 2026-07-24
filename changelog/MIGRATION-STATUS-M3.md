# Huff Native Migration Status

## Proven and retained

- Native FFmpeg video decoding
- Native audio decoding and playback
- Native camera capture
- Explicit camera/video source ownership
- Native wgpu output
- Surface occlusion recovery
- Canonical Rust parameter state
- Existing Huff control surface
- Independent internal render resolution
- HDR feedback foundation
- Native presets
- MIDI and OSC input foundations

## Milestone 03 — Current

- GPU `texture_2d_array` temporal-history ring
- Authentic source-frame capture rather than render-loop duplication
- Full/75%/50%/25%/custom history sizes
- Every-frame/30/24/15/10 FPS capture
- Smooth/crisp sampling
- Bounded GPU memory and adapter-layer limits
- Quality-driven capacity
- Source-switch and decoder-restart history reset
- History diagnostics
- First full-frame temporal depth compositor using existing Glitch controls

## Milestone 04 — Glitch tile engine

- Rust procedural tile command generation
- Per-tile historical frame selection
- Depth scatter
- Corrupt density and drift
- Pixel/block sizing
- Jitter, alpha, smear distance, and smear angle
- X/Y offsets and motion
- Instanced wgpu rectangle rendering
- Seeded deterministic behavior

## Milestone 05 — Cluster engine

- Native cluster motion state
- Centers, spread, minimum radius, and spatial gap
- Drift, steering, speed variance, pulse, inertia, coherence, and breathing
- Bounce and wrap behavior

## Milestone 06 — Remaining render graph

- Scanlines
- Layer priority
- Smoosh
- Luma key
- Global mix
- Flow and pulse routing
- Exact pass ordering and visual comparison

## Milestone 07 — Inputs, mappings, and projects

- Canonical MIDI mapping editor
- Canonical OSC mapping editor
- Existing mapping-file migration
- Complete preset compatibility
- Automation/project format

## Milestone 08 — Native outputs

- Direct wgpu-to-Syphon path
- Direct wgpu-to-Spout path
- Native recording and audio muxing
- High-resolution and offline export

## Completion condition

The old renderer can be retired only when representative Huff presets produce acceptable native visual matches and the native branch passes playback, camera, MIDI/OSC, Syphon/Spout, recording, and packaging tests on macOS and Windows.
