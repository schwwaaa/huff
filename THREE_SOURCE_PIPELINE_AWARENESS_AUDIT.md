# HUFF Classic Pass 52D — Three-Source Pipeline Awareness Audit

## Decision

Pass 52D does **not** add standalone source ownership to Symmetry or Solarize. It preserves the constrained Classic instrument model and makes the dependency visible at the point of use.

## Existing Classic mental model

```text
PRIMARY IMAGE FEEDS
  CORRUPT
  SCANLINES
  LUMA KEY / COMPOSITE
        |
        v
  persistent image state
        |
        v
     FEEDBACK
        |
        v
       FLOW
        |
        v
    SYMMETRY
        |
        v
    SOLARIZE
        |
        v
      OUTPUT
```

Global Mix remains a position-selectable clean-source reinjection mechanism. It is intentionally not presented as a fourth primary starter because doing so would weaken the immediate instrument model.

## Why the UI needed to change

Symmetry and Solarize look like ordinary independent effects when viewed as isolated control groups. A first-time user may turn either ON immediately after loading video. The Classic engine does not conceptually treat them as front-end image generators, so a non-result appears to be a broken control.

The correct repair for the free Classic instrument is therefore **awareness**, not a hidden pipeline rewrite.

## New visible contract

The Pipeline group now exposes:

```text
IMAGE FEED
CORRUPT | SCANLINES | LUMA/COMP | current active feed summary
```

Symmetry and Solarize each expose:

```text
DOWNSTREAM
WAITING FOR FEED
```

If enabled with no primary feed:

```text
NEEDS IMAGE FEED
```

If a feed is active:

```text
PROCESSING · CORRUPT
PROCESSING · SCANLINES
PROCESSING · LUMA/COMP
PROCESSING · CORRUPT+SCANLINES
...
```

No source is auto-enabled. No downstream control is disabled.

## Luma qualification

Luma is only advertised as a primary image feed when all three conditions are true:

```text
LUMA KEY = ON
TARGET = COMPOSITE
MIX > 0
```

Luma targeting CORRUPT or SCAN is a mask/gate relationship with those effect objects, not an independent primary image feed.

## Pipeline recipe disclosure

### CLASSIC

```text
IMAGE FEED -> FEEDBACK -> FLOW -> SYMMETRY -> SOLARIZE
```

This is the intended quick mental model. Global Mix insertion points are unchanged and intentionally omitted from the short label.

### CRISP FINISH

```text
FEEDBACK -> FLOW -> SYMMETRY -> SOLARIZE -> IMAGE FEED
```

The downstream badges explicitly change to `CRISP · PRE-FEED` when enabled. This prevents the interface from suggesting that Symmetry/Solarize necessarily transform the final Corrupt/Luma/Scan layers in CRISP FINISH.

## Protected runtime

Pass 52D is a UI-awareness pass. The following Pass 52B runtime functions are hash-protected by `scripts/validate-pass52d.mjs`:

- `_runSourceSyncStage`
- `_runPersistentDecayStage`
- `_runGlitchLumaFrontGroup`
- `_runScanlineFrontGroup`
- `_runFrontStagePriority`
- `_canFuseGlobalMixIntoSolarize`
- `_runGlobalMixStage`
- `_runFeedbackStage`
- `_runFlowStage`
- `_feedbackActuallyOwnsBuffer`
- `_symmetryShouldReadCleanLiveSource`
- `_runSymmetryStage`
- `_solarizeShouldReadCleanLiveSource`
- `_runSolarizeStage`
- `_runPresentationStage`
- `draw`

Also protected byte-for-byte:

- `src/effects.js`
- `src/pipeline-runtime.js`
- `src/syphon-stream-worker.js`

The Pass 51 Syphon simulation is part of the Pass 52D validation run.

## Rejected direction

Pass 52C attempted to create a separate stateless live lane. The target-machine test failed and that package remains rejected. Pass 52D is built from Pass 52B, not Pass 52C.
