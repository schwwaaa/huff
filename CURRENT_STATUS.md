# HUFF Classic Current Status — Pass 14

## Authoritative baseline

**HUFF Classic Optimization Pass 14 is Pass 13S plus an isolated Canvas2D copy and temporal-ring resource pass.**

The rejected Pass 13 scheduler consolidation and Pass 12 asset-protocol decoder migration remain excluded.

## Working architecture

```text
controls WebView
  → File input / Blob URL / p5 createVideo decode
  → decoded-frame gCur update
  → bounded full-resolution temporal ring
  → p5.js + Canvas2D effect pipeline
  → independent JPEG canvas mirror
  → independent Syphon / Spout outputs
```

## Pass 14 additions

- exact-size full-frame Canvas2D copy dispatch;
- exact-size temporal-history capture path;
- explicit history backing-store retirement on shrink, resize, and exit;
- newest-frame retention during ring-capacity reduction;
- temporal-ring allocation and estimated-memory profiler rows;
- reusable clustered-glitch physics updater;
- Pass 14 deterministic validation.

## Preserved stability boundaries

- Blob URL + p5 `createVideo()` media path;
- controls-window decoder ownership;
- independent p5, transport, mirror, and profiler clocks;
- full-rate history capture;
- existing history capacity and memory-budget policy;
- fixed effect order and formulas;
- Pass 13S source-generation and cleanup guards;
- Syphon, Spout, Rust relay, and mandatory framework packaging.

## Next optimization boundary

Runtime-test Pass 14 before changing another subsystem. The next measured candidates are:

1. mirror capture staging and full-canvas snapshot cost;
2. Solarize CPU readback and upload;
3. Pipeline Luma Key CPU mask work;
4. high-density Glitch draw-call cost;
5. temporal-history capture policy only if a behavioral tradeoff is explicitly approved.

The next pass must continue from whichever of Pass 13S or Pass 14 proves more stable in target testing.
