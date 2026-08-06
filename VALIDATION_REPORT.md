# HUFF Classic Optimization Pass 26 — Validation Report

## Scope

Pass 26 formalizes only the already-existing Glitch/Luma versus Scanline priority relationship inside the validated serial recipe runtime. It adds no route, effect position, control, preset field, or render resource.

## Priority parity validation

`node scripts/validate-pass26.mjs` executes 46,880 comparisons between:

1. a direct implementation of the Pass 22 inline `glitchOnTop` calculation; and
2. the new immutable priority resolver.

The matrix includes:

```text
scan
glitch
neutral
pulse
empty
unknown
undefined
null
```

and pulse speeds from below the clamp through the UI maximum, plus undefined and `NaN` cases.

Every case returned the same paint order.

## Compiled group validation

The validator confirms:

- SCAN TOP executes Glitch/Luma then Scanlines;
- GLITCH TOP executes Scanlines then Glitch/Luma;
- NEUTRAL uses the original render-frame parity;
- PULSE uses the original 60fps timing formula;
- static order arrays are frozen and reused;
- both handlers are required at compile time;
- a modified SCAN TOP contract is rejected.

## Runtime preservation checks

- `src/effects.js` remains exact Pass 22:

```text
2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44
```

- `src/index.html`, controls, presets, MIDI maps, OSC maps, media workers, and relay scripts match the Pass 25 source manifest;
- the complete `src-tauri/` tree matches the Pass 22 native manifest;
- Flow dispatch parameters and `gBuf`/`gScratch` swap remain unchanged;
- the count of full-resolution p5 Graphics allocations remains unchanged;
- rejected Melt and Sort-Mosh code remains absent.

## Validators completed

```text
Pass 9
Pass 10
Pass 11
Pass 13S
Pass 14
Pass 15
Pass 16
Pass 16S
Pass 17
Pass 18
Pass 19
Pass 20
Pass 21
Pass 22
Pass 25
Pass 26
```

Pass 23 and Pass 24 validators remain superseded by the runtime integration introduced in Pass 25.

## Static validation

The final package is checked for:

- 30 project-owned JavaScript/ESM/CommonJS files with `node --check`;
- 32 inline HTML scripts with `node --check`;
- 29 JSON files parsed successfully;
- 2 TOML files parsed successfully;
- 6 shell scripts with `bash -n`;
- complete Pass 25 source-manifest constraints;
- complete Pass 22 native-manifest constraints;
- bundled Syphon binary confirmed as universal `x86_64 + arm64`;
- ZIP integrity after packaging.

## Native validation

`cargo check` was not run because Cargo and Rust are not installed in this environment. The native tree is unchanged and hash-verified.

## Runtime claims

No FPS improvement is claimed. No visual change is intended. Actual WebView playback, visual parity, Syphon, Spout, and long-session behavior require testing in the packaged application.
