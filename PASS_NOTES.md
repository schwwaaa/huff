# HUFF Classic Optimization Pass 27 — Pass Notes

**Date:** 2026-08-05  
**Authoritative behavioral baseline:** user-supplied Pass 22 archive  
**Immediate predecessor:** user-confirmed working Pass 26 package  
**Scope:** capability and stability instrumentation  
**User-facing effect behavior:** unchanged  
**Flow changes:** none

## Work completed

- added immutable capability profiles for `720p30`, `720p60`, `1080p30`, and `1080p60`;
- added detached light, moderate, and worst-case effect-load scene definitions;
- added low-cost counters for file/camera source replacement, readiness, errors, stale camera completions, resize requests/commits, buffer allocation passes, and buffer dimension changes;
- added profiler-gated timing for complete render cost, source synchronization, and the active validated pipeline;
- retained the existing independent decode, render, mirror, Syphon, Spout, transport, and profiler clocks;
- exposed Spout draw, CPU readback, WebSocket send, sent-frame, buffered-skip, socket-miss, and surface-rebuild telemetry;
- extended the existing backtick profiler with capability profile, uptime, render-path, source lifecycle, resize, buffer, optional heap, and Spout data;
- added a long-session test protocol and Classic-to-wgpu pipeline strategy document;
- updated Pass 25 and Pass 26 validators only so their already-proven foundations remain runnable in the presence of the declared Pass 27 instrumentation files;
- added no route, effect stage, control, preset, output clock, render surface, or native change.

## Runtime files changed

```text
src/capability-instrumentation.js  new immutable profile/scene registry and telemetry API
src/canvas.js                      lifecycle counters, profiler-gated render phases, profiler display
src/index.html                     script registration and Spout phase telemetry
```

## Frozen runtime

```text
src/effects.js
src/pipeline-runtime.js
src/presets/**
src-tauri/**
```

Flow remains exact Pass 22. The validated Pass 26 serial recipe and front-stage priority runtime remain byte-identical.

## Result

Pass 27 makes performance and lifecycle behavior observable without changing the image. The application can now be tested against repeatable capability profiles and effect-load scenes before output endurance and packaging freeze.
