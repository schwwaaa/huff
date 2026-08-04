# HUFF Classic Pass 13S — Source Lifecycle Stability Audit

## Decision boundary

The rejected Pass 13 combined rendering, transport UI, mirror scheduling, and profiler work at the end of every p5 frame. Runtime testing showed that Pass 12R was significantly more stable, so none of that scheduling consolidation is retained.

Pass 13S changes only asynchronous ownership and cleanup.

## Stable clock topology retained

```text
requestVideoFrameCallback
  → decoded frame copy
  → temporal-ring capture

p5 draw
  → effects
  → presentation

transport requestAnimationFrame
  → timeline and time display

mirror requestAnimationFrame
  → bounded preview capture and encoding

profiler requestAnimationFrame
  → optional diagnostic overlay
```

No service above is invoked by `draw()`.

## Source authority model

```text
select source A
  → generation 1

select source B before A finishes
  → retire generation 1
  → generation 2

late callback from A
  → generation mismatch
  → stop without changing current state
```

A callback must match both:

1. the active generation; and
2. the active media element or capture wrapper.

This protects against stale readiness, autoplay, seek, error, and camera callbacks.

## Resource ownership

| Resource | Owner | Retirement point |
|---|---|---|
| readiness interval | active source generation | ready, timeout, replacement, shutdown |
| pointer/keyboard autoplay unlock | active source generation | successful gesture, replacement, shutdown |
| rVFC/fallback frame pump | `_pumpSession` token | pause, replacement, shutdown |
| camera tracks | active capture | stop, replacement, stale completion, shutdown |
| Blob URL | active file source | replacement, camera start, shutdown |
| media Web Audio node connection | active media element | replacement, shutdown |
| mirror encoder Worker | mirror transport | pagehide or beforeunload |
| mirror WebSocket | mirror transport | pagehide or beforeunload |
| mirror reconnect timer | mirror transport | suppressed once shutdown begins |

## Junkpile influence

The implementation follows lifecycle lessons already demonstrated in the Junkpile Tauri v1 examples without importing their renderer architecture:

- the video-player example explicitly revokes the prior Object URL and removes readiness listeners after completion;
- the live-video-switcher example explicitly stops camera tracks, clears `srcObject`, revokes source URLs, and performs shutdown cleanup.

HUFF Classic keeps its existing p5 media wrappers and decoder path, adding only equivalent resource ownership and stale-request rejection.

## Rejected behavior kept out

The following remain absent:

- `_afterRenderFrame()`;
- transport updates from `draw()`;
- mirror capture from `draw()`;
- profiler reporting from `draw()`;
- renderer-window decoder ownership;
- Tauri asset-protocol video loading;
- `removeAttribute('src')` during ordinary replacement;
- forced `media.load()` during ordinary replacement.

## Expected benefit

This pass should improve stability during:

- rapid file replacement;
- changing files before autoplay unlock;
- camera-to-file switching;
- repeated camera selection;
- closing the app while media is active;
- closing while mirror reconnect is pending;
- long sessions with many source changes.

It does not claim a direct Canvas2D frame-rate increase. Its performance value is preventing hidden old resources from competing with the current decoder and renderer.
