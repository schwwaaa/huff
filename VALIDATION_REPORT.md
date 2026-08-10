# Validation Report — Pass 40W

## Dedicated Pass 40W

- `npm run validate:pass40w` — **204 checks PASS**.
- `npm run simulate:pass40w` — **PASS**.

The deterministic simulation reproduces the architectural failure in the old
CONTINUOUS gate:

```text
old 0.15x: C------C------C-----
new 0.15x: CCCCCCCCCCCCCCCCCCCC
```

`C` means Corrupt actually participates in that render frame.

It also verifies the speed-scaled decoded source serial:
- 0x stays constant;
- 0.25x evolves more slowly than decoded frames;
- 1x tracks decoded-frame cadence.

## Inherited validation

PASS:
- Pass 40V — **170 checks**.
- Pass 22 Scan engine — **12,000 cases / 760,519 bands / 3,802,595 exact comparisons**.
- Pass 9.
- Pass 10.
- Pass 13S.
- Pass 14.
- Pass 15.
- Pass 16.
- Pass 16S.
- Pass 19.
- Pass 20.
- Pass 21.

## Release/static validation

- `release:preflight` — **38 passed / 0 warnings / 0 blockers**.
- JavaScript syntax — PASS for runtime and new validation/simulation scripts.
- No new `createGraphics()` call.
- No new `getImageData()` / `putImageData()` in Corrupt.
- No new FrameRing allocation.
- Pass 40V Luma TARGET/cache validation remains PASS.
- Pass 40U Scan FIELD protected through inherited Pass 40V checks.
- `src-tauri/**` remains exact to the inherited Pass 40U manifest through Pass 40V validation.

## Runtime status

Static/simulation validation proves the one-frame behavior existed in the old
layer gate and that CONTINUOUS now keeps Corrupt present every render. It does not
prove the final visual feel or performance on the user's WebKit/GPU path.
Runtime acceptance remains authoritative.
