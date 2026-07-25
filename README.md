# Huff Native wgpu · Milestone 09

Milestone 09 adds **native synchronized MP4 recording** to the working Milestone 08.1 engine.

Huff now has a complete live native path from media input through GPU effects to presentation, Syphon/Spout, and recording:

```text
Native video / camera + native audio
        ↓
GPU temporal history
        ↓
Huff flying-frame-buffer render graph
        ↓
Authoritative RGBA8 output texture at R: resolution
        ├── Native output window
        ├── Syphon on macOS
        ├── Spout on Windows
        └── CFR MP4 recorder
```

The HTML/CSS interface remains the control surface. Decoding, timing, history, effects, feedback, output, and recording are native Rust + wgpu systems.

## Native recorder

The recorder consumes the same authoritative image used by native presentation and external outputs. It does not record the WebView or the visible window.

Features:

- 30 or 60 FPS constant-frame-rate recording
- Current internal `R:` render resolution
- Video-audio capture
- Microphone capture for camera use
- Silent recording
- Automatic source selection
- MP4/H.264/AAC output
- Bounded latest-frame transport
- Timestamp-aligned audio chunks
- Frame duplication when the renderer or encoder is late
- Silence insertion for missing audio regions
- Safe finalization on Stop or application close
- Recording while Syphon or Spout is active
- Recording while the native presentation window is minimized

## Recording controls

Use the controls in the top bar:

1. Select `REC 30` or `REC 60`.
2. Select `AUDIO AUTO`, `VIDEO AUDIO`, `MIC`, or `SILENT`.
3. Press **Rec** and choose an MP4 destination.
4. Press **Stop** to finalize and mux the file.

`AUDIO AUTO` uses video audio for the file source and microphone audio for the camera source. When microphone capture is selected, Huff starts the current default microphone automatically.

Hover the `REC:` pill for:

- Recording path
- Resolution and CFR
- Audio source and format
- Encoded and duplicated video frames
- Skipped, rejected, and replaced submissions
- Audio samples and dropped chunks
- Current audio queue depth
- Approximate temporary-file size

## Bounded output behavior

The recorder shares Huff's three persistent asynchronous wgpu readback buffers with Syphon and Spout. A busy readback is dropped rather than queued. The recording worker stores only the latest complete pending frame and uses CFR duplication to keep time stable.

This means heavy effects can reduce unique captured frames without causing memory growth or continuously increasing output latency.

## Requirements

- FFmpeg available on `PATH`
- macOS: Metal backend recommended
- Windows: DX12 backend recommended

## Run on macOS

```bash
npm install
npm run dev:metal
```

Automatic backend selection:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Major remaining work

1. High-resolution still capture
2. Deterministic offline video export
3. Independent export resolution and codec profiles
4. Parameter-by-parameter visual/motion calibration
5. Complete MIDI/OSC mapping editors
6. Expanded routing, sequencing, automation, and project state
7. Windows Spout and installer verification

Use `TESTING.md` for the recording regression checklist and `UPGRADE-NOTES-09.md` for implementation details.
