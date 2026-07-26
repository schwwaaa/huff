# HUFF Native wgpu · Milestone 19

Milestone 19 introduces a **constrained named-bus routing model** while preserving the complete fixed HUFF render recipe. The goal is not a general node graph. It is to make source ownership, temporal writes, clean restoration, Flow placement, Program output, and local monitoring understandable and serializable.

## Named routing responsibilities

HUFF now exposes these architectural buses:

- **Clean** — normalized current source;
- **History** — bounded GPU frame ring;
- **Process** — the fixed glitch/scan/Smoosh/luma/Global Mix/Flow path;
- **Field Store** — persistent flying effect memory;
- **Mask** — luma-derived region control;
- **Program** — authoritative external output;
- **Monitor** — independent local native-window inspection.

The fixed HUFF pipeline remains the default **Classic HUFF** recipe.

## Program and Monitor selection

Program can commit:

- the normal Program Composite;
- the Clean source directly;
- the raw persistent Field Store.

Syphon, Spout, recording, still export, and deterministic export always consume Program.

Monitor affects only the native output window. It can inspect Program, Clean, or Field Store without changing external output. This is intentionally a small preview/auxiliary function rather than a full broadcast switcher.

## Routing recipes

The Routing panel includes validated recipes for:

- Classic HUFF;
- Glitch → Flow → Scan;
- Scan → Flow → Glitch;
- isolated Smoosh layers;
- Clean Program bypass;
- Program output with Field Store monitoring.

Recipes update canonical parameters and are recorded by the automation system when automation recording is active.

## State integration

The canonical registry now contains **100 parameters**. The two new parameters are:

```text
routing.program_bus
routing.monitor_bus
```

They are classified in the Routing state domain. Presets, snapshots, and projects capture or recall them only when Routing scope is enabled. Older `huff-state/v1` files remain compatible and use safe defaults when these fields are absent.

## Legal temporal cycles

HUFF still permits recursion only through explicit image memory:

```text
Field Store → Process → Field Store
History capture → older History read
```

Same-frame arbitrary texture cycles remain invalid.

## Route-plan export

Press **Export Plan** in the Routing panel to save the active `huff-routing/v1` topology as JSON. The plan records bus ownership, active edges, Program/Monitor selections, Flow target, layer priority, Global Mix position, legal cycles, and warnings.

## Run

```bash
npm install
npm run dev:metal
```

Automatic backend selection:

```bash
npm run dev
```

Windows DX12:

```powershell
npm run dev:dx12
```

FFmpeg must be on `PATH` for file playback, recording, and encoded export.

## Validation

```bash
npm run validate:parity
npm run validate:control-maps
npm run validate:state-model
npm run validate:routing
```

## Runtime status

The user-confirmed Milestone 18 baseline runs. Milestone 19 is integrated on top of that baseline and should be tested locally for Program selection, Monitor isolation, external-output ownership, state recall, automation recording, and route-plan export. The broader effect and export refinement cycle remains intentionally deferred until all planned milestones are present.

## Documentation

- `MILESTONES.md` — authoritative complete roadmap
- `ROUTING-MODEL.md` — buses, recipes, cycles, and output ownership
- `STATE-MODEL.md` — presets, snapshots, sequences, projects, and recall scopes
- `UPGRADE-NOTES-19.md` — implementation summary
- `TESTING.md` — focused Milestone 19 test cycle
- `VALIDATION.md` — packaging-environment checks
- `CONTROL-MAPPING.md` — MIDI/OSC mapping model
- `UPGRADE-NOTES-01..18.md` — prior milestone notes

## Next milestone

Milestone 20 is the broad cross-platform production-verification cycle covering Metal, DX12/MSVC, Spout, Syphon, multi-GPU behavior, long sessions, installers, restart recovery, codec availability, and interaction among the completed systems.
