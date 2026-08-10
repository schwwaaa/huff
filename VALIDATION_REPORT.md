# Validation Report — Pass 40U

Completed before packaging:

- `npm run simulate:pass40u` — PASS.
- `npm run validate:pass40u` — PASS, **90 dedicated checks**.
- `npm run validate:pass22` — PASS: **12,000 scanline cases, 760,519 bands, 3,802,595 exact band-field comparisons**.
- `validate:pass9` — PASS.
- `validate:pass10` — PASS.
- `validate:pass13s` — PASS.
- `validate:pass14` — PASS.
- `validate:pass15` — PASS.
- `validate:pass16` — PASS, 8,391,032 exact pixel comparisons.
- `validate:pass16s` — PASS.
- `validate:pass19` — PASS.
- `validate:pass20` — PASS, 2,500,000 exact arithmetic comparisons.
- `validate:pass21` — PASS, 5,000 Flow cases / 4,417,878 exact field-draw comparisons.
- `release:preflight` — **38 passed / 0 warnings / 0 blockers**.
- JavaScript-family syntax — **55 files PASS**.
- Inline HTML scripts — **32 PASS**.
- JSON — **33 files PASS**.
- Shell syntax — **8 scripts PASS**.
- `src-tauri/**` — exact Pass 40T tree comparison: **0 differences**.
- `src/pipeline-runtime.js` — exact Pass 40T match.
- `src/capability-instrumentation.js` — exact Pass 40T match.

## Pass 11 historical validator

`validate:pass11` is **not a current regression signal**. It fails on the already-superseded literal source marker `if (activity.feedback)`; the current Feedback architecture predates Pass 40U and does not contain that historical source form. Pass 40U does not modify the Feedback implementation.

## Pass 40U dedicated assertions

The dedicated validator confirms:

- BANDS remains the default layout;
- legacy presets migrate to BANDS;
- FIELD controls are contextual;
- no rejected Scanlines FIELD RATE, Raster Scan naming, or Zoom Target modes return;
- one Scanlines SPEED still owns phases, XYZ motion and spin;
- deterministic FIELD seeds do not consume p5 `random()` or `noise()` state;
- zeroed FIELD collapses to neutral BANDS geometry;
- default FIELD creates diverse X/Y/apparent-Z/size values;
- zero FIELD drift is phase-stable;
- `ScanlineBandWorkspace` hash remains exact to the accepted Pass39N lineage;
- Corrupt, Flow and Luma protected section hashes remain exact;
- no `getImageData()`, `putImageData()`, `createGraphics()`, or FrameRing access is added by Scan FIELD.

## Runtime status

Static validation cannot confirm artistic usefulness, app responsiveness, or actual FPS. No runtime speedup is claimed. User testing is authoritative.
