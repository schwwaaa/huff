# Git Commit Message — HUFF Classic Pass 14

## Title

```text
perf: streamline HUFF Classic canvas copies and history release
```

## Body

```text
Continue from the committed Pass 13S baseline without changing decoder ownership or frame scheduling.

Use Canvas2D's non-scaling drawImage path when full-frame source and destination dimensions match, while retaining the scaled fallback for mismatched media.

Apply the exact-size path to temporal-ring capture and shared buffer/scratch copies.

Explicitly collapse and release discarded temporal-ring canvas backing stores during capacity reduction, render-size changes, and application shutdown.

Preserve the newest history frames and existing temporal capture cadence, capacity formula, sample ordering, and 192 MiB estimated budget.

Move clustered-glitch physics updating to a reusable module-level function while preserving seeded random order and motion equations.

Add profiler rows for allocated history slots and estimated raw history memory.

Add deterministic Pass 14 validation and preserve the Pass 13S lifecycle, independent clocks, effects, Syphon, Spout, Rust relay, and framework packaging.
```

## Command

```bash
git add . && git commit \
  -m "perf: streamline HUFF Classic canvas copies and history release" \
  -m "Continue from the committed Pass 13S baseline without changing decoder ownership or frame scheduling." \
  -m "Use Canvas2D's non-scaling drawImage path when full-frame source and destination dimensions match, while retaining the scaled fallback for mismatched media." \
  -m "Apply the exact-size path to temporal-ring capture and shared buffer/scratch copies." \
  -m "Explicitly collapse and release discarded temporal-ring canvas backing stores during capacity reduction, render-size changes, and application shutdown." \
  -m "Preserve the newest history frames and existing temporal capture cadence, capacity formula, sample ordering, and 192 MiB estimated budget." \
  -m "Move clustered-glitch physics updating to a reusable module-level function while preserving seeded random order and motion equations." \
  -m "Add profiler rows for allocated history slots and estimated raw history memory." \
  -m "Add deterministic Pass 14 validation and preserve the Pass 13S lifecycle, independent clocks, effects, Syphon, Spout, Rust relay, and framework packaging."
```
