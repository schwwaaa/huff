# Changelog

## Pass 39N — Corrupt Clock Separation + UI Readability — 2026-08-08
- Fixed the reported Clusters ON → OFF → RANDOM SPEED 0x regression.
- Renamed the general Corrupt master control to RANDOM SPEED and made it contextual to Random mode.
- Made CLUSTER SPEED the explicit independent clock for Cluster mode.
- Added CONTINUOUS-mode speed sample/hold: sub-1x slows visible updates and 0x holds after one established state.
- Stopped inactive mode speed from driving the active Corrupt phase/XYZ clock.
- Preserved explicit STROBE and MULTIGRAB timing.
- Converted neon-green UI text to black and moved affected dark fields to light Win95 surfaces.
- Preserved Pass 39M Feedback and `src/effects.js` exactly.
- Added no image readback/upload/full-resolution buffer.

## Pass 39M — Feedback Merge + Independent Cluster Speed — 2026-08-08
- Rebuilt Feedback as an additive merge over the accepted Pass 38 instrument.
- Preserved original FEEDBACK / PERSISTENCE / FB X/Y/Z/theta controls and Reset Motion defaults.
- Added Feedback Enable, transform-only Strobe/Interval, Restore, semantic action labels, and CLASSIC/WIDE motion range.
- Added independent Cluster Speed 0..4 and cluster clock for slow evolving through chaotic motion.
- Cluster Speed also scales low-coherence shape evolution, Kick timing, and Pulse Size breathing.
- Added no new full-resolution buffer or pixel readback/upload.

## Historical passes

### Pass 39R — Feedback Recovery — 2026-08-08

### Restored
- original FEEDBACK 0–3 control;
- original PERSISTENCE 0–10 control;
- original FB X/Y/Z/θ ranges;
- original Reset Motion defaults (1, 1, 1.000, 0.01);
- independent persistent-decay stage from Pass 38.

### Added
- optional `FB STROBE` transform-only gate;
- decoded-frame `INTERVAL` 1–30;
- optional `RESTORE` 0–100% clean-source overlay.

### Rejected from Pass 39
- replacement RETURN control;
- replacement DECAY control;
- new Feedback ON state;
- strobe-gated persistence;
- changed motion ranges/defaults.

### Performance boundary
- no new image readbacks/uploads;
- no new full-resolution buffer;
- RESTORE adds a Canvas draw only when nonzero.

---

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