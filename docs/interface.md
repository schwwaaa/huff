---
layout: page
title: The Interface
permalink: /interface/
nav_order: 4
---

huff opens two windows. The **controls window** is your workspace — all parameters, toggles, and configuration panels live here. The **canvas window** is the fullscreen output that receives the processed frames over the embedded WebSocket relay.

<div class="img-placeholder">
  <span class="ph-label">📸 SCREENSHOT PLACEHOLDER</span>
  <span>Annotated screenshot of the controls window with group labels highlighted<br/>
  <em>Replace with: annotated UI overview showing all collapsed groups</em></span>
</div>

The controls are organised into collapsible **groups**. Click a group label to collapse or expand it. Collapsing a group does not disable its effects — use the **ON** toggle inside each group for that.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `P` | Toggle controls panel visibility |
| `F` | Toggle fullscreen on the output canvas window |

---

## Source Group

Controls the input material fed into the effect chain.

| Control | Description |
|---------|-------------|
| **File** | Load a video file. Drag-and-drop also works. Supported formats: any format your system's video decoder handles (MP4, MOV, WebM, etc.). |
| **Camera** | Select a webcam from the dropdown. Click **↻ Refresh** to scan for newly connected devices. |
| **▶ Play / ⏸ Pause** | Toggle video playback. |
| **BASE VIDEO** | Show the raw source frame underneath the glitch output. |
| **BASE MIX** | Opacity of the base video layer. 0 = fully glitched output, 1 = raw source on top. |
| **BASE BG** | Background fill colour when no tile covers a pixel: Black, Green (chroma key), Blue, or White. |
| **SEED ON LOAD** | Prime the frame ring with the first video frame immediately on file load, rather than waiting for the ring to fill naturally over 60 frames. |
| **QUALITY** | Scales the frame ring depth (0 → 4 frames, 1 → 60 frames) and controls the Solarize frame-skip rate. This is the single most impactful performance lever. |

<div class="callout">
  <strong>QUALITY tip:</strong> On slower machines, lower QUALITY first before touching individual effects. At quality=0 the ring holds only 4 frames and every temporal effect becomes much cheaper to compute.
</div>

---

## Glitch Group

The core datamosh engine. Reads tiles from past frames and blits them onto the current frame at noise-driven positions.

<div class="img-placeholder">
  <span class="ph-label">📸 SCREENSHOT PLACEHOLDER</span>
  <span>Close-up of the Glitch group controls panel<br/>
  <em>Suggested AI prompt: "Datamosh tile displacement glitch art, blocky pixel corruption, temporal artefacts, dark background, vivid colours displaced in rectangular chunks"</em></span>
</div>

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable the glitch pass entirely. |
| **CORRUPT %** | 0–7 | Fraction of grid tiles displaced per frame. 0 = nothing moves. 7 = every tile replaced. |
| **CORRUPT DRIFT** | 0–1 | Noise-driven oscillation of the corruption density. The percentage breathes slowly when > 0. |
| **PIXEL SIZE** | 150–2000 | Tile size in pixels. Larger = blockier datamosh. Smaller = fine grain displacement. |
| **DEPTH** | 0–0.5 | How far back in the ring tiles are sampled. 0 = only the previous frame. 0.5 = half the ring depth. |
| **DEPTH SCATTER** | 0–1 | Per-tile randomisation of the lookback index. 0 = all tiles from the same frame. 1 = each tile independently randomised. |
| **GLITCH SIZE** | 1–60 | Spatial scaling of each tile relative to PIXEL SIZE. |
| **OPACITY** | 0–1 | Alpha of each blit tile. Lower values create translucent displacement artefacts. |
| **JITTER** | 0–1 | Magnitude of per-tile position noise on top of the regular grid. |
| **SMEAR** | 0–200 | Number of duplicate stamps trailed behind each tile in the smear direction. |
| **SMEAR ANGLE** | 0–360 | Direction of the smear trail in degrees. 0 = noise-driven direction per frame. |
| **SPEED** | 0–10 | Phase velocity of the noise field driving tile selection and placement. |
| **FINE SPEED** | 0–5 | Secondary noise phase multiplied with SPEED. |
| **MULT** | 0–5 | Global speed multiplier applied on top of SPEED × FINE SPEED. |
| **GLITCH X / Y** | -1–1 | Base offset applied to all tile destination positions. |
| **SEED** | — | Randomisation seed. Same seed + parameters = same output. Use to lock a pattern. |

---

## Feedback Group

Composites the previous output frame back onto itself with a spatial transform, creating infinite zoom, drift, and rotation effects.

| Control | Range | Description |
|---------|-------|-------------|
| **FEEDBACK** | 0–3 | Contribution of the previous frame. 0 = no feedback. Values > 1 over-expose. |
| **PERSISTENCE** | 0–10 | Decay rate between frames. Higher = trails linger longer. |
| **FB X** | -1–1 | Horizontal translation per frame. Creates lateral drift. |
| **FB Y** | -1–1 | Vertical translation per frame. Creates vertical drift. |
| **FB Z** | 0.98–1.03 | Zoom per frame. < 1 = implode inward. > 1 = explode outward. |
| **FB θ** | -2–2 | Rotation in degrees per frame. Creates spinning feedback tunnels. |
| **↺ Reset Motion** | button | Returns FB X/Y/Z/θ to neutral (0, 0, 1.0, 0). |

---

## Scanlines Group

Displaces horizontal bands of pixels by sampling from past frames.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable the scanline pass. |
| **BANDS** | 0–30 | Number of active displacement bands per frame. |
| **BAND HEIGHT** | 0–1 | Relative height of each band. |
| **RAND SIZE** | toggle | Randomise band height per band. |
| **SHIFT** | 0–0.5 | Maximum horizontal displacement as a fraction of canvas width. |
| **SKEW** | -1–1 | Position-based horizontal offset making bands angle diagonally. |
| **DRIFT** | 0–3 | Vertical drift speed of band positions. |
| **SPEED** | 0–5 | Overall speed multiplier for band drift. |
| **GAP** | 0–200 | Snaps band positions to a regular grid spacing. Creates rhythmic rather than random placement. |
| **OPACITY** | 0–1 | Alpha of displaced band content. |

---

## Clusters Group

Biases tile placement toward radial cluster zones rather than uniform scatter.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable cluster-biased tile placement (Glitch must also be ON). |
| **CENTERS** | 1–20 | Number of cluster centres. |
| **SPREAD** | 1–300 | Radius around each centre within which tiles are distributed. |
| **MIN RAD** | 0–150 | Minimum distance from centre — creates a hollow ring. |
| **SPATIAL GAP** | 0–200 | Minimum pixel distance between any two tiles. Prevents overlap. |
| **BIAS** | 0–1 | Fraction of tiles forced into clusters. Remainder placed randomly. |
| **DRIFT** | 0–5 | Noise-driven movement of cluster centre positions. |
| **SPEED** | 0–15 | Speed of cluster centre physics simulation. 0 = static. |
| **INERTIA** | 0.01–0.99 | Momentum of cluster centres. High = smooth slow movement. Low = jittery. |

---

## Solarize Group

Per-pixel luminance-threshold colour inversion with per-channel RGB scaling.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable. |
| **THRESH** | 0–1 | Luminance threshold. Pixels above this are inverted. |
| **AMOUNT** | 0–1 | Inversion strength. 0 = no effect, 1 = full inversion. |
| **SOL R / G / B** | 0–2 | Per-channel multiplier applied after inversion. Values > 1 over-expose that channel. |

---

## Flow Warp Group

Distorts UV coordinates using a noise field, creating liquid or heat-haze displacement.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable. |
| **STRENGTH** | 0–20 | Maximum pixel displacement. |
| **SCALE** | 40–200 | Spatial scale of the noise field. Lower = finer cells, higher = broader sweeps. |
| **PULSE** | 0–200 | Frames back in the ring to sample during warp. Adds temporal smear. |
| **IMPLODE** | 0–1 | Centripetal pull toward the canvas centre added on top of the noise warp. |

---

## Symmetry Group

Mirrors the frame about one or both axes.

| Control | Options | Description |
|---------|---------|-------------|
| **SYMM** | toggle | Enable/disable. |
| **MODE** | V / H / HV | Vertical mirror, horizontal mirror, or both. |
| **SYM POS** | 0–1 | Position of the mirror axis. 0.5 = centred. |

---

## Trails Group

Blends multiple past frames as translucent ghost layers.

| Control | Range | Description |
|---------|-------|-------------|
| **ON** | toggle | Enable/disable. |
| **TRAIL LAYERS** | 0–10 | Number of ghost frames composited. |
| **TRAIL DEPTH** | 0–1 | How far back in the ring to pull trail frames from. |
| **LUMA KEY** | 0–1 | Drops dark pixels from trail frames. Only bright areas trail. |

---

## Presets

Presets save a complete snapshot of all parameter values to `localStorage`. They survive app restarts.

- **Save** — type a name and click Save. Overwrites if the name exists.
- **Load** — select from dropdown, click Load.
- **Delete** — select and click Delete.

**Factory presets** are always present and cannot be deleted:

| Preset | Character |
|--------|-----------|
| `clean` | All effects off — raw source passthrough |
| `chaos` | High corruption, deep ring, fast clusters |
| `melt` | Slow feedback zoom with deep scanlines |
| `mirror` | Symmetry-forward with light solarise |
| `pulse` | Rhythmic cluster glitch with trails |
| `solar` | Solarise dominant, flow warp texture |
| `vapor` | Soft trails, slow feedback rotation |
