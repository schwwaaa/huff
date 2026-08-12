# Pass 47 Runtime Checklist — LIVE Luma Performance

## Primary isolated comparison

- [ ] Use the same source/process state that produced approximately 60 FPS with Luma OFF and approximately 52 FPS with Luma ON in Pass 46.
- [ ] Luma: ON.
- [ ] TARGET: COMPOSITE.
- [ ] KEY SRC: LIVE.
- [ ] Preserve the same Clip, Mix, Invert, Gain, Cleanup, Density and Fade values.
- [ ] Keep unrelated effects in the same state as the original isolation test.
- [ ] Let the patch settle for several seconds and record steady FPS.

## Profiler gate

Open profiler with backtick (`):

- [ ] `gpu color` = `ON`.
- [ ] `gpu luma` advances.
- [ ] `gpu lu fall` remains 0 during successful LIVE frames.
- [ ] `gpu lu cal` reports `premultiplied:<mode>` or `unpremultiplied:<mode>` and max error <= 2.
- [ ] `luma gpu` build/reuse counts advance.
- [ ] `luma read`, `luma xform`, `luma upload` remain at 0 for successful GPU LIVE frames.
- [ ] Record `stage front`.

If `gpu lu cal` reports a rejected mode / large error and `gpu lu fall` advances,
HUFF is intentionally on CPU fallback. Send the exact calibration line.

## Visual parity

- [ ] Compare Pass 46 and Pass 47 at identical Clip/Gain/Cleanup/Density/Invert values.
- [ ] Test X-FADE.
- [ ] Test SOFT ADD.
- [ ] Sweep MIX 0 -> 1.
- [ ] Confirm dark/bright matte polarity is unchanged.
- [ ] Capture a STENCIL and confirm stored-key behavior remains correct.

## Scratch budget

- [ ] On landscape 1080p, stored stencil should report approximately 640x360.
- [ ] On portrait 1080x1920, stored stencil should report approximately 360x640, not a tall 640x1000+ surface.

## Regression

- [ ] Solarize THRESHOLD unchanged.
- [ ] Solarize LUMA QUANTIZE unchanged.
- [ ] Solarize FLUIDITY unchanged.
- [ ] Feedback/Persistence unchanged.
- [ ] Flow unchanged.
- [ ] No frame holding/skipping/strobe has been introduced.
