# HUFF Classic — Front-Stage Priority Formalization Audit

**Pass:** HUFF Classic Optimization Pass 26  
**Behavioral reference:** Pass 22  
**New user-facing routing:** none  
**New render buffers:** none  
**Flow status:** frozen

## 1. Purpose

HUFF Classic already had one constrained routing relationship: the paint order between the Glitch/Luma group and Scanlines. Pass 25 still calculated this relationship inline in `draw()` and passed a Boolean into the front-stage handler.

Pass 26 moves only that existing decision into the validated recipe infrastructure. It does not invent a new route.

## 2. Existing groups

```text
GLITCH/LUMA GROUP
- Glitch
- Pipeline Luma Key

SCANLINE GROUP
- Scanlines
```

Pipeline Luma Key remains coupled to Glitch for ordering purposes, exactly as in Pass 22.

## 3. Existing modes

Array order below is paint order; the last group is visually on top.

### SCAN TOP

```text
Glitch/Luma
→ Scanlines
```

### GLITCH TOP

```text
Scanlines
→ Glitch/Luma
```

### NEUTRAL

```text
even render frame:  Scanlines → Glitch/Luma
odd render frame:   Glitch/Luma → Scanlines
```

The implementation uses the existing `frameCount & 1` parity rule.

### PULSE

```text
pulseFrames = max(1, round(60 / max(0.1, layerPulseSpeed)))
```

The top group alternates every `pulseFrames` render frames. The 60fps timing basis is deliberately preserved rather than changed to measured frame time.

## 4. Runtime representation

`src/pipeline-runtime.js` now owns an immutable contract containing:

```text
state key
pulse-speed key
render-frame key
group membership
mode names
fixed order arrays
default and fallback mode
60fps timing basis
minimum pulse speed
minimum pulse-frame count
```

The runtime compiles two stable group handlers once:

```text
glitch-luma-group
scanline-group
```

The resolver returns one of two pre-existing frozen order arrays. It does not allocate an array, closure, recipe, or handler object per frame.

## 5. Exact preservation details

Pass 26 preserves:

- SCAN TOP as the default;
- unknown truthy values falling back to SCAN TOP;
- empty values falling back to SCAN TOP;
- NEUTRAL alternating by render-frame parity;
- PULSE using `Math.max`, `Math.round`, `Math.floor`, and the original bitwise parity operation;
- the original Glitch/Luma internal order;
- Scanline and Glitch contribution values at `1.0`;
- the clean bypass;
- front-stage inactivity when Glitch, Pipeline Luma Key, and Scanlines are all neutral.

## 6. Validation

The Pass 26 validator compares the new resolver against a direct implementation of the Pass 22 calculation across:

```text
8 priority inputs
10 pulse-speed inputs
586 sampled render frames per combination
46,880 total cases
```

It also validates:

- exact group execution traces for all four modes;
- immutable reused order arrays;
- rejection of missing group handlers;
- rejection of a modified SCAN TOP contract;
- unchanged stage legality and scratch ownership;
- unchanged Flow/effects source;
- unchanged controls and presets;
- unchanged native tree;
- unchanged full-resolution p5 Graphics count.

## 7. Boundaries

Pass 26 does not add:

```text
new priority modes
stage movement outside front-overlays
Flow placement choices
Scanline before/after Flow choices
parallel branches
send/return buses
feedback cycles
another full-resolution surface
routing presets
routing UI
```

These remain outside the current pass and require separate capability and resource decisions.
