# HUFF Native wgpu · Milestone 16

Milestone 16 adds a **parameter-contract and parity-calibration framework** without forcing subjective visual retuning before the larger hands-on test cycle.

The supplied legacy web/Tauri HUFF interface is now represented by an embedded, machine-readable contract. The native registry is checked against that source for:

- canonical and legacy identifiers;
- control kinds;
- default values;
- minimum and maximum values;
- steps;
- select options.

The current build matches all **87 mapped legacy controls** exactly. Eleven additional native controls cover render resolution, brightness/contrast, and GPU-history configuration and are reported separately rather than being misclassified as legacy mismatches.

## Parity Lab

The control window now includes a compact **PARITY LAB** row.

- **Legacy Defaults** restores the mapped legacy controls while preserving native-only render and history configuration.
- **Glitch Isolation** enables historical glitch tiles with the other effect families disabled.
- **Cluster Isolation** enables moving clustered glitch bodies with reproducible values.
- **Scanline Isolation** isolates the native scanline-band system.
- **Feedback Reference** isolates feedback transform, persistence, and decay.
- **Flow Reference** feeds a bounded feedback image into the default Flow path.
- **Compare** checks the embedded contract and shows how many current controls differ from legacy defaults.
- **Export Report** writes the full contract, mismatch list, native-only list, current-value differences, and profile inventory as JSON.

Applying a calibration profile clears persistent feedback and temporal effect state so comparisons begin from a known boundary. Profile applications are recorded as canonical parameter batches when automation recording is active.

## Included systems

The application currently includes:

- native FFmpeg video and synchronized audio playback;
- native camera capture;
- Rust + wgpu rendering on Metal, Vulkan, and DX12;
- independent live render and history resolutions;
- native history, feedback, glitch, clusters, scanlines, Smoosh, Luma Key, Global Mix, and Flow;
- Syphon output on macOS and SpoutDX output on Windows;
- synchronized 30/60 FPS live MP4 recording;
- custom-size PNG still export;
- deterministic 24/30/60 FPS offline export;
- H.264, ProRes, FFV1, and PNG-sequence profiles;
- deterministic automation recording and export replay;
- the provisional durable export queue;
- private full-resolution render graphs for deterministic export;
- embedded legacy parameter-contract validation and reproducible calibration profiles.

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

## Static parity validation

The embedded legacy contract can be checked without launching the application:

```bash
npm run validate:parity
```

A successful result reports the exact legacy contract count, total native registry count, and native-only controls. The command exits with an error if a later code change alters a mapped legacy default, range, step, kind, option list, or identifier without updating the contract intentionally.

## Milestone 15 runtime status

Milestone 15’s export-resolution graph remains integrated. Initial local testing produced successful and unsuccessful cases, and detailed investigation is intentionally deferred until the broader feature set is assembled. Milestone 16 does not hide or reinterpret those results; it adds reproducible states and reports that will make the later refinement cycle easier to conduct.

## Documentation

- `MILESTONES.md` — authoritative master roadmap; carried in every future full and changed-files package
- `UPGRADE-NOTES-16.md` — Milestone 16 architecture and usage
- `TESTING.md` — focused Parity Lab checks and deferred runtime notes
- `MIGRATION-STATUS.md` — current native-port status
- `VALIDATION.md` — checks completed in the packaging environment
- `UPGRADE-NOTES-01..15` — prior milestone notes retained in the project

## Next milestone

Milestone 17 will build complete MIDI and OSC mapping workflows on top of the existing native control foundation. Detailed visual calibration remains intentionally available through the Parity Lab rather than blocking continued architecture work.
