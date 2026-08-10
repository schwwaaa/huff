# Testing Checklist — Pass 40W

## A. Exact reported case

Start with:
- Scan ON
- PANEL LAYOUT = FIELD
- Luma ON
- TARGET = SCAN
- fixed Layer Priority: `SCAN TOP` first
- Corrupt MODE = CONTINUOUS

Turn Corrupt ON and sweep RANDOM SPEED:

```text
1.00x
0.50x
0.15x
0.05x
0.00x
```

Expected:
- Corrupt remains visibly part of the composite at every speed;
- lowering Speed slows Corrupt evolution instead of making it appear for isolated render frames;
- changing Speed should not create one single Corrupt flash followed by Scan-only frames;
- at 0x patch placement and historical delay choice stay fixed while delayed video remains live inside patches.

## B. Fixed layer priority

Repeat with:
- `SCAN TOP`
- `CORRUPT TOP`

Expected: both are stable compositing orders in CONTINUOUS mode.

Then compare `ALTERNATE` / `PULSE ORDER`. Those intentionally change top order and
should not be judged as stable-layer modes.

## C. Luma interaction

With TARGET=SCAN, adjust:
- CLIP
- GAIN
- CLEANUP
- DENSITY
- INVERT

Expected: Scan panel participation changes while Corrupt's speed remains
controllable. The Pass 40V bounded Luma cache/readback behavior should remain.

Repeat with TARGET=CORRUPT and TARGET=COMPOSITE for routing sanity.

## D. Random vs Cluster

Clusters OFF:
- sweep RANDOM SPEED 0x -> 4x.

Clusters ON:
- sweep CLUSTER SPEED 0x -> 4x.

Expected: each control owns its respective evolution. At 0x the relevant spatial
organization holds; historical-delay choice also holds.

## E. Stress test

Use Scan FIELD + Luma + Corrupt with high:
- AMOUNT
- PATCH SIZE
- REPEATS
- Scan panel count / large Z spread

Open profiler. Record actual FPS and draw counts.

Pass 40W adds no readback/buffer, but CONTINUOUS Corrupt now draws every render
below 1x to preserve layer presence. Do not accept if this creates a new sustained
FPS regression on normal artistic settings.

## F. Explicit modes not redesigned

Test STROBE and MULTIGRAB with Scan separately. They retain their explicit update
gates in this pass. Report whether their held states need true independent layer
retention; do not conflate that result with the CONTINUOUS repair.
