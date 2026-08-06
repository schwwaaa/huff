# HUFF Classic — Stage Contract Registry

**Current pass:** HUFF Classic Optimization Pass 26  
**Behavioral baseline:** authoritative user-supplied Pass 22 runtime  
**Accepted serial recipes:** one  
**Flow status:** frozen

## Purpose

The registry at `pipeline/stage-contracts.mjs` describes the existing HUFF Classic resources, serial zones, stage ownership, and front-stage priority relationship. It does not define an unrestricted graph.

## Registered resources

```text
video-source
gCur
gBuf
gScratch
FrameRing
main-canvas
```

## Registered serial zones

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

## Stage ownership summary

| Stage | Reads | Writes | Scratch / swap | Legal zone |
|---|---|---|---|---|
| Source sync | video source | `gCur` | none | source-sync |
| Persistent decay | `gBuf` | `gBuf` | none | persistent-decay |
| Glitch | `gCur`, `FrameRing` | `gBuf` | none | front-overlays |
| Pipeline Luma Key | `gCur` | `gBuf` | none | front-overlays |
| Scanlines | `gCur` | `gBuf` | none | front-overlays |
| Global Mix | `gCur` | `gBuf` | none | four existing slots |
| Feedback | `gBuf` | `gScratch`, `gBuf` | snapshot; no swap | persistent-transform |
| Flow | `gBuf`, `FrameRing` | `gScratch` | swap | primary-transform |
| Symmetry | `gBuf` | `gScratch` | swap | secondary-transform |
| Solarize | `gBuf` | `gBuf` | bounded readback cache | color-finish |
| Presentation | `gCur`, `gBuf` | main canvas | none | presentation |

## Front-stage priority contract

Pass 26 formalizes the relationship already present in Pass 22:

```text
Glitch/Luma group:
- Glitch
- Pipeline Luma Key

Scanline group:
- Scanlines
```

Existing modes:

```text
SCAN TOP:    Glitch/Luma → Scanlines
GLITCH TOP:  Scanlines → Glitch/Luma
NEUTRAL:     alternate by render-frame parity
PULSE:       alternate by Layer Pulse Speed
```

The source and browser contracts also record the existing state keys, `frameCount` timing source, SCAN fallback, 60fps basis, `0.1` minimum pulse speed, and one-frame minimum interval.

## Runtime status

- Pass 25 loads and validates the fixed 12-zone serial recipe.
- Pass 26 compiles the two existing front-stage groups and resolves only the four existing modes.
- No route UI, arbitrary movement, parallel branch, or new buffer exists.

## Flow freeze

```text
zone: primary-transform
reads: gBuf + FrameRing
writes: gScratch
swap: required
routing presettable: no
live-safe routing: no
implementation: exact Pass 22
```
