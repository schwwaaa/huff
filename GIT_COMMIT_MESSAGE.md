# HUFF Classic Pass 19 — Git Commit Message

```bash
git add . && git commit \
  -m "perf: reduce HUFF Classic Syphon control overhead" \
  -m "Continue from the committed Pass 18 baseline while preserving the Pass 16S one-fps bootstrap and moving-frame startup repair." \
  -m "Coalesce Syphon status DOM updates to four hertz while retaining one acknowledgement per accepted frame and one-frame-in-flight backpressure." \
  -m "Cache the selected output FPS and suspend redundant Tauri runtime-state polling while WebSocket acknowledgements remain healthy." \
  -m "Sample native Syphon receiver presence at four hertz while connected and on every bootstrap frame while disconnected, avoiding 30/60 Objective-C hasClients calls per second without delaying attachment." \
  -m "Add profiler-gated browser capture, Worker draw/readback, end-to-end pipeline, backpressure, and UI telemetry." \
  -m "Add low-rate sampled Metal upload and Syphon publication timings while keeping ordinary acknowledgements compact." \
  -m "Preserve the stable Blob URL decoder, independent clocks, Canvas2D effects, temporal history, mirror output, Spout, persistent Metal textures, and mandatory framework packaging." \
  -m "Add deterministic Pass 19 validation for receiver sampling, UI coalescing, polling recovery, and retained bootstrap behavior."
```
