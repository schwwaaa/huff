# Frame Store Temporal Gate Audit

## Objective

Add playable freeze and strobe behavior to HUFF Classic without introducing a fourth full-resolution surface or changing the accepted Pass 22 effect implementation.

## Update policies

### LIVE

The renderer follows the complete Pass 30 path. The gate returns before capture work, so the new feature is neutral by default.

### STROBE

`EVERY` is measured in decoded source frames, using the existing decoded-frame serial. This avoids tying the effect to the 60 Hz render loop and preserves predictable sampling across duplicate render ticks.

The first STROBE frame updates immediately. The completed presentation is then held until the decoded-frame bucket changes.

### HOLD

Entering HOLD captures the last fully completed presentation. Effects, recipe changes, and new source frames continue to exist in control/decode state but are not rendered until:

- `STEP` requests one complete update; or
- the user returns to `LIVE` or `STROBE`.

If HOLD is enabled before a valid completed frame exists, one update is permitted so the held image can be initialized.

## Clean-source behavior

When Frame Store is the only active visual feature, an accepted STROBE/STEP update copies the current decoded frame directly into `gBuf`. This prevents the normal persistence decay from fading a clean held image when no legacy source-injection stage is active.

## Buffer ownership

```text
LIVE update
  gScratch = normal Feedback / Flow / Symmetry scratch

STROBE or HOLD accepted update
  gScratch = normal scratch during the pipeline
  then gScratch = captured completed presentation

STROBE or HOLD closed gate
  gScratch = read-only held presentation
```

No same-frame read/write hazard is introduced because JavaScript rendering is serial and the held capture occurs only after the selected pipeline recipe completes presentation.

## Reset ownership

The held state is invalidated by:

- source retirement or replacement;
- Clear Buffers;
- window resize/fullscreen buffer reallocation;
- application startup.

## Performance boundary

The augmentation adds one full-resolution copy only on accepted STROBE/HOLD updates. Closed-gate frames skip persistence and every effect stage. LIVE adds no held-frame copy.

No runtime performance gain is claimed until target-machine measurements are completed.
