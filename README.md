# Huff Native wgpu · Milestone 14

Milestone 14 adds **frame-exact automation replay to deterministic offline export**.

Huff can now record a live control performance as canonical instrument state, save or import that performance as a `.huff-automation.json` clip, and evaluate it from the fixed offline timeline instead of from wall-clock timing.

The application includes:

- native FFmpeg video and synchronized audio playback;
- native camera capture;
- wgpu temporal history, flying feedback, glitch, clusters, scanlines, Smoosh, Luma Key, Global Mix, and Flow;
- Syphon output on macOS and a SpoutDX path on Windows;
- synchronized 30/60 FPS live MP4 recording;
- native, 1080p, 4K, 8K, and custom PNG still export;
- deterministic 24/30/60 FPS production export;
- H.264, ProRes, FFV1, and PNG-sequence profiles;
- optional alpha preservation for compatible profiles;
- the provisional durable export queue from Milestone 13;
- canonical automation recording and deterministic replay.

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

FFmpeg must be available on `PATH`.

## Automation workflow

1. Load a video and establish an initial Huff state.
2. Enter a clip name and interpolation mode in the **AUTOMATION** strip.
3. Press **Record**.
4. Move Huff controls, recall presets, clear buffers, or fire Flow pulses.
5. Press **Stop**. The completed clip becomes the active automation.
6. In deterministic export, choose **ACTIVE AUTOMATION** and optionally enable **LOOP AUTO**.
7. Queue the export.

The queued job receives an immutable copy of the automation clip. Editing, importing, or clearing the active clip later does not alter jobs already queued.

## Recorded event types

Milestone 14 records:

- individual canonical parameter changes;
- parameter batches such as preset recalls and reset operations;
- `clear_buffers` actions;
- `flow_pulse` actions.

Numeric parameters support:

- linear;
- smooth;
- ease in;
- ease out;
- step interpolation.

Boolean and select parameters always use step behavior.

Render allocation, history allocation, and `source.seed_on_load` settings are intentionally excluded from automation. Those settings can change GPU resource topology or source initialization and remain frozen per export job.

## Deterministic behavior

For export frame `n` at frame rate `fps`, automation is evaluated at:

```text
simulation_time = n / fps
```

No automation timing depends on UI polling, live render speed, or wall-clock duration. A slower-than-real-time export therefore produces the same keyframe state and action boundaries as a fast export.

Looping repeats control state and recorded actions; it does not automatically clear feedback, history, or other persistent image memory. Record a **Clear** action at the desired loop boundary when each cycle must restart temporal state.

The automation clip, loop setting, duration, event count, and name are included in queue descriptions and deterministic export metadata.

## Clip files

The active clip can be exported as:

```text
<name>.huff-automation.json
```

The browser control surface also retains the latest active clip in local storage for restoration at the next launch. Imported clips are validated and canonicalized by Rust before they become active.

## Queue status

Milestone 13's export queue remains present as provisional infrastructure. It is not required for authoring automation beyond the current deterministic export dispatch path, and it may be simplified or removed after the larger product testing cycle.

## Current resolution meaning

1080p, 4K, 8K, and custom deterministic exports still resample Huff's completed internal render. Full high-resolution execution of every history and effect pass remains Milestone 15.

## Documentation

- `UPGRADE-NOTES-14.md` — automation schema, recording, and replay architecture
- `TESTING.md` — Milestone 14 runtime checklist
- `MIGRATION-STATUS.md` — completed and remaining systems
- `VALIDATION.md` — validation completed in the packaging environment

## Next milestone

Milestone 15 is true independent high-resolution graph execution: the history, glitch, cluster, feedback, scan, Flow, and compositing passes run at the requested export resolution instead of only resampling the live-resolution result.
