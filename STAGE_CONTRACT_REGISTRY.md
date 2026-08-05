# HUFF Classic — Stage Contract Registry

**Pass:** HUFF Classic Optimization Pass 24  
**Baseline:** Authoritative user-supplied Pass 22 runtime  
**Runtime execution change:** None  
**Flow status:** Frozen and byte-for-byte unchanged

## Purpose

Pass 24 converts the Pass 23 pipeline audit into immutable, machine-readable stage metadata without loading that metadata into the application runtime.

The registry is located at:

```text
pipeline/stage-contracts.mjs
```

It is the foundation for Pass 25, where the existing fixed route can be represented by a validated serial recipe. In Pass 24, `src/`, `src-tauri/`, controls, presets, clocks, media paths, and output paths remain exactly Pass 22.

## Registered resources

```text
video-source
gCur
gBuf
gScratch
FrameRing
main-canvas
```

The registry does not invent any new buffer or resource.

## Registered zones

```text
source-sync
persistent-decay
front-overlays
global-mix-before
persistent-transform
global-mix-after
primary-transform
global-mix-afterflow
secondary-transform
color-finish
global-mix-final
presentation
```

These zones describe the existing Pass 22 serial route. They are not user-facing patch points and do not create arbitrary routing.

## Registered stage contracts

| Stage | Class | Reads | Writes | Scratch / swap | Legal zone |
|---|---|---|---|---|---|
| Source synchronization | source-sync | video source | `gCur` | none | source-sync |
| Persistent decay | in-place-persistence | `gBuf` | `gBuf` | none | persistent-decay |
| Glitch | clean-overlay | `gCur`, `FrameRing` | `gBuf` | none | front-overlays |
| Pipeline Luma Key | clean-overlay | `gCur` | `gBuf` | none | front-overlays |
| Scanlines | clean-overlay | `gCur` | `gBuf` | none | front-overlays |
| Global Mix | clean-overlay | `gCur` | `gBuf` | none | four existing named slots |
| Feedback | snapshot-transform | `gBuf` | `gScratch`, `gBuf` | snapshot; clears destination | persistent-transform |
| Flow | ping-pong-transform | `gBuf`, `FrameRing` | `gScratch` | swaps `gBuf` / `gScratch` | primary-transform |
| Symmetry | ping-pong-transform | `gBuf` | `gScratch` | swaps `gBuf` / `gScratch` | secondary-transform |
| Solarize | in-place-readback | `gBuf` | `gBuf` | bounded internal readback cache | color-finish |
| Presentation | presentation | `gCur`, `gBuf` | main canvas | none | presentation |

## Contract fields

Each stage declares:

```text
id
label
stage class
legal zones
read resources
write resources
scratch resources
whether it clears its destination
whether it swaps buffers
whether it is stateful
whether it requires clean source
whether it requires FrameRing
whether routing is presettable
whether routing is live-safe
its default order
whether it is frozen
```

This metadata makes hidden ownership constraints explicit before any runtime dispatch is refactored.

## Existing front-stage priority

Pass 22 treats Glitch plus Pipeline Luma Key as one ordering group and Scanlines as the second group.

```text
scan priority:
Glitch/Luma -> Scanlines

glitch priority:
Scanlines -> Glitch/Luma

neutral:
alternate by render-frame parity

pulse:
alternate by Layer Pulse Speed
```

Pass 24 records this behavior without changing it.

## Flow freeze

The Flow contract is deliberately restrictive:

```text
class: ping-pong-transform
zone: primary-transform
reads: gBuf + FrameRing
writes: gScratch
buffer swap: required
routing presettable: no
live-safe routing: no
frozen: yes
```

Pass 24 does not load the registry, dispatch Flow through it, change Flow's source, alter its controls, or modify its implementation.

## Validation boundary

The Pass 24 validator proves:

- all contracts and nested resource arrays are immutable;
- every stage ID is unique;
- every declared zone and resource exists;
- the 12-zone route skeleton matches Pass 22;
- Feedback preserves snapshot-before-clear ownership;
- Flow preserves its input, output, FrameRing dependency, and swap contract;
- Global Mix retains only its four existing named positions;
- front-stage priority metadata matches the current implementation;
- current `src/` and `src-tauri/` match complete Pass 22 file manifests;
- the registry is not imported by the runtime;
- rejected post-Pass-22 Flow code and controls remain absent.

## What this pass does not do

```text
No runtime recipe execution
No new routing control
No stage reordering
No additional full-resolution buffer
No parallel branch
No arbitrary cycle
No preset schema change
No Flow change
No output change
```

Pass 25 may begin executing the exact fixed route through a validated serial recipe only after preserving all Pass 22 dispatch and buffer-swap invariants.
