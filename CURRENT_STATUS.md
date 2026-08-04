# HUFF Classic Current Status — Pass 18

## Authoritative baseline

Pass 18 continues from the working and committed Pass 17 baseline.

The stable decoder, independent schedulers, Pass 16S Syphon bootstrap repair, and Pass 17 Luma Key optimization remain intact.

## Pass 18 state

- Glitch tile and smear draws now call the cached Canvas2D context directly.
- Temporal history source references are cached by FrameRing mutation generation and requested depth.
- Smear offsets are rounded once per smear step in reusable typed buffers.
- Constant tile span is calculated once per Glitch invocation.
- The profiler reports Glitch tile count, draw-call count, and ring-cache rebuild/reuse behavior.
- Artistic draw count, order, geometry, and compositing remain unchanged.

## Retained stable systems

- File → Blob URL → p5 `createVideo()` decoding
- independent p5, transport, mirror, and profiler clocks
- source-generation lifecycle guards
- consolidated `gCur`, `gBuf`, and `gScratch` topology
- canvas-backed temporal history and memory release
- cached Flow and Scanline geometry
- neutral-stage bypass
- packed Solarize processing
- one-scratch Pipeline Luma Key
- receiver-aware JPEG mirror
- one-fps Syphon bootstrap before attachment
- selected full Syphon rate after attachment
- Spout native path
- mandatory universal bundled `Syphon.framework`

## Current performance boundary

Glitch's remaining dominant cost is the number of Canvas2D `drawImage()` operations:

```text
accepted tiles × (1 + SMEAR)
```

Pass 18 reduces surrounding JavaScript overhead and exposes that count. It does not silently reduce tiles or smear copies.

## Acceptance gate

Pass 18 should be committed as the next baseline only after:

1. visual parity with Pass 17;
2. equal or better normal playback stability;
3. no Syphon regression;
4. equal or lower `applyGlitch` time at the same `gl draws` count;
5. correct temporal history after seek, resize, QUALITY change, and source replacement.

## Next mandatory target

Pass 19: output-capture budget and Syphon optimization, preserving the working bootstrap and black-frame repair.
