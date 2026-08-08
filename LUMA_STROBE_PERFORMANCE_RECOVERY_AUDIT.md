# Pass 35 — Luma / Glitch-Strobe Performance Recovery Audit

## Reported regression

Pass 34 keying was accepted creatively, but enabling Pipeline Luma Key while Glitch Strobe was active could reduce rendering to single-digit FPS.

The pass therefore prioritizes responsiveness rather than adding another keying feature.

## Why Luma is expensive

HUFF Classic's luminance key is implemented in Canvas2D. The expensive boundary is synchronous pixel analysis:

```text
bounded clean image
→ getImageData()
→ CPU luminance / Clip / Gain / Cleanup / Density transform
→ putImageData()
→ composite
```

At 1920×1080 the Luma working image remains bounded to 640×360, but synchronous readback can still stall the WebView render path.

## Pass 35 architecture

Pass 35 separates two concepts that production keyers describe independently:

```text
KEY CUT
region-control signal

KEY FILL
image passing through that signal
```

Internally:

```text
LIVE source
   │
   ├── bounded luminance analysis ──→ reusable CUT canvas
   │
   └── current RGB ─────────────────→ FILL canvas
                                         │
CUT ───────────────── destination-in ────┘
                                         │
                                         ▼
                                  keyed live patch
```

The CUT may be reused while the FILL remains current.

## Glitch Strobe compatibility

When both conditions are true:

```text
Glitch ON
Glitch STROBE ON
```

LIVE Luma CUT analysis is admitted at approximately 15 Hz maximum.

This does **not** freeze the complete Luma result. Current clean RGB is copied and composited through the cached CUT on every render.

The intent is:

```text
expensive matte boundary = lower cadence
moving video inside matte = render cadence
```

When Glitch Strobe is off, LIVE Luma keeps the existing decoded-frame analysis cadence.

## STENCIL optimization

The Fairlight-inspired stored stencil already contains the luminance CUT. Pass 34 still rebuilt a fresh RGBA clean patch with `getImageData()` whenever the source frame advanced.

Pass 35 removes that unnecessary dependency.

After CAPTURE:

```text
stored Uint8 luminance
→ rebuild CUT only when key controls change
→ no per-source-frame getImageData()

current clean video
→ render-rate FILL
→ destination-in cached CUT
```

This makes STENCIL the lowest-readback Luma mode after capture.

## Storage cost

One additional **bounded** 640px-working-width Canvas2D matte surface is used. It is not a fourth full-resolution HUFF render buffer.

At a 16:9 1080p canvas:

```text
working size: 640×360
RGBA matte backing: about 0.88 MiB
```

The existing captured stencil remains an 8-bit luminance array of roughly 225 KiB at that working size.

## Stencil-state clarity

The prior `READY` text used the same dim styling as `EMPTY`, so a successful capture was easy to miss.

Pass 35 makes capture state explicit:

```text
READY 640×360  bright green + glow
CAPTURE FIRST  amber
NO SOURCE      red
EMPTY          dim
```

The CAPTURE button also lights while a stencil is stored.

## What this pass does not change

- no Flow edits;
- no Glitch algorithm edits;
- no Glitch Strobe interval edits;
- no Luma visual-control removal;
- no new keying feature;
- no new full-resolution surface;
- no routing recipe changes;
- no decoder or output changes;
- no native changes.

## Runtime test required

The exact regression test is mandatory:

```text
Glitch ON
Strobe ON
Every 4 / 8 / 16
Luma ON
Key Source LIVE
X-FADE
```

Compare FPS and response against Pass 34.

Then test STENCIL:

```text
Key Source STENCIL
CAPTURE
confirm READY dimensions illuminate
```

After capture, compare profiler `luma read` activity: STENCIL should not incur advancing-source readbacks during normal reuse.
