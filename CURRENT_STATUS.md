# HUFF Classic — Current Status After Optimization Pass 28

## Confirmed lineage

- Pass 22 remains the authoritative visual and effect baseline.
- Passes 25–26 established the validated fixed serial recipe and existing front-stage priority behavior.
- Pass 27 added capability and stability instrumentation.
- Pass 28 hardens output reconnect, start/stop, and application shutdown lifecycle.

## Current infrastructure

```text
validated fixed 12-zone serial recipe
formalized front-stage priority
720p/1080p capability instrumentation
bounded mirror/Syphon/Spout output paths
owned reconnect timers and animation pumps
generation-guarded Syphon/Spout start and stop
deterministic browser output cleanup
idempotent native MIDI/OSC/Syphon/Spout shutdown
no new render buffer
no Flow changes
```

## Remaining infrastructure pass

One infrastructure pass remains:

```text
Pass 29 — Platform Packaging Freeze
```

## After Pass 29

```text
Pass 30 — Constrained Pipeline Switching Foundation
Pass 31+ — Paired-down Classic effect augmentation
HUFF HD — full typed wgpu modular routing and expanded effects
```
