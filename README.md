# Huff Native wgpu · Milestone 10

Milestone 10 adds **independent high-resolution PNG still export** to the native Huff engine.

The application now includes:

- native FFmpeg video and audio playback;
- native camera capture;
- wgpu temporal history, flying feedback, glitch, clusters, scanlines, Smoosh, Luma Key, Global Mix, and Flow;
- Syphon output on macOS;
- SpoutDX output path on Windows;
- synchronized 30/60 FPS MP4 recording;
- native, 1080p, 4K, 8K, and custom PNG still export.

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

FFmpeg must be available on `PATH` for file decoding, recording, and PNG encoding.

## Still export

The top bar contains:

```text
PNG NATIVE / 1080P / 4K / 8K / CUSTOM
SMOOTH / CRISP
FIT / CROP / STRETCH
PNG
EXPORT status
```

The export is generated from Huff's authoritative native output texture through a separate GPU pass. Export dimensions do not alter the live render size shown by `R:`.

```text
Live render graph
      ↓
Authoritative RGBA8 output
      ├── native window
      ├── Syphon / Spout
      ├── recording
      └── independent still scaling pass
                ↓
             PNG export
```

### What high resolution means here

A 4K or 8K still is a high-resolution GPU resample of the completed current Huff image. It preserves the exact current live composition and temporal buffer state without rebuilding those systems. It does not yet re-run tile generation, flow, history, and feedback at an independent 8K working resolution.

## Sidecar

Every PNG also writes:

```text
<image-name>.huff-export.json
```

The sidecar records the source, transport position, render/export dimensions, export policy, parameter revision, and canonical parameter values.

## Documentation

- `UPGRADE-NOTES-10.md` — implementation details and scope
- `TESTING.md` — runtime checklist
- `MIGRATION-STATUS.md` — completed and remaining native systems
- `VALIDATION.md` — static package checks

## Next milestone

The next structural milestone is a frame-driven deterministic video exporter. It should own decoding, render time, frame stepping, output resolution, and encoding rather than relying on the real-time recording clock.
