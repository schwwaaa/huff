<p align="center">
  <img width="25%" height="25%" src="https://github.com/vondas-network/huff/blob/v1-stable/src-tauri/icons/Square310x310Logo.png?raw=true"/>  
</p>

<p align="center"><em>click & huff; find the trail</em></p> 


## What the app does

- Loads a **video file** from disk (with audio), renders the current frame into an off-screen buffer (`gCur`).
- Maintains a **state buffer** (`gBuf`) that accumulates feedback and corruption over time.
- On each frame it may:
  - Corrupt tiles by sampling **older frames** from a **ring buffer** (`frameRing`).
  - Apply optional **feedback** (translate/rotate/scale re-projection of last frame).
  - Apply optional **flow field warp**, **bloom**, and **colorizer**.
  - Composite the **base video** (`gCur`) under the moshed buffer according to **Base Mix**.
- A **Quality** control throttles expensive passes and history length.
- Transport: **Play/Pause** and **Record** (canvas → `.webm`).  

Keyboard: **P** toggles UI, **F** toggles browser fullscreen.


## Video Pipeline

File input
- <input type="file"> → Blob URL → createVideo() → hidden <video> element (audio on).

Video to buffer (gCur)
- Uses requestVideoFrameCallback (if supported) to copy frames only when the media clock advances.
- Otherwise copies each draw() into gCur.
- Function: blitVideoInto(gCur).

Seed into moshed buffer (gBuf)
- If “Seed on load” is checked, the first valid frame is copied from gCur to gBuf.
- Provides a visible start state instead of black.

Corruption (applyGlitch)
- Divides canvas into tiles.
- Randomly samples older frames from frameRing (based on Depth).
- Applies optional smearing (directional copies).
- Writes tiles into gBuf.

Feedback
- Previous gBuf reprojected with translation, zoom, rotation.
- Optionally auto-animated with noise.
- Tint controls accumulation strength.

Flow warp (optional)
- Builds a noise-driven vector field grid.
- Displaces tiles of gBuf into gWarp, then swaps.
- Very GPU-heavy.

Bloom (optional)
- Copies gBuf into a work buffer.
- Applies blur with radius.
- Adds blurred image back (ADD blend) with strength.

Colorizer (optional)
- Per-pixel hue shift and saturation boost.
- Operates in-place by copying to gTemp then swapping.

Final composite
- If “Base Video” is on, draws gCur under gBuf with opacity.
- Then draws gBuf to the screen.
- Provides mix of clean + moshed content.
- Ring buffer maintenance
- Each frame, a copy of gCur is pushed into frameRing.
- Length is capped by Quality setting (~30–120 frames).
- Used for temporal sampling in glitches.

Recording
- Uses canvas.captureStream() + MediaRecorder.
- Outputs .webm (VP9).
- MP4 requires post-process (ffmpeg).

---

## File → video → gCur

- The hidden `<video>` element is **not** `display:none` (some engines throttle hidden media). It is cloaked off-screen and 1×1 px so decoding stays active.
- **Audio** plays when the user presses **Play** (meets browser autoplay policy).
- If `HTMLVideoElement.requestVideoFrameCallback` (rVFC) exists, `gCur` is only updated when the media clock advances. Otherwise, `gCur` is updated every `draw()`.


## State buffer and history

- **`gBuf`** is the “moshed state.” Most effects read & write this buffer.
- **`frameRing`** stores prior `gCur` frames for temporal pulls (depth sampling).
- **`Seed on load`** copies the first valid `gCur` into `gBuf` to avoid a black start.


## Performance & Quality

- **Quality** increases/decreases:
  - How often expensive passes run (every 1st/2nd/3rd/4th frame).
  - `frameRing` length (history depth), ~30–120 frames depending on Quality.
- Effects affected most: **flow**, **bloom**, and **depth**.


## Recording

- Uses `canvas.captureStream()` + `MediaRecorder` (VP9) → **`moshed.webm`**.
- For MP4 delivery, re-mux externally (e.g., `ffmpeg -i moshed.webm -c copy out.mp4`).

---

## Controls (complete)

> **Tip:** The HTML owns the default values. The JS reads the current value each frame and applies it.

| Group | Control (ID) | Type / Range | What it does |
|---|---|---:|---|
| System | **SYSTEM** (`corruptOn`) | toggle | Gates `applyGlitch()` (tile corruption) on/off. |
| Performance | **QUALITY** (`quality`) | 0–3 (UI), used as scalar | Sets cadence for heavy passes (flow/bloom/colorizer) and ring length. Higher = more frequent passes + deeper history. |
| Temporal | **DEPTH** (`depth`) | 0–0.3 | Fraction of the ring used for temporal pulls. Larger = older frames sampled. |
| Corruption | **CORRUPT %** (`corrupt`) | 0–1 | Fraction of grid cells to corrupt per frame (before cadence/burst mods). |
| Corruption | **PIXEL SIZE** (`block`) | 4–2000 px | Base grid cell size. Larger = chunkier blocks, fewer total tiles. |
| Cadence | **GLITCH SPEED** (`glitchSpeed`) | 0.005–5 | Coarse rate that advances smear direction phases. |
| Cadence | **FINE SPEED** (`glitchSpeedFine`) | 0.001–10 | Fine multiplier for cadence. Effective activity ≈ coarse × fine. |
| Corruption | **GLITCH SIZE** (`glitchSize`) | 1–60 | Scales drawn tile size relative to `block`. |
| Corruption | **GLITCH SMEAR** (`glitchSmear`) | 0–20 | Repeats the same tile along a noise-driven vector (directional smear). |
| Seed | **SEED** (`seed`) | integer | Reseeds noise for reproducible spatial patterns. |
| Feedback | **FEEDBACK** (`feedback`) | 0–3 | Re-projects last `gBuf` into itself with X/Y/Z/θ transform at given tint. |
| Feedback | **PERSISTENCE** (`persistence`) | 0–10 | Per-frame decay of `gBuf` via `destination-out`. Lower = faster fade. |
| Feedback | **FB X / Y** (`fbX`,`fbY`) | −50..50 px | Per-frame translation in the feedback pass. |
| Feedback | **FB Z** (`fbZ`) | 0.90–1.10 | Per-frame scale in feedback pass (zoom feedback). |
| Feedback | **FB θ** (`fbTheta`) | −180..180° | Per-frame rotation in feedback pass. |
| Auto FB | **FB Auto** (`fbAuto`) | toggle | Enables low-frequency noise animation of X/Y/Z/θ. |
| Auto FB | **SPEED** (`fbSpeed`) | 0.01–10 | Rate of auto-feedback noise phases. |
| Auto FB | **MV X/Y/Z/ROTATE** | toggles | Choose which feedback components auto-animate. |
| Spatialization | **CLUSTERS** (`clusters`) | toggle | Group targets around cluster centers instead of uniform distribution. |
| Spatialization | **COUNT** (`clusterCount`) | 1–50 | Number of cluster centers. |
| Spatialization | **RADIUS** (`clusterRadius`) | 1–20 (scaled internally) | Radius around each center used to pick targets. |
| Spatialization | **SPATIAL GAP** (`spatialGap`) | 0–200 px | Minimum distance between selected targets (reduces overdraw). |
| Cadence | **CYCLE** (`cycleOn`) | toggle | Periodically modulates corruption intensity (currently sine). |
| Cadence | **SHAPE** (`cycleShape`) | enum | `sine` or `square` (current code uses sine). |
| Bursts | **BURST** (`burstOn`) | toggle | Turns on high-intensity windows. |
| Bursts | **LENGTH** (`burstLen`) | 0.2–5 s | Duration of the “on” window. |
| Bursts | **GAPS** (`burstGap`) | 0.2–5 s | Duration of the “off” window. |
| Bursts | **BOOST** (`burstBoost`) | 1–10× | Multiplier while in the burst window. |
| Bloom | **Bloom on** (`bloomOn`) | toggle | Enables blur + add-back glow. |
| Bloom | **Bloom strength** (`bloomStrength`) | 0–2 | Opacity of blurred image added back. |
| Bloom | **Bloom radius** (`bloomRadius`) | 1–20 px | Blur radius (heavier = slower). |
| Flow | **FLOW** (`flowOn`) | toggle | Enables flow-field warp (expensive). |
| Flow | **STRENGTH** (`flowStrength`) | 0–20 | Displacement magnitude in warp. |
| Flow | **SCALE** (`flowScale`) | 20–200 px | Cell size of warp grid (larger = blockier, faster). |
| Composite | **BASE VIDEO** (`baseOn`) | toggle | Draws current video (`gCur`) under `gBuf`. |
| Composite | **BASE MIX** (`baseMix`) | 0–1 | Opacity of base video underlay. |
| Init | **Seed on load** (`seedOnLoad`) | toggle | Copy first ready frame into `gBuf` at start. |
| Color | **COLORIZER** (`colOn`) | toggle | Hue rotate + saturation gain (fast). |
| Color | **HUE** (`colHue`) | −180..180° | Approximate hue rotation. |
| Color | **SAT** (`colSat`) | 0–2 | Saturation multiplier. |

---

## How the main functions fit together

- **`blitVideoInto(target)`**  
  Scales the current `<video>` frame to *cover* the target buffer (letterboxed) and draws it. Target is usually `gCur`.

- **`pumpVideoFrames()`**  
  Arms `requestVideoFrameCallback`; when the media clock advances, it copies into `gCur`. Re-arms itself while playing.

- **`applyGlitch(density)`**  
  Picks target tiles (optionally clustered), samples from older frames in `frameRing` according to **Depth**, draws onto `gBuf`, and optionally smears along a noise vector.

- **Feedback block (in `draw()`)**  
  Re-projects last `gBuf` into itself with X/Y/Z/θ and optional auto-motion.

- **`applyFlowWarp(src, dst, strength, scale)`**  
  Builds a noise-driven vector field over a coarse grid and re-samples tiles from offset positions. Writes to `dst`, then buffers are swapped.

- **Bloom block (in `draw()`)**  
  Copy `gBuf` into `gBloomWork`, blur, then ADD back into `gBuf` with strength.

- **`applyColorizer(src, dst, hueDeg, sat)`**  
  Very fast per-pixel hue-ish rotation and saturation gain in RGB space, then swap back.

- **Final composite**  
  If **Base Video** is on, draw `gCur` with `Base Mix` opacity, then draw `gBuf` full frame.

---

## Tips & gotchas

- **Audio starts only after a user gesture** (Play button), per browser policy.
- **Hidden video** must remain renderable: the element is cloaked off-screen but not `display:none`.
- For **MP4 output**, record `.webm` in-app and re-mux externally.
- **Fullscreen** here is browser fullscreen. A **borderless** native fullscreen is available in the packaged desktop build via Tauri window APIs.

---

## Short glossary

- **gCur** — off-screen buffer with the latest video frame.
- **gBuf** — persistent buffer containing the evolving moshed image.
- **frameRing** — circular buffer of recent `gCur` images for temporal pulls.
- **Quality** — knob that trades accuracy/smoothness for speed.
