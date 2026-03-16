---
layout: page
title: Parameter Reference
permalink: /parameter-reference/
nav_order: 8
---

Complete list of all mappable parameter IDs for use in MIDI and OSC map files. The `param` field in any map entry must match an ID in this table exactly.

---

## Range Parameters

| ID | Label | Min | Max | Notes |
|----|-------|-----|-----|-------|
| `baseMix` | Base Mix | 0 | 1 | |
| `quality` | Quality | 0 | 3 | Scales ring depth + perf |
| `feedback` | Feedback | 0 | 3 | Values > 1 over-expose |
| `persistence` | Persistence | 0 | 10 | |
| `fbX` | FB X | -1 | 1 | |
| `fbY` | FB Y | -1 | 1 | |
| `fbZ` | FB Z | 0.98 | 1.03 | 1.0 = no zoom |
| `fbTheta` | FB θ | -2 | 2 | degrees/frame |
| `depth` | Depth | 0 | 0.5 | |
| `depthScatter` | Scatter | 0 | 1 | |
| `corrupt` | Corrupt % | 0 | 7 | |
| `corruptDrift` | Corrupt Drift | 0 | 1 | |
| `block` | Pixel Size | 150 | 2000 | |
| `glitchSize` | Glitch Size | 1 | 60 | |
| `glitchAlpha` | Tile Opacity | 0 | 1 | |
| `glitchJitter` | Jitter | 0 | 1 | |
| `glitchSmear` | Smear | 0 | 200 | |
| `glitchSmearAngle` | Smear Angle | 0 | 360 | 0 = noise-driven |
| `glitchSpeed` | Glitch Speed | 0 | 10 | |
| `glitchSpeedFine` | Fine Speed | 0 | 5 | |
| `glitchSpeedMul` | Speed Mult | 0 | 5 | |
| `glitchBaseX` | Glitch X | -1 | 1 | |
| `glitchBaseY` | Glitch Y | -1 | 1 | |
| `trailLayers` | Trail Layers | 0 | 10 | |
| `trailDepth` | Trail Depth | 0 | 1 | |
| `trailLumaKey` | Luma Key | 0 | 1 | 0 = off |
| `symPos` | Sym Position | 0 | 1 | 0.5 = centre |
| `scanShift` | Scan Shift | 0 | 0.5 | |
| `scanDrift` | Scan Drift | 0 | 3 | |
| `scanSpeed` | Scan Speed | 0 | 5 | |
| `scanGap` | Scan Gap | 0 | 200 | |
| `scanSkew` | Scan Skew | -1 | 1 | |
| `scanAlpha` | Scan Opacity | 0 | 1 | |
| `clusterCount` | Scan Bands | 0 | 30 | |
| `clusterRadius` | Band Height | 0 | 1 | |
| `cluCenters` | Clu Centers | 1 | 20 | |
| `cluSpread` | Clu Spread | 1 | 300 | |
| `cluMinSpread` | Clu Min Rad | 0 | 150 | |
| `spatialGap` | Spatial Gap | 0 | 200 | |
| `cluBias` | Clu Bias | 0 | 1 | |
| `cluDrift` | Clu Drift | 0 | 5 | |
| `cluSpeed` | Clu Speed | 0 | 15 | |
| `cluInertia` | Clu Inertia | 0.01 | 0.99 | |
| `solarizeThresh` | Sol Thresh | 0 | 1 | |
| `solarizeAmt` | Sol Amount | 0 | 1 | |
| `solarizeR` | Sol R | 0 | 2 | |
| `solarizeG` | Sol G | 0 | 2 | |
| `solarizeB` | Sol B | 0 | 2 | |
| `flowStrength` | Flow Strength | 0 | 20 | |
| `flowScale` | Flow Scale | 40 | 200 | |
| `flowPulse` | Flow Pulse | 0 | 200 | frames back |
| `flowImpl` | Flow Implode | 0 | 1 | |

---

## Toggle Parameters

These are checkboxes. Use `type: "toggle"` in your map. Value > 0.5 = checked (ON), value ≤ 0.5 = unchecked (OFF).

| ID | Label |
|----|-------|
| `corruptOn` | Glitch On |
| `baseOn` | Base Video |
| `seedOnLoad` | Seed on Load |
| `symOn` | Symmetry On |
| `clusters` | Scanlines On |
| `scanRandSize` | Rand Band Size |
| `clusterTiles` | Cluster Tiles On |
| `solarizeOn` | Solarize On |
| `flowOn` | Flow Warp On |
| `trailOn` | Trails On |

---

## Trigger Parameters

These are buttons. Use `type: "trigger"` in your map. Any value > 0 fires the click.

| ID | Action |
|----|--------|
| `refreshBtn` | Re-seed glitch randomisation |
| `resetMotionBtn` | Reset FB X/Y/Z/θ to neutral |
| `resetBtn` | Reset all parameters to defaults |

---

## Notes on Ranges

**MIDI maps** use `cc: 0–127`. This range is mapped linearly to the parameter's min–max regardless of what those values are. You do not specify the output range in a MIDI map — it is taken from the DOM element's `min`/`max` attributes.

**OSC maps** use `inputMin`/`inputMax` to tell huff what range your sender outputs. If your sender outputs `0.0–1.0` (standard TouchOSC), use `"inputMin": 0, "inputMax": 1`. If it outputs `0–127`, use `"inputMin": 0, "inputMax": 127`.

**`fbZ`** has a narrow range (0.98–1.03) because the zoom is applied multiplicatively every frame. Even a value of 1.005 produces dramatic zoom over a few seconds of feedback.

**`quality`** range is 0–3 in the DOM but 0–1 is the practical working range for most content. Values > 1 increase ring depth beyond 60 frames and can cause memory pressure at high resolutions.
