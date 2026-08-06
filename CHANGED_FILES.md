# HUFF Classic Optimization Pass 27 — Changed Files

## Runtime files

```text
src/capability-instrumentation.js
src/canvas.js
src/index.html
```

### `src/capability-instrumentation.js`

- adds immutable 720p/1080p at 30/60 fps capability profiles;
- adds detached light, moderate, and worst-case scene definitions;
- owns low-cost lifecycle counters and profiler-gated phase timing;
- exposes snapshots only for diagnostics;
- adds no clock, render surface, UI control, preset field, or route.

### `src/canvas.js`

- records source replacement/readiness/error and resize/buffer counters;
- times total render, source synchronization, and active pipeline only while the profiler is visible;
- reports capability, uptime, render-path, lifecycle, optional heap, and Spout metrics;
- preserves the exact Pass 26 pipeline dispatch and exact Pass 22 Flow call.

### `src/index.html`

- loads the instrumentation before the existing pipeline/effects/canvas scripts;
- adds profiler-gated Spout draw/read/send timing;
- adds low-cost Spout sent/skip/socket/surface counters;
- changes no controls, output cadence, frame format, or native protocol.

## Validation and metadata

```text
baseline/pass26-src.sha256
baseline/pass26-src-tauri.sha256
scripts/validate-pass25.mjs
scripts/validate-pass26.mjs
scripts/validate-pass27.mjs
package.json
```

The Pass 25 and Pass 26 validators were updated only to permit the declared later instrumentation files while continuing to prove their original route and priority contracts.

## Documentation

```text
DOCUMENTATION_INDEX.md
PASS_NOTES.md
CHANGELOG.md
CHANGED_FILES.md
TESTING_CHECKLIST.md
VALIDATION_REPORT.md
CURRENT_STATUS.md
OPTIMIZATION_ROADMAP.md
GIT_COMMIT_MESSAGE.md
BASELINE_INTEGRITY_MANIFEST.md
CAPABILITY_STABILITY_INSTRUMENTATION_AUDIT.md
CLASSIC_TO_WGPU_PIPELINE_STRATEGY.md
HUFF_CLASSIC_OPTIMIZATION_PASS_27.txt
README.md
```

## Explicitly unchanged

```text
src/effects.js
src/pipeline-runtime.js
src/presets/**
src/midi/**
src/osc/**
src-tauri/**
```

Flow, effect algorithms, pipeline order, front-stage priority modes, controls, presets, media ownership, FrameRing cadence, mirror pacing, Syphon pacing, Spout pacing, and native code remain unchanged.
