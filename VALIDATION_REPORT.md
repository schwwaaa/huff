# Validation Report — Pass 41A

## Dedicated validation

- `npm run validate:pass41a` — **286 checks PASS**.
- `npm run simulate:pass41a` — **PASS**.

The simulation verifies:
- 3840×2160 AUTO -> 1920×1080;
- 2560×1440 AUTO -> 1920×1080;
- ultrawide/portrait AUTO dimensions remain within the 1080p-class pixel/long-edge ceiling;
- explicit 720P and 1080P modes;
- 1080P history ceiling = 24 full RGBA frames under 192 MiB;
- 720P history ceiling = 54 frames;
- STRETCH/FIT/FILL/1:1 rectangle/crop geometry for a 4:3 source.

## Protected-baseline validation

`baseline/pass40w-protected.sha256` contains **214 exact protected files**:
- `src/effects.js`;
- `src/pipeline-runtime.js`;
- `src/capability-instrumentation.js`;
- all 211 `src-tauri/**` files.

All match Pass 40W exactly.

## Inherited validators

PASS:
- Pass 9 — 1,728 Flow cases / 4,385,502 exact comparisons;
- Pass 10 — 2,400 Scanline cases / 28,342 exact comparisons;
- Pass 13S — 27 checks;
- Pass 14 — 31,497 checks;
- Pass 15 — 38 checks;
- Pass 16 — 644 checks / 8,391,032 exact pixel comparisons;
- Pass 16S — 22 checks;
- Pass 19 — 56 checks;
- Pass 20 — 27 checks / 2,500,000 exact arithmetic comparisons;
- Pass 21 — 32 checks / 5,000 Flow cases / 4,417,878 exact comparisons;
- Pass 22 — 12,000 Scanline cases / 760,519 bands / 3,802,595 exact comparisons;
- Pass 40W — 204 checks.

## Static syntax / data validation

- JavaScript-family syntax — **60 files PASS**;
- inline HTML scripts — **32 scripts PASS**;
- JSON — **33 files PASS**;
- TOML — **1 file PASS**;
- shell syntax — **8 scripts PASS**.

## Release preflight

`npm run release:preflight`:
- **38 passed**
- **0 warnings**
- **0 blockers**

## Runtime claims deliberately not made

Static validation cannot prove:
- exact codec support on every OS/WebView;
- hardware decode use;
- 1080p60 performance with every effect combination;
- whether a specific MOV/WebM codec will decode;
- visual quality of FIT/FILL/1:1 on the user's footage.

Those remain runtime acceptance tests.
