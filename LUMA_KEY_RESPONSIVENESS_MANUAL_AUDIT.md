# Pass 33 — Luma Key Responsiveness and Manual Correlation Audit

## 1. Why Pass 33 exists

Pass 32 added a useful Self Key but derived the key signal from the current processed `gBuf` every render while active.

At the bounded 640×360 Luma workspace, that meant the Self Key path could perform:

```text
clean-source copy + getImageData
processed-gBuf copy + getImageData
pixel transform
putImageData
presentation
```

every active render.

That extra synchronous processed-image readback is the primary structural reason Pass 32 can cost noticeably more than the historical clean-source Luma path.

Pass 33 prioritizes responsiveness over literal Self Key behavior.

---

## 2. Magic DaVE correlation — processed output as a key source

Reference:

**Snell & Wilcox Magic DaVE 8DOE/4D(O)E User Manual, Version 3.00**  
Section B, **Effects - Keyers - DVE Luma Self Key Menu** (manual page 77; scanned PDF page around 86).

The manual describes a keyer that:

- takes the output from the DVE;
- analyzes its luma content;
- performs a Luma Self Key;
- exposes Lift as the clipping point;
- exposes Gain as the key steepness;
- can invert through negative Gain values;
- can restrict the affected region through a DVE Mask.

### HUFF adaptation

HUFF already has:

```text
threshold  ≈ clipping point
GAIN       ≈ edge steepness
INVERT     = explicit polarity control
```

Pass 33 changes the processed source relationship from:

```text
processed output read every render
```

to:

```text
Glitch stage accepts a new decoded-frame update
        ↓
capture bounded processed luminance once
        ↓
store 8-bit key-cut field
        ↓
reuse until the next accepted Glitch update
```

The result is called **GLITCH KEY** rather than Self Key because the key-control signal is intentionally decoupled from the continuously changing final processed fill.

That decoupling is a HUFF-specific performance adaptation.

---

## 3. INDIGO correlation — key cut versus key fill

Reference:

**Grass Valley INDIGO AV Mixer User Manual**, Video Processing / Luminance Key.

INDIGO explicitly separates:

```text
Key Cut
determines the shape of the key

Key Fill
supplies the image placed into that shape
```

It notes that when one source provides both cut and fill, the result is a Self/Video key.

### HUFF adaptation

Pass 33 uses:

```text
KEY SRC = CLEAN

key cut:  live clean luminance
fill/restoration material: live clean RGB
underlying material: current processed gBuf
```

or:

```text
KEY SRC = GLITCH

key cut:  cached luminance captured after a Glitch update
fill/restoration material: current live clean RGB
underlying material: current processed gBuf
```

This is deliberately not a literal self key. It uses the key-cut/key-fill separation to create a more responsive hybrid: a held processed matte controlling continuously moving clean video.

---

## 4. INDIGO correlation — Luma Fade Mode

Reference:

**Grass Valley INDIGO AV Mixer User Manual**, Keyer Main Menu, Luma key controls (manual pages around 86–87).

INDIGO offers two Luma Fade Modes:

```text
Add.
X-Fade
```

Pass 33 adds the same operator-level choice.

HUFF mapping:

```text
X-FADE
Canvas2D source-over
Preserves the existing HUFF Luma presentation behavior.

ADD
Canvas2D lighter
Additively combines the keyed clean patch with the processed image.
```

`FADE` changes only the final Canvas2D composite operator. It adds no extra image readback, persistent image surface, history store, or animation loop.

---

## 5. Bounded resource model

At 1920×1080:

```text
Luma working size
640×360

Persistent GLITCH KEY luminance
230,400 bytes
≈ 225 KiB
```

The existing bounded working canvas is reused for capture and clean-patch processing.

No fourth full-resolution p5 Graphics buffer is added.

---

## 6. Capture cadence

### CLEAN

Same historical cache model:

```text
new decoded frame / changed key setting
→ rebuild clean Luma patch

same decoded frame + same settings
→ reuse patch
```

### GLITCH

Processed key capture:

```text
no stored Glitch key yet
OR
Glitch accepted an update on a new decoded source frame
→ capture processed luma
```

Otherwise:

```text
reuse stored processed key-cut luminance
```

The live clean RGB patch can still refresh with each decoded source frame.

With Glitch Strobe `EVERY = 8`, the expensive processed key capture is therefore expected to occur much less frequently than render rate.

Runtime profiling is still required before claiming a measured FPS improvement.

---

## 7. Hot-path cleanup

Pass 32 clamped Gain inside the mask helper used for every pixel.

Pass 33 clamps once:

```text
safeGain = clamp(GAIN)
```

before the transform.

Normal and inverted key transforms then use separate loops.

For the inverted key, the historical operation order is retained:

```text
reveal = 1 - roll
alpha  = 1 - reveal
```

rather than algebraically simplifying to `roll`, because earlier HUFF validation demonstrated that floating-point cancellation can change a boundary alpha byte.

---

## 8. Compatibility

Compatibility state:

```text
KEY SRC = CLEAN
GAIN    = 1.00
FADE    = X-FADE
```

The Pass 33 validator exhaustively compares the historical key alpha over:

```text
256 luminance values
× 256 threshold values
× normal / inverted
```

Factory presets remain untouched.

Pass 32 presets that contain `lumaKeySelf = true` migrate to `KEY SRC = GLITCH`, the closest responsive replacement. Older presets migrate to `CLEAN + X-FADE`.
