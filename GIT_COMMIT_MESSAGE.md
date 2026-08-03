# HUFF Classic Optimization Pass 11 — Git Commit Message

## Commit title

```text
perf: bypass neutral HUFF Classic render stages
```

## Commit body

```text
Resolve effective frame activity before entering the persistent Canvas2D pipeline.

Skip zero-strength Flow, invisible Scanlines, zero-mix Luma and Global Mix, identity Feedback, edge-position Symmetry, and exact-identity Solarize states.

Present the clean source directly when every stage is neutral and synchronize gBuf only once per decoded source frame instead of every render tick.

Preserve Glitch and Scanline phase progression, fixed layer order, persistence behavior during active processing, and immediate re-entry from the current clean frame.

Include Scanlines and Pipeline Luma Key in effective-pipeline accounting so their output is not discarded when used independently.

Add exact neutral-state and bypass-copy validation while preserving Syphon, Spout, Rust relay, Tauri packaging, and the mandatory bundled Syphon framework.
```

## Ready-to-run command

```bash
git add . && git commit \
  -m "perf: bypass neutral HUFF Classic render stages" \
  -m "Resolve effective frame activity before entering the persistent Canvas2D pipeline." \
  -m "Skip zero-strength Flow, invisible Scanlines, zero-mix Luma and Global Mix, identity Feedback, edge-position Symmetry, and exact-identity Solarize states." \
  -m "Present the clean source directly when every stage is neutral and synchronize gBuf only once per decoded source frame instead of every render tick." \
  -m "Preserve Glitch and Scanline phase progression, fixed layer order, persistence behavior during active processing, and immediate re-entry from the current clean frame." \
  -m "Include Scanlines and Pipeline Luma Key in effective-pipeline accounting so their output is not discarded when used independently." \
  -m "Add neutral-state validation while preserving Syphon, Spout, Rust relay, Tauri packaging, and mandatory framework bundling."
```
