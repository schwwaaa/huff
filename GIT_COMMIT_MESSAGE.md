# Git Commit Message

```text
fix: bootstrap HUFF Classic Syphon frame publication

Supersede Pass 16 after OBS discovered the HUFF Syphon server but received a black source with no advancing frames.

Remove the duplicate native hasClients gate and publish one bounded bootstrap frame per second until a receiver is confirmed.

Switch immediately to the selected Syphon frame rate after attachment while preserving one-frame acknowledgements, WebSocket backpressure, Worker readback, persistent Metal textures, and receiver-aware full-rate pacing.

Request Syphon output dimensions during ImageBitmap capture when supported and retain the proven full-size Worker fallback.

Preserve the Pass 16 Solarize optimization, stable Blob URL decoder, independent render clocks, temporal history, canvas mirror, Spout, and mandatory framework packaging.
```

## Command

```bash
git add . && git commit \
  -m "fix: bootstrap HUFF Classic Syphon frame publication" \
  -m "Supersede Pass 16 after OBS discovered the HUFF Syphon server but received a black source with no advancing frames." \
  -m "Remove the duplicate native hasClients gate and publish one bounded bootstrap frame per second until a receiver is confirmed." \
  -m "Switch immediately to the selected Syphon frame rate after attachment while preserving one-frame acknowledgements, WebSocket backpressure, Worker readback, persistent Metal textures, and receiver-aware full-rate pacing." \
  -m "Request Syphon output dimensions during ImageBitmap capture when supported and retain the proven full-size Worker fallback." \
  -m "Preserve the Pass 16 Solarize optimization, stable Blob URL decoder, independent render clocks, temporal history, canvas mirror, Spout, and mandatory framework packaging."
```
