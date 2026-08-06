# HUFF Classic Optimization Roadmap — After Pass 28

## Authoritative rule

Pass 22 remains the visual/behavioral baseline. Flow remains frozen during infrastructure work.

## Pass 29 — Platform Packaging Freeze

- macOS universal framework verification;
- final bundled-framework path and architecture checks;
- signing/notarization preparation;
- Windows installer and Spout package validation;
- Linux WebKit/GStreamer/ALSA/codec package matrix;
- 720p/1080p capability matrix template;
- release known-issues document;
- final Classic infrastructure freeze.

## Post-infrastructure sequence

### Pass 30 — Constrained Pipeline Switching Foundation

Classic will expose a small set of validated serial recipes rather than a general node graph.

Requirements:

- retain current route as the default compatibility recipe;
- use existing `gBuf` / `gScratch` ping-pong ownership;
- validate stage contracts before use;
- reject undeclared cycles and routes requiring hidden buffers;
- expose only routes that remain stable under the Classic Canvas2D budget.

### Pass 31+ — Paired-down Effect Augmentation

- add a deliberately limited set of effects;
- validate every effect in every supported Classic recipe;
- keep free Classic coherent and stable;
- defer high-resolution, parallel branches, typed temporal stores, broad routing, and full experimentation to HUFF HD/wgpu.

## HUFF HD / wgpu direction

HUFF Classic acts as the stable proving ground for instrument behavior. HUFF HD can then expand accepted ideas into:

- typed video/mask/key ports;
- explicit history, field, trail, and feedback stores;
- parallel branches;
- program, preview, and auxiliary buses;
- legal temporal cycles;
- per-route GPU-resource budgeting;
- high-resolution output and full modular routing.
