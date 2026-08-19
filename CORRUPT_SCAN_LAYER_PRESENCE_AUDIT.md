# Corrupt / Scan Layer Presence Audit — Pass 40W

## Reported behavior

With Scan and Luma active, enabling Corrupt made the composite appear faster and
less controllable. Lowering Corrupt speed did not behave like a slow layer. A
speed adjustment could produce a single visibly wrong/glitch frame and then the
image continued. Overall FPS remained normal.

That symptom strongly suggested composition/layer timing rather than renderer
throughput. Code review confirms that interpretation.

## Confirmed cause in Pass 40V

In `CONTINUOUS` mode, `_shouldApplyGlitchThisRender()` used Random/Cluster Speed as
an **effect-presence gate** below 1x.

Representative 0.15x schedule:

```text
render:   01 02 03 04 05 06 07 08 09 10 11 12 13 14 ...
Scan:      S  S  S  S  S  S  S  S  S  S  S  S  S  S ...
Corrupt:   C  -  -  -  -  -  -  C  -  -  -  -  -  - ...
```

Both effects write to the same persistent `gBuf`. Therefore the `-` rows did not
mean "hold the Corrupt layer." They meant **do not paint Corrupt this frame**.
Scan continued writing, so the visible front-stage relationship changed between
Corrupt-update and Corrupt-held frames.

At 0x, a speed edit intentionally forced one update so the UI could respond. In a
shared Scan/Corrupt composite that became exactly the reported pattern:

```text
held composite
    ↓
ONE Corrupt redraw after speed/control edit
    ↓
Scan-only frames again
```

Visually this looks like a dropped/bad frame even though application FPS is fine.

## Why Luma made the problem more visible

Pass 40V's `TARGET=SCAN` changes each Scan panel's contribution according to the
current bounded luminance source. That is functioning as designed, but it means
Scan can expose and cover more of the persistent image as keyed panel opacity
changes. If Corrupt itself is present only on sparse render frames, those reveals
make the layer-presence discontinuity much easier to see.

The Luma readback/cache repair from Pass 40V is retained. Pass 40W does not add a
new Luma handoff.

## Pass 40W model

`CONTINUOUS` now means exactly that: the Corrupt layer participates in every
rendered composite.

```text
render:   01 02 03 04 05 06 07 08 09 10 ...
Scan:      S  S  S  S  S  S  S  S  S  S ...
Corrupt:   C  C  C  C  C  C  C  C  C  C ...
```

Speed is moved to **evolution**, where it belongs:

- spatial random/cluster evolution;
- noise-field phase;
- Patch XYZ / Group XYZ motion;
- cluster shape/organic evolution;
- historical AGE-choice evolution.

Layer presence is no longer modulated by Random/Cluster Speed in CONTINUOUS mode.

## Historical source selection

Simply repainting Corrupt every render while hashing AGE from live `_vfc` would
reintroduce the old "0x still looks fast" problem because every decoded frame
could choose a different historical delay.

Pass 40W therefore adds a small scalar source clock:

```text
decoded frame delta × active Corrupt Speed
                 ↓
       Corrupt source serial
                 ↓
     stable per-patch AGE choice
```

Behavior:

```text
SPEED 0x
patch geometry:       fixed
historical age choice fixed
video at that delay:  live

SPEED .25x
age choice evolves roughly one-quarter decoded cadence

SPEED 1x
age choice tracks decoded cadence
```

This gives Corrupt the same useful distinction already discovered in Scan:
**spatial geometry can stop while image content remains alive**.

If the user wants actual temporal sample/hold behavior, that remains the job of
`STROBE` and `MULTIGRAB` rather than overloading the Speed slider.

## Layer priority after the repair

Fixed layer order now has a stable meaning in CONTINUOUS mode because both groups
are actually present on every render:

```text
SCAN TOP
Corrupt → Scan

CORRUPT TOP
Scan → Corrupt
```

`ALTERNATE` and `PULSE ORDER` still intentionally change order and are not stable
layer modes.

## Performance / memory

The repair does **not** add a retained full-resolution Corrupt framebuffer.

Added:
- two scalar source-clock values;
- one scalar `sourceSerial` in the existing Corrupt motion object.

Not added:
- `createGraphics()`;
- extra full-resolution canvas;
- `getImageData()`;
- `putImageData()`;
- new FrameRing storage;
- additional Luma object readback.

The tradeoff is that CONTINUOUS Corrupt is now drawn every render even below 1x.
This is required for stable layer presence. At 1x and above this was already the
existing behavior. Heavy patch counts/repeats should be runtime stress-tested.

## Remaining explicit boundary

`STROBE` and `MULTIGRAB` retain their decoded-frame update gates. Their interaction
with Scan is intentionally not rewritten in this pass. Pass 40W is specifically
the CONTINUOUS speed/layer repair reported by the user. If held Strobe/MultiGrab
states are later expected to remain as independent retained visual layers while
Scan continues repainting, that requires a separate explicit design/validation
rather than silently adding another full-resolution buffer here.
