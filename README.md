# Huff Native wgpu · Milestone 13

Milestone 13 adds a **durable deterministic-export queue** to Huff's native Rust + wgpu engine.

The application now includes:

- native FFmpeg video and synchronized audio playback;
- native camera capture;
- wgpu temporal history, flying feedback, glitch, clusters, scanlines, Smoosh, Luma Key, Global Mix, and Flow;
- Syphon output on macOS and a SpoutDX path on Windows;
- synchronized 30/60 FPS live MP4 recording;
- native, 1080p, 4K, 8K, and custom PNG still export;
- deterministic 24/30/60 FPS production export;
- H.264, ProRes, FFV1, and PNG-sequence profiles;
- optional alpha preservation for compatible profiles;
- a persistent sequential export queue with pause, reorder, cancellation, retry, repeat, history, and crash recovery.

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

## Queue workflow

1. Load a video file and establish the desired Huff state.
2. Choose the deterministic profile, timeline, dimensions, sampling, fit, audio, and alpha settings.
3. Press **Queue Video** or **Queue Frames** and choose a new destination.
4. Continue changing Huff and queue additional jobs. Each job keeps the state captured when it was added.
5. The queue runs jobs sequentially and reports per-job progress and failure state.

The queue can be paused without interrupting its active export. Waiting jobs can be reordered or cancelled. Failed, cancelled, and interrupted jobs can be restarted from frame zero. Completed or retryable jobs can be repeated to a new destination.

## Durable files

The global queue is stored in the platform application-data directory:

```text
huff-export-queue.json
```

Each queued job writes:

```text
<output-name>.huff-queue-job.json
```

Each encoding attempt retains Milestone 12's lifecycle manifest:

```text
<output-name>.huff-export-job.json
```

Completed deterministic exports also write their reproducibility metadata:

```text
<output-file>.huff-offline.json
```

PNG sequences contain internal metadata and manifest copies.

## Production profiles

| Profile | Output | Video format | Audio | Alpha |
|---|---|---|---|---|
| H.264 MP4 | `.mp4` | `libx264`, MPEG-4 fallback | AAC | No |
| ProRes 422 HQ | `.mov` | `prores_ks`, 10-bit 4:2:2 | 24-bit PCM | No |
| ProRes 4444 | `.mov` | `prores_ks`, 4:4:4:4 | 24-bit PCM | Optional |
| FFV1 Lossless | `.mkv` | FFV1 level 3 | FLAC | Optional |
| PNG Sequence | folder | numbered RGB/RGBA PNG | optional `audio.wav` | Optional |

## Recovery semantics

Huff never treats an unfinished temporary output as complete. If the application closes during a job, the next launch checks whether the transactional final destination was committed. Otherwise the job is marked **interrupted**, the queue pauses, and the user may restart the frozen job from frame zero.

This is restartable job recovery, not arbitrary frame-level codec continuation.

## Current resolution meaning

1080p, 4K, 8K, and custom deterministic exports still resample Huff's completed internal render. Full high-resolution execution of every history and effect pass remains a later milestone.

## Documentation

- `UPGRADE-NOTES-13.md` — queue architecture and recovery behavior
- `TESTING.md` — Milestone 13 runtime checklist
- `MIGRATION-STATUS.md` — completed and remaining systems
- `VALIDATION.md` — validation completed in the packaging environment

## Next milestone

Milestone 14 is deterministic automation replay: keyframes, parameter automation, registered actions, and preset recalls evaluated against the fixed export timeline.
