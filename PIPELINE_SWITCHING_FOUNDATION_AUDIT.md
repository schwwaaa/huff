# HUFF Classic — Constrained Pipeline Switching Foundation Audit

**Pass:** 30  
**Baseline:** Pass 29  
**Flow status:** frozen at the exact Pass 22 implementation  
**Renderer:** Tauri v1 + p5.js + Canvas2D

## 1. Scope

Pass 30 proves that HUFF Classic can switch among a very small number of validated serial routes without adopting the unrestricted routing model planned for HUFF HD/wgpu.

The implementation does not create nodes, ports, branches, sends, returns, dynamic cycles, or runtime GPU resources. It selects one precompiled recipe at the beginning of a frame and uses that same plan for source synchronization, persistence, effects, and presentation.

## 2. Resource declaration

Every Classic recipe must declare:

```text
full-resolution resources: gCur, gBuf, gScratch
scratch resource:          gScratch only
parallel branches:         none
pipeline cycles:           none
runtime allocation:        none
```

The route validator rejects a recipe that changes those declarations.

## 3. CLASSIC compatibility recipe

`CLASSIC` preserves the exact accepted Pass 22 route and remains the default.

```text
SOURCE SYNC
PERSISTENT DECAY
FRONT OVERLAYS
GLOBAL MIX — BEFORE
FEEDBACK
GLOBAL MIX — AFTER
FLOW
GLOBAL MIX — AFTERFLOW
SYMMETRY
SOLARIZE
GLOBAL MIX — FINAL
PRESENTATION
```

The existing Layer Priority modes remain unchanged inside the front overlay group:

```text
SCAN TOP
GLITCH TOP
NEUTRAL
PULSE
```

## 4. CRISP FINISH recipe

`CRISP FINISH` moves only the existing front overlay group. All other stage ownership and order remain fixed.

```text
SOURCE SYNC
PERSISTENT DECAY
GLOBAL MIX — BEFORE
FEEDBACK
GLOBAL MIX — AFTER
FLOW
GLOBAL MIX — AFTERFLOW
SYMMETRY
SOLARIZE
FINAL OVERLAYS
GLOBAL MIX — FINAL
PRESENTATION
```

The final overlay group still contains exactly:

```text
Glitch
Pipeline Luma Key
Scanlines
```

The route does not duplicate those effects. It runs the group once, after the transform and color stages.

## 5. Atomic switching

The control value is read at the beginning of `draw()` before source synchronization. The recipe switcher returns one precompiled immutable plan. The local `pipelinePlan` variable is then used for the entire frame.

This prevents a control change from selecting one route for source/persistence and another route for effects/presentation in the same frame.

## 6. Failure recovery

The only accepted IDs are:

```text
classic
crisp-finish
```

An empty or unknown ID selects `CLASSIC`. Invalid selections are counted by the switcher and emit one warning per distinct invalid selection rather than attempting to render a partial route.

## 7. Preset compatibility

The route is preset-scoped, but legacy compatibility takes priority.

```text
new preset              saves selected recipe
old preset              loads CLASSIC
unknown imported route  loads CLASSIC
undo                     includes recipe selection
```

This prevents an old visual preset from silently inheriting whichever alternate route happened to be active.

## 8. Deliberate limits

Pass 30 does not permit:

- moving Feedback;
- moving Flow;
- moving Symmetry;
- moving Solarize independently;
- duplicate effects;
- parallel branches;
- same-frame cycles;
- extra full-resolution buffers;
- custom user-authored recipes;
- runtime graph mutation.

Those limits keep the free Classic edition coherent and testable. HUFF HD/wgpu remains the target for typed ports, parallel paths, explicit persistent stores, program/preview buses, auxiliary outputs, and full modular routing.

## 9. Expected visual distinction

With the same controls:

```text
CLASSIC
Glitch / Luma / Scanlines become material that Flow, Symmetry, and Solarize can transform.

CRISP FINISH
Flow, Symmetry, and Solarize transform the persistent composite first; Glitch / Luma / Scanlines are painted afterward and remain sharper.
```

This pass changes topology only. It does not alter the character or parameters of any effect.
