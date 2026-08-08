# HUFF Classic Pass 37 — CORRUPT Semantic Control Audit

## Purpose

Pass 37 does not attempt to turn HUFF Classic into a new effect engine. It takes the existing temporal corruption + cluster system and exposes it as a coherent instrument.

The governing usability test is simple:

> When a relevant control is visible and the user moves it, the resulting action should be visually understandable without needing to know the implementation.

## Historical source grounding

### Fairlight CVI / Video Entertainer

The Fairlight documentation organizes the instrument around operator meaning such as **timing** and **movement**, rather than exposing every implementation variable as an unrelated control. Its field-store catalog also treats freeze/strobe/trail/scan/catch-up as different policies for how stored imagery changes. The CVI preset examples explicitly combine periodic capture with RATE controls, pan/slide, zoom and stencils to build larger behaviors from a small vocabulary.

Pass 37 adapts that lesson by separating CORRUPT into UPDATE, TIME, REGIONS, MOVEMENT and COMPOSITE responsibilities. The existing stored Luma Stencil is also reused as a **process eligibility mask**: it does not merely change final alpha; it can decide where CORRUPT is allowed to place patch centers. This is a constrained HUFF adaptation of Fairlight's broader use of stencils as region-control state.

Reference reading:
- *Fairlight CVI Computer Video Instrument*, Getting Started / preset examples, especially Trail, Trail-Strobe, Trail-Slide and Catch-Up families.
- *Fairlight Video Entertainer User Manual*, control-panel and stored/live image concepts.
- `HUFF_VIDEO_INSTRUMENT_REFERENCE_STUDY.md`, sections on stencil roles, freeze/update policies and semantic control groups.

### Snell & Wilcox Magic DaVE

Magic DaVE's **Effects — MultiGrab Menu** states that MultiGrab automatically freezes and unfreezes the DVE picture on a regular basis. It exposes separate parameters:

- `FreezeT`: how long the picture remains frozen before being unfrozen;
- `LiveT`: how long normal live picture appears between freezes;
- On/Off;
- Frame/Field freeze mode.

Pass 37 adapts the first two concepts to progressive decoded-frame timing:

```text
MULTIGRAB
HOLD   N decoded frames
LIVE   M decoded frames
```

Only CORRUPT update execution is gated. Luma, Scanlines, Flow, playback and outputs remain live. HUFF Classic intentionally does **not** copy Magic DaVE's Frame/Field option because the WebView/file-decoder pipeline does not expose an equivalent historical interlaced-field instrument model.

Reference: *Magic DaVE 8DOE/4D(O)E User Manual*, Section B, Effects — MultiGrab Menu, manual p. 71.

### Grass Valley INDIGO

INDIGO uses delegation so one control area changes responsibility only when the selected target is explicit. Its Effects menus reveal additional parameter areas depending on the selected effect pattern.

Pass 37 adapts this interaction rule:

- STROBE shows INTERVAL; other update modes hide it.
- MULTIGRAB shows HOLD/LIVE; other update modes hide them.
- CLUSTER shows group shape/movement controls; RANDOM hides them.
- STENCIL shows LEVEL/SIDE; FULL hides them.

The goal is to prevent the user from moving a control that cannot possibly affect the selected mode.

Reference: *Grass Valley INDIGO AV Mixer User Manual*, Auto Menu Delegation and SD/HR Effects Submenu, manual pp. 77–78.

## Semantic control map

| Domain | Visible control | Observable action | Legacy/runtime basis |
| --- | --- | --- | --- |
| Update | MODE | chooses continuous, periodic-strobe, or hold/live MultiGrab updates | accepted Glitch Strobe + new policy |
| Update | INTERVAL | increases/decreases time between STROBE refreshes | `glitchStrobeEvery` |
| Update | HOLD | lengthens/shortens frozen portion of MULTIGRAB | new canonical state |
| Update | LIVE | lengthens/shortens active-update portion of MULTIGRAB | new canonical state |
| Time | AGE | expands/reduces how far into FrameRing history patches may come from | `depth` |
| Time | AGE SPREAD | increases/reduces age difference among patches | `depthScatter` |
| Regions | AMOUNT | increases/reduces target count | `corrupt` |
| Regions | AMOUNT DRIFT | increases temporal variation in target count | `corruptDrift` |
| Regions | GRID | makes placement lattice coarser/finer | `block` |
| Regions | PATCH SIZE | changes borrowed patch size relative to GRID | `glitchSize` |
| Regions | GAP | changes minimum accepted center spacing | `spatialGap` |
| Regions | JITTER | changes random patch displacement | `glitchJitter` |
| Regions | MASK | chooses full-frame or stored-stencil eligibility | new canonical state |
| Regions | LEVEL | changes stencil luminance threshold | new canonical state |
| Regions | SIDE | selects bright or dark stencil region | new canonical state |
| Distribution | LAYOUT | chooses RANDOM or CLUSTER placement | replaces visible `clusterTiles` |
| Group Shape | GROUPS | changes number of moving groups | `cluCenters` |
| Group Shape | GROUP AMOUNT | changes share of targets assigned to groups | `cluBias` |
| Group Shape | GROUP SIZE | changes outer group radius | `cluSpread` |
| Group Shape | HOLLOW | opens/closes inner exclusion radius | `cluMinSpread` |
| Group Shape | SHAPE HOLD | changes boil ↔ persistent constellation | `cluCohere` |
| Group Shape | PULSE SIZE | changes group-radius breathing | `cluBreathe` |
| Group Move | MOVE SPEED | changes center travel speed | `cluSpeed` |
| Group Move | TURN RATE | changes heading-change rate | `cluSteer` |
| Group Move | WANDER | adds/removes noise-driven center movement | `cluDrift` |
| Group Move | SPEED VAR | changes speed differences among groups | `cluSpeedVar` |
| Group Move | KICK | changes periodic velocity impulses | `cluPulse` |
| Group Move | MOMENTUM | changes persistence of existing velocity | `cluInertia` |
| Group Move | EDGE | chooses bounce or wrap | `cluBounds` |
| Patch Move | OFFSET X/Y | translates corrupted patches | `glitchBaseX/Y` |
| Patch Move | REPEATS | changes repeated patch copies | `glitchSmear` |
| Patch Move | DIRECTION | controls repeat direction; 0 is explicitly AUTO | `glitchSmearAngle` |
| Patch Move | RATE | one performance control over exact legacy motion-rate product | legacy speed/fine/mult |
| Composite | MIX | changes corrupted-material opacity | `glitchAlpha` |

## RATE compatibility design

The legacy runtime computes:

```text
effective rate = SPEED × FINE × MULT²
```

Those three original IDs remain in the DOM and canonical render state so old presets and MIDI/OSC maps are not invalidated. The visible RATE slider is derived. Moving RATE decomposes the requested effective rate back into values that remain inside the original ranges. Loading an old preset preserves the exact legacy triplet and only updates the visible RATE readout.

This is deliberate: Pass 37 cleans the performance surface without silently changing the old parameter contract.

## Cluster integration boundary

Clusters are **not** claimed to be a Fairlight, Magic DaVE or INDIGO historical feature. They are an existing HUFF behavior. Pass 37 only changes their operator model: instead of looking like a separate effect, they become the CLUSTER distribution method for CORRUPT.

## Stencil-process-mask boundary

STENCIL mask uses the already-captured bounded Luma stencil. It samples its stored 8-bit luminance when accepting candidate patch centers. It does not:

- add a new image readback;
- add a full-resolution buffer;
- modify the Luma Key implementation;
- clip every pixel of a patch to the mask edge.

The mask controls **center eligibility**, so a patch may extend beyond the exact luminance boundary. That tradeoff keeps the feature cheap and understandable in Classic.

## Immediate-understanding test

Pass 37 is intentionally an evaluation build. A control fails the pass artistically if a user cannot infer its action after moving it in the relevant mode. Report controls by visible name, for example:

```text
AGE feels clear
HOLLOW is surprising but understandable
KICK seems dead
RATE range feels compressed
SHAPE HOLD is excellent
```

That feedback should drive the next pass. Do not add more Corrupt parameters until this vocabulary is evaluated in real use.
