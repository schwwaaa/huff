> **Historical note:** The target Mac did not validate the intended standalone behavior. This audit records the 52B experiment; Pass 52D uses Pass 52B as the code baseline but does not promise standalone Symmetry/Solarize.

# HUFF Classic Pass 52B — Solarize / Symmetry Standalone Source Ownership Audit

## Finding

Yes, both effects are fixable without changing their actual algorithms.

The defect is not in Solarize's transfer functions or Symmetry's mirror math. It is in **which image owns the input to those stages** when they are used at the end of Classic's persistent pipeline.

HUFF Classic deliberately keeps `gBuf` persistent. That is required for Feedback and the instrument's historical image-memory behavior. A stateless effect such as Symmetry or Solarize therefore cannot assume `gBuf` contains the current clean video when no earlier stage has written fresh imagery into it.

## Why Pass 52A was incomplete

Pass 52A correctly added a direct `gCur` source for isolated Solarize, but its isolation test used `activity.feedback` as an ownership barrier.

That activity flag has unusual historical semantics: it may remain true when the Feedback amount is non-neutral even if the explicit Feedback `ENABLE` control is off. This keeps Persistence independent of the Feedback transform.

Therefore this state was possible:

```text
Feedback ENABLE = OFF
Feedback amount = 0.60
activity.feedback = true
actual Feedback transform = does not run
```

Pass 52A interpreted that as "Feedback owns gBuf," so Solarize stayed on stale/persistent `gBuf` instead of taking the live source.

Symmetry had an additional issue: it had no direct-live source path at all.

## Pass 52B ownership rule

An activity bit and actual image ownership are now separate concepts.

```text
Feedback owns gBuf only when:
Feedback ENABLE is ON
AND
Feedback activity is non-neutral
```

### Symmetry

If no enabled image-producing stage precedes Symmetry:

```text
gCur -> Symmetry -> gBuf
```

If an upstream stage is active:

```text
established gBuf -> Symmetry -> gBuf
```

Solarize is downstream of Symmetry and does not block Symmetry from taking live ownership.

### Solarize

If no enabled upstream image owner exists and Symmetry is off:

```text
gCur -> Solarize -> gBuf
```

With Symmetry active:

```text
gCur -> Symmetry -> gBuf -> Solarize -> gBuf
```

With actual Feedback or another upstream image stage active:

```text
established gBuf -> Solarize -> gBuf
```

## Protected behavior

This repair does not modify:

- `applySymmetry()` mirror equations;
- any Solarize / Luma Quantize / Chroma Posterize algorithm;
- Solarize Fluidity;
- Flow;
- Luma Key;
- Feedback math;
- Persistence math;
- Global Mix;
- Pass 51 Syphon worker/native transport;
- native Tauri output code.

The correction is a dispatcher/source-selection change in `src/canvas.js` only.
