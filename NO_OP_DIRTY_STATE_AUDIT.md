# HUFF Classic Pass 11 — No-Op and Dirty-State Audit

**Baseline:** Pass 10  
**Renderer:** p5.js + Canvas2D inside Tauri v1  
**Purpose:** Record which stages can be bypassed safely, which state must continue progressing, and which costs remain irreducible.

## 1. Frame activity model

HUFF Classic has two different questions:

```text
Is a control enabled?
Can the stage visibly change this frame?
```

Pass 11 resolves the second question before touching full-resolution buffers.

| Stage | Effective activity condition | Neutral shortcut |
|---|---|---|
| Glitch | `corruptOn` | Existing semantics preserved; no new alpha/amount shortcut in this pass |
| Scanlines | ON + positive count + positive alpha | Skip dispatch and do not hold pipeline active |
| Pipeline Luma | ON + positive mix | Skip mask/readback and do not hold pipeline active |
| Global Mix | ON + positive amount | Skip composite and do not hold pipeline active |
| Feedback | Positive amount and non-identity result | Skip snapshot/clear/redraw for full-opacity identity transform |
| Flow | ON + truncated strength above zero | Skip grid/tile pass and do not hold pipeline active |
| Symmetry | ON + a mirror region containing pixels | Skip copy/swap when boundary is at the far edge |
| Solarize | ON + non-identity mapping | Skip CPU readback for threshold/unity identities |
| Base Mix | ON + positive amount | Skip clean-source draw when zero/off |

## 2. Why Glitch remains conservative

Glitch owns stateful cluster physics and consumes seeded random values. A visually hidden Glitch state can still change the cluster positions that appear when it becomes visible again.

Pass 11 therefore does **not** classify `corruptOn` as neutral based only on Glitch opacity or corruption amount. A later profiling pass may split Glitch simulation from Glitch drawing, but that requires explicit state-equivalence testing.

## 3. Bypass pipeline

### Previous all-neutral frame

```text
gCur current source
  ├─ fill main background
  ├─ draw gCur to main output
  └─ copy gCur to gBuf every render tick
```

### Pass 11 all-neutral frame

```text
gCur current source
  ├─ copy gCur directly to main output
  └─ copy gCur to gBuf only when decoded-frame serial changes
```

The `copy` composite operation fully replaces the alpha-enabled main canvas, so the background fill is redundant in the clean path.

## 4. Active pipeline

When any stage contributes:

```text
seed gBuf from current gCur when entering from bypass
  → persistence
  → Glitch / Luma / Scanlines in fixed layer order
  → Global Mix: before
  → Feedback, only if non-identity
  → Global Mix: after
  → Flow, only if integer strength > 0
  → Global Mix: afterflow
  → Symmetry, only if mirror region exists
  → Solarize, only if mapping is non-identity
  → Global Mix: final
  → background + optional Base Mix + gBuf
```

## 5. State progression retained

The following values continue updating on every render tick, including bypass frames:

- Glitch X/Y noise phases;
- Scanline X/Y phases;
- Scanline spin accumulator.

This preserves the temporal position reached when a neutral Scanline state becomes visible again.

## 6. Corrected dirty-state cases

### Scanline-only output

The previous aggregate predicate omitted Scanlines. In configurations where no other listed effect was active, the final clean fallback could discard the bands painted into `gBuf`.

Pass 11 includes visible Scanlines in the aggregate activity plan.

### Luma-only output

The previous aggregate predicate also omitted Pipeline Luma Key. Pass 11 includes positive-mix Luma states.

### Zero-strength Flow

The previous final predicate treated `flowOn` as active even when the dispatched Flow strength truncated to zero. This could keep a stale persistent buffer on screen without running Flow.

Pass 11 uses the same integer-strength condition for dispatch and final activity.

### Identity Feedback

Feedback amount is clamped to one during drawing. At amount `>= 1` with X/Y zero, scale one, and rotation equal to zero modulo 360, the snapshot/clear/redraw produces the same buffer. Pass 11 skips it.

### Solarize identities

Two exact no-op forms are recognized:

```text
THRESHOLD >= 1
```

No pixel passes the strict luminance comparison.

```text
AMOUNT = 0
R = G = B = 1
```

Every lookup maps each channel to itself.

## 7. Junkpile influence

The audit carries forward these principles from the Junkpile Tauri v1 and native examples:

- direct presentation when no intermediate stage is required;
- explicit ping-pong ownership only for stages that write it;
- decoded-frame-aware source updates;
- persistent reusable state rather than transient frame allocations;
- stage dispatch based on actual contribution;
- fixed, inspectable ordering rather than an unrestricted graph.

The current pass does not copy Junkpile’s WebGL/wgpu renderer into Classic. It uses those resource and scheduling lessons within the existing Canvas2D architecture.

## 8. Remaining costs after Pass 11

### Clean playback

- source decode;
- decoded-frame copy into `gCur`;
- frame-ring capture at source cadence;
- one clean main-canvas presentation;
- optional mirror/Syphon/Spout capture.

### Active Canvas2D effects

- one draw per Glitch tile and smear copy;
- one draw per accepted Scanline band;
- one draw per Flow grid cell;
- persistent-buffer decay and final composite;
- downsampled synchronous pixel readback for active Solarize/Luma.

### Two-window mirror

The controls WebView still owns rendering and sends JPEG frames to the canvas window. Eliminating that architecture is the next major speed pass.

## 9. Safety constraints for later passes

- Do not pause Glitch physics without separating simulation and rendering.
- Do not remove background fill from an active pipeline that may contain transparency.
- Do not merge `gBuf` and `gScratch`.
- Do not share a scratch surface across simultaneous asynchronous output workers.
- Keep Scanline and Glitch phase progression explicit.
- Keep all no-op predicates aligned with the exact dispatch formulas.
