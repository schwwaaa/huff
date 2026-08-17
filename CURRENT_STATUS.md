# HUFF Classic — Current Status

## Authoritative lineage

- Pass 41A (`huff-08102026.zip`) remains the runtime-accepted HUFF Classic foundation.
- Passes 42–48 retain the accepted Solarize/Luma/compositing work.
- Pass 49 — **Syphon Stability Contract** — accepted on the target machine.
- Pass 50 — Worker-owned Syphon transport — reported to work well on the target machine.

## Current candidate

**Pass 51 — 720p60 Syphon Bounded Pipeline.**

Classic Syphon is now fixed at 1280×720. 60 fps is the default worker-direct target; 30 fps is the safe selectable mode and automatic fallback rate. 1080p Syphon is removed from Classic.

## Pass 51 transport

`Canvas -> ImageBitmap -> Worker scale/readback -> Worker WebSocket -> max 2 outstanding native frames -> Rust -> Metal -> Syphon`

The Worker owns native ACK credits. Browser capture of the next frame may begin after the Worker has sent the current frame rather than waiting for native publication to finish.

## Protected stability contract

- explicit OFF / STARTING / WAITING / STREAMING / RECOVERING / STOPPING lifecycle;
- 1 fps bootstrap while waiting for a receiver;
- bounded transport, never an unbounded latency queue;
- Pass 49 one-frame main-socket fallback;
- fallback automatically caps requested 60 fps to 30 fps;
- clean Start/Stop/restart/shutdown ownership.

## Protected creative behavior

All effect/render behavior, Luma, Solarize, Global Mix, Layer Priority, Feedback/Persistence, frozen Flow, playback, Spout, native Syphon protocol and native Metal publisher are unchanged.

## Runtime gate

Test 720p60 first and confirm `worker-direct`. The profiler should show `sy credit` moving between 0–2 without persistent credit saturation. Then test receiver reconnects, Start/Stop/Start, heavy-effects streaming and forced fallback to 720p30.
