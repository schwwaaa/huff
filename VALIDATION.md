# Milestone 07.2 static validation

The packaging environment does not include Cargo, rustc, rustfmt, or a WGSL compiler. Native compilation and Metal/Vulkan/DX12 runtime validation must occur on the development machine.

Static checks completed:

- `src/app.js` passes `node --check`.
- All project JSON files parse successfully.
- Package, Cargo, Tauri, npm lockfile, and Cargo lockfile project versions are synchronized at `0.7.2`.
- Modified Rust files have balanced braces, parentheses, and brackets after comment/string-aware structural scanning.
- `VideoStatus` and `VideoAudioInfo` defaults initialize all newly exposed recovery counters.
- Long-running video playback no longer performs a blocking pipe read in the playback worker; reads are isolated in `huff-video-pipe-reader`.
- Long-running audio playback no longer performs a blocking pipe read in the decoder worker; reads are isolated in `huff-audio-pipe-reader`.
- Video and audio reader channels are bounded.
- Full video-frame buffers and audio chunk buffers are returned through bounded recycle channels.
- Decoder workers use three-second liveness timeouts.
- Stalled child processes are killed and waited before restart.
- Video restart resumes from the last confirmed native position.
- Audio restart estimates source position from samples actually consumed by the CPAL output callback and the active playback rate.
- Unexpected early video EOF is recoverable when the reported file duration has not been reached.
- Existing WGSL shaders and render pipelines are unchanged from Milestone 07.1.
- The controls UI exposes decoder stall and watchdog-restart diagnostics without altering parameter mappings.

Runtime validation still required:

- Rust compilation.
- Long-duration playback with the reported source file.
- Automatic recovery after a real or induced FFmpeg pipe stall.
- Audio/video synchronization after recovery.
- Play, Pause, Seek, Rate, Loop, Camera switching, and file replacement after recovery.
- Confirmation that visual effects and GPU performance remain unchanged.
