# HUFF Classic — Changelog

## Pass 38 — CORRUPT XYZ + Cluster Toggle + Master Speed — 2026-08-08

### Added
- master CORRUPT `SPEED` control;
- Patch `POSITION Z` plus `MOVE X/Y/Z`;
- Cluster `Z SPREAD` plus direct Group `MOVE X/Y/Z`;
- visible Clusters ON/OFF toggle;
- Reset XYZ action;
- reusable per-target Float32 Z data in the existing placement workspace;
- bounded Canvas2D 2.5D depth projection.

### Changed
- Cluster UI now separates Shape, XYZ and organic Dynamics;
- derived `RATE` label is now `FIELD RATE` to distinguish it from master SPEED;
- Clusters OFF explicitly means normal RANDOM Corrupt placement;
- old preset migration keeps new XYZ neutral and legacy clusters flat;
- MIDI/OSC docs describe `clusterTiles` as the visible Clusters toggle.

### Performance / stability boundary
- Pipeline Luma Key source section remains byte-identical to Pass 36/37;
- no new synchronous image readback;
- no new pixel upload path;
- no new full-resolution image surface;
- Corrupt draw-call formula remains targets × (1 + repeats);
- no FPS improvement is claimed until runtime testing.

### Protected
Flow, Luma, Feedback, Scanlines, Symmetry, Solarize, pipeline recipes, FrameRing, decoding, outputs and native Tauri code remain outside Pass 38 scope.

## Pass 37
CORRUPT semantic controls, Cluster integration, MultiGrab, stored-stencil process mask.

## Pass 36
Luma Key stability rebase and stored-stencil repair.
