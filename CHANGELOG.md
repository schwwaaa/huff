# Changelog

## Pass 40W — candidate

### Fixed
- Fixed the Scan + Luma + Corrupt CONTINUOUS layering bug where sub-1x Corrupt Speed removed Corrupt from most render frames.
- Removed Random/Cluster Speed from CONTINUOUS layer-presence gating.
- Eliminated the isolated "one Corrupt frame" behavior triggered by a speed change in CONTINUOUS mode.
- Added a speed-scaled decoded-frame source serial so historical AGE choice slows independently of layer presence.

### Behavior clarification
- `CONTINUOUS` now means Corrupt remains in the composite every render.
- `RANDOM SPEED` / `CLUSTER SPEED` now mean evolution speed.
- At 0x, patch/cluster geometry and historical delay choice lock while delayed video remains live inside the patches.
- `STROBE` / `MULTIGRAB` remain the explicit temporal hold/update modes.

### Preserved
- Pass 40V Luma TARGET and readback/cache repair.
- Pass 40U Scan FIELD/panel collage design.
- Scan SPEED and spatial controls.
- Flow exact implementation.
- merged Feedback/Persistence behavior.
- pipeline-runtime contract.
- native Tauri/decoder/output tree.

### Performance containment
- No new framebuffer.
- No new `getImageData()` / `putImageData()` path.
- No new FrameRing storage.
