# Huff Native Milestone 12 validation

The packaging environment did not provide Cargo, rustc, rustfmt, a standalone WGSL compiler, Metal, or DX12. Local Rust compilation and real GPU export remain required before Milestone 12 is considered runtime-proven.

## Passed static checks

- `src/app.js` passes `node --check`.
- `package.json`, `package-lock.json`, and `src-tauri/tauri.conf.json` parse as JSON.
- Package, npm lockfile, Cargo manifest, Cargo lockfile project entry, and Tauri configuration are synchronized at `0.12.0`.
- `HNW-12` is reported by application info, PNG still sidecars, and deterministic-export metadata.
- All HTML IDs are unique.
- Every JavaScript `byId()` reference resolves to an existing HTML ID.
- Every JavaScript Tauri command name is present in the Rust command surface.
- Modified Rust files pass a lexical delimiter/string/comment balance audit.
- No new Rust crate dependency was introduced.

## Profile and UI wiring checks

- The command accepts `profile` and `preserveAlpha`.
- H.264, ProRes HQ, ProRes 4444, FFV1, and PNG-sequence values map to native profile validation.
- File extensions are selected natively as `.mp4`, `.mov`, or `.mkv`; PNG sequence uses a destination directory name.
- Alpha is available only for ProRes 4444, FFV1, and PNG sequences.
- H.264 and ProRes HQ enforce even dimensions.
- The status surface reports profile, output kind, alpha, frame pattern, metadata path, manifest path, audio behavior, progress, and output size.

## Transaction and lifecycle checks

- Video outputs encode to hidden temporary files before destination replacement.
- Audio muxing writes to a second temporary file before final replacement.
- PNG frames encode to a hidden temporary directory.
- PNG sequence audio is written inside that temporary directory before final rename.
- Existing PNG-sequence destinations are rejected instead of deleted or merged.
- Cancel and renderer failure use distinct manifest terminal states.
- Running manifests are written after decoder and encoder startup.
- Complete manifests list output artifacts and rendered frame totals.
- PNG sequences receive both adjacent and internal manifest copies.
- Reproducibility metadata remains separate from the job-lifecycle manifest.

## Alpha-path checks

- The export uniform carries an explicit alpha-preservation flag.
- Still export leaves that flag disabled and keeps prior opaque behavior.
- Alpha-capable deterministic profiles preserve sampled render alpha.
- FIT bars are transparent only when alpha preservation is enabled.
- Opaque profiles force alpha to one before encoding.

## FFmpeg profile tests

A synthetic three-frame 64×64 RGBA stream was encoded through the exact profile argument families used by Milestone 12.

Observed probe results:

```text
H.264 MP4
codec_name=h264
pix_fmt=yuv420p
nb_frames=3

ProRes 422 HQ
codec_name=prores
pix_fmt=yuv422p10le
nb_frames=3

ProRes 4444 alpha
codec_name=prores
pix_fmt=yuva444p12le
nb_frames=3

FFV1 alpha
codec_name=ffv1
pix_fmt=bgra

PNG sequence alpha
frame_000000.png
frame_000001.png
frame_000002.png
```

The ProRes decoder reporting `yuva444p12le` is expected behavior for the produced 4444 stream even though the encoder input pixel format is requested as `yuva444p10le`.

## Audio-profile tests

A synthetic H.264/AAC source was muxed using each profile's audio policy.

Observed:

```text
H.264 MP4: AAC audio
ProRes MOV: pcm_s24le audio
FFV1 MKV: FLAC audio
PNG sequence: separate pcm_s24le WAV
```

All test outputs probed successfully.

## Scope not runtime-validated here

- Rust type and borrow checking
- Tauri command deserialization on target machines
- wgpu export-shader pipeline creation on Metal, Vulkan, and DX12
- actual alpha values produced by Huff's full compositor under user presets
- long-duration encoder backpressure
- 4K/8K ProRes and FFV1 disk throughput
- cancellation during operating-system-level FFmpeg stalls
- Windows MSVC and packaged-app behavior

## Required local validation

Run:

```bash
npm install
npm run dev:metal
```

Follow `TESTING.md`, beginning with short native-size H.264 and PNG-sequence jobs before testing ProRes, FFV1, alpha, 4K/8K, cancellation, and unusual source files.
