# HUFF Classic Pass 46 — Threshold Solarize Performance Audit

## Trigger

Pass 45 improved the reported heavy Luma + Solarize path, but the next runtime
screenshot still showed roughly **48 FPS**. The screenshot exposed the key fact:
Solarize was set to **THRESHOLD**.

Pass 45 only moved `LUMA QUANTIZE` off the synchronous Canvas2D pixel boundary.
The legacy THRESHOLD mode was still doing this every render:

```text
gBuf (1920x1080 Classic buffer)
  -> downsample to <=640px Solarize scratch
  -> getImageData()
  -> JavaScript luma test + RGB lookup transform
  -> putImageData()
  -> scale back to gBuf
```

That means the Pass 45 optimization was real, but it did not target the mode
actually active in the supplied screenshot.

## Pass 46 strategy

Pass 46 extends the **same bounded WebGL 1 colour helper** to THRESHOLD Solarize.
HUFF remains the Tauri v1 + p5.js / Canvas2D Classic application. This is not a
wgpu renderer migration.

```text
gBuf
  -> existing <=640px Canvas2D staging surface
  -> reusable WebGL texture upload
  -> THRESHOLD fragment pass
  -> draw bounded GPU canvas back to gBuf
```

The successful path therefore avoids:

- `getImageData()`;
- the JavaScript per-pixel THRESHOLD loop;
- `putImageData()`;
- any WebGL `readPixels()` operation.

The CPU path remains available automatically if WebGL initialization fails or
is lost.

## Threshold equation preserved

The accepted CPU implementation computes:

```text
luma = 0.299*R + 0.587*G + 0.114*B

if luma > THRESH*255:
    inverted = channel + (255 - 2*channel) * AMOUNT
    output   = round_and_clamp(inverted * SOL_CHANNEL_SCALE)
else:
    output   = source channel
```

The Pass 46 shader reconstructs 8-bit RGB values before the test and uses the
same strict `>` threshold, inversion equation, channel scales, clamp, and
nearest-byte rounding.

The Pass 46 validator runs **65,536 deterministic byte-domain transfer cases**
across random RGB, threshold, amount and channel-scale combinations and requires
the CPU and shader models to match exactly.

The actual CPU THRESHOLD helper functions remain byte-identical to Pass 45 and
are still the fallback/reference implementation.

## Why Luma remains CPU

The Pass 45 GPU-Luma experiment was rejected because WebGL alpha / premultiply
handoff changed the final Canvas2D composite materially. Pass 46 does not reopen
that experiment. The accepted merged LIVE/COMPOSITE Luma CPU path remains
byte-identical.

This is especially important because the reported heavy patch uses Luma Key.
The goal is to remove the *second* synchronous pixel boundary (Solarize), not to
trade away the accepted Luma image for an unsafe shortcut.

## Global Mix interaction

Pass 44's safe Global Mix fusion remains active. If Global Mix is positioned
before Solarize and no active Flow/Symmetry transform lies between that position
and Solarize, the mix is performed in Solarize's existing <=640px staging domain.

For the supplied screenshot-like state (`AFTER FB`, Flow/Symmetry inactive), the
intended hot path is therefore:

```text
Feedback at Classic resolution
  -> defer Global Mix
  -> bounded Solarize staging
       + Global Mix inside staging surface
  -> THRESHOLD WebGL fragment pass
  -> presentation
```

This avoids both the old full-resolution Global Mix draw immediately before
Solarize and the old Solarize CPU pixel readback/transform/upload.

## New profiler stage timing

Pass 46 adds profiler-only wall-clock timing at the actual serial recipe
boundaries. The new lines are:

```text
stage pers
stage front
stage mix
stage fb
stage flow
stage sym
stage solar
stage pres
```

These are complementary to the existing detailed Luma/Solarize counters. They
answer a different question: **which complete pipeline stage is consuming the
frame budget on the target machine?**

With THRESHOLD GPU acceleration active, the key accelerator counters are:

```text
gpu color   ON
gpu thresh  advancing
gpu quant   0 (when MODE=THRESHOLD)
gpu fall    0
```

If the same patch is still below 60 FPS after this pass, `stage front`,
`stage fb`, `stage solar`, and `stage pres` provide direct target-machine
evidence for the next optimization rather than requiring another guess.

## Explicit non-goals

Pass 46 does not:

- skip frames;
- reduce playback FPS;
- alter Feedback/Persistence;
- change Flow;
- change the Solarize controls;
- lower the accepted <=640px Solarize ceiling;
- add a full-resolution GPU framebuffer;
- move Pipeline Luma to WebGL;
- introduce WebGPU/wgpu.
