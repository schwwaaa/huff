# Huff Native Migration Status

## Proven

- Native video decoding
- Native audio decoding and playback
- Native camera capture
- Native wgpu output
- Tauri control communication
- Independent video operation when audio is missing or unreadable
- MIDI and OSC input foundations

## Milestone 02

- Real Huff control surface
- Canonical Rust parameter registry
- Native transport wiring
- Source/background controls
- Brightness and contrast
- Independent internal render resolution
- Feedback foundation
- Canonical native presets
- Full visible map of unported controls

## Milestone 03 — GPU temporal history and feedback parity

- GPU texture-history ring
- Full/75%/50%/25%/custom history sizes
- Every-frame/30/24/15/10 FPS history capture
- Smooth/crisp history sampling
- Time/depth-based historical selection
- Exact persistence behavior
- Exact feedback transform and compositing comparison

## Milestone 04 — Glitch tile engine

- Rust procedural tile commands
- Historical frame selection
- Depth and scatter
- Drift, jitter, alpha, smear, and offsets
- Instanced wgpu tile rendering
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
- Exact pass ordering

## Milestone 07 — Inputs, mappings, and projects

- Canonical MIDI mapping editor
- Canonical OSC mapping editor
- Existing mapping-file migration
- Complete preset compatibility
- Automation/project format

## Milestone 08 — Native outputs

- Direct wgpu-to-Syphon path
- Direct wgpu-to-Spout path
- Native recording
- Audio muxing
- High-resolution and offline export

## Completion condition

The old renderer can be retired only when representative Huff presets produce acceptable native visual matches and the native branch passes playback, camera, MIDI/OSC, Syphon/Spout, recording, and packaging tests on macOS and Windows.
