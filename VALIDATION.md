# Huff Native Milestone 13 validation

The packaging environment does not provide Cargo, rustc, rustfmt, Metal, DX12, or a native Tauri runtime. Rust type/borrow checking and real GPU queue execution therefore remain required on the target machine before Milestone 13 is considered fully runtime-proven.

## Passed static checks

- `src/app.js` passes `node --check` under Node.js 22.
- `package.json`, `package-lock.json`, and `src-tauri/tauri.conf.json` parse as JSON.
- Package, npm lockfile, Cargo manifest, Cargo lockfile project entry, and Tauri configuration are synchronized at `0.13.0`.
- The native build identifier is synchronized at `HNW-13` for application info, still metadata, deterministic metadata, queue jobs, and lifecycle manifests.
- All 294 HTML IDs are unique.
- All 108 static JavaScript `byId()` references resolve to existing HTML IDs.
- All 40 JavaScript Tauri command calls resolve to commands registered in `generate_handler!`.
- Queue commands, queue controls, persistence paths, queue states, recovery paths, and descriptor naming are present and connected.
- Modified Rust files pass a lexical comment/string/delimiter balance audit.
- No Rust dependency or build-dependency was added.

## Queue architecture checks

Source inspection confirms that Milestone 13 provides:

- one sequential background coordinator;
- immutable queued copies of source/export configuration, metadata, deterministic seed, and canonical parameter state;
- stable queue job IDs propagated into per-attempt lifecycle manifests;
- global queue persistence in the application-data directory;
- adjacent `.huff-queue-job.json` descriptors;
- approximately one-second active-progress persistence;
- immediate terminal-state persistence;
- pause/resume without interrupting the active job;
- waiting-job cancellation and active-job cancellation;
- queued-job reordering;
- retry from frame zero for failed, cancelled, and interrupted jobs;
- repeat-to-new-destination behavior;
- terminal history removal and clear-finished behavior;
- startup recovery for `starting` and `running` jobs;
- unreadable/newer queue-state backup rather than startup failure;
- source-missing and unexpected-destination failure handling;
- duplicate nonterminal destination prevention, including retry;
- waiting while live recording finalizes or still export is active.

## Transaction and recovery checks

Milestone 12's transactional exporter remains unchanged:

- video outputs encode to temporary files before final rename;
- PNG sequences encode into a temporary directory before final rename;
- audio muxing uses a separate temporary artifact;
- incomplete temporary artifacts are not treated as committed destinations;
- cancellation, failure, and completion retain distinct lifecycle states.

Milestone 13 recovery uses that final-destination boundary. A persisted `starting` or `running` job is recovered as complete only when its final transactional destination exists; otherwise it becomes interrupted and the queue starts paused.

## Export-profile regression

FFmpeg 7.1.3 encoded a synthetic three-frame 64×64 RGBA stream through the same profile argument families used by the deterministic exporter.

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
3 numbered frames
```

The ProRes decoder reporting `yuva444p12le` is expected for the produced 4444 stream even though encoder input is requested as `yuva444p10le`.

## Scope not runtime-validated here

- Rust compilation and borrow checking
- Tauri state injection and command deserialization
- queue coordinator behavior under real renderer timing
- app-data path behavior in packaged macOS and Windows builds
- forced termination at every transaction boundary
- long queues and long-duration exports
- simultaneous UI polling and queue mutation under load
- Metal, Vulkan, and DX12 wgpu behavior
- Windows MSVC packaging and filesystem replacement semantics

## Required local validation

Run:

```bash
npm install
npm run dev:metal
```

Follow `TESTING.md`. Begin with three short native-size H.264 jobs, then verify pause/resume, reordering, waiting-job cancellation, active cancellation, retry, repeat, and application-restart recovery before beginning long 4K/8K profile tests.
