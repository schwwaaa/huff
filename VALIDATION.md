# Huff Native Milestone 10 validation

The packaging environment does not include Cargo, rustc, a WGSL compiler, Metal, or DX12. Local Tauri compilation and real GPU export remain required before Milestone 10 is considered runtime-proven.

## Completed static checks

A 47-check source audit passed:

- `src/app.js` passes `node --check`.
- `package.json`, `package-lock.json`, and `src-tauri/tauri.conf.json` parse successfully.
- HTML IDs are unique.
- All seven still-export controls are present.
- Package, npm lockfile, Cargo manifest, Cargo lockfile project entry, and Tauri configuration are synchronized at `0.10.0`.
- Rust and WGSL files pass comment/string-aware delimiter checks.
- `mod export;`, managed export state, Tauri command registration, renderer command wiring, shader inclusion, and UI invocation are present.
- The export shader uses bind groups `0` and `1` only.
- Rust and WGSL `ExportUniforms` layouts agree at 32 bytes.
- One pending request and one in-flight GPU capture bound the still-capture path.
- Export dimensions are bounded by the adapter limit, an 8192-per-axis ceiling, and a 35-megapixel ceiling.
- No Rust dependency was added relative to Milestone 09.
- The UI completion counter is initialized and export/record actions are mutually disabled while active.

## FFmpeg PNG pipeline validation

A synthetic test used the same command family as `export.rs`:

1. Generated a dense 64×32 RGBA frame.
2. Piped it to FFmpeg as raw `rgba` video.
3. Encoded one PNG frame with compression level 6.
4. Used `ffprobe` to verify:
   - codec: PNG
   - dimensions: 64×32
   - pixel format: RGBA

This validates the encoder command and raw-frame format, but not Rust pipe ownership or GPU readback at runtime.

## Architecture checks

- Still capture samples Huff's authoritative RGBA8 output texture.
- A separate export render target is allocated for the requested dimensions.
- Fit, Crop, and Stretch happen in the dedicated export shader.
- Smooth and Crisp use the existing linear and nearest samplers.
- The export path does not resize live render targets, rebuild temporal history, or clear feedback.
- GPU readback is asynchronous and the PNG encoder runs on a separate bounded worker.
- A sidecar records source identity, transport state, live render size, export settings, parameter revision, and canonical parameter values.

## Required local validation

- `npm run dev:metal` compilation on macOS.
- `npm run dev:dx12` compilation on Windows.
- Native-size PNG export.
- 1080p, 4K, and 8K PNG export.
- Fit, Crop, and Stretch with mismatched aspect ratios.
- Smooth versus Crisp comparison.
- Export while the native output window is minimized.
- Confirm history count, feedback state, video transport, and audio continue unchanged.
- Confirm recording and export cannot start simultaneously.
- Confirm PNG orientation, color, alpha behavior, and sidecar contents.
- Confirm graceful errors for over-budget dimensions and unavailable FFmpeg.

## Scope boundary

Milestone 10 performs a high-quality GPU resample of the current authoritative Huff image. It does **not** independently re-run the complete effect graph at 4K or 8K. True frame-driven, high-resolution re-rendering belongs to the deterministic video-export milestone.
