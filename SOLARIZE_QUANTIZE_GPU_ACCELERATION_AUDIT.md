# HUFF Classic Pass 45 — Solarize Quantize / Luma Contention Audit

## Why this pass exists

Runtime testing of Pass 44 showed that **Pipeline Luma + Solarize LUMA QUANTIZE**
could still fall to roughly 40 FPS under a heavy composition. Pass 44 removed
redundant work around Global Mix and the Luma patch, but it did not remove the
structural problem: Luma and Solarize could still each cross the Canvas2D
GPU/CPU boundary.

The key finding is that LUMA QUANTIZE itself was still doing, every render:

```text
gBuf (full-resolution Canvas2D)
  -> downsample to <=640px CPU-readable canvas
  -> synchronous getImageData()
  -> JavaScript luminance transform
  -> putImageData()
  -> scale back into gBuf
```

That is expensive even though the pixel surface is bounded.

## Pass 45 strategy

Pass 45 keeps **HUFF Classic** as the existing Tauri v1 + p5.js / Canvas2D
instrument. It is **not wgpu** and does not replace the renderer.

A deliberately narrow **WebGL 1** helper is added only for Solarize
`LUMA QUANTIZE`. It owns one <=640px offscreen canvas and one reusable texture.
The rest of HUFF remains Canvas2D.

```text
gBuf
  -> existing <=640px downsample
  -> reusable WebGL texture upload
  -> one fragment-shader quantize draw
  -> draw WebGL canvas back into existing Canvas2D pipeline
```

There is no WebGL `readPixels()`, no new full-resolution framebuffer, and no
new playback/frame cadence rule.

### Why WebGL 1 rather than another CPU trick

The accepted Quantize transform is not dominated only by arithmetic. The
synchronous Canvas2D `getImageData()` boundary is itself costly. Integerizing
the JavaScript transform reduced isolated loop time, but test versions changed
hard quantization boundaries enough to risk the visual identity the user had
already accepted. The WebGL path removes the CPU readback entirely while
retaining the established transfer function to practical visual parity.

## Shader-specific optimization

The first GPU prototype calculated the exponential LEVEL -> number-of-levels
mapping with `pow()` in every fragment. Pass 45 does not do that.

`LEVEL` is converted once on the CPU into:

- `steps = levels - 1`, or
- the explicit `removeLuma` endpoint at LEVEL 100.

The fragment shader therefore performs only the per-pixel luma, quantization,
softness, invert, amount, and chroma-preserving delta operations.

The source texture allocation is retained and steady-state frames use
`texSubImage2D()` rather than reallocating texture storage.

`preserveDrawingBuffer` is disabled and no explicit `gl.flush()` / `gl.finish()`
is issued.

## Luma Key optimization: one CPU traversal instead of two

A second safe optimization was possible without moving Luma to WebGL.

For LIVE / COMPOSITE Luma, Pass 44 already retained the source `ImageData` so it
could reuse its RGB bytes for the final keyed patch. However, on a new source
frame it still traversed the <=640px readback twice:

```text
Pass 44
read source
  -> loop 1: calculate/cache luma + source alpha
  -> loop 2: calculate keyed alpha from cached luma
  -> upload keyed patch
```

Pass 45 performs the exact same byte equations in one traversal:

```text
Pass 45
read source
  -> one loop: cache luma + cache source alpha + calculate keyed alpha
  -> upload keyed patch
```

If the user changes Luma parameters while the same source frame is still
current, the established cached rebuild path remains available. STENCIL Luma
is unchanged.

Browser comparison against Pass 44 returned **0 differing channels** across
three representative Luma configurations, including X-Fade, Add, Invert,
Gain, Cleanup and Density combinations.

## Why GPU Luma is NOT shipped

A bounded WebGL Luma prototype was investigated as part of the review. It was
rejected.

The shader could reproduce the matte equation, but the WebGL canvas alpha /
premultiplication handoff did not reproduce the accepted Canvas2D composite.
A final-composite browser comparison produced material differences (15,675 of
24,576 tested channels differed in that prototype, maximum difference 184).

That path is **not present in Pass 45**.

This is intentional: performance work does not justify changing the accepted
Luma appearance.

## Visual parity testing for GPU Solarize

The actual `src/effects.js` was loaded in Chromium with WebGL and the same
synthetic source was processed once through the forced CPU path and once
through the GPU path.

Representative 64x48 tests:

| LEVEL | SOFT | INVERT | AMOUNT | differing channels / 12,288 | max difference |
|---:|---:|:---:|---:|---:|---:|
| 75 | 0 | no | 1.0 | 20 | 1 byte |
| 94 | 67 | no | 1.0 | 2 | 1 byte |
| 99 | 0 | no | 1.0 | 11 | 1 byte |
| 75 | 30 | yes | 0.7 | 12 | 1 byte |
| 100 | 0 | no | 1.0 | 11 | 1 byte |

The screenshot-like combination of **HARD LIGHT Global Mix 80%, LEVEL 94,
SOFT 67** was also tested with Global Mix fused into Solarize. At 128x72 it
produced only **3 differing channels**, each by **1 byte**.

This is not claimed as bit-exact hardware emulation. It is a practical browser
parity gate for the already accepted HUFF Classic visual behavior.

## Synthetic performance measurements

These numbers were collected in Chromium in the development container. Its
WebGL renderer was Mesa/LLVM software rendering, so these are **not a prediction
of the user's Mac FPS**. They only measure the relative code paths under the
same environment.

### Solarize LUMA QUANTIZE, 1920x1080 instrument buffer / <=640px working surface

- Pass 44 CPU path: ~11.98 ms per call
- Pass 45 GPU path: ~8.15 ms per call
- relative reduction: ~31.9%

### Solarize + fused HARD LIGHT Global Mix

- CPU path: ~13.80 ms per call
- GPU path: ~11.20 ms per call
- relative reduction: ~18.8%

### LIVE / COMPOSITE Luma on a new source frame

- Pass 44 two-traversal path: ~10.63 ms per call
- Pass 45 merged-traversal path: ~9.56 ms per call
- relative reduction: ~10.1%

### Combined Luma + Quantize + fused HARD LIGHT Global Mix

- Pass 44: ~21.9–24.1 ms per iteration across repeated runs
- Pass 45: ~16.5–18.4 ms per iteration across repeated runs
- relative reduction: approximately 24%

The only authoritative FPS result remains the user's runtime test on the target
machine.

## Fallback and compatibility

If WebGL cannot initialize or the context is lost:

- Solarize automatically falls back to the exact Pass 44 CPU Quantize path;
- no project/preset migration is required;
- THRESHOLD Solarize always uses its established CPU path;
- Luma always uses its established CPU path.

A debug override is available in the console:

```js
window.HUFF_CLASSIC_FORCE_CPU_COLOR = true
```

This allows direct A/B comparison without changing presets.

## Profiler proof

With the profiler open, LUMA QUANTIZE should show:

```text
gpu color       ON
gpu sol       advancing
gpu fall             0
sol read           0-ish / no CPU samples from the GPU branch
sol xform          0-ish / no CPU samples from the GPU branch
sol upload         0-ish / no CPU samples from the GPU branch
luma merge      advancing on new LIVE source frames
```

Luma readback remains visible because this pass deliberately does not ship the
parity-failed GPU Luma prototype.

## Explicit non-goals

Pass 45 does **not**:

- skip Solarize frames;
- lower media playback FPS;
- add sample-and-hold behavior;
- lower the 640px accepted Solarize/Luma working ceiling;
- change THRESHOLD Solarize;
- change LUMA QUANTIZE's accepted control transfer;
- change FLUIDITY's temporal coefficient;
- modify Feedback/Persistence;
- modify Flow;
- introduce wgpu;
- change the native Tauri/Syphon/Spout runtime.
