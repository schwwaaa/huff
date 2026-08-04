# HUFF Classic Current Status — Pass 16S

## Authoritative baseline

Pass 16S supersedes Pass 16.

It retains the stable Pass 13S lifecycle and Pass 14–16 Canvas2D improvements while repairing the Syphon black/zero-frame startup condition.

## Stable systems retained

- File → Blob URL → p5 `createVideo()` decoding
- Independent p5 render, transport, mirror, and profiler clocks
- Canvas-backed temporal history
- Consolidated full-resolution buffer topology
- Cached Flow and Scanline geometry
- Neutral-stage bypass
- Reduced Solarize surface/copy cost
- Receiver-aware JPEG mirror
- Source-generation lifecycle guards
- Mandatory bundled universal `Syphon.framework`
- Spout native path

## Pass 16S repair state

- Syphon server discovery remains unchanged.
- No-client output now publishes one bounded bootstrap frame per second.
- Connected clients receive the selected output frame rate.
- Browser and native layers no longer apply a mutually blocking `hasClients` gate.

## Release gate

Pass 16S is not accepted as the next committed baseline until OBS displays live frames and the published-frame counter advances under target macOS testing.
