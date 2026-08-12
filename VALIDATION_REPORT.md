# HUFF Classic Pass 47 — Validation Report

## Static validation

```text
npm run validate:pass47
PASS 47 validation: 98,580 checks PASS
```

The validator covers:

- Classic/Tauri-v1 boundary (no WebGPU/WGSL);
- GPU LIVE Luma first-refusal before the CPU readback fallback;
- absence of `getImageData`, `putImageData`, `readPixels`, `gl.finish`, and
  `gl.flush` from the successful GPU patch helper;
- runtime alpha parity calibration structure for X-FADE and SOFT ADD;
- 65,536 randomized byte-domain matte comparisons between CPU reference and
  GPU shader model;
- 32,768 randomized final-key-LUT equivalence checks;
- landscape/portrait long-edge and pixel-budget assertions;
- exact protected Solarize/Fluidity/Flow helper hashes;
- protected native/runtime/config/preset manifest.

## Historical simulations

```text
npm run simulate:pass40v   PASS
npm run simulate:pass40w   PASS
npm run simulate:pass41a   PASS
```

## Release preflight

```text
npm run release:preflight
38 passed / 0 warnings / 0 blockers
```

## CPU fallback microbenchmark

A Node-only arithmetic microbenchmark over a 640x360 luma plane measured direct
key-alpha math at ~2.03 ms/iteration and LUT lookup at ~0.39 ms/iteration
(~5.25x for that isolated calculation). This does not include Canvas readback,
upload, or presentation and is not a target-machine FPS claim.

## Browser GPU limitation in this environment

Container Chromium could not initialize a usable GPU/WebGL process, so the
one-time WebGL->Canvas2D alpha calibration and actual GPU performance cannot be
truthfully runtime-certified here. Pass 47 therefore performs that parity probe
inside HUFF on the target runtime and automatically falls back to CPU if it
fails.

## Historical validator note

`validate:pass46` is expected to fail because Pass 47 intentionally changes the
Luma helper hashes that Pass 46 froze. This is not treated as a regression;
Pass 47's validator supersedes those Luma-specific hash expectations while
continuing to protect the unaffected creative/runtime boundaries.
