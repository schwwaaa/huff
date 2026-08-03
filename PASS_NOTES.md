# HUFF Classic Optimization Pass 11 — No-Op and Dirty-State Elimination

**Date:** 2026-08-03  
**Scope:** HUFF Classic only — Tauri v1 + HTML/JavaScript + p5.js/Canvas2D  
**Baseline:** HUFF Classic Optimization Pass 10  
**Status:** Implementation and deterministic static validation complete; runtime visual parity and endurance testing pending

## Objective

Stop the Classic renderer from touching full-resolution canvases, CPU pixel paths, or shared scratch storage when the current control state cannot visibly change the frame.

This pass continues the resource discipline proven in Junkpile’s Tauri v1 examples:

- distinguish an enabled module from a module that is currently contributing pixels;
- keep persistent state explicit;
- bypass dormant stages before acquiring ping-pong resources;
- present the clean source directly when the effect graph is neutral;
- use decoded-frame serials rather than render ticks to coalesce unchanged source work;
- retain fixed routing and deterministic state progression.

## Implementation changes

### 1. Allocation-free render activity plan

`src/canvas.js` now owns one sealed `_frameActivity` record reused every frame. `_resolveFrameActivity()` updates its flags in place rather than allocating a new object.

The activity plan independently tracks:

```text
glitch
scanlines
pipeline luma key
global mix
feedback
flow
symmetry
solarize
base mix
aggregate active state
```

This replaces the older `anyFxActive` expression, which did not include Scanlines or Pipeline Luma Key and treated several neutral settings as active.

### 2. Exact no-op stage detection

The dispatcher now skips these exact neutral states:

- **Flow:** ON with `Math.trunc(STRENGTH) <= 0`.
- **Scanlines:** OFF, band count `<= 0`, or effective alpha `<= 0`.
- **Pipeline Luma Key:** OFF or MIX `<= 0`.
- **Global Mix:** OFF or AMOUNT `<= 0`.
- **Feedback:** AMOUNT `<= 0`, or AMOUNT `>= 1` with identity X/Y/Z/rotation.
- **Symmetry:** OFF, unsupported mode, or the selected mirror boundary rounds to the far edge and changes no pixels.
- **Solarize:** OFF, THRESHOLD `>= 1`, or AMOUNT `0` with unity R/G/B multipliers.
- **Base Mix:** OFF or amount `<= 0` during final compositing.

The Solarize function also carries its own identity guard, so direct calls outside the main dispatcher cannot trigger a synchronous readback for an exact no-op.

### 3. True clean bypass path

When every effect stage is neutral, HUFF now performs:

```text
gCur → main output canvas
```

The clean frame uses Canvas2D `copy` compositing and completely replaces the output. The renderer does not perform:

- main-canvas background fill;
- persistence decay;
- Glitch/Scanline ordering work;
- Feedback snapshot/clear/redraw;
- Flow or Symmetry ping-pong operations;
- Solarize or Luma readback;
- Global Mix dispatch.

### 4. Decoded-frame-aware `gBuf` synchronization

The prior bypass path copied `gCur → gBuf` on every render frame, even when a 24/30 fps source had not decoded a new frame.

Pass 11 retains the same clean-buffer contract but coalesces the copy by `_vfc`, the decoded-frame serial:

```text
same decoded frame, repeated render tick → no gBuf copy
new decoded frame                 → one gBuf copy
```

On WebViews with `requestVideoFrameCallback`, this reduces bypass buffer synchronization from render cadence to source decode cadence. Compatibility WebViews retain their existing 60 Hz fallback serial.

### 5. Clean re-entry into the persistent pipeline

When an effect becomes active after bypass, `gBuf` is seeded once from the current `gCur` frame before persistence and effects run. Active runs then retain their normal persistent `gBuf` state.

Resize, Refresh, Clear, and source-reset paths invalidate the bypass serial and active/bypass transition state.

### 6. Phase and spin continuity preserved

Glitch X/Y phases, independent Scanline phases, and the Scanline spin accumulator continue advancing while their visible stages are neutral.

Re-enabling Scanlines or changing alpha/count therefore does not restart or pause the temporal motion.

### 7. Correct effective-pipeline accounting

The output predicate now includes:

- visible Scanlines;
- active Pipeline Luma Key;
- only non-neutral Flow, Feedback, Symmetry, and Solarize states.

This prevents Scanline-only and Luma-only configurations from being overwritten by the clean fallback while allowing truly neutral configurations to bypass the persistent pipeline.

## Structural hot-path reduction

### All-neutral render state

Previous per render tick:

```text
main background fill
gCur → main canvas
gCur → gBuf
```

Pass 11 per render tick:

```text
gCur → main canvas
```

`gCur → gBuf` now occurs once per decoded source frame rather than once per repeated render tick.

At 60 Hz rendering with a 30 fps source, the three listed full-surface operations fall from approximately 180 operations/second to approximately 90 operations/second. This is a structural bandwidth count, not a claimed frame-rate result.

### Identity Feedback

The following full-resolution sequence is now removed when Feedback is a mathematical identity:

```text
gBuf → gScratch
clear gBuf
gScratch → gBuf
```

### Neutral CPU effects

Exact-identity Solarize avoids scratch scaling, `getImageData()`, pixel iteration, `putImageData()`, and full-resolution result copy.

## Preserved behavior

The following are intentionally unchanged:

- fixed Classic effect order;
- Glitch and Scanline phase formulas;
- Scanline spin direction and right-wins behavior;
- layer-priority modes and pulse timing;
- persistence formula when the pipeline is active;
- Feedback output for every non-identity transform or amount below one;
- Flow output for every integer strength above zero;
- Symmetry output whenever its mirror region contains pixels;
- Solarize output for every non-identity setting;
- Luma mask construction and decoded-frame cache;
- controls, presets, MIDI, OSC, source playback, and audio routing;
- JPEG mirror, Syphon, Spout, Rust relay, Tauri configuration, and packaging;
- mandatory bundled `Syphon.framework` layout.

## Files changed

```text
src/canvas.js
src/effects.js
scripts/validate-pass11.mjs
package.json
README.md
docs/docs/how-it-works.html
docs/docs/architecture.html
docs-v1/docs/how-it-works.html
docs-v1/docs/architecture.html
PASS_NOTES.md
NO_OP_DIRTY_STATE_AUDIT.md
CHANGELOG.md
TESTING_CHECKLIST.md
CURRENT_STATUS.md
GIT_COMMIT_MESSAGE.md
DOCUMENTATION_INDEX.md
HUFF_CLASSIC_OPTIMIZATION_PASS_11.txt
```

## Validation completed

Run:

```bash
npm run validate:pass11
```

The validator covers:

- neutral-stage activity truth tables;
- zero-strength Flow and invisible Scanline states;
- zero-contribution Luma, Global Mix, and Base Mix states;
- identity and non-identity Feedback cases;
- Symmetry edge-boundary no-op cases across multiple resolutions;
- exhaustive 256-value Solarize unity-map identity proof;
- decoded-frame bypass-copy coalescing;
- source markers and removal of the legacy `anyFxActive` path.

Pass 9 Flow and Pass 10 Scanline deterministic validators also continue to pass.

## Runtime work still required

Test transitions into and out of every neutral state while video is moving:

- all effects OFF;
- Flow ON with STRENGTH below one, then above one;
- Scanlines ON with ALPHA zero, then visible;
- Luma ON with MIX zero, then visible;
- Global Mix ON with AMOUNT zero, then visible;
- Feedback identity at amounts 1–3, then move/scale/rotate;
- Symmetry at POS 1, then move inward;
- Solarize exact identity, then change amount or channel multipliers;
- Scanline-only and Luma-only output;
- repeated bypass/active switching during Syphon output;
- long clean-playback memory and CPU behavior.

## Result

Pass 11 removes avoidable full-resolution canvas work from neutral and bypass configurations while preserving the Classic fixed pipeline and temporal control behavior. The next major optimization is renderer ownership: moving decoding and rendering into the canvas output WebView to eliminate the JPEG mirror from normal operation.
