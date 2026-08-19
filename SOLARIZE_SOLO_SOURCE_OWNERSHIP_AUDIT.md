# HUFF Classic Pass 52A — Solarize Solo Source-Ownership Audit

## Finding

The reported solo-Solarize problem is a source-ownership issue, not a new Chroma Posterize transfer-function failure.

The active Classic pipeline deliberately keeps `gBuf` persistent. It is seeded from `gCur` when entering from bypass, but it is not automatically replaced with `gCur` on every render while effects are active.

This is correct for the stateful HUFF architecture. However, it means a stage must either:

- inject current source pixels into `gBuf`, or
- intentionally operate on persistent `gBuf` state.

Solarize did neither when isolated. It is a terminal color transform, so it repeatedly processed the already-persistent buffer.

## Why it showed up now

Pass 52 encouraged testing the Solarize family as a standalone color processor. The underlying behavior predates Pass 52; Pass 51 has the same persistent-buffer ownership model.

## Corrected ownership rule

```text
Solarize only
    gCur -> Solarize -> gBuf

Solarize + established upstream image stage
    established gBuf result -> Solarize -> gBuf
```

The second path is unchanged.

## Isolation predicate

Direct live source is permitted only when Solarize is active and all of the following are inactive:

- Glitch
- Scanlines
- Pipeline Luma
- Global Mix
- Feedback
- Flow
- Symmetry

`BASE MIX` is presentation-only and does not prevent direct-live Solarize.

## Why not copy gCur into gBuf first?

A full-resolution `gCur -> gBuf` copy on every render would repair source freshness, but it would add unnecessary full-resolution Canvas2D traffic. `applySolarize()` already downsamples its source into the bounded <=640px color domain, so Pass 52A lets it read `gCur` directly.

This keeps the repair narrow and avoids introducing another large copy in the hot path.

## Persistence contract

No Persistence implementation was changed. Persistent decay still runs in the established pipeline. Pass 52A only changes the source supplied to the terminal Solarize stage in the one configuration where no upstream image stage has established a meaningful `gBuf` image for that frame.

As soon as Feedback, Flow, Symmetry, Glitch, Scanlines, Luma, or Global Mix participates, Solarize reads `gBuf` exactly as before.

## Telemetry

`sol live` counts profiler-visible frames using direct `gCur` ownership. This makes the runtime decision observable on the target Mac.
