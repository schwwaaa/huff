# HUFF Classic Current Status — Pass 17

## Authoritative baseline

Pass 17 continues from the working and committed Pass 16S baseline.

Pass 16S remains the known Syphon repair boundary. Pass 17 modifies only Pipeline Luma Key Canvas2D processing and profiler reporting; it does not change the native Syphon implementation or startup policy.

## Retained stable systems

- File → Blob URL → p5 `createVideo()` decoding
- Independent p5 render, transport, mirror, and profiler clocks
- Source-generation lifecycle guards
- Consolidated `gCur`, `gBuf`, and `gScratch` topology
- Canvas-backed temporal history
- Cached Flow and Scanline geometry
- Neutral-stage bypass
- Packed Solarize processing
- Receiver-aware JPEG mirror
- One-fps Syphon bootstrap before attachment
- Full selected Syphon rate after attachment
- Spout native path
- Mandatory bundled universal `Syphon.framework`

## Pass 17 state

- Pipeline Luma Key now uses one bounded scratch instead of two.
- One clean-source copy and one `destination-in` pass are removed from each patch rebuild.
- Packed and byte fallback pixel paths are present.
- Luma Key phase telemetry is available only while the profiler is visible.

## Acceptance gate

Pass 17 becomes the next committed baseline only after:

1. key-boundary visual parity against Pass 16S;
2. equal or better playback stability;
3. no Syphon black-frame regression;
4. acceptable performance with Luma Key combined with Glitch, Scanlines, Feedback, and Solarize.

## Deferred Syphon optimization

Syphon is working again under Pass 16S. Further Syphon optimization remains mandatory, but it is deferred to the dedicated output-capture pass so the functioning bootstrap path is not casually disturbed during effect optimization.
