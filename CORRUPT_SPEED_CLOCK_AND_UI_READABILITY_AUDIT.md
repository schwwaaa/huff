# Corrupt Speed Clock + UI Readability Audit — Pass 39N

## Reported failure
The user enabled Corrupt, enabled Clusters, disabled Clusters, then moved the general Corrupt speed to `0`. The visible corruption continued evolving instead of slowing/holding.

## Root cause
Pass 39M separated Cluster center/dynamics timing from general Corrupt motion, but the Corrupt layer itself was still re-applied every render in `CONTINUOUS` mode. Even with the general phase clock at zero, historical patches were re-composited while the FrameRing continued receiving decoded video frames. That made `0x` look effectively full-speed.

There was also a semantic ownership problem: the UI exposed both a general speed and Cluster speed, but the general Corrupt clock still drove shared patch phases/XYZ while Clusters were active. The user could not reliably infer which speed owned the visible motion.

## Pass 39N model

### RANDOM mode
`RANDOM SPEED` (`corruptSpeed`) owns:
- the active Corrupt clock;
- Corrupt noise phases;
- Patch MOVE X/Y/Z;
- CONTINUOUS-mode visible update cadence.

### CLUSTER mode
`CLUSTER SPEED` (`clusterMasterSpeed`) owns:
- the active Corrupt clock while Clusters are enabled;
- shared Corrupt phases used by the clustered patch layer;
- Cluster Group XYZ and organic dynamics already implemented in Pass 39M;
- Cluster shape/breathe/kick time;
- CONTINUOUS-mode visible update cadence.

The inactive mode's master clock no longer drives the active Corrupt phase.

## Continuous speed semantics
- `1.00x` and above: preserve the established every-render Corrupt application cadence; autonomous phases still accelerate above 1x.
- `0.01x .. 0.99x`: sample/hold the Corrupt layer at a proportionally reduced cadence while its phase/XYZ clocks also advance more slowly.
- `0.00x`: render one state on entry/speed change and hold the Corrupt layer afterward.

This deliberately uses the same established skip/hold mechanism already proven by Corrupt Strobe rather than adding a new framebuffer.

## Explicit timing modes remain explicit
`STROBE` and `MULTIGRAB` retain their decoded-frame interval/hold/live behavior. RANDOM SPEED and CLUSTER SPEED continue to control motion/evolution inside those modes but do not silently rewrite the user's explicit frame timing.

## UI readability
The neon-green text system was removed from readable UI text. Green may remain as a non-text accent (checkbox accent/border/scanline texture), but visible text now uses black. Where an old component used green text on a black terminal-style field, the surface was moved to a light Win95 field so black text remains legible.

Affected categories include:
- control labels;
- select/number fields;
- status pills;
- Corrupt status text;
- About heading;
- MIDI/OSC/Syphon/Spout green status text;
- success toast;
- UI-hidden indicator;
- FPS display;
- profiler overlay;
- Luma stencil READY/capture text.

## Performance boundary
This fix adds only scalar state/update gating. It adds no:
- `getImageData()`;
- `putImageData()`;
- `createGraphics()` render surface;
- full-resolution framebuffer;
- Luma processing work.
