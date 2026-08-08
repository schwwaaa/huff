# Luma Key Stability Rebase Audit — Pass 36

## Runtime report that triggered this pass

Runtime testing of Pass 35 reported:

- two freezes while using Luma Key;
- one freeze occurred immediately after enabling Luma Key and pressing Invert;
- Luma sometimes stopped responding after using other features and returning to it;
- Luma no longer interacted with Glitch in the same way as the previously accepted implementation;
- the Fairlight-inspired Stencil concept remained desirable.

## Findings

### 1. Concrete stencil state-corruption bug

Pass 35 reused one persistent `ImageData` object for the stencil alpha mask. On each threshold, Gain, Cleanup, Density, or Invert rebuild, the new mask alpha was multiplied by the alpha already left in that same `ImageData` from the previous rebuild.

That made stencil shaping cumulative when it should have been stateless. Repeated edits could progressively collapse portions of the mask toward transparency. This directly explains a stencil that works once and then appears not to respond correctly after additional edits.

Pass 36 rebuilds stencil alpha directly from the stored one-byte luminance plane every time:

```text
stored luminance
→ Clip / Gain
→ Cleanup / Density
→ optional Invert
→ ASSIGN fresh alpha
```

No previous mask alpha participates in the calculation.

### 2. Pass 35 changed the accepted LIVE Luma execution model

The original stable Luma path used one bounded 640px scratch canvas. A clean source patch was analyzed and cached by decoded frame, then reused for presentation.

Pass 35 separated the key into a cached CUT and a current FILL and introduced a wall-clock ~15 Hz analysis gate for Glitch-Strobe combinations. Although intended to reduce readbacks, this changed both timing and compositing behavior relative to the previously accepted Luma/Glitch interaction.

Pass 36 removes that experiment for LIVE keying and restores the proven decoded-frame cached clean-patch architecture.

### 3. Freeze diagnosis boundary

A deterministic infinite loop or deadlock was not found in static source inspection. The observed freezes cannot be reproduced in the packaging environment because the Tauri/WebView application is not being run here.

However, Pass 36 removes the two newly introduced risk areas most closely correlated with the report:

- the wall-clock Luma analysis gate and split live CUT/FILL path;
- cumulative persistent stencil-alpha mutation.

LIVE Invert now follows the same bounded one-readback rebuild path used by the earlier stable Luma implementation. STENCIL Invert performs no source readback after capture.

## Pass 36 architecture

### LIVE

```text
new decoded clean frame / key parameter change
→ copy clean source to bounded scratch
→ one getImageData()
→ derive luminance alpha
→ putImageData()
→ cache clean keyed patch
→ composite patch over processed gBuf
```

At neutral Gain/Cleanup/Density this retains the established key equation.

### STENCIL

```text
CAPTURE once
→ one bounded clean-source readback
→ store 8-bit luminance

key parameter change
→ rebuild bounded alpha mask from stored luminance
→ no source readback

render
→ current clean source to bounded scratch
→ destination-in with stored alpha mask
→ composite over processed gBuf
```

Selecting STENCIL without a valid capture no longer silently falls back to LIVE. The key stage waits for a capture and the UI shows `CAPTURE FIRST`.

## Preserved features

- Luma threshold / A-B control
- Mix
- Invert
- Gain
- Cleanup
- Density
- LIVE / STENCIL source
- X-Fade
- Soft Add
- Glitch-only Strobe
- CLASSIC / CRISP FINISH pipeline recipes

## Protected systems

Pass 36 does not change:

- Flow;
- Glitch algorithm;
- Glitch Strobe scheduling;
- Scanlines;
- Feedback;
- Symmetry;
- Solarize;
- FrameRing;
- video decoder and source lifecycle;
- render / transport / mirror / profiler clocks;
- Syphon;
- Spout;
- native Tauri code;
- factory presets;
- full-resolution buffer topology.
