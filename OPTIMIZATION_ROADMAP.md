# HUFF Classic Optimization Roadmap — After Pass 27

## Authoritative rule

Pass 22 remains the behavioral baseline. Pass 26 is the confirmed-working modular-runtime checkpoint. Pass 27 adds measurement only.

Flow remains frozen throughout Passes 28–29.

## Pass 28 — Output Endurance and Shutdown

- Syphon start/stop/reconnect and receiver detach/reattach testing;
- bootstrap-to-full-rate transition soak;
- Spout start/stop/reconnect and backpressure testing;
- mirror receiver reconnect and latest-frame-wins endurance;
- deterministic source, Worker, WebSocket, timer, and native-output cleanup;
- process-exit and orphan-process verification;
- no effect or Flow changes.

## Pass 29 — Platform Packaging Freeze

- macOS universal framework verification;
- signing and notarization preparation;
- Windows installer and Spout package validation;
- Linux codec, WebKit, GStreamer, ALSA, and package matrix;
- final 720p/1080p capability matrix;
- release-known-issues and platform documentation;
- final Classic infrastructure freeze.

## Post-infrastructure feature sequence

### Pass 30 — Constrained Pipeline Switching Foundation

- expose a small validated recipe list rather than a node graph;
- preserve serial `gBuf` / `gScratch` ownership;
- reject routes requiring undeclared buffers or unsafe cycles;
- retain the original route as the default and compatibility fallback.

### Pass 31+ — Paired-Down Effect Augmentation

- add only effects that fit the Classic resource and stability budget;
- validate each effect in every supported recipe;
- keep the free Classic feature set coherent and intentionally limited;
- reserve broad modular routing, high-resolution processing, and full experimentation for HUFF HD/wgpu.
