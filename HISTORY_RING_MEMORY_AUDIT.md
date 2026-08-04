# HUFF Classic Pass 14 — Temporal History and Canvas-Copy Audit

## Current history topology

```text
video decoder
  → decoded-frame callback
  → full-frame copy into gCur
  → full-frame copy into next FrameRing slot

render loop
  → glitch and Flow may sample FrameRing slots
```

The ring stores reusable, full-resolution Canvas2D surfaces. It does not perform `getImageData()` during capture and temporal effects draw historical canvases directly.

## Capacity policy retained

The existing capacity policy remains authoritative:

```text
requested capacity ≈ 60 × (QUALITY × 2)
maximum estimated raw history memory = 192 MiB
minimum capacity = 4 frames
```

The actual capacity is the lower of the quality request and the memory-budget result.

Pass 14 deliberately does not lower the budget or capture cadence because either change would alter temporal depth or immediate effect behavior.

## Exact-size copy audit

Before Pass 14, full-frame copies always used a destination rectangle:

```javascript
ctx.drawImage(source, 0, 0, width, height);
```

That form is required for scaling, but many HUFF copies are exact-size transfers between render buffers.

Pass 14 dispatches exact-size transfers to:

```javascript
ctx.drawImage(source, 0, 0);
```

Scaled media still uses the destination rectangle. The composite operator, alpha, destination dimensions, and source pixels are unchanged.

## Backing-store retirement

Dropping a JavaScript reference does not require a browser engine to release a canvas backing store immediately. Pass 14 therefore collapses retired canvases before discarding them.

### Capacity reduction

```text
old ring capacity
  → retain newest N active frames
  → collapse discarded canvas backing stores
  → install smaller ring array
```

### Render-size change

```text
old-resolution history
  → collapse every old backing store
  → clear ring
  → lazily allocate new-resolution slots as decoded frames arrive
```

### Application exit

```text
media shutdown
  → dispose FrameRing
  → collapse all allocated history surfaces
```

## Why history capture remains always armed

A demand-driven ring could reduce clean-playback work, but it would also change what happens when Glitch or Flow Pulse is enabled after a period of inactivity. The existing instrument keeps historical material immediately available.

Pass 14 preserves that behavior. Demand-driven capture remains a separate, explicitly behavioral proposal and is not included in this optimization pass.

## Profiler interpretation

The backtick profiler now includes:

```text
ring mem   allocated/capacity slots
ring MiB   estimated raw backing memory
```

Use these rows to observe:

- how quickly the ring fills after loading a source;
- the capacity selected for the current resolution and QUALITY;
- whether capacity reduction releases slots;
- whether repeated resize cycles leave unexpected allocations.

The estimate excludes browser metadata, texture duplication, compositor resources, decoder surfaces, and garbage-collector overhead.

## Junkpile comparison

Junkpile's WebGL feedback and video-player examples explicitly create persistent ping-pong resources, delete old framebuffers/textures on size changes, and preserve a strict read/write swap order. HUFF Classic uses different technology, but the same rule applies:

> Persistent visual memory must have explicit allocation, retention, resize, and release boundaries.
