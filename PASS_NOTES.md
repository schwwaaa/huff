# HUFF Classic — Pass Notes

## Pass 36 — Luma Key Stability Rebase

**Status:** static/deterministic validation complete; runtime validation required.

Pass 36 is a corrective stability pass after Pass 35 runtime testing exposed Luma freezes, inconsistent Glitch interaction, and unreliable Stencil reuse.

### Changes

- restored LIVE Luma to the known-good decoded-frame cached clean-patch architecture;
- removed the Pass 35 ~15 Hz wall-clock Luma analysis gate;
- removed the Pass 35 split LIVE CUT/FILL execution path;
- fixed cumulative stencil alpha corruption by rebuilding mask alpha directly from stored luminance;
- retained the no-readback-after-capture STENCIL presentation path;
- made uncaptured STENCIL explicit instead of silently falling back to LIVE;
- added explicit bounded-cache invalidation for Invert and key-shaping changes;
- clarified stored stencil status as `STENCIL STORED WxH`;
- added Invert to undo snapshot handling.

### No new feature

This pass intentionally adds no new creative control. It stabilizes the accepted Luma feature set before further augmentation.
