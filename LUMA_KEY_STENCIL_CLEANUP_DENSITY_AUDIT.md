# Pass 34 — Luma Key Stencil / Cleanup / Density Audit

## Why Pass 33 changed

Runtime feedback established three points:

1. X-FADE is worth keeping.
2. The GLITCH-derived key source is not creatively useful.
3. literal Canvas2D `lighter` ADD is too intense and loses image information too quickly.

Pass 34 therefore does not deepen the rejected GLITCH key. It changes the key model.

## Fairlight influence: live key + stored stencil

The Fairlight research distinguishes:

- a live luminance/chroma key that follows incoming video continuously;
- an internal stored stencil that persists and divides the image into regions.

Fairlight's stencil can participate in under/over image relationships and, more broadly, can control where image state changes. Pass 34 intentionally adapts only the smallest useful Classic-compatible subset:

```text
LIVE
continuous luminance-derived key

STENCIL
one-shot captured luminance region map
```

The captured stencil is stored as bounded 8-bit luminance. It does not become a new full-resolution image store, and it is not serialized into presets.

## INDIGO influence: Cleanup / Density

The INDIGO AV Mixer describes Cleanup/Density as an alternative adjustment of the same key-control process used by Clip/Gain:

- Cleanup increasingly limits background key levels to black, removing noise and slight shadows.
- Density increasingly limits foreground key levels to white/unity.
- Opacity remains separate from Clip/Gain.

HUFF maps these concepts to the existing key alpha signal after Clip/Gain. Existing MIX continues to act as the separate overall opacity control.

The shaping uses a cached 256-entry alpha LUT, rebuilt only when Cleanup or Density changes.

## SOFT ADD adaptation

INDIGO offers Add and X-Fade modes. Pass 33 represented Add with Canvas2D `lighter`. That is a useful conceptual mapping but was too aggressive in this image-processing context.

Pass 34 keeps the Add concept but deliberately does not claim mathematical hardware emulation:

```text
X-FADE  → source-over
SOFT ADD → screen
```

Screen keeps a bright/additive character while avoiding simple channel summation to white.

## Resource cost

At 1080p:

```text
working matte = 640 × 360
8-bit stencil  = 230,400 bytes ≈ 225 KiB
```

CAPTURE adds one bounded readback on demand. Reusing the stencil adds no repeated processed-image readback.

## Preset semantics

Following the Fairlight distinction between process state and pictorial information:

Preset stores:

- key source selection;
- Clip/Gain;
- Cleanup/Density;
- Fade mode;
- Mix/Invert.

Preset does not store:

- captured stencil pixels.

If a preset requests STENCIL and none exists, runtime safely falls back to LIVE until a new stencil is captured.
