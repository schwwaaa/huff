# HUFF Classic Optimization Pass 27 — Validation Report

## Scope

Pass 27 adds capability and stability instrumentation only. No effect behavior, route, control, preset, output pacing, render surface, or native code is changed.

## Instrumentation contract validation

`scripts/validate-pass27.mjs` executes the browser instrumentation in an isolated VM and confirms:

- the four profile definitions and frame budgets;
- the three detached effect-load scene definitions;
- frozen public registries;
- exact profile selection for 720p30 and 1080p60;
- lifecycle counter behavior;
- profiler-gated timing behavior;
- render total and maximum accumulation;
- source/pipeline phase accumulation;
- render-path counting;
- source/canvas state snapshots;
- uptime and optional heap snapshots.

## Runtime preservation

```text
src/effects.js
2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44

src/pipeline-runtime.js
5124aa948fcf556ce5b00c8da1bfef8a86da850d278e680cc9a4e0a8ea3634b9
```

The validator also confirms:

- every source file outside `canvas.js`, `index.html`, and the declared new instrumentation file matches the Pass 26 manifest;
- the complete native tree matches the Pass 26 manifest;
- no third p5 Graphics surface exists;
- no new animation or polling clock exists in the instrumentation;
- no closure or object-spread allocation was introduced inside `draw()`;
- rejected Flow Melt and Sort-Mosh code remains absent.

## Validators completed

```text
Pass 9
Pass 10
Pass 11
Pass 13S
Pass 14
Pass 15
Pass 16
Pass 16S
Pass 17
Pass 18
Pass 19
Pass 20
Pass 21
Pass 22
Pass 25
Pass 26
Pass 27
```

The Pass 25 and Pass 26 validators were made forward-compatible with the declared Pass 27 instrumentation files while retaining their original contract checks.

## Static validation

The final package is checked for:

- project-owned JavaScript syntax with `node --check`;
- inline HTML script syntax;
- JSON parsing;
- TOML parsing;
- shell syntax with `bash -n`;
- Pass 26 source/native manifest constraints;
- universal `x86_64 + arm64` Syphon framework binary;
- ZIP integrity after packaging.

## Native validation

`cargo check` was not run because Cargo/Rust are unavailable in this environment. The native tree is unchanged and hash-verified.

## Runtime claims

No FPS increase or capability tier is claimed. Runtime tests on the target machines must establish the final 720p/1080p matrix and output endurance.
