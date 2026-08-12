# HUFF Classic Pass 47 — LIVE Luma GPU Acceleration Audit

## Problem

Target-machine isolation showed that enabling Luma Key alone in `COMPOSITE + LIVE`
could move HUFF Classic from approximately 60 FPS to approximately 52 FPS. That
made Luma itself a meaningful frame-budget consumer before adding Solarize,
Feedback, Scanlines, or other stages.

## Previous design

The accepted LIVE key path was already bounded and cached, but every newly
decoded source frame still required:

```text
clean source
  -> bounded Canvas2D copy
  -> getImageData()
  -> CPU luminance + key alpha work
  -> putImageData()
  -> scaled keyed patch -> gBuf
```

The expensive part is not merely the arithmetic. `getImageData()` is a synchronous
CPU-visible readback boundary and `putImageData()` returns modified pixels to the
Canvas pipeline.

## Pass 47 design

For `TARGET=COMPOSITE`, `KEY SRC=LIVE`, Pass 47 attempts:

```text
clean source
  -> bounded staging surface
  -> WebGL1 luma/key fragment
  -> bounded keyed patch cache
  -> scaled keyed patch -> gBuf
```

No CPU pixel readback occurs on this successful branch.

### Alpha parity gate

An earlier GPU-Luma prototype was correctly rejected because its matte math
matched but the final Canvas2D composite did not: alpha/premultiplication semantics
changed RGB during the handoff.

Pass 47 does not assume one WebGL alpha convention. On first LIVE-Luma use it:

1. builds a tiny deterministic source/background test;
2. creates the established CPU keyed-patch reference;
3. renders candidate WebGL alpha conventions;
4. composites each through Canvas2D using X-FADE and SOFT ADD;
5. reads those tiny calibration outputs once;
6. selects GPU Luma only when max byte error <= 2 and mean error <= 0.75.

The normal per-frame path performs no calibration readback.

The existing premultiplied Solarize WebGL context is tested first. A second
Luma-only `premultipliedAlpha=false` context is allocated only if needed.

## CPU fallback

The exact accepted CPU path remains. Pass 47 also improves it by compiling
Clip/Gain/Invert/Cleanup/Density into a 256-entry final luma-to-alpha LUT.
A Node microbenchmark over a 640x360 luma plane measured the key-alpha mapping
portion at approximately 2.03 ms/iteration with direct math versus 0.39 ms with
the LUT (~5.25x faster for that isolated arithmetic). This is not a claim about
whole-app FPS because Canvas readback/upload remains the larger CPU-fallback cost.

## Scratch budget repair

The previous rule limited only width to 640. A tall image could therefore produce
workspaces such as 640x847 (>542k pixels), more than 2.3x the 640x360 budget.

Pass 47 uses both maximum long edge and maximum pixel count:

- COMPOSITE: 640 long edge / ~230,400 pixels;
- object-target Luma: 320 long edge / ~57,600 pixels.

This preserves 1920x1080 -> 640x360 while making 1080x1920 -> 360x640.

## Protected boundaries

No frame cadence manipulation was introduced. Feedback/Persistence, Flow,
Solarize transforms, factory presets, native output runtime, and the serial
pipeline recipe remain protected.
