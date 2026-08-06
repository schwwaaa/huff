# Glitch Strobe Isolation Audit

## Signal relationship

```text
current decoded source ───────────────→ Pipeline Luma Key mask (every render)
         │
         └→ FrameRing → Glitch update (every N decoded frames) → persistent gBuf

persistent glitch + real-time clean reveal → remaining selected pipeline stages
```

The strobe gate surrounds only the call to `applyGlitch()`. `applyPipelineLumaKey()` remains outside the gate and receives the current `_vfc` serial on every render in which Luma Key is active.

## Resource cost

- no additional full-resolution canvas;
- no second FrameRing;
- no new animation loop;
- one small sealed scheduling-state object;
- scheduling uses decoded-frame buckets rather than render-frame timing.

## Compatibility

- STROBE defaults off;
- legacy presets explicitly recover to STROBE off;
- changing source, resizing, or clearing buffers resets the bucket gate;
- both CLASSIC and CRISP FINISH recipes use the same isolated Glitch/Luma group;
- Flow and all effect implementations are unchanged.
