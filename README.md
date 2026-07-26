# HUFF Native wgpu · Milestone 17

Milestone 17 turns the existing MIDI and OSC foundations into **canonical controller-mapping workflows**. Incoming controls now write directly into the same Rust-owned parameter store used by the HTML interface, presets, automation, rendering, and deterministic export.

## MIDI and OSC mapping

The MIDI and OSC panels now provide:

- learn-next-input workflows;
- manual mapping creation and editing;
- canonical parameter and action target selection;
- Absolute, Gate, Toggle, and Trigger behavior;
- normalized output-range scaling;
- Linear, Smooth, Square, Cube, and Square-root response curves;
- per-mapping smoothing;
- enable/disable state;
- duplicate-source conflict warnings;
- native Open and Save As dialogs;
- portable `huff-control-map/v1` JSON documents;
- compact factory maps that can be restored at any time.

The canonical action targets are:

- `clear_buffers`
- `flow_pulse`
- `reset_parameters`

Mapped parameter changes are recorded when automation recording is active. Action mappings also enter the automation action stream.

## Important compatibility note

Milestone 01 contained eight demonstration MIDI/OSC values used as visual input signals. Those low-level signals remain available to the shader for experimental modulation, but the mapping editor no longer treats them as the main user-facing destination. The authoritative destination is now the canonical HUFF parameter/action registry.

## Included systems

The application currently includes native FFmpeg media playback, camera capture, Rust + wgpu rendering, GPU history and feedback, glitch/cluster/scanline/Smoosh/Luma/Global Mix/Flow processing, Syphon, Spout, live recording, high-resolution still export, deterministic production export, export automation replay, the provisional export queue, full export-resolution render graphs, the Parity Lab, and canonical MIDI/OSC maps.

## Run

```bash
npm install
npm run dev:metal
```

Automatic backend selection:

```bash
npm run dev
```

Windows DX12:

```powershell
npm run dev:dx12
```

FFmpeg must be available on `PATH` for video playback, recording, and encoded export.

## Mapping workflow

1. Open **MIDI** or **OSC** from the top bar.
2. Select a canonical target.
3. Press **Learn Next**.
4. Move the MIDI control or send the OSC message.
5. Edit behavior, source, range, curve, smoothing, or notes in the table.
6. Press **Save** on the row.
7. Use **Save As…** to create a portable mapping file.

See `CONTROL-MAPPING.md` for the file schema and behavioral details. Static map validation is available through `npm run validate:control-maps`.

## Runtime status

The application runs locally, and earlier milestone tests include both successful and unsuccessful cases that are intentionally being retained until the broad refinement cycle. Milestone 17 is structurally integrated, but controller-specific behavior must still be tested with real USB devices, virtual MIDI ports, TouchOSC, Max/MSP, Pure Data, and other senders.

## Documentation

- `MILESTONES.md` — authoritative complete roadmap
- `UPGRADE-NOTES-17.md` — Milestone 17 implementation details
- `CONTROL-MAPPING.md` — portable map schema and behavior
- `TESTING.md` — focused Milestone 17 test cycle
- `MIGRATION-STATUS.md` — current native-port status
- `VALIDATION.md` — checks completed in the packaging environment
- `UPGRADE-NOTES-01..16` — prior milestone notes

## Next milestone

Milestone 18 formalizes presets, full snapshots, sequences, stored image state, projects, and selective recall scopes.
