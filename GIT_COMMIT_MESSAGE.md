# Git Commit Message — HUFF Classic Pass 13S

## Title

```text
fix: harden HUFF Classic source lifecycle without changing frame pacing
```

## Body

```text
Branch from the stable Pass 12R / Pass 11 renderer and keep the proven Blob URL plus p5 createVideo decoder path.

Add source-generation guards so stale readiness, autoplay, seek, error, and camera callbacks cannot reactivate replaced media.

Own and clear the active readiness interval and autoplay gesture listeners across replacement and shutdown.

Reject stale camera completions by stopping their tracks, clearing srcObject, and removing abandoned capture elements.

Add conservative idempotent media, audio, Blob URL, mirror Worker, and WebSocket shutdown cleanup without forcing decoder reset during normal source changes.

Keep p5 draw, transport, mirror, and profiler requestAnimationFrame loops independent and keep mirror capture out of the render boundary.

Add profiler-only decode, temporal-ring, and mirror backpressure telemetry plus a lifecycle-boundary validator.

Preserve effects, buffer topology, MIDI, OSC, presets, Syphon, Spout, Rust transport, and mandatory framework packaging.
```

## Command

```bash
git add . && git commit \
  -m "fix: harden HUFF Classic source lifecycle without changing frame pacing" \
  -m "Branch from the stable Pass 12R / Pass 11 renderer and keep the proven Blob URL plus p5 createVideo decoder path." \
  -m "Add source-generation guards so stale readiness, autoplay, seek, error, and camera callbacks cannot reactivate replaced media." \
  -m "Own and clear the active readiness interval and autoplay gesture listeners across replacement and shutdown." \
  -m "Reject stale camera completions by stopping their tracks, clearing srcObject, and removing abandoned capture elements." \
  -m "Add conservative idempotent media, audio, Blob URL, mirror Worker, and WebSocket shutdown cleanup without forcing decoder reset during normal source changes." \
  -m "Keep p5 draw, transport, mirror, and profiler requestAnimationFrame loops independent and keep mirror capture out of the render boundary." \
  -m "Add profiler-only decode, temporal-ring, and mirror backpressure telemetry plus a lifecycle-boundary validator." \
  -m "Preserve effects, buffer topology, MIDI, OSC, presets, Syphon, Spout, Rust transport, and mandatory framework packaging."
```
