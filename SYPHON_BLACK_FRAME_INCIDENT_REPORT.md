# Syphon Black-Frame Incident Report

## Symptom

- HUFF reported that Syphon started.
- OBS discovered the `huff` Syphon server.
- The OBS source remained black.
- No useful frames appeared to advance.

## What did not change in Pass 16

A direct Pass 15-to-Pass 16 comparison showed no changes to:

- the inline Syphon sender;
- `syphon-stream-worker.js`;
- the Rust WebSocket relay;
- `src-tauri/src/syphon.rs`;
- `Syphon.framework`.

Pass 16 changed Solarize processing and profiler instrumentation only. The black output therefore exposed a latent transport-startup weakness rather than a direct Solarize-to-Syphon edit.

## Deadlock-capable startup sequence

The old browser sender returned before capture whenever `receiverConnected` was false. The native `push_pixels()` function independently returned before upload whenever `SyphonMetalServer.hasClients` was false.

```text
Server starts
  ↓
Receiver discovers server
  ↓
No frame has been published yet
  ↓
Browser waits for hasClients
  ↓
Native waits for hasClients
  ↓
Zero frames are published
  ↓
Receiver remains black
```

This policy is efficient after a receiver is fully attached, but unsafe during discovery/attachment.

## Corrected policy

```text
No confirmed receiver
  → publish one bootstrap frame per second

Confirmed receiver
  → publish at the selected Syphon FPS

Stopped Syphon
  → publish nothing
```

Only one browser frame may remain in flight. Socket backpressure still drops work rather than building a latency queue.

## Why the repair is bounded

At no receiver, the hotfix permits only one capture/upload per second. It does not restore continuous no-client readback. Once a client attaches, the existing selected frame-rate cap applies.

## Remaining uncertainty

The macOS/Tauri/Syphon runtime is unavailable in the build environment. Static inspection verifies the gating repair and preserves the existing native upload path, but OBS output must be confirmed on the target Mac.
