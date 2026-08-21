# HUFF Classic — Pass 58 Pipeline Recipe Expansion Audit

## 1. Scope

Pass 58 is an intentionally narrow modularity pass built from the committed Pass 57 baseline.

It does **not** add a node graph. It does **not** create parallel branches. It does **not** rewrite an effect.

It expands the already-existing immutable serial recipe system so the same five operator-facing stage classes can appear in several validated orders:

```text
IMAGE FEED
FEEDBACK
FLOW
SYMMETRY
SOLARIZE
```

Global Mix remains a separate clean-source reinjection utility with its existing named insertion positions.

## 2. Why this is low-destructive modularity

HUFF Classic already compiles a recipe at startup and atomically selects one complete plan at the beginning of each rendered frame.

Pass 58 reuses that infrastructure.

Every recipe still declares:

```text
full-resolution buffers: 3
scratch: gScratch
parallel branches: none
same-frame cycles: none
```

The effect handlers themselves are unchanged.

This creates meaningful additional behavior from stage relationships rather than feature accumulation.

## 3. Recipe set

### CLASSIC

```text
IMAGE FEED → FEEDBACK → FLOW → SYMMETRY → SOLARIZE
```

Exact Pass 22 compatibility route.

### CRISP FINISH

```text
FEEDBACK → FLOW → SYMMETRY → SOLARIZE → IMAGE FEED
```

The existing alternate route. Fresh Corrupt / Luma Composite / Scanlines material is drawn after the transform/color chain.

### TEMPORAL UNDERLAY

```text
FEEDBACK → FLOW → IMAGE FEED → SYMMETRY → SOLARIZE
```

The persistent temporal image is transformed first. Fresh image-feed material then enters before final spatial/color processing.

### SYMMETRY MEMORY

```text
IMAGE FEED → SYMMETRY → FEEDBACK → FLOW → SOLARIZE
```

Symmetry becomes part of the material received by Feedback and Flow rather than only reshaping their result.

### COLOR MEMORY

```text
IMAGE FEED → SOLARIZE → FEEDBACK → FLOW → SYMMETRY
```

Solarize output enters recursive/persistent processing. Threshold, Luma Quantize, or Chroma Posterize can therefore become temporal material instead of only a finishing treatment.

### FLOW FINISH

```text
IMAGE FEED → FEEDBACK → SYMMETRY → SOLARIZE → FLOW
```

Flow becomes the final major transform. It receives already mirrored/solarized imagery.

### FEEDBACK FINISH — EXPERIMENTAL

```text
IMAGE FEED → FLOW → SYMMETRY → SOLARIZE → FEEDBACK
```

Feedback is moved to the end of the creative chain so the finished processed image becomes recursive material.

This recipe is intentionally marked experimental because Feedback owns persistent `gBuf` state and clears/redraws its destination as part of its accepted implementation. Static validation confirms the handler itself is untouched; target-machine visual/endurance testing determines whether this topology belongs.

## 4. Global Mix semantics

Pass 58 preserves the existing Global Mix choices:

```text
BEFORE FB
AFTER FB
AFTER FLOW
FINAL
```

These names remain semantically attached to Feedback / Flow rather than to a fixed numeric slot.

For example, in FEEDBACK FINISH:

```text
... SOLARIZE
→ GLOBAL MIX BEFORE FB
→ FEEDBACK
→ GLOBAL MIX AFTER FB
→ GLOBAL MIX FINAL
```

The old Global Mix → Solarize fusion optimization was proven against the original transform order. Pass 58 therefore permits that fusion only in CLASSIC and CRISP FINISH.

All new recipes execute the selected Global Mix slot explicitly.

## 5. Mini routing diagram

The Pipeline panel now contains a small stage-box diagram beneath the recipe selector.

Example:

```text
[FEED] → [SYMMETRY] → [FEEDBACK] → [FLOW] → [SOLARIZE]
```

The diagram is **not** maintained as an independent hand-written UI map.

Each executable recipe definition includes its five-stage operator diagram. Runtime validation checks that the diagram order exactly matches the executable order after non-operator stages such as source sync, persistent decay, Global Mix slots, and presentation are removed.

The UI reads this same definition and rebuilds the diagram whenever the selector changes.

This prevents documentation drift between what HUFF shows and what HUFF executes.

## 6. Preset behavior

`pipelineRecipe` remains part of the normal preset state.

Pass 58 changes imported-route validation from a hard-coded two-ID set to the actual runtime recipe registry.

Compatibility remains:

```text
old preset, no route      → CLASSIC
known Pass 58 route       → requested recipe
unknown imported route    → CLASSIC
```

No preset file format change is required.

## 7. Protected implementations

Pass 58 hash-checks the accepted implementations of:

- `_runFeedbackStage`
- `_runFlowStage`
- `_feedbackActuallyOwnsBuffer`
- `_symmetryShouldReadCleanLiveSource`
- `_runSymmetryStage`
- `_solarizeShouldReadCleanLiveSource`
- `_runSolarizeStage`
- `_runPresentationStage`

It also preserves exact Pass 57 bytes for:

- `src/effects.js`
- `src/syphon-stream-worker.js`
- `src-tauri/src/main.rs`
- `src-tauri/src/syphon.rs`

## 8. Historical validator policy

Pass 57 and some earlier validators intentionally hash-protect `src/pipeline-runtime.js`, `src/canvas.js`, or `src/index.html`.

Those whole-file freeze assertions are expected to fail after an explicitly authorized pipeline-expansion pass.

Pass 58 therefore uses a new current validator that protects the unaffected algorithms/files while validating the intentional routing/UI changes directly.

Historical behavior simulations that do not prohibit the intended Pass 58 change remain part of the regression runner.

## 9. Acceptance rule

A recipe survives only if it has a clear creative reason to exist.

Target-machine review should compare the same source and effect state across recipes and ask:

1. Is the visual relationship clearly different?
2. Is it useful rather than merely different?
3. Does switching remain stable while imagery is moving?
4. Does persistent imagery remain understandable?
5. Does performance stay in the expected Classic range?
6. Does the routing diagram accurately explain what is happening?

Redundant or unstable recipes should be removed rather than kept for menu count.

## 10. Status

Static/container validation can prove routing structure and protected code boundaries.

It cannot prove the creative result.

**Pass 58 remains a runtime candidate until the user visually tests the recipes on the target machine.**
