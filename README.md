# HUFF Native wgpu · Milestone 20

Milestone 20 adds a **production-verification harness and bounded recovery workflow** on top of the complete Milestone 19 named-bus renderer. The effect graph and routing recipes are unchanged. The new work makes the final macOS and Windows test cycle repeatable, inspectable, and easier to document.

## Production Verification

Press **VERIFY** in the HUFF top bar to inspect the currently running system. The `huff-production-report/v1` report covers:

- operating system, architecture, build identity, and executable;
- wgpu backend, adapter, driver, surface, frame pacing, and output readback;
- FFmpeg, FFprobe, H.264, ProRes, FFV1, PNG, AAC, PCM, and FLAC availability;
- video decoder and watchdog status;
- camera permission, device, format, and frame delivery;
- video audio, microphone devices, buffer depth, and underflows;
- Syphon and Spout availability and active sender health;
- live recording, still export, deterministic export, and queue ownership;
- MIDI and OSC service state;
- temporary-storage write access.

Reports use PASS, WARNING, FAIL, and INFO. A report certifies only the computer and active configuration on which it was generated.

## Bounded Recovery

The verification window can request:

- **Recover Surface** — reconfigure the native wgpu output after display, focus, sleep, or minimize problems;
- **Restart Source** — rebuild the current video/audio decoders at the current position or restart the selected camera/profile;
- **Restart Outputs** — restart active Syphon and Spout senders with their current settings;
- **Recover All** — perform all applicable recovery actions.

Recovery does not reset parameters, change the routing recipe, clear feedback/history, or erase project state. Source recovery is blocked while recording or deterministic export owns the pipeline.

## Diagnostics Folder

**Export Diagnostics…** writes:

```text
README.txt
production-report.json
production-report.txt
app-info.json
parameter-state.json
routing-plan.json
state-model.json
```

The folder excludes source media and GPU pixel buffers. It may contain local paths and device names, so review it before sharing.

## Named Routing Responsibilities

HUFF retains the Milestone 19 constrained buses:

- **Clean** — normalized current source;
- **History** — bounded GPU frame ring;
- **Process** — fixed glitch/scan/Smoosh/luma/Global Mix/Flow path;
- **Field Store** — persistent flying effect memory;
- **Mask** — luma-derived region control;
- **Program** — authoritative external output;
- **Monitor** — independent local inspection.

The fixed HUFF pipeline remains the default **Classic HUFF** recipe. Recipes select only legal insertion points and output responsibilities; HUFF is not an unrestricted node graph.

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
```

On a production build machine:

```bash
npm run validate:production:strict
```

## Production Build

```bash
npm run build:metal   # macOS production target
npm run build:dx12    # Windows production target
npm run build:vulkan  # Linux/research target
```

`npm run build:production` chooses Metal on macOS, DX12 on Windows, and Vulkan elsewhere.

## Runtime Status

The user-confirmed Milestone 19 application runs. Milestone 20 is integrated as the common verification and recovery layer for the larger final test cycle. The packaging environment cannot claim actual Metal, DX12/MSVC, Syphon-client, Spout-receiver, multi-GPU, installer, or long-session success; those observations must be collected locally using `TESTING.md` and exported diagnostics folders.

## Documentation

- `MILESTONES.md` — authoritative roadmap through Milestone 21
- `PRODUCTION-VERIFICATION.md` — report, recovery, diagnostics, and platform matrix
- `UPGRADE-NOTES-20.md` — Milestone 20 implementation summary
- `TESTING.md` — cross-platform and long-session checklist
- `VALIDATION.md` — packaging and structural checks
- `ROUTING-MODEL.md` — buses, recipes, cycles, and output ownership
- `STATE-MODEL.md` — presets, snapshots, sequences, projects, and recall scopes
- `CONTROL-MAPPING.md` — MIDI/OSC mapping model
- `UPGRADE-NOTES-01..19.md` — prior milestone notes

## Next Milestone

Milestone 21 investigates lower-copy platform interoperability: shared or external GPU textures for Metal, Direct3D, and Vulkan-compatible environments without making the stable HUFF engine backend-fragile.
