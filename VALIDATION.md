# Huff Native Milestone 09 validation

The packaging environment does not include Cargo, rustc, Metal, DX12, or native Tauri runtime support. Rust compilation and real-time recording remain local validation requirements.

## Completed static checks

- JavaScript passes `node --check`.
- `package.json`, `package-lock.json`, and `tauri.conf.json` parse successfully.
- HTML IDs are unique and all Milestone 09 recording controls are present.
- Package, npm lockfile, Cargo manifest, Cargo lockfile project entry, and Tauri configuration are synchronized at `0.9.0`.
- Tauri command registration includes native recording start and stop.
- The recorder module is registered and managed as shared application state.
- Video, microphone audio, renderer readback, and UI telemetry are wired to the recording state.
- Video submission uses one replaceable latest-frame slot rather than an unbounded queue.
- Audio submission uses a fixed-capacity channel with dropped-chunk telemetry.
- The wgpu readback path remains fixed at three persistent buffers shared by Syphon, Spout, and recording.
- Recording keeps the native renderer active while its presentation surface is minimized or temporarily unavailable.
- Internal render dimensions are held stable while recording or finalizing, then restored to the selected render mode.
- Active recording is finalized on application close.
- Modified Rust and WGSL source passes delimiter and stale-reference audits.

## FFmpeg pipeline validation

A synthetic command-line test completed successfully in this environment:

1. Generated raw RGBA frames were encoded as CFR H.264 MP4.
2. Generated interleaved `f32le` audio was encoded as PCM WAV.
3. Video and audio were muxed into an AAC MP4.
4. `ffprobe` confirmed a readable video stream, audio stream, duration, and frame rate.

This validates the command family used by the recorder, but not Huff's Rust pipe ownership or live A/V timing.

## Required local validation

- `cargo`/Tauri compilation on macOS and Windows.
- 30 and 60 FPS recording from the real wgpu output.
- Video-audio and microphone capture.
- Pause, seek, playback-rate, loop, and decoder-recovery behavior.
- Recording while Syphon or Spout is active.
- Minimized/occluded-window recording.
- Long-duration memory, drift, and finalization tests.
- Packaged-app FFmpeg discovery and permissions.
