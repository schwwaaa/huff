# Current Status

## Product boundary

HUFF Classic remains the legacy **Tauri v1 + p5.js / Canvas2D** instrument and is intentionally **1080p-class maximum**. HUFF HD remains the separate native/wgpu 4K+ path.

## Accepted baseline

**Pass 41A — Playback Fidelity / 1080p Classic boundary** is runtime-tested and accepted on the development machine.

## Current candidate

**Pass 42 — Solarize Luma Quantize augmentation.**

Pass 42 is built directly on the accepted Pass 41A tree. It adds one new Solarize algorithm without changing the established THRESHOLD Solarize, Flow, Feedback, Scan, Corrupt, Luma Key, pipeline recipes, decode path, or native Tauri runtime.

## Solarize contract

- MODE defaults to **THRESHOLD** for complete preset/session compatibility.
- THRESHOLD keeps the existing THRESH / AMOUNT / SOL R/G/B implementation.
- **LUMA QUANTIZE** adds LEVEL / SOFT / INVERT and shares AMOUNT as wet/dry strength.
- LEVEL 1–99 maps from fine to coarse luma quantisation; 99% produces two luma levels.
- LEVEL 100 removes the luminance component, leaving the chroma residual subject to RGB gamut clipping.
- SOFT 0 gives hard contours; SOFT 100 restores unquantized luminance (INVERT remains independently active).
- No second readback or full-resolution buffer was added. Both Solarize modes share the existing max-640px scratch, adaptive load guard, one getImageData(), one putImageData(), and one presentation copy.

## Protected

- accepted Pass 41A playback/source/history behavior;
- Pass 40W Corrupt / Scan / Luma handoff;
- Scan FIELD / panel collage;
- Feedback / Persistence;
- frozen Flow;
- pipeline runtime and recipes;
- capability instrumentation;
- native Tauri outputs/runtime.

## Acceptance status

Static validation complete. Runtime visual/performance acceptance on the development machine is still required before Pass 42 becomes the new authoritative Classic baseline.
