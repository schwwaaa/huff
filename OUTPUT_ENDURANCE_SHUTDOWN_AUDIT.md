# HUFF Classic — Output Endurance and Shutdown Audit

**Pass:** HUFF Classic Optimization Pass 28  
**Date:** 2026-08-05  
**Behavioral baseline:** user-confirmed Pass 22  
**Confirmed predecessor:** Pass 27  
**Flow changes:** none

## Objective

Pass 28 hardens the lifecycle around the canvas mirror, Syphon, Spout, MIDI, OSC, and application exit. The visual pipeline and effect algorithms are not changed.

The target failure classes were:

- an output reconnect timeout firing after its window had already closed;
- a mirror animation-frame pump continuing after shutdown;
- a late asynchronous start result reactivating Syphon or Spout after Stop or app exit;
- a Worker, WebSocket, polling interval, or staging canvas surviving longer than its output session;
- OSC and MIDI resources relying only on abrupt process teardown;
- two Tauri windows attempting native cleanup more than once;
- a canvas receiver continuing to decode a stale frame after its socket generation was replaced.

## Browser lifecycle changes

### Canvas mirror sender

The index-window mirror sender now owns:

- one reconnect timeout;
- one animation-frame pump ID;
- Worker message/error handlers;
- input/change listeners used for stream tuning;
- the staging canvas backing store.

Shutdown now:

1. prevents future reconnect scheduling;
2. clears the pending reconnect timeout;
3. cancels the mirror animation-frame pump;
4. detaches tuning listeners;
5. releases and terminates the encoder Worker;
6. detaches and closes the WebSocket;
7. releases the cached render-canvas reference;
8. shrinks the staging canvas to `1 × 1`.

The mirror remains independently paced and is not moved into `draw()`.

### Canvas mirror receiver

The output viewer now uses:

- one owned reconnect timeout;
- a monotonically increasing socket generation;
- one latest-frame-wins pending slot;
- a shutdown flag checked before reconnect, decode, and draw;
- generation checks before an asynchronous ImageBitmap is presented.

Closing the receiver clears the pending frame and prevents an old decode completion from drawing into a new or closed receiver lifecycle.

### Syphon

Syphon start/stop now uses generation guards and explicit pending-operation gates.

A late `start_syphon` completion is rejected when:

- Stop was requested while native start was pending;
- the page began shutting down;
- a newer lifecycle operation superseded the start.

The browser cleanup path now owns and releases:

- the Syphon requestAnimationFrame sender;
- the state polling interval on app shutdown;
- the dedicated WebSocket and handlers;
- the stream Worker and handlers;
- the fallback Canvas2D staging surface;
- cached source-canvas references.

`pagehide` and `beforeunload` both run the same idempotent shutdown path. Native stop is requested on teardown, while the Tauri close handler remains the final authority.

### Spout

Spout receives the same start/stop generation protection as Syphon.

Cleanup now owns and releases:

- the requestAnimationFrame sender;
- the status polling interval on app shutdown;
- the dedicated WebSocket and handlers;
- the Canvas2D readback surface and its backing store;
- cached source-canvas references.

Repeated Start or Stop requests are ignored while the corresponding native operation is pending.

## Native lifecycle changes

The Tauri runtime now performs one idempotent native cleanup pass when either HUFF window closes.

That pass:

- drops the active MIDI connection;
- takes and sends the OSC shutdown channel, releasing UDP port 9000;
- stops Syphon on macOS;
- stops Spout on Windows;
- prevents the second window-close event from repeating native teardown;
- exits the complete two-window process.

The OSC shutdown sender changed from an immutable `OnceCell<Sender>` to a mutex-owned `Option<Sender>`, allowing it to be consumed exactly once.

## Preserved behavior

Pass 28 does not change:

- `src/effects.js`;
- Flow implementation, controls, presets, noise order, FrameRing access, or buffer swap;
- `src/pipeline-runtime.js`;
- stage order or priority behavior;
- video decoding or source scheduling;
- mirror frame format, JPEG quality calculation, receiver-aware suspension, or latest-frame-wins policy;
- Syphon bootstrap behavior, selected 30/60 fps behavior, ACK gate, or Metal publication path;
- Spout frame format, output rate selection, or backpressure skip policy;
- the number of p5 Graphics render surfaces.

## Runtime acceptance tests

### Fast smoke test

1. Start HUFF with a video playing.
2. Open and close the canvas mirror three times.
3. Start Syphon, attach OBS, detach OBS, reattach OBS, then Stop Syphon.
4. Close HUFF while Syphon is active.
5. Relaunch HUFF immediately.

Expected:

- no growing delay in the mirror;
- reconnect resumes with the newest frame;
- Syphon returns from bootstrap to full rate when the receiver reconnects;
- no frozen Start/Stop button;
- no remaining HUFF process after close;
- ports 8787 and 9000 are immediately reusable on relaunch.

### macOS process/port check

After closing HUFF:

```bash
pgrep -fl huff
lsof -nP -iTCP:8787
lsof -nP -iUDP:9000
```

No HUFF process or HUFF-owned listener should remain.

### Windows process/port check

After closing HUFF:

```powershell
Get-Process huff -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue
Get-NetUDPEndpoint -LocalPort 9000 -ErrorAction SilentlyContinue
```

## Non-claims

The package was not runtime-soaked with real Syphon or Spout receivers in the build environment. Rust/Cargo was unavailable, so the native tree was source-validated but not compiled here. Target-machine output endurance and process-exit verification remain required.
