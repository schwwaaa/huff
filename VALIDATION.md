# Milestone 08 static validation

The packaging environment does not include Cargo, rustc, rustfmt, a WGSL compiler, macOS Metal/Syphon runtime access, or a Windows MSVC/Spout runtime. Native compilation and receiver testing must occur on the target development machines.

## Checks completed

- `src/app.js` passes `node --check`.
- All JSON files parse successfully.
- The HTML control document has no duplicate IDs.
- Package, npm lockfile, Cargo manifest, Cargo lockfile project entry, and Tauri configuration are synchronized at `0.8.0`.
- The Cargo lockfile includes the required `cmake 0.1.54` package entry.
- Modified Rust and build-script files pass comment/string-aware delimiter-balance checks.
- WGSL uses bind groups `0–3` only.
- WGSL defines `fs_output` and `fs_surface`; the previous direct `fs_present` entry is absent.
- The authoritative output texture is renderable, sampleable, and `COPY_SRC` capable.
- The wgpu readback bridge has exactly three fixed staging slots.
- Readback mappings are asynchronous and completed through nonblocking device polling.
- Busy readback slots cause frame drops rather than queue allocation.
- Completed output pixel memory is shared between Syphon and Spout through `Arc<[u8]>`.
- Syphon and Spout each use a one-frame latest-value worker boundary.
- Syphon reuses one persistent Metal texture at the active dimensions.
- Start commands validate output dimensions against the current internal render resolution.
- Render-resolution rebuilding recreates readback resources and attempts to restart active outputs.
- External output rendering can continue without an available presentation surface.
- Tauri command registration includes Syphon and Spout start/stop commands.
- The controls UI exposes start/stop, FPS, status, published/replaced counts, upload time, frame age, and shared readback diagnostics.
- `Syphon.framework` is present in the project and referenced by the Tauri macOS bundle configuration.
- The Spout CMake bridge, C++ source, and Spout SDK sources are present.
- Temporary `.bak` source files were removed from the deliverable.
- Shell scripts pass `bash -n` where applicable.

## Runtime validation still required

### macOS

- Rust and WGSL compilation with wgpu 29.0.4.
- `npm run dev:metal` regression testing.
- Syphon framework loading in development.
- Reception in a Syphon client.
- Correct orientation and color handling.
- Long-duration 30/60 FPS operation.
- `.app` bundle framework placement and runtime loading.

### Windows

- MSVC/CMake compilation of the Spout bridge.
- Import-library and DLL linking.
- D3D11 Spout sender initialization.
- Reception in a Spout client.
- Runtime DLL placement during development.
- DLL inclusion in the packaged application/installer.

### Cross-platform

- No regression in video/audio decoder watchdog behavior.
- No regression in effects, feedback, source switching, presets, MIDI, or OSC.
- Stable memory over long output sessions.
- Readback pending count remains bounded at three.
- Busy drops increase instead of latency when output cannot keep up.
