# Huff Native wgpu · Milestone 12 upgrade notes

Milestone 12 converts Milestone 11's deterministic MP4 path into a profile-driven production exporter.

## New export profiles

```text
H.264 MP4
ProRes 422 HQ MOV
ProRes 4444 MOV
FFV1 Lossless MKV
PNG image sequence
```

All profiles consume the same frame-driven native render path. Codec selection changes only after the authoritative Huff frame has been rendered and read back.

## Profile-specific encoding

### H.264 MP4

- `libx264`, medium preset, CRF 18, `yuv420p`
- existing MPEG-4 fallback when `libx264` is unavailable
- source audio encoded as AAC at 192 kbps
- even width and height required

### ProRes 422 HQ

- `prores_ks`
- profile 3
- `yuv422p10le`
- source audio encoded as 24-bit PCM
- even width and height required

### ProRes 4444

- `prores_ks`
- profile 4
- `yuv444p10le` without alpha
- `yuva444p10le` with alpha
- source audio encoded as 24-bit PCM

### FFV1 Lossless

- FFV1 level 3
- range coder, context 1, slice CRC
- intra-only (`-g 1`)
- `bgr0` without alpha or `bgra` with alpha
- source audio encoded as FLAC

### PNG sequence

- zero-based six-digit numbering: `frame_%06d.png`
- RGB or RGBA PNG
- optional retimed source audio written as `audio.wav` using 24-bit PCM
- sequence destination must not already exist

## Alpha-preserving export pass

The shared export shader now treats the second export-uniform component as an alpha policy.

Opaque export:

```text
sample output RGB
force alpha to 1.0
FIT bars are opaque black
```

Alpha-preserving export:

```text
sample output RGBA
preserve native alpha
FIT bars are transparent black
```

Still export keeps its prior opaque behavior. Alpha preservation is used only by compatible deterministic profiles.

## Output transaction model

Video exports use:

```text
hidden temporary encoded video
        ↓
optional temporary audio-mux result
        ↓
atomic-style replacement of selected destination
```

PNG sequences use:

```text
hidden temporary sequence directory
        ↓
numbered frames
        ↓
optional audio.wav
        ↓
rename to final destination directory
```

This prevents partial final outputs from masquerading as completed jobs.

## Export-job manifests

A manifest is written when the session starts and updated at terminal state.

Statuses:

```text
running
complete
cancelled
failed
```

The manifest includes the complete reproducibility metadata object plus output artifacts and error state. This is the foundation for Milestone 13's export queue.

## Live-engine behavior

Milestone 11's deterministic boundary remains unchanged:

- private exact-frame decoder;
- fixed simulation step;
- frozen parameter and external-control snapshots;
- reset procedural, history, cluster, scan, flow, and feedback state;
- live source pause and restoration;
- exclusion from recording and still export;
- Syphon and Spout hold their latest live frame.

## Scope boundaries

- File-video source only.
- No automation or keyframe replay yet.
- No queued or resumable jobs yet.
- No EXR, TIFF, HEVC, AV1, DNxHR, or user-authored FFmpeg argument profiles.
- Alpha is preserved from the final render texture; automatic subject/background key generation is not part of export.
- 4K/8K/custom exports still resample the completed internal render.
