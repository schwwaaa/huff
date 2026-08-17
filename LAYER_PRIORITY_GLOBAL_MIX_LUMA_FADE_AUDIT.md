# HUFF Classic Pass 48 — Layer Priority / Global Mix / Luma Fade Audit

## 1. Scope

Pass 48 is intentionally a small compositing-language cleanup. It does not add a new effect family and does not alter the fixed HUFF Classic render graph.

## 2. Layer Priority

### Previous behavior

The old control offered four values, but only two represented literal hierarchy:

- `SCAN TOP` — Scanlines painted last.
- `CORRUPT TOP` — Corrupt/Luma painted last.
- `NEUTRAL` — alternated the order every render frame.
- `PULSE` — alternated order according to Pulse Speed.

The latter two are temporal modulation, not neutral hierarchy. They also make layer ownership harder to read during performance.

### Pass 48 decision

Keep only the two stable orders. This makes the label "Layer Priority" literal and inspectable.

Compatibility is deterministic: old `neutral`, `pulse`, missing, or unknown values resolve to `SCAN TOP`. No hidden oscillator remains active.

## 3. Global Mix

Global Mix already has substantial creative range because it combines:

- clean source;
- Canvas blend relationship;
- mix amount;
- insertion position (`BEFORE FB`, `AFTER FB`, `AFTER FLOW`, `FINAL`).

Adding more routing here would make the control much harder to reason about. Pass 48 therefore extends only the **response of the existing Mix fader**.

### Curves

`LINEAR`

```text
effective = a
```

Exact established behavior and the default for old presets.

`SMOOTH`

```text
effective = a*a*(3 - 2*a)
```

Keeps exact 0 and 1 endpoints but slows the transition into/out of those limits.

`PUNCH`

```text
effective = 1 - (1-a)*(1-a)
```

Makes the clean contribution audible/visible earlier in the control travel while retaining exact endpoints.

The mapping is calculated before either Global Mix implementation path, so the normal full-resolution operation and eligible Solarize-bounded fusion receive the same effective amount.

## 4. Luma Fade

Pass 47 solved the expensive LIVE matte-generation path. Pass 48 does not disturb that work.

The Luma COMPOSITE operation can be understood as:

```text
LIVE/STENCIL key
      ↓
Clip/Gain + Cleanup/Density + Invert
      ↓
keyed CLEAN patch
      ↓
FADE / composite relationship
      ↓
current process image
```

This separation is important: **Fade is downstream of key extraction.** Changing Fade must not change which pixels belong to the key.

### Modes

Historical/reference pair retained exactly:

- `X-FADE` = `source-over`
- `SOFT ADD` = `screen`

HUFF Classic extensions:

- `LIGHTEN`
- `DARKEN`
- `MULTIPLY`
- `OVERLAY`
- `HARD LIGHT`
- `DIFFERENCE`

These were selected because they are understandable two-image compositing relationships already supported by Canvas2D and therefore add no new pixel-analysis stage.

## 5. Performance implications

### Layer Priority

Removing Neutral/Pulse slightly simplifies state evaluation; it does not add work.

### Global Mix Curve

One scalar mapping per Global Mix dispatch. No extra buffer, draw, readback, or pass.

### Luma Fade

The keyed patch already exists. The new modes only change `globalCompositeOperation` for the existing draw. They do not add another key readback or matte build.

## 6. Protected boundaries

Pass 48 validator freezes the Pass 47 Flow, Solarize, and Feedback helper bodies. The new priority contract intentionally supersedes Pass 47's exact `pipeline-runtime.js` hash because removing Neutral/Pulse is the purpose of this pass.

## 7. Known compatibility note

Historical validators that require Pass 47's exact priority contract may fail by design. This should not be concealed or treated as proof of an unrelated regression. `validate:pass48` is the authoritative structural validator for this change surface.
