# Huff Native Milestone 11 validation

The packaging environment does not include Cargo, rustc, rustfmt, a standalone WGSL compiler, Metal, or DX12. Local Tauri compilation and real GPU export are therefore still required before Milestone 11 is considered runtime-proven.

## Passed static checks

- `src/app.js` passes `node --check`.
- `package.json`, `package-lock.json`, and `src-tauri/tauri.conf.json` parse as JSON.
- Package, npm lockfile, Cargo manifest, Cargo lockfile project entry, and Tauri configuration are synchronized at `0.11.0`.
- `HNW-11` is reported by application info, PNG sidecars, and deterministic-export sidecars.
- All 286 HTML IDs are unique.
- Every JavaScript `byId()` reference resolves to an existing HTML ID.
- Every JavaScript Tauri command name is present in the Rust command surface.
- The new `offline_export` module is declared in the crate root.
- `OfflineExportHandle` is managed by Tauri and included in application status.
- Start and cancel commands are registered in the invoke handler.
- Renderer start wiring includes the offline handle plus native video and video-audio control handles.
- Recording and PNG commands reject deterministic-export overlap.
- Renderer-side still capture also rejects a deterministic-export race.
- Source render selection is forced to the private offline video frame while the session is active.
- Canonical parameters are frozen from the same snapshot written to the sidecar.
- MIDI, OSC, audio-analysis, and gesture snapshots are frozen for the session.
- The fixed simulation clock replaces wall time for shader time, cluster motion, scan motion, and temporal-history capture.
- History capture uses deterministic seconds with an epsilon at exact frame-rate boundaries.
- Procedural frame count, p5 noise phases, cluster physics, history, and feedback are reset at export start.
- Clear, Flow Fire, and target-affecting resize operations are ignored or deferred during export.
- Deferred output-window dimensions are applied after returning to live mode.
- Offline rendering bypasses real-time sleep pacing.
- Minimized/occluded output does not prevent offscreen export rendering.
- Syphon, Spout, recording, and live-output readback targets are excluded from the offline frame copy.
- The decoder queue is bounded to three source frames.
- The GPU readback uses one persistent texture, buffer, and CPU pixel allocation.
- Each export step performs one decoder receive, one native render, one GPU readback, and one encoder write.
- Export dimensions are bounded to 8192 pixels per axis and 35 megapixels.
- MP4 dimensions are required/normalized to even values for H.264 compatibility.
- Export FPS is restricted to 24, 30, or 60.
- Duration is bounded to 0.1–3600 seconds.
- Non-looping exports are checked against remaining playback-rate-adjusted source duration.
- The decoder has a ten-second liveness timeout.
- Decoder/encoder startup failures terminate already-created child processes.
- Cancel terminates child processes and removes temporary files.
- Existing destination files remain untouched until a successful final replacement.
- Audio muxing writes to a separate temporary file before replacing the destination.
- Source audio uses playback-rate-aware `atempo`, volume, silence padding, AAC encoding, and exact duration trimming.
- Sidecar naming and metadata fields are present.
- Modified Rust files pass a lexical delimiter/string/comment balance audit.
- No new Rust crate dependency was introduced.

## FFmpeg pipeline test

A synthetic 320×180, 30 FPS H.264/AAC source was generated locally. The intended Milestone 11 command sequence was then exercised at 1.5× playback rate:

1. FFmpeg produced a fixed 24 FPS raw source-frame stream.
2. Forty-eight frames were encoded to a temporary H.264 MP4.
3. Source audio was trimmed, retimed with `atempo=1.5`, padded/trimmed to two seconds, encoded to AAC, and muxed through a temporary final file.
4. `ffprobe` reported:

```text
avg_frame_rate=24/1
nb_read_frames=48
video duration=2.000000
audio duration=2.000000
```

The test also confirmed that a request extending beyond a non-looping source naturally produces fewer frames at FFmpeg level, matching the need for the preflight duration rejection implemented in Rust.

## Scope not runtime-validated here

- Rust type checking and borrow checking
- wgpu pipeline creation on Metal, Vulkan, or DX12
- repeated mapping of the persistent export readback buffer
- exact source-frame output for VFR, rotated, or unusual-codec files
- long-duration encoder backpressure behavior
- 4K and 8K memory/performance on the target GPU
- audio synchronization with unusual source timestamp offsets
- cancel behavior during an operating-system-level FFmpeg stall
- restoration of the live decoder/audio source on the target machine
- Windows MSVC and packaged-app behavior

## Required local validation

Run:

```bash
npm install
npm run dev:metal
```

Then follow `TESTING.md`, starting with a short native-size 30 FPS file export before testing 4K/8K, looping, playback-rate changes, cancellation, and minimized-window operation.
