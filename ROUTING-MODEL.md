# HUFF Constrained Routing Model

**Schema:** `huff-routing/v1`  
**Build:** `0.20.0 / HNW-20`

Milestone 19 does not replace HUFF with an unrestricted node graph. The established render order remains the canonical **Classic HUFF recipe**, while the responsibilities previously hidden inside draw order are now named, inspectable, selectable at defined boundaries, and serializable through canonical parameters.

## Named buses

### Clean

The normalized current camera or video frame before persistent effect processing. Clean feeds history capture, scanline generation, Global Mix, luma restoration, and the normal final composite.

### History

The bounded GPU texture-array ring containing older Clean frames. History is written only by the capture policy and read by historical glitch sampling. It is persistent but is not an arbitrary render target.

### Process

The constrained sequence of glitch, scanlines, Smoosh, luma key, Global Mix, Flow, and feedback stages. Existing controls still decide insertion behavior inside this known recipe.

### Field Store

The persistent ping-pong effect image carried between frames. This is HUFF’s explicit recursive image memory. A graph cycle is legal only because the Field Store introduces at least one frame of delay and owns clear/rebuild behavior.

### Mask

The live luminance-derived region signal used by Luma Key to restore or expose Clean imagery. Milestone 19 names the role but does not introduce a general-purpose mask graph.

### Program

The committed output texture used by Syphon, Spout, live recording, still export, deterministic export, and normal presentation. Program can select one of three validated buses:

- **Program Composite** — normal HUFF clean/effect composite;
- **Clean Source** — direct clean bypass while the effect graph continues running;
- **Raw Field Store** — persistent effect pixels against black for inspection or specialized output.

### Monitor

The native output window’s local inspection destination. Monitor can show Program, Clean, or Field Store without changing external Program consumers. This provides a lightweight auxiliary/preview function without turning HUFF into a complete production switcher.

## Existing routing controls now formalized

Several earlier controls were already routing decisions even though they appeared as effect parameters:

- `layers.layer_priority` — glitch/scan paint order;
- `flow.flow_target` — Flow after glitch, after scan, or at the final stage;
- `global_mix.global_mix_pos` — clean-source mix insertion point;
- `smoosh.smoosh_on` — isolated glitch and scanline layer composition;
- `routing.program_bus` — committed output source;
- `routing.monitor_bus` — local window source.

All are part of the Routing state domain, so presets, snapshots, and projects can capture or recall them only when Routing scope is enabled.

## Constrained recipes

The Routing panel includes validated recipes that set only known canonical parameters:

1. **Classic HUFF**
2. **Glitch → Flow → Scan**
3. **Scan → Flow → Glitch**
4. **Isolated Smoosh Layers**
5. **Clean Program Bypass**
6. **Program + Field Store Monitor**

A recipe is not a rendered image and does not contain GPU pixel memory. It is a named batch of routing decisions applied to the same fixed engine.

## Legal cycles

Only explicit temporal resources may participate in cycles:

```text
Field Store → Process → Field Store
History capture → older History read
```

Same-frame arbitrary texture cycles remain invalid. The routing model exposes ownership rather than permitting unsafe patching.

## Exported route plan

Press **Export Plan** in the Routing panel to create a JSON description containing:

- named bus catalog;
- active edges;
- Program and Monitor selections;
- Flow target;
- layer priority;
- Global Mix position;
- Smoosh, luma, and feedback state;
- legal temporal cycles;
- warnings for diagnostic monitoring or raw Field Store output.

The route plan is intended for debugging, study, project documentation, and later migration into the wider modular video-instrument ecosystem.
