# HUFF Classic Optimization Pass 28 — Pass Notes

## Name

**Output Endurance and Shutdown**

## Scope

Pass 28 hardens the lifecycle of:

- canvas mirror sender and receiver;
- Syphon browser transport;
- Spout browser transport;
- native MIDI and OSC resources;
- final two-window Tauri shutdown.

## Runtime changes

```text
src/canvas.js
src/canvas.html
src/index.html
src-tauri/src/main.rs
```

## Preserved boundary

```text
src/effects.js                 unchanged
src/pipeline-runtime.js        unchanged
src/capability-instrumentation.js unchanged
src/presets/**                 unchanged
Flow                           unchanged
pipeline route                 unchanged
render buffer count            unchanged
```

## Main implementation points

- Owned mirror reconnect timeout and animation-frame pump.
- Canvas viewer socket-generation guard for asynchronous frame decode.
- Syphon and Spout start/stop generation guards.
- Duplicate start/stop operation prevention.
- Deterministic Worker, WebSocket, timer, staging-surface, and cached-reference cleanup.
- Shared `pagehide` and `beforeunload` cleanup paths.
- Idempotent native shutdown for MIDI, OSC, Syphon, and Spout.

## Validation status

Deterministic validation is complete. Runtime Syphon, Spout, reconnect, soak, and process-exit tests remain for target machines.
