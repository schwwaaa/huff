# Scanlines Pass 40U — Panel Field Audit

## Intent

Pass 40U does **not** redefine Scanlines. It adds one alternate organization of
the same live-video panels created by the existing Scanlines / panel-zoom path.
The user can return to `BANDS` at any time.

The design target is a multi-layer collage instrument: panels should be able to
occupy different X/Y positions, apparent depths, and sizes, while the existing
Flow, Feedback, Persistence, Shift, Skew, Roll, Drift, Angle, Spin and general
XYZ controls remain independent composition tools.

## Layout contract

### BANDS

- default mode;
- same band generator;
- same source sampling;
- same general panel-aware Zoom from Pass 40T;
- no FIELD offsets or per-panel depth/size variation.

### FIELD

FIELD begins *after* the existing `ScanlineBandWorkspace` generates each band.
It never replaces that generator.

For each generated panel, deterministic seeds produce:

- an X anchor;
- a Y anchor;
- an apparent-Z anchor;
- a size variation;
- two motion phases.

The seeds use a small integer hash and do not call `random()` or `noise()`, so
changing Scan layout does not consume shared p5 randomness and cannot alter
Corrupt or another effect through random-state side effects.

## Controls

### SPREAD X / SPREAD Y

Move individual panels away from their existing band lanes. At zero, there is
no added FIELD translation. At larger values, panels distribute across the
local Scan coordinate plane and can overlap.

### SPREAD Z

Varies each panel's **local Zoom** around the general Scan `ZOOM`. This is
Canvas2D apparent depth, not a 3D surface. Because Pass 40T already unfolds a
band toward source-aspect panel geometry as Zoom leaves 1x, Z spread can create
foreground / midground / background panels rather than only differently-sized
thin strips.

### SIZE VAR

Adds independent scale variation after apparent Z. This prevents FIELD from
reading as a uniform tile array. It is separate from Z so depth organization and
graphic-size heterogeneity can be controlled independently.

### DRIFT

Adds per-panel X/Y movement around the deterministic FIELD anchors. It uses the
existing Scan phases (`nPhaseScanX/Y`), therefore the established Scan `SPEED`
control is still the only motion-rate control.

### DEPTH DRIFT

Animates apparent per-panel Z around each deterministic depth anchor using the
same Scan phases. `SPEED = 0` therefore freezes it.

### ZERO FIELD

Sets every FIELD amount to zero while leaving `PANEL LAYOUT = FIELD`. This is a
diagnostic and performance comparison state: a zeroed FIELD should collapse
onto the BANDS geometry rather than becoming a different effect.

## What Pass 40U deliberately does not add

- filters / per-panel color modes;
- stencil write/protect;
- temporal age / FrameRing sampling;
- strobe / sample-and-hold;
- an additional speed clock;
- actual 3D geometry;
- lighting / shadows;
- a second persistent framebuffer.

Those ideas remain separate review topics. The point of this pass is to learn
whether *spatial organization alone* is the missing counterweight for Scan.

## Performance investigation

Maximum panel count is inherited from the existing Scan control. FIELD adds
constant arithmetic per panel but no additional `drawImage` count: each accepted
band still maps to one image draw. No CPU pixel readback/upload is added.

The likely cost increase relative to BANDS is raster area when Z spread / Zoom
create very large destination rectangles, not an increase in the number of
render passes.

Stress test:

1. Scan FIELD, many bands, SPREAD Z high, general ZOOM > 1;
2. compare Luma OFF vs LIVE vs STENCIL;
3. watch existing scan draw telemetry and Luma read/xform/upload profiler lines.
