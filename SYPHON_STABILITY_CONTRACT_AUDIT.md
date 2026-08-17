# HUFF Classic Pass 49 — Syphon Stability Contract Audit

## Why the contract was narrowed

Classic Syphon is not a zero-copy texture share. The WebView output must become CPU-readable RGBA, cross the local transport boundary, then be uploaded into a native Metal texture. At 1280×720/30 this is already about 105 MiB/s of raw RGBA before protocol/runtime overhead. The goal of Pass 49 was therefore reliability inside a deliberately smaller envelope rather than exposing arbitrary high-load combinations.

## Public profiles

| Profile | Resolution | Rate | Contract |
|---|---:|---:|---|
| CLASSIC | 1280×720 | 30 fps | recommended / stability reference |
| 1080p | 1920×1080 | 30 fps | higher load |
| 720p60 | 1280×720 | 60 fps | experimental |

15 fps, 24 fps and arbitrary dimensions are removed from the Syphon UI.

## Explicit lifecycle

```text
OFF
  -> STARTING
  -> WAITING
  -> STREAMING
  -> RECOVERING
  -> STREAMING / WAITING

RUNNING STATE
  -> STOPPING
  -> OFF
```

The lifecycle state is authoritative; transport details are subordinate to it. This prevents unrelated booleans from producing ambiguous combinations during recovery.

## Bootstrap and backpressure

The repaired startup rule remains:

```text
no confirmed receiver -> at most 1 bootstrap frame/sec
receiver confirmed     -> selected profile rate
```

Only one frame may be in flight. A native acknowledgement releases the gate. If the local socket is backed up, HUFF drops that output opportunity rather than queueing stale frames.

## Pass 50 boundary

Pass 50 is allowed to change where the local WebSocket lives. It is not allowed to change the lifecycle/profile/bootstrap/one-frame contract. The accepted Pass 49 main-owned socket path must remain available automatically as fallback.
