# HUFF Classic Optimization Roadmap — After Pass 26

## Authoritative rule

Pass 22 remains the behavioral baseline. Pass 25 is the confirmed-working modular-runtime checkpoint. Pass 26 formalizes only the priority behavior already present in Pass 22.

Flow remains frozen throughout the infrastructure sequence.

## Pass 27 — Capability and Stability Instrumentation

- define 720p30, 720p60, 1080p30, and 1080p60 test profiles;
- define light, moderate, and worst-case effect scenes;
- measure decode, render, mirror, and Syphon/Spout phases separately;
- add source replacement and resize counters;
- add long-session resource and state telemetry;
- avoid new per-frame allocation and avoid visual-effect changes;
- make no Flow changes.

## Pass 28 — Output Endurance and Shutdown

- Syphon reconnect and soak validation;
- Spout validation;
- mirror backpressure endurance;
- deterministic source/output cleanup;
- process-exit and orphan-process verification;
- make no Flow changes.

## Pass 29 — Platform Packaging Freeze

- macOS universal framework verification;
- signing and notarization preparation;
- Windows installer validation;
- Linux codec, WebKit, GStreamer, and package matrix;
- final capability and known-issues documentation.

## Deferred feature work

New effects, Flow changes, pixel sorting, datamosh expansion, and broader routing remain deferred until the infrastructure and release sequence is stable.
