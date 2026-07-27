# HUFF Production Verification and Recovery

**Build:** `0.21.0 / HNW-21`  
**Schema:** `huff-production-report/v1`

Milestone 20 turns production testing into a repeatable application workflow. It does not claim that one computer can certify every supported platform. Instead, the same checks, report format, recovery actions, diagnostics bundle, and build commands can be run on each macOS and Windows test machine.

## In-app verification

Press **VERIFY** in the top bar and choose **Run Check**. HUFF inspects the state that is active at that moment:

- operating system, architecture, build type, and executable;
- selected wgpu backend, adapter, driver, surface, frame progression, and readback health;
- FFmpeg, FFprobe, and the encoders required by the Milestone 12 export profiles;
- video-decoder progress and watchdog activity;
- camera permission, selected device, frame delivery, and capture errors;
- video audio, microphone devices, buffer depth, and underflows;
- Syphon or Spout availability and active sender health;
- recording, still export, deterministic export, and queue ownership;
- MIDI and OSC service state;
- writable temporary storage.

A report may contain four result types:

- **PASS** — the running condition meets the automated check;
- **WARNING** — the system can continue, but the condition needs review;
- **FAIL** — a required runtime or production dependency is unavailable;
- **INFO** — the subsystem is optional or currently idle.

An overall PASS applies only to the machine and active configuration on which it was generated. A macOS report does not verify Windows, and an inactive Spout or Syphon sender does not prove receiver compatibility.

## Recovery controls

Recovery is explicit and bounded. It does not reset parameters, clear feedback, alter the routing recipe, or discard project state.

### Recover Surface

Requests reconfiguration of the native wgpu output surface. Use it after an output window has remained black following minimization, display changes, sleep, or focus transitions.

### Restart Source

Refreshes camera and microphone devices, then restarts the currently authoritative source:

- video resumes by rebuilding the video and source-audio decoders at the current position;
- camera capture is stopped and restarted with its current device and profile.

Source recovery is disabled while live recording is active/finalizing or while deterministic export owns the private render graph.

### Restart Outputs

Restarts only active Syphon and Spout senders using their current frame-rate cap and, for Spout, the selected adapter. Inactive outputs are left inactive.

### Recover All

Runs the surface, source, and active-output recovery operations together. It remains nondestructive to parameters and persistent GPU image state.

## Diagnostics bundle

**Export Diagnostics…** creates a timestamped folder containing:

```text
README.txt
production-report.json
production-report.txt
interop-report.json
interop-report.txt
app-info.json
parameter-state.json
routing-plan.json
state-model.json
```

The interoperability files describe the current bounded readback/upload path and platform candidates; they do not indicate that native texture sharing is enabled.

The bundle intentionally excludes source media and GPU pixel buffers. It may include local file paths, device names, adapter names, and controller configuration. Review it before sharing publicly.

## Repository checks

Run the structural production check:

```bash
npm run validate:production
```

This validates build/version synchronization, platform assets, command wiring, documents, Node, optional Rust tools, FFmpeg/FFprobe, and production encoders. Missing external tools are warnings in normal mode because packaging environments may intentionally omit them.

For a build machine, use strict mode:

```bash
npm run validate:production:strict
```

Strict mode treats unavailable Rust tools, FFmpeg, FFprobe, and production encoders as failures.

## Production builds

The production build wrapper runs strict validation before Tauri packaging and selects the expected backend:

```bash
# macOS
npm run build:metal

# Windows
npm run build:dx12

# Linux/research
npm run build:vulkan
```

`npm run build:production` selects Metal on macOS, DX12 on Windows, and Vulkan elsewhere.

## Verification matrix

A release candidate should collect at least one diagnostics folder and the manual results from `TESTING.md` on every production target.

| Target | Required backend | Required output test | Required package test |
|---|---|---|---|
| macOS Apple Silicon | Metal | Syphon receiver | `.app` / DMG launch outside dev |
| macOS Intel, when supported | Metal | Syphon receiver | `.app` / DMG launch outside dev |
| Windows 10/11 | DX12 | Spout receiver on selected GPU | MSI/NSIS launch outside dev |
| Linux research target | Vulkan | window/recording unless another bridge is added | distributable chosen for that target |

The report records automated facts. The matrix records observed behavior. Both are needed before a build is called production-verified.
