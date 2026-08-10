# Git Commit Message — use after runtime acceptance

```bash
git add . && git commit \
  -m "fix: define HUFF Classic playback fidelity boundary" \
  -m "Cap Classic processing to a 1080p-class maximum and add explicit AUTO, 720P and 1080P processing modes so fixed-resolution effects/history/output are no longer silently driven by a large UI window; keep AUTO as the compatibility default and reserve 4K+ processing for HUFF HD." \
  -m "Add STRETCH/FIT/FILL/1:1 source mapping, replace the misleading public QUALITY control with memory-budgeted HISTORY while retaining the old quality ID as a hidden preset/MIDI/OSC alias, and enforce the FrameRing 192 MiB ceiling without an unsafe minimum-frame override." \
  -m "Decouple mirror preview fidelity from temporal history, retain fastSeek while dragging but land on an exact currentTime seek at release, and expose requestVideoFrameCallback plus browser dropped-frame/source/process telemetry in the profiler." \
  -m "Preserve Pass 40W Corrupt/Scan/Luma behavior, Scan FIELD, Feedback, Flow, pipeline runtime and the full native Tauri tree; add Pass 41A simulation, validation, compatibility docs and playback-fidelity audit."
```
