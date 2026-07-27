# Huff Native wgpu — Milestone 09

Milestone 09 adds native constant-frame-rate recording to the working Milestone 08.1 engine. The live render graph, Syphon, Spout, decoder watchdogs, and effect behavior are unchanged.

## Recording architecture

```text
Authoritative RGBA8 wgpu output
        ↓
Shared three-slot asynchronous readback
        ↓
Latest complete recording frame
        ↓
CFR timeline scheduler
        ├── encode newest frame
        └── repeat previous frame when rendering is late
        ↓
FFmpeg video encoder

Native audio callback
        ↓
Bounded timestamped audio queue
        ↓
FFmpeg PCM audio writer
        ↓
AAC mux into final MP4
```

The recorder never adds an unbounded frame queue to the renderer. If GPU readback or encoding cannot keep up, the newest available image replaces stale pending work. The CFR scheduler repeats the previous frame where needed so output duration remains aligned to the recording clock.

## Controls

The top transport bar now includes:

- `REC 30` / `REC 60`
- `AUDIO AUTO`, `VIDEO AUDIO`, `MIC`, or `SILENT`
- Start and Stop buttons
- A live `REC:` status pill

`AUDIO AUTO` selects video audio while a video is authoritative and microphone audio while the camera is authoritative. A microphone stream is started automatically when required.

## Output format

The initial production format is:

- MP4 container
- H.264 through `libx264` when available
- MPEG-4 Part 2 fallback when `libx264` is unavailable
- AAC at 192 kb/s when audio is enabled
- `yuv420p` output for broad playback compatibility

## Synchronization

Audio chunks and GPU frames are timestamped against the same recording start instant. Missing audio regions are padded with silence. Overlapping late chunks are trimmed. Video frames are assigned to a deterministic 30 or 60 FPS CFR timeline.

## Safety and diagnostics

- Recording continues when the native output window is minimized.
- Syphon and Spout can remain active while recording.
- Render-resolution Apply is disabled during a recording.
- Closing Huff finalizes the active recording before exit.
- Hover `REC:` to inspect frame duplication, skipped submissions, audio queue depth, dropped chunks, and approximate temporary-file size.
- Temporary audio/video files are removed after a successful mux. They remain available for recovery if final muxing fails.

## Not included yet

- Independent recording resolution
- HEVC, ProRes, FFV1, image sequences, or user-selectable codec profiles
- Offline/faster-than-real-time rendering
- High-resolution still export
- Mixed video-audio plus microphone recording

Those belong to the export milestone rather than the first reliable live recorder.
