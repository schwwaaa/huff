# Huff Native wgpu · Milestone 12

Milestone 12 expands Huff's fixed-timestep deterministic exporter into a **production export system**.

The application now includes:

- native FFmpeg video and synchronized audio playback;
- native camera capture;
- wgpu temporal history, flying feedback, glitch, clusters, scanlines, Smoosh, Luma Key, Global Mix, and Flow;
- Syphon output on macOS and a SpoutDX path on Windows;
- synchronized 30/60 FPS live MP4 recording;
- native, 1080p, 4K, 8K, and custom PNG still export;
- deterministic 24/30/60 FPS offline export;
- H.264, ProRes, FFV1, and PNG-sequence production profiles;
- optional alpha preservation for compatible profiles;
- reproducibility metadata and durable export-job manifests.

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

FFmpeg must be available on `PATH` for file decoding, audio, recording, still encoding, and deterministic export.

## Production export profiles

| Profile | Output | Video format | Audio behavior | Alpha |
|---|---|---|---|---|
| **H.264 MP4** | `.mp4` | `libx264`, with the existing MPEG-4 fallback | AAC 192 kbps | No |
| **ProRes 422 HQ** | `.mov` | `prores_ks`, profile 3, `yuv422p10le` | 24-bit PCM | No |
| **ProRes 4444** | `.mov` | `prores_ks`, profile 4 | 24-bit PCM | Optional `yuva444p10le` |
| **FFV1 Lossless** | `.mkv` | FFV1 level 3, intra-only, slice CRC | FLAC | Optional BGRA |
| **PNG Sequence** | folder | `frame_000000.png`, `frame_000001.png`, … | Optional `audio.wav`, 24-bit PCM | Optional RGBA |

H.264 and ProRes 422 HQ require even output dimensions. FFV1 and PNG sequences may use odd dimensions. ProRes 4444 is kept on the production-safe even-dimension path by the UI presets but is not forced by the exporter.

## Alpha behavior

The `ALPHA` option is enabled only for ProRes 4444, FFV1, and PNG sequences.

When enabled:

- the export scaling pass preserves the alpha channel already present in Huff's authoritative output texture;
- `FIT` letterbox regions become transparent instead of opaque black;
- the selected codec or image format receives an alpha-capable pixel format.

This does not automatically key an opaque source. It preserves alpha that the render graph actually produces.

## Deterministic timeline

The exporter still owns its timeline:

```text
private exact-frame decoder
        ↓
one source frame
        ↓
one fixed native simulation step
        ↓
one completed Huff output frame
        ↓
production encoder or numbered PNG frame
```

The export may run slower than real time, but it renders the requested frame count without relying on wall-clock presentation timing.

At export start Huff freezes canonical parameters and control-input snapshots, resets temporal/procedural state, and uses the selected source interval, seed, playback rate, frame rate, duration, output size, profile, and alpha policy for the entire job.

## Reproducibility metadata

Video exports write:

```text
<output-file>.huff-offline.json
```

PNG sequences write:

```text
<sequence-folder>/huff-offline.json
```

The metadata records source details, timeline settings, dimensions, scaling policy, profile, codec, pixel format, alpha policy, complete canonical parameter state, and deterministic seed.

## Export-job manifests

Every job writes a lifecycle manifest immediately after its FFmpeg processes start:

```text
<output-name>.huff-export-job.json
```

The manifest is updated to `complete`, `cancelled`, or `failed` and records:

- a stable job ID;
- start and finish timestamps;
- requested and rendered frame counts;
- output path and output kind;
- numbered-frame pattern;
- audio artifact path;
- produced artifacts;
- reproducibility metadata;
- failure details when applicable.

Completed PNG sequences also contain an internal copy:

```text
<sequence-folder>/huff-export-job.json
```

## Cancellation and destination safety

Video profiles encode to temporary files and replace the selected destination only after successful completion. PNG sequences encode into a hidden temporary directory and rename it only after all frames and optional audio are complete.

Cancellation or failure:

- terminates the private decoder and encoder;
- removes temporary video files or temporary sequence directories;
- leaves a cancelled/failed job manifest;
- restores the live source position and prior play/pause state.

A PNG-sequence destination must not already exist, preventing Huff from deleting or mixing with unrelated files.

## Current resolution meaning

1080p, 4K, 8K, and custom exports still resample Huff's completed internal render through the GPU export pass. They do not yet rerun the complete history/effect graph at an independently larger working resolution.

## Documentation

- `UPGRADE-NOTES-12.md` — profile architecture, alpha behavior, and manifests
- `TESTING.md` — runtime checklist for every profile
- `MIGRATION-STATUS.md` — completed and remaining systems
- `VALIDATION.md` — static and FFmpeg pipeline validation

## Next milestone

The next milestone is **export queue and job management**: queued jobs, durable pending-job descriptions, repeat/retry operations, clearer failure history, and safe sequential execution. Automation replay remains the following structural milestone.
