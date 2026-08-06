# HUFF Classic Optimization Pass 31 — Pass Notes

## Name

**Glitch Strobe Isolation**

## Baseline

HUFF Classic Optimization Pass 30 — Constrained Pipeline Switching.

## Purpose

Add strobing only to the existing Glitch stage. The complete output is never frozen. Pipeline Luma Key continues to evaluate the current clean source every render frame, allowing held/persistent glitch material to be revealed against real-time video.

## Controls

```text
STROBE  off/on
EVERY   1–30 decoded source frames
```

With STROBE off, Glitch follows the exact Pass 30 path. With STROBE on, `applyGlitch()` runs once per decoded-frame bucket. The existing persistent composite remains available between updates.

## Explicitly live while Glitch strobes

- Pipeline Luma Key and its clean-source mask;
- Scanlines;
- Feedback;
- Flow;
- Symmetry;
- Solarize;
- Global Mix;
- media decode, transport, mirror, Syphon, and Spout.

No whole-frame LIVE/STROBE/HOLD system is included. The rejected Frame Store Pass 31 is not part of this package.
