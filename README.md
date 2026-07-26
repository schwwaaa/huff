# Huff Native wgpu · Milestone 11

Milestone 11 adds **frame-driven deterministic MP4 export** to the native Huff engine.

The application now includes:

- native FFmpeg video and synchronized audio playback;
- native camera capture;
- wgpu temporal history, flying feedback, glitch, clusters, scanlines, Smoosh, Luma Key, Global Mix, and Flow;
- Syphon output on macOS;
- SpoutDX output path on Windows;
- synchronized 30/60 FPS live MP4 recording;
- native, 1080p, 4K, 8K, and custom PNG still export;
- fixed-timestep 24/30/60 FPS offline MP4 export.

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

FFmpeg must be available on `PATH` for file decoding, audio, recording, still encoding, and offline export.

## Deterministic offline export

The control bar includes:

```text
24 / 30 / 60 FPS
START CURRENT / ZERO / CUSTOM
DURATION
NATIVE / 1080P / 4K / 8K / CUSTOM
SMOOTH / CRISP
FIT / CROP / STRETCH
SOURCE AUDIO / SILENT
EXPORT MP4 / CANCEL
```

Unlike live recording, the exporter owns its timeline:

```text
private exact-frame decoder
        ↓
one source frame
        ↓
one fixed native simulation step
        ↓
one completed Huff output frame
        ↓
one CFR encoder frame
```

The export may run slower than real time, but it renders the requested frame count without relying on wall-clock presentation timing. MP4 dimensions are normalized to even values for broad H.264 compatibility.

At the start of the export, Huff freezes canonical parameters and control-input snapshots, resets its temporal/procedural state, and uses the selected source interval, seed, playback rate, frame rate, and duration for the entire render.

## Sidecar

Every MP4 also writes:

```text
<video-name>.mp4.huff-offline.json
```

The sidecar records:

- Huff engine build;
- source path, codec, source duration, and playback rate;
- export start, duration, FPS, resolution, sampling, and fit policy;
- source audio and looping policy;
- canonical parameter revision and values;
- deterministic source seed.

## Important live-state behavior

The exporter pauses the live file source and restores its prior position and play/pause state afterward. Temporal history and feedback pixel contents are cleared to establish a reproducible initial export condition; they are not checkpointed and restored.

Syphon and Spout hold the last live frame during export and resume afterward. Recording and PNG export cannot run at the same time as deterministic export.

## Resolution meaning

1080p, 4K, and 8K offline outputs currently resample Huff's completed internal render using a GPU pass. They do not yet rerun the complete history/effect graph at an independently larger working resolution.

## Documentation

- `UPGRADE-NOTES-11.md` — design, lifecycle, and scope
- `TESTING.md` — local runtime checklist
- `MIGRATION-STATUS.md` — completed and remaining systems
- `VALIDATION.md` — static and FFmpeg pipeline checks

## Next milestone

The next structural milestone is **production export profiles and image sequences**: PNG sequences, ProRes/FFV1 options, alpha-capable output where supported, and export-job manifests. Parameter calibration remains a later dedicated pass, as planned.
