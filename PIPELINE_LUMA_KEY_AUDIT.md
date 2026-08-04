# HUFF Classic Pass 17 — Pipeline Luma Key Audit

## Role in the fixed Classic pipeline

The Pipeline Luma Key is not a generic final-output keyer. It is applied inside the Glitch/Scanline group and restores a luminance-selected portion of the clean source over `gBuf`.

```text
gCur clean source ────────────────┐
                                  │ luminance-derived clean patch
Glitch / persistent gBuf ─────────┼────────→ Scanlines → later stages
```

Its output must preserve existing glitch trails, persistence, and feedback in regions where the clean patch is transparent.

## Cache ownership

The completed bounded clean patch is rebuilt only when one of these changes:

- decoded source-frame serial;
- Luma Key threshold;
- invert state;
- bounded scratch dimensions.

The mix amount is intentionally not part of the patch cache because it is applied as final Canvas2D `globalAlpha` during presentation.

## Removed work

The former implementation retained two bounded canvases:

1. a CPU-readable white alpha mask;
2. a masked clean-source patch.

Each rebuild required:

- one clean copy into the mask canvas;
- one readback;
- one mask upload;
- another clean copy into the patch canvas;
- one `destination-in` composition.

Pass 17 retains only the CPU-readable patch canvas. The readback starts with the actual clean pixels, and the transform changes only alpha. This removes one bounded surface, one clean copy, and one composition pass per rebuild.

## Estimated scratch reduction

At 1920×1080 output, the bounded scratch is 640×360:

```text
640 × 360 × 4 bytes = 921,600 bytes ≈ 0.88 MiB
```

Pass 17 removes one such persistent raw backing surface. Actual WKWebView memory reduction may differ because Canvas2D implementations can retain additional internal resources.

## Pixel equivalence

For ordinary HUFF video and camera frames, source alpha is 255. The previous `destination-in` stage therefore produced exactly the generated mask alpha while retaining the source color. Pass 17 writes that same alpha directly.

For partially transparent source pixels, Pass 17 applies the destination-in alpha multiplication model:

```text
output alpha = round(source alpha × mask alpha / 255)
```

The validation suite compares the removed two-canvas model with both new pixel paths across opaque and partially transparent input.

## Important precision finding

The inverted formula must retain the original operation order:

```text
reveal = 1 - roll
clean alpha = 1 - reveal
```

Although this is algebraically equal to `roll`, floating-point cancellation at exact boundaries can produce a one-byte difference after quantization. The direct implementation deliberately preserves the original sequence.

## Remaining cost

The main remaining Pipeline Luma Key cost is still synchronous Canvas2D readback and upload:

```text
copy/downscale → getImageData → JavaScript transform → putImageData
```

Pass 17 reduces work around that boundary. It does not introduce WebGL, a Worker, frame latency, or a scheduler change.

## Stable fallback

A byte-oriented transform remains available when the runtime is not little-endian. Current supported macOS, Windows, and Linux desktop targets are expected to use the packed path, but correctness does not depend on that assumption.
