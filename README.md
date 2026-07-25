# Huff Native wgpu · Milestone 07.1

Milestone 07.1 stabilizes the Milestone 07 render graph and retains the completed core native layers: **Smoosh, Luma Key, Global Mix, and Flow**. It is built directly on the working Milestone 06 flying-frame-buffer, GPU history, glitch, clusters, scanlines, layer priority, and feedback systems.

The control interface remains HTML/CSS. Media decoding, temporal history, procedural effect state, compositing, feedback, and presentation are native Rust + wgpu.

## Milestone 07.2 stability

Native FFmpeg video and audio pipes are now supervised through bounded reader channels. A decoder that remains alive but stops producing bytes is terminated and restarted near the current media position instead of leaving Huff permanently frozen. Hover the `NATIVE:` status pill to inspect decoder stalls and watchdog recoveries.

## Native render graph

```text
Native video or camera frame
        ↓
Clean GPU temporal-history ring
        ↓
Persistent flying frame buffer
        ↓
Glitch + Scanline layers
        ├── normal Layer Priority ordering
        ├── Smoosh blend ordering
        └── Flow target routing
        ↓
Luma Key
        ↓
Global Mix: BEFORE FB
        ↓
Non-additive feedback transform
        ↓
Global Mix: AFTER FB
        ↓
Final Flow when selected
        ↓
Global Mix: AFTER FLOW / FINAL
        ↓
Optional clean base + brightness / contrast
        ↓
Metal / Vulkan / DX12 output
```

## Smoosh now active

- On
- Blend mode
- Amount
- Invert

Smoosh isolates the glitch and scanline draws, then combines them over the persistent flying buffer. Invert swaps which layer is the base and which is blended over it. Smoosh supersedes Layer Priority while enabled, matching original Huff's routing behavior.

The 16 original blend choices are represented in WGSL: Screen, Add, Lighten, Dodge, Multiply, Darken, Burn, Overlay, Soft Light, Hard Light, Difference, Exclusion, Hue, Saturation, Color, and Luminosity.

## Luma Key now active

- On
- A/B threshold
- Mix
- Invert

The clean source luminance determines where clean video is laid back over the persistent effect buffer. The key remains immediately after the glitch stage, including when Smoosh is active.

## Global Mix now active

- On
- Blend mode
- Mix
- Position

Positions follow the original pipeline:

- **Before FB** — clean source enters the feedback recursion.
- **After FB** — feedback processes the dirty result; clean source is added afterward.
- **After Flow** — clean source is inserted wherever the Flow stage is routed.
- **Final** — clean source is added at the absolute tail.

## Flow now active

- On
- Strength
- Scale
- Speed
- Pulse depth
- Pulse trigger and Fire button
- Implode / Explode
- Swirl
- Turbulence
- Spread
- Carry
- Target: Final / Glitch / Scan

Flow target routing preserves the original shared-buffer rule:

- **Glitch** — glitch is warped, scanlines remain crisp on top.
- **Scan** — scanlines are warped, glitch remains crisp on top.
- **Final** — the completed effect chain is warped at the tail.

Smoosh forces Flow to Final because the isolated blend owns the glitch/scan ordering.

### Current Carry implementation

Flow Carry is active, but this milestone uses a bounded GPU steady-state approximation rather than the original CPU per-cell accumulator. It provides increasing accumulated displacement without unbounded growth. Exact Carry motion parity can be refined during the dedicated parameter/parity pass.

## Retained behavior

- Native FFmpeg video and audio
- Exclusive camera/video source ownership
- GPU temporal history
- Corrected p5-compatible flying glitch engine
- Persistent native cluster bodies
- Native scanline bands and layer ordering
- Destination-out-style persistence decay
- Non-additive feedback transform
- Independent render and history resolutions
- Native presets, MIDI, OSC, and diagnostics foundations

## Pending major systems

- Direct Syphon and Spout output from the native render result
- Native recording and export
- Final parameter-by-parameter visual calibration
- Additional routing/automation expansion

## Run

```bash
npm install
npm run dev:metal
```

Automatic backend selection:

```bash
npm run dev
```

Use `TESTING.md` for the runtime checklist. This milestone prioritizes completing the native pipeline; fine parameter calibration is intentionally deferred unless a control is structurally incorrect or nonfunctional.


## 07.1 Metal stability correction

Scanlines now use a dedicated group-2 bind layout containing only the clean composite texture and its sampler. Earlier builds reused the full feedback bind group for scanlines. After a ping-pong stage such as Luma Key, that bind group could also contain the texture currently used as the render attachment. Even though the scan shader did not intentionally sample that feedback texture, binding it during the pass created an avoidable read/write alias risk on Metal.

The visible scanline behavior is unchanged. This correction only isolates resources used by the scan pass.
