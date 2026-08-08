# Pass 32 — Luma Key Gain + Self Key Audit

## Existing Pass 31 behavior

The Pipeline Luma Key uses a bounded scratch canvas (maximum width 640) to derive a luminance mask and restore clean-source pixels over `gBuf`.

Before Pass 32 the transition width was fixed:

```text
roll = clamp((luminance - threshold) / 64)
```

That fixed 64-level rolloff is retained at `GAIN = 1.00`.

## Gain

Pass 32 exposes the key-edge amplification as:

```text
roll = clamp(((luminance - threshold) * GAIN) / 64)
```

Range:

```text
0.25 ... 4.00
```

Meaning:

```text
GAIN < 1.00  wider / softer translucent edge
GAIN = 1.00  exact prior HUFF Classic behavior
GAIN > 1.00  narrower / harder edge
```

Invert remains a separate control.

## Self Key

### Standard mode — SELF KEY OFF

```text
key control: clean source luminance
clean patch: clean source RGB
underlying image: current processed gBuf
```

This is the existing HUFF Classic behavior.

### Self-key mode — SELF KEY ON

```text
key control: current processed gBuf luminance
key fill: current processed gBuf
background/restoration material: clean source
```

Implementation detail:

HUFF does not allocate a new full-resolution key/fill surface. The existing bounded key canvas first captures the clean patch, then temporarily samples `gBuf` to derive the key-control luminance. The clean patch alpha is shaped by the processed luminance and composited over the already-present processed image.

At full MIX this is algebraically equivalent, for opaque video, to:

```text
output = processed * key + clean * (1 - key)
```

At partial MIX, the existing processed image is progressively moved toward that self-key composite.

## Why this matters with Glitch Strobe

```text
stepped / held Glitch material
        +
real-time Pipeline Luma Key
        +
SELF KEY optionally derived from the processed corruption itself
```

The key can therefore isolate bright/dark regions of the corrupted material while clean video continues moving beneath it.

## Performance boundary

- no fourth full-resolution canvas;
- no second history system;
- no change to FrameRing cadence;
- standard key path retains decoded-frame caching;
- SELF KEY intentionally rebuilds while active because its key source is the changing processed image;
- SELF KEY therefore performs one additional bounded 640px-class readback compared with standard mode.

## Protected systems

Unchanged:

- Flow;
- Glitch algorithm and Glitch Strobe scheduling;
- Scanlines;
- Feedback;
- Symmetry;
- Solarize;
- CLASSIC / CRISP FINISH recipes;
- render buffer topology;
- decoder and clocks;
- mirror, Syphon, Spout;
- native Tauri runtime;
- factory presets.
