# HUFF Native wgpu · Milestone 21

Milestone 21 completes the planned native-engine roadmap with a **lower-copy platform interoperability research harness**. HUFF does not claim that zero-copy output is complete. Instead, it reports the existing GPU→CPU→platform-texture path, estimates its bandwidth, benchmarks bounded host-memory copying, prepares a typed external-output transport seam, and documents realistic Metal, Direct3D, and Vulkan candidates with explicit risks and fallback requirements.

The complete Milestone 20 production-verification and recovery workflow remains available.

## INTEROP Lab

Press **INTEROP** in the top bar.

### Analyze Current Path

The `huff-interop-report/v1` report covers:

- operating system, architecture, wgpu backend, adapter, driver, and surface format;
- current render dimensions and output-rate reference;
- bytes per RGBA frame;
- GPU readback, host repack, and platform upload stages;
- estimated MiB/s for each full-frame stage;
- current Syphon or Spout state;
- Metal/Syphon direct texture and IOSurface candidates;
- D3D12 shared-handle and D3D11On12 Spout candidates;
- Vulkan external-memory research constraints;
- the recommended next proof-of-concept step for the current platform.

### CPU Copy Probe

Runs a bounded host-memory memcpy baseline and estimates the cost of copying one full current-resolution RGBA frame.

It does **not** measure GPU readback, map latency, synchronization, Metal/DX upload, or receiver latency.

### Export Report

Writes both JSON and human-readable text:

```text
huff-interop-report.json
huff-interop-report.txt
```

The Production Verification diagnostics folder also contains:

```text
interop-report.json
interop-report.txt
```

## Current Production Transport

Syphon and Spout still use the safe, bounded path:

```text
Program wgpu texture
  → triple-buffered MAP_READ
  → one shared dense CPU RGBA frame
  → Metal/Spout texture upload
```

Native texture sharing remains disabled. The current implementation favors correctness, bounded pressure, and automatic frame dropping over render-thread blocking.

## Typed External-Output Boundary

Syphon and Spout now accept `ExternalOutputFrame`. Its only production variant is `CpuRgba(OutputFrame)`.

This creates a controlled extension point for a later feature-gated Metal, D3D, or Vulkan token without redesigning the worker API. No backend token has been enabled yet.

## Production Verification

Press **VERIFY** to inspect:

- GPU, surface, frame pacing, and readback health;
- FFmpeg, FFprobe, and production encoders;
- video, camera, and audio systems;
- Syphon and Spout sender state;
- recording/export ownership;
- MIDI and OSC services;
- temporary storage.

Bounded recovery remains available for the surface, source, and active platform outputs.

## Development Run

```bash
npm install
npm run dev:metal   # macOS
npm run dev:dx12    # Windows
npm run dev:vulkan  # Linux/research
```

FFmpeg and FFprobe must be on `PATH` for file playback and production export.

## Validation

```bash
npm run validate:parity
npm run validate:control-maps
npm run validate:state-model
npm run validate:routing
npm run validate:production
npm run validate:interop
```

On a configured build computer:

```bash
npm run validate:production:strict
```

## Production Build

```bash
npm run build:metal
npm run build:dx12
npm run build:vulkan
```

`npm run build:production` chooses Metal on macOS, DX12 on Windows, and Vulkan elsewhere.

## Runtime Status

The user-confirmed Milestone 20 application runs. Milestone 21 preserves the existing output implementation while adding observation, reporting, and architectural preparation. The packaging environment cannot certify native Metal/D3D shared textures, receiver compatibility, multi-GPU synchronization, or long-session performance. Those remain optional future proof-of-concept work and local refinement tests.

## Documentation

- `MILESTONES.md` — authoritative Milestones 01–21 record
- `INTEROP-RESEARCH.md` — current path, candidates, risks, and proof criteria
- `PRODUCTION-VERIFICATION.md` — runtime checks, recovery, and diagnostics
- `UPGRADE-NOTES-21.md` — Milestone 21 change summary
- `TESTING.md` — focused Milestone 21 test sequence
- `VALIDATION.md` — structural and packaging checks
- `ROUTING-MODEL.md` — named buses and recipes
- `STATE-MODEL.md` — presets, snapshots, sequences, projects, and scopes
- `CONTROL-MAPPING.md` — MIDI/OSC mapping model
- `UPGRADE-NOTES-01..20.md` — prior milestone notes

## Full Retrospective

The completed 21-milestone architecture and migration retrospective is available in:

- `FULL-RETROSPECTIVE.md`
- `MILESTONE-QUICK-REFERENCE.md`
- `retrospective-assets/HUFF-DEVELOPMENT-GRAPH.png`
- `retrospective-assets/HUFF-ARCHITECTURE-MIGRATION.png`

The retrospective distinguishes integrated architecture, provisional features, research-only work, and the remaining testing/calibration/pruning cycle.
