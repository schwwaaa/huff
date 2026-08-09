# HUFF Classic Pass 39R — Feedback Recovery Audit

## Why this recovery exists

Rejected Pass 39 did more than reorganize the Feedback UI. It hid the original `FEEDBACK`/`PERSISTENCE` controls, introduced replacement state, changed Reset Motion defaults, and—most importantly—made persistent decay conditional on the new Feedback update policy. That changed the established instrument.

Pass 39R discards that branch and starts from the accepted Pass 38 package.

## Preserved Pass 38 behavior

The visible controls and ranges are restored exactly:

| Control | Range | Default |
|---|---:|---:|
| FEEDBACK | 0–3 | 0.6 |
| PERSISTENCE | 0–10 | 0.7 |
| FB X | -1–1 | 1 |
| FB Y | -1–1 | 1 |
| FB Z | 0.98–1.03 | 1.000 |
| FB θ | -2–2 | 0.01 |

Reset Motion is restored to `1 / 1 / 1.000 / 0.01`.

The original `_feedbackHasVisibleEffect()` function and `_runPersistentDecayStage()` are source-hash equivalent to Pass 38. The persistent-decay stage does not reference the new strobe or restore controls.

## Additive experiments

### FB STROBE

`FB STROBE` is deliberately narrower than rejected Pass 39's update-policy rewrite. It gates only the already-existing Feedback transform:

```text
existing gBuf
  -> snapshot to existing gScratch
  -> clear gBuf
  -> transform/redraw snapshot
```

When Strobe is OFF, this transform follows the Pass 38 path every time it has a visible effect.

When Strobe is ON, the transform is applied once per selected decoded-frame bucket. `PERSISTENCE` continues independently every active pipeline render, exactly as before. CORRUPT, Luma, Flow and source playback remain independent.

### RESTORE

`RESTORE` is a neutral-by-default clean-source catch-up experiment. At values above zero, the current `gCur` is blended over the Feedback result using `source-over`. It requires no CPU pixel readback and no new framebuffer.

`RESTORE = 0%` performs no extra draw and preserves the old Feedback path.

## Performance boundary

- no `getImageData()` added to `canvas.js`;
- no `putImageData()` added;
- no `createGraphics()`/new full-resolution surface;
- `src/effects.js` is exact Pass 38;
- `src/pipeline-runtime.js` is exact Pass 38;
- RESTORE costs one Canvas draw only while nonzero.

## Runtime decision

Pass 39R is not considered accepted until the original Feedback combinations feel the same as Pass 38. The first test is not the new features—it is regression recovery.
