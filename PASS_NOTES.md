# HUFF Classic Optimization Pass 20 — Pass Notes

**Date:** 2026-08-05  
**Baseline:** committed and runtime-confirmed Pass 19  
**Scope:** direct hot-path arithmetic and profiler-only Canvas2D ceiling telemetry

## Summary

Pass 20 continues from the working Pass 19 source without changing media decoding, frame scheduling, buffer ownership, effect order, or native output behavior.

The pass removes p5 `map()` dispatch from active persistence, Scanline, and Glitch paths. p5's `map()` implementation performs parameter validation before evaluating a simple range conversion. In the Glitch jitter loop and moving Scanline preparation, that framework dispatch could occur hundreds of times per rendered frame.

The replacement expressions use the same operation order as p5 `map()` for a `[0, 1]` input range. Deterministic validation compared 2,500,000 old/new arithmetic results with exact JavaScript equality.

Pass 20 also adds profiler-only Scanline and Flow draw-count telemetry so the remaining Canvas2D ceiling can be ranked from target-runtime evidence rather than speculation.

## Runtime changes

### 1. Persistence decay

Before:

```javascript
map(1 - persistence, 0, 1, 1, 20) / 255
```

After:

```javascript
(((1 - persistence) * (20 - 1)) + 1) / 255
```

The decay alpha is unchanged. The p5 helper and its validation path are removed from the active persistent-render path.

### 2. Scanline shift remapping

Per-band shift noise now uses local unit-range arithmetic instead of p5 `map()`.

The shift range and span are prepared once before the band loop. Noise sampling, flooring, skew addition, clipping, band order, and draw rectangles remain unchanged.

### 3. Glitch smear direction

The zero-angle X/Y noise conversion and the angle-jitter conversion now use direct arithmetic. Noise calls and trigonometric calculations remain at the same positions.

### 4. Glitch per-tile jitter

The jitter minimum, maximum, and span are prepared once per Glitch invocation. Each tile now performs only the noise samples, direct range conversion, jitter multiplication, and floor.

The following remain unchanged:

- noise coordinates;
- block-derived range;
- jitter amount;
- flooring order;
- wrapped tile position;
- history selection;
- source and destination rectangles;
- tile and smear draw order.

### 5. Remaining-ceiling telemetry

The backtick profiler now includes:

```text
scan bands   average prepared Scanline bands per active frame
scan draws   average Scanline drawImage calls per active frame
flow tiles   average Flow tiles per active frame
flow draws   average Flow drawImage calls per active frame
flow grid    Flow grid rebuild/reuse count
```

These counters update only while the profiler is visible.

## Junkpile influence

Pass 20 applies the same rule used throughout the Junkpile examples: once a parameter is in an active per-frame or per-element path, avoid routing simple operations through general-purpose framework helpers. Keep the creative model in p5.js, but perform the irreducible Canvas2D work with explicit state, direct arithmetic, persistent workspaces, and measurable draw counts.

No WebGL or wgpu renderer was imported.

## Deliberately unchanged

- File → Blob URL → p5 `createVideo()` decoding
- p5 draw clock
- independent transport, mirror, and profiler clocks
- media lifecycle from Pass 13S
- full-resolution buffer topology
- temporal-ring capture and memory policy
- Glitch placement, cluster motion, history selection, and artistic draw count
- Scanline band generation, noise sequence, geometry, and paint order
- Flow formulas, tile geometry, Float32 displacement quantization, and paint order
- Solarize and Pipeline Luma Key
- JPEG mirror transport
- Pass 16S Syphon bootstrap repair
- Pass 19 Syphon control-plane optimization
- Spout
- Rust/Tauri source and bundled `Syphon.framework`

## Expected benefit

This pass removes framework parameter validation from the hottest Glitch and Scanline remapping paths. The largest structural reduction occurs when Glitch uses many tiles and Scanlines uses many moving bands.

No target-platform FPS claim is made until runtime comparison against Pass 19.
