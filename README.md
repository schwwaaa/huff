# HUFF Native wgpu · Milestone 18

Milestone 18 formalizes HUFF state into four distinct portable document types: **presets, snapshots, sequences, and projects**. Recall is no longer treated as one undifferentiated JSON dump. Every document declares what it captured, and the operator chooses which domains may be restored.

## State document types

- **Preset** — a reusable artistic condition. By default it captures Look, Temporal, and Routing parameters while leaving source files, transport, render allocation, automation, controller maps, and GPU pixel memory untouched.
- **Snapshot** — a broad current-state capture. It may include parameters, source and transport references, render/history configuration, and the active automation clip, but recall is still explicitly scoped.
- **Sequence** — the active canonical automation clip. It stores state changes and actions over time; it is source-independent and is not rendered video.
- **Project** — a portable container for selected parameter domains, source/transport references, automation, and MIDI/OSC maps.

All four use the `huff-state/v1` schema.

## Selective recall

The State Library exposes explicit domains:

- Look
- Source
- Temporal
- Routing
- Render
- Transport
- Automation
- MIDI/OSC Maps
- GPU Pixels

A loaded document can restore only the intersection of:

1. the domains captured by the document; and
2. the domains currently checked by the operator.

This prevents an artistic preset from unexpectedly changing the video file, playback position, output dimensions, history allocation, automation clip, or controller mappings.

## Persistent image memory is separate

HUFF’s GPU history ring, flying glitch buffer, feedback store, and Flow state are identified in state documents but their pixel contents are **not silently embedded**. Temporal or render recalls clear the relevant persistent runtime buffers when required. This is intentional: a preset is not a still image, a snapshot is not a field-store dump, and a sequence is not a movie.

## Parameter state metadata

Milestone 18 classifies all 98 canonical parameters with:

- state domain;
- preset eligibility;
- snapshot and project scope;
- sequenceability;
- interpolation policy;
- live-safety behavior.

Use **Export State Model** in the State Library, or run:

```bash
npm run validate:state-model
```

## Existing quick presets

The earlier local browser-storage preset row remains available for rapid testing and compatibility. The new State Library is the formal native file workflow. The older row may later be simplified or removed in a practical fork after the comprehensive evaluation cycle.

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

FFmpeg must be on `PATH` for file playback, recording, and encoded export.

## Runtime status

The broader architecture is intentionally being completed before the long refinement pass. State documents are structurally integrated and the application’s static validators pass. Local testing should focus on save/load boundaries, selective recall, missing source files, automation restoration, and MIDI/OSC map restoration.

## Documentation

- `MILESTONES.md` — authoritative complete roadmap
- `STATE-MODEL.md` — state types, recall domains, metadata, and file behavior
- `UPGRADE-NOTES-18.md` — implementation details
- `TESTING.md` — focused Milestone 18 test cycle
- `MIGRATION-STATUS.md` — current native-port status
- `VALIDATION.md` — packaging-environment checks
- `CONTROL-MAPPING.md` — Milestone 17 MIDI/OSC map schema
- `UPGRADE-NOTES-01..17.md` — prior milestone notes

## Next milestone

Milestone 19 introduces constrained routing and named buses while preserving the stable fixed HUFF pipeline as a valid instrument recipe.
