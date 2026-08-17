# HUFF Classic Pass 51 — Syphon 720p60 Pipeline Audit

## Decision

Classic Syphon is deliberately narrowed to **1280×720 only**. The primary output rate is **60 fps**; **30 fps** remains the safe mode and automatic fallback. 1080p is removed from the Classic Syphon UI.

## Why Pass 50 could still miss 60 fps

Pass 50 eliminated the largest browser-thread transfer by sending Worker-read RGBA directly to Rust, but scheduling still behaved as a single round trip:

```text
capture A → Worker readback → socket → native upload/publish → ACK
                                                        ↓
                                             only then capture B
```

That is a good stability contract for 30 fps, but at 60 fps every stage has to complete before the next 16.67 ms opportunity. It prevents useful overlap between browser readback and native publication.

## Pass 51 model

```text
controls                    Worker                     Rust / Metal
   │                          │                           │
   ├─ capture A ─────────────>│ draw/read/send A ───────>│ publish A
   │                          │  credit: 1/2             │
   ├─ capture B ─────────────>│ draw/read/send B ───────>│ queued behind A
   │                          │  credit: 2/2             │
   │        stop captures     │                           │
   │                          │<────────────── ACK A ─────┤
   │<─ capacity available ────┤  credit: 1/2             │
   ├─ capture C ─────────────>│                           │
```

The Worker owns the native credits. Maximum outstanding depth is exactly **2**.

## Backpressure

Two independent limits prevent an output queue:

1. `outstandingFrames < 2`
2. local WebSocket `bufferedAmount` may not exceed approximately one 720p RGBA frame before another readback is accepted.

If capacity is exhausted, the current *Syphon output opportunity* is dropped. HUFF's source/playback/effect rendering is not held or slowed.

## ACK timeout

Direct-transport ACK timeout ownership moves into the Worker. A one-shot timer tracks the oldest outstanding frame. Failure returns control to the established main-socket fallback rather than leaving the direct pipeline wedged at two credits.

## Controls-thread traffic

The Worker no longer forwards every native ACK as a scheduling dependency. It aggregates status/profiling and reports at a bounded rate (approximately 4 Hz), with immediate reports for connection changes/native samples/empty pipeline state. Small `frame-consumed` and `transport-capacity` messages control only browser capture availability.

## Safe fallback behavior

When worker-direct fails:

```text
requested 720p60
      ↓
automatic fallback
      ↓
1280×720 / 30 fps
      ↓
Pass 49 one-frame-in-flight main-socket transport
```

A future Start makes a fresh worker-direct attempt and restores the selected 60 fps rate if successful.

## Deliberately unchanged

- native Rust WebSocket protocol;
- `syphon.rs` Metal textures/publication;
- Syphon bootstrap discovery repair;
- all HUFF effects;
- Luma/Solarize/Feedback/Persistence/Flow;
- Spout.

## What this does not solve

Classic remains a WebView/Canvas2D architecture. Syphon still requires a 720p CPU-readable RGBA frame and a native Metal upload. Pass 51 improves overlap and bounds latency; it does not make the path zero-copy.
