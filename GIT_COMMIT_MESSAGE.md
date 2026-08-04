# HUFF Classic Pass 17 — Git Commit Message

## Title

```text
perf: streamline HUFF Classic pipeline luma key
```

## Body

```text
Continue from the committed Pass 16S baseline without changing decoder ownership, frame scheduling, or the working Syphon bootstrap path.

Build the bounded Pipeline Luma Key clean patch directly in one CPU-readable scratch canvas instead of maintaining a separate white mask canvas and masked-clean canvas.

Remove one clean-source copy and the destination-in composition pass from each patch rebuild while preserving the existing decoded-frame, threshold, invert, and dimension cache keys.

Use a packed little-endian Uint32 pixel path that retains clean RGB and replaces only alpha, with a byte-oriented fallback and partial-source-alpha handling.

Preserve the original luma coefficients, 64-level rolloff, invert floating-point operation order, mix behavior, effect position, and 640-pixel scratch bound.

Add profiler-only Luma Key readback, transform, upload, presentation, and cache telemetry.

Preserve Blob URL media loading, independent render/transport/mirror/profiler clocks, Solarize, temporal history, canvas mirror, Syphon, Spout, Rust transport, and mandatory framework packaging.

Add deterministic Pass 17 validation with 17,715,200 exact pixel comparisons.
```

## Command

```bash
git add . && git commit \
  -m "perf: streamline HUFF Classic pipeline luma key" \
  -m "Continue from the committed Pass 16S baseline without changing decoder ownership, frame scheduling, or the working Syphon bootstrap path." \
  -m "Build the bounded Pipeline Luma Key clean patch directly in one CPU-readable scratch canvas instead of maintaining a separate white mask canvas and masked-clean canvas." \
  -m "Remove one clean-source copy and the destination-in composition pass from each patch rebuild while preserving the existing decoded-frame, threshold, invert, and dimension cache keys." \
  -m "Use a packed little-endian Uint32 pixel path that retains clean RGB and replaces only alpha, with a byte-oriented fallback and partial-source-alpha handling." \
  -m "Preserve the original luma coefficients, 64-level rolloff, invert floating-point operation order, mix behavior, effect position, and 640-pixel scratch bound." \
  -m "Add profiler-only Luma Key readback, transform, upload, presentation, and cache telemetry." \
  -m "Preserve Blob URL media loading, independent render/transport/mirror/profiler clocks, Solarize, temporal history, canvas mirror, Syphon, Spout, Rust transport, and mandatory framework packaging." \
  -m "Add deterministic Pass 17 validation with 17,715,200 exact pixel comparisons."
```
