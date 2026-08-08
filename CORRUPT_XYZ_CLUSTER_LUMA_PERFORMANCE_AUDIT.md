# HUFF Classic Pass 38 — CORRUPT XYZ, Cluster, and Luma Performance Audit

**Date:** 2026-08-08  
**Baseline:** runtime-positive Pass 37, with the Cluster section specifically under refinement.  
**Scope:** add explicit CORRUPT master speed, direct XYZ placement/movement, a true Clusters toggle, 2.5D cluster depth, and investigate the existing Luma/Corrupt FPS interaction without changing the accepted Pass 36 Luma implementation.

## 1. Operator requirement

The acceptance rule remains:

> A visible control should produce an understandable visual action when the control is moved.

Pass 38 therefore separates three concepts that were previously easy to confuse:

```text
SPEED
master rate for autonomous CORRUPT movement

FIELD RATE
base rate of the existing internal noise/motion field

STROBE / MULTIGRAB TIMING
explicit decoded-frame update policy; intentionally NOT scaled by SPEED
```

This keeps temporal sampling legible while giving CORRUPT a performance-speed macro.

---

## 2. Historical/manual grounding

### Fairlight CVI / Video Entertainer

The Fairlight lineage groups controls according to operator meaning such as timing and movement rather than exposing implementation variables as unrelated controls. This is the main influence on Pass 38's explicit `POSITION X/Y/Z`, `MOVE X/Y/Z`, and master `SPEED` vocabulary.

Fairlight is **not** being cited as a literal 3D source for this implementation. Its contribution is semantic/direct performance control and clear separation of time from movement.

### Snell & Wilcox Magic DaVE

Magic DaVE's documented feature set includes a 3D DVE with position, size, rotation, perspective and zoom, and its models treat image geometry as a structured part of the effect rather than as an unrelated filter.

Pass 38 borrows that geometric idea only at the interaction level. HUFF Classic remains Canvas2D and therefore implements a bounded **2.5D projection**, not a true 3D DVE.

### Grass Valley INDIGO

INDIGO's SD key transform controls explicitly provide:

```text
3D Rotation: X / Y / Z
3D Position: X / Y / Z
```

This is the clearest historical precedent in the supplied resources for an operator-facing XYZ position vocabulary.

Pass 38 uses the simpler subset that makes sense for CORRUPT now:

```text
POSITION X / Y / Z
MOVE X / Y / Z
```

No 3D rotation system is introduced in Classic.

---

## 3. General CORRUPT XYZ

### Static placement

```text
POSITION X
existing destination X offset, renamed for direct meaning

POSITION Y
existing destination Y offset, renamed for direct meaning

POSITION Z
new simulated depth position
```

`POSITION Z = 0` is exact neutral scale.

Negative Z:

```text
patches shrink
patch centers project toward the frame center
```

Positive Z:

```text
patches enlarge
patch centers project away from the frame center
```

The transform is:

```text
zScale = 2^(0.75 * z)
```

with Z bounded before projection.

### Continuous movement

```text
MOVE X   pixels / second
MOVE Y   pixels / second
MOVE Z   normalized depth / second
```

X/Y wrap through the frame. Z reflects at near/far limits.

These controls alter destination geometry only. The historical source-region selection remains based on the existing bounded FrameRing.

### Performance boundary

XYZ adds scalar math and uses the existing `drawImage` calls. It does **not** add:

- a framebuffer;
- a p5 Graphics surface;
- `getImageData()`;
- `putImageData()`;
- another history store;
- another draw pass.

Positive Z can make individual scaled `drawImage` operations cover more pixels, so it is not free. Runtime FPS must still be measured.

---

## 4. Master SPEED

Pass 38 adds:

```text
SPEED 0.00x ... 4.00x
```

It scales:

- CORRUPT internal X/Y noise phase;
- autonomous target reconfiguration cadence;
- general MOVE X/Y/Z;
- direct Group MOVE X/Y/Z;
- organic cluster steering/travel cadence;
- group breathing timing;
- group kick timing.

It intentionally does **not** alter:

- STROBE `INTERVAL`;
- MULTIGRAB `HOLD`;
- MULTIGRAB `LIVE`;
- source video playback speed.

This follows the design rule that image-motion rate and decoded-frame capture policy are separate actions.

`SPEED = 0` freezes autonomous CORRUPT spatial motion. It does not promise to freeze the source/history contents themselves; newly decoded video may continue entering the existing FrameRing according to the established engine.

---

## 5. Clusters are now an explicit toggle

Pass 37's layout selector is replaced in the visible UI by:

```text
CLUSTERS
ON / OFF
```

```text
OFF  -> RANDOM placement
ON   -> grouped persistent bodies
```

The old `corruptDistribution` select remains hidden as a compatibility alias. Existing `clusterTiles` MIDI/OSC mappings now map naturally to the visible toggle.

When Clusters is OFF, all group-only controls are hidden.

---

## 6. Cluster XYZ distinction

Pass 38 gives grouped bodies a geometric identity that RANDOM placement does not have.

### Z SPREAD

Each persistent group receives a stable normalized base-Z coordinate. `Z SPREAD` determines how strongly those groups separate through the simulated Z plane.

```text
Z SPREAD 0
all groups remain on the same visual plane

Z SPREAD 1
full per-group near/far separation
```

### GROUP MOVE X / Y / Z

Direct group-center motion is separate from organic cluster physics.

```text
MOVE X / Y
translates group centers directly

MOVE Z
moves all group bodies through near/far depth
```

`MOVE Z` remains visible even when `Z SPREAD = 0`; Z SPREAD controls separation among groups, while MOVE Z controls direct travel.

### GROUP DYNAMICS

Existing cluster physics remain available as a separate optional character layer:

```text
ORGANIC SPEED
TURN RATE
WANDER
SPEED VAR
KICK
MOMENTUM
EDGE
```

This is deliberate. Pass 38 does not delete the old behavior before runtime evaluation determines which controls deserve to survive.

---

## 7. Luma FPS investigation

The accepted Pass 36/37 Pipeline Luma implementation is byte-identical in Pass 38.

### LIVE Luma hot path

At a 1920x1080 program frame, the Luma workspace is bounded to approximately:

```text
640 x 360 = 230,400 pixels
RGBA working image = 921,600 bytes ~= 0.879 MiB
```

On a genuinely new decoded source frame or key-parameter change, LIVE Luma performs:

```text
1 bounded source copy
1 synchronous getImageData readback
1 CPU luminance/alpha transform
1 putImageData upload
1 keyed presentation draw
```

On render frames that share the same decoded source frame and unchanged key parameters, it reuses the cached keyed patch rather than repeating the readback.

For a 30 fps source, the raw readback + upload traffic alone is roughly:

```text
0.879 MiB x 2 x 30 ~= 52.7 MiB/s
```

before Canvas copies, synchronization, compositing and CPU transform cost are counted.

### STENCIL Luma hot path

After a successful one-shot capture:

```text
stored 8-bit luminance plane
+ cached mask
+ Canvas destination-in
```

Normal STENCIL playback performs no source `getImageData()` readback. This makes STENCIL the naturally cheaper key source after capture, although runtime measurement remains authoritative.

### CORRUPT interaction

CORRUPT's dominant cost is usually draw-call count:

```text
targets x (1 + REPEATS)
```

Pass 38 does not change that multiplication and XYZ does not add another draw pass.

The heavy combination remains:

```text
many CORRUPT drawImage calls
+
LIVE Luma synchronous bounded readback / transform / upload
```

on the same main/render thread.

The existing backtick profiler already exposes both sides:

```text
luma read
luma xform
luma upload
luma pres
luma cache

gl tiles
gl draws
```

### Pass 38 performance policy

No Luma cadence is reduced, no quality is silently lowered, and no new Luma optimization is introduced in this pass. The point is to prevent the XYZ/Cluster work from making the known readback pressure worse while preserving a clean measurement baseline.

Validation confirms:

- Luma source section hash unchanged from Pass 36/37;
- `getImageData()` count in `src/effects.js` remains 5;
- `putImageData()` count remains 4;
- CORRUPT/XYZ/Cluster section contains no `getImageData()` or `putImageData()`;
- no new p5 Graphics surface is created by CORRUPT.

---

## 8. Runtime test matrix

### A. Master SPEED

1. CORRUPT ON, Clusters OFF.
2. Set MOVE X to a clearly visible value.
3. Sweep SPEED: 0 -> 0.25 -> 1 -> 2 -> 4.
4. Confirm spatial motion scales immediately.
5. Enable STROBE and confirm changing SPEED does not change the decoded-frame INTERVAL.

### B. RANDOM XYZ

1. Clusters OFF.
2. POSITION Z: -1 -> 0 -> +1.
3. Confirm recede / neutral / approach relationship.
4. Return POSITION Z to 0.
5. Move MOVE Z away from zero and confirm repeated near/far travel.
6. Test MOVE X and MOVE Y independently.

### C. Cluster identity

1. Toggle CLUSTERS ON/OFF repeatedly.
2. With Clusters ON, set Organic Speed, Wander and Kick to zero.
3. Set Z SPREAD high and confirm groups occupy distinct apparent Z planes.
4. Move GROUP MOVE X only; then Y only; then Z only.
5. Add Organic Speed afterward and determine whether the distinction remains legible.

### D. Luma stress

Use a moving 30 fps source and the same CORRUPT settings for all comparisons.

1. CORRUPT alone; note FPS and `gl draws`.
2. CORRUPT + LIVE Luma; note FPS, `luma read/xform/upload`, and cache rebuild/reuse.
3. Capture STENCIL, then CORRUPT + STENCIL Luma; compare.
4. Repeat with REPEATS 0, moderate, and high.
5. Repeat with positive Z to determine whether scaled draws materially affect the machine.

Do not infer an optimization from static validation. Runtime measurements decide the next step.
