# Changelog

## Pass 40U — candidate

### Added
- `PANEL LAYOUT`: `BANDS / FIELD`.
- FIELD `SPREAD X`, `SPREAD Y`, `SPREAD Z`.
- FIELD `SIZE VAR`.
- FIELD `DRIFT` and `DEPTH DRIFT` using the existing Scan motion phases.
- `Zero Field` diagnostic/reset action.
- deterministic Panel Field simulation and validator.

### Preserved
- original `ScanlineBandWorkspace` band generation;
- existing Scanlines SPEED as the only Scan motion-rate control;
- 40T panel-aware general ZOOM;
- existing Shift/Skew/Focus/Drift/Roll/Angle/Spin controls;
- Corrupt, Cluster clocks, Feedback, Persistence, Luma, Flow and native runtime.

### Not added
- new framebuffer;
- image readback/upload;
- FrameRing source;
- filter mode;
- stencil mode;
- new temporal update policy.
