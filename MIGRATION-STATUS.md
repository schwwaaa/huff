# Huff Native Migration Status

## Proven and retained

- Native FFmpeg video and audio
- Native camera capture and explicit source ownership
- Native wgpu output and surface recovery
- Existing Huff HTML control surface
- Canonical Rust parameter registry and presets
- Independent render resolution
- Native GPU temporal-history ring
- Persistent HDR flying frame buffer and non-additive feedback
- Native historical glitch tile renderer
- Native cluster-biased placement and cluster physics
- Native scanline band compositor and layer priority
- MIDI and OSC foundations

## Milestone 06 — Current

- Original scanline band generator translated to Rust
- Independent scanline noise phases
- Angle and continuous spin
- Band count/radius, focus, shift, skew, drift, placement, zoom, speed, gap, and alpha
- Content, Pattern, and Both zoom modes
- Glitch Top / Scan Top binary ordering
- Neutral per-frame interleave
- Pulse timed ordering
- Persistent-buffer integration before feedback
- Scan diagnostics

## Milestone 07 — Remaining render graph

- Smoosh blend modes and inversion
- Luma key
- Global mix positions and blend modes
- Flow warp, carry, pulse, and target routing
- Exact effect pass ordering and visual comparison

## Milestone 08 — Control ecosystem

- Canonical MIDI mapping editor
- Canonical OSC mapping editor
- Existing mapping-file migration
- Complete preset compatibility
- Automation/project format

## Milestone 09 — Native outputs

- Direct wgpu-to-Syphon
- Direct wgpu-to-Spout
- Native recording and audio muxing
- High-resolution and offline export

## Completion condition

The original renderer can be retired only after representative Huff presets produce acceptable native matches and playback, camera, mappings, outputs, recording, and packaging pass on macOS and Windows.
