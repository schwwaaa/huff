# HUFF Classic Optimization Roadmap — After Pass 25

## Authoritative rule

Pass 22 remains the behavioral baseline. Pass 25 changes only how the existing route is validated and dispatched.

Flow remains frozen throughout the infrastructure sequence.

## Pass 26 — Existing Front-Stage Priority Formalization

- formalize the current Glitch/Luma and Scanline ordering group inside the validated recipe system;
- preserve `scan`, `glitch`, `neutral`, and `pulse` behavior exactly;
- preserve all defaults and existing presets;
- keep route selection limited to the behavior already present in Pass 22;
- reject positions requiring parallel branches or another full-resolution buffer;
- make no Flow changes.

## Pass 27 — Capability and Stability Instrumentation

- 720p30 / 720p60 / 1080p30 / 1080p60 matrix;
- light, moderate, and worst-case effect scenes;
- decode, render, mirror, and Syphon/Spout phase measurements;
- source replacement and resize diagnostics;
- long-session state and resource telemetry;
- no visual-effect redesign.

## Pass 28 — Output Endurance and Shutdown

- Syphon reconnect and soak tests;
- Spout validation;
- mirror backpressure endurance;
- deterministic source/output cleanup;
- process-exit verification;
- no Flow changes.

## Pass 29 — Platform Packaging Freeze

- macOS universal framework verification;
- signing and notarization;
- Windows installer validation;
- Linux codec and package matrix;
- final known-issues and capability documentation.

## Deferred feature work

New effects, Flow changes, pixel sorting, datamosh expansion, and broader routing remain deferred until the infrastructure and release sequence is stable.
