# HUFF Classic Current Status — Pass 19

## Authoritative baseline

Pass 19 continues from the working and committed Pass 18 baseline.

The stable decoder, independent clocks, Pass 16S black-frame repair, Solarize/Luma optimization, and Glitch hot-path optimization remain intact.

## Pass 19 state

- Syphon acknowledgements remain one per accepted frame.
- Visible Syphon status updates are coalesced to four hertz.
- Native receiver checks run every bootstrap frame while disconnected and four times per second while connected.
- Redundant Tauri runtime polling is suspended during healthy acknowledgement flow.
- Native upload and publication timing is sampled at low rate.
- The profiler now separates browser capture, Worker draw/readback, total pipeline, Metal upload, and Syphon publication.
- Output image data, dimensions, orientation, pacing options, and backpressure behavior remain unchanged.

## Retained stable systems

- File → Blob URL → p5 `createVideo()` decoding
- independent p5, transport, mirror, profiler, and Syphon clocks
- source-generation lifecycle guards
- consolidated `gCur`, `gBuf`, and `gScratch` topology
- canvas-backed temporal history
- cached Flow and Scanline geometry
- neutral-stage bypass
- packed Solarize and one-scratch Luma Key
- optimized Glitch dispatch and temporal source cache
- receiver-aware JPEG mirror
- one-fps Syphon bootstrap before attachment
- selected 30/60 fps rate after attachment
- one-frame-in-flight Syphon backpressure
- persistent Metal texture ring
- Spout native path
- mandatory universal bundled `Syphon.framework`

## Current output boundary

HUFF Classic still performs a Canvas2D-to-CPU readback and CPU-to-Metal upload for Syphon. Pass 19 removes avoidable control-plane work and provides the measurements needed to decide whether the next output improvement should target:

- main-thread bitmap capture;
- Worker OffscreenCanvas draw;
- Worker `getImageData`;
- Worker-to-main RGBA transfer;
- WebSocket transfer;
- Metal upload;
- Syphon publication.

## Acceptance gate

Commit Pass 19 only after:

1. OBS receives moving frames from startup;
2. no black-frame regression occurs;
3. reconnect works repeatedly;
4. Pass 18 playback stability is retained;
5. 30 and 60 fps selections still operate;
6. profiler values advance without destabilizing output.

## Next mandatory target

Pass 20: remaining Canvas2D ceiling review using the accumulated Flow, Scanline, Glitch, Solarize, Luma, mirror, and Syphon telemetry. Further Syphon transport ownership changes remain gated on Pass 19 runtime measurements.
