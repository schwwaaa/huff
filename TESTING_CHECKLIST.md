# HUFF Classic Pass 52D — Three-Source Pipeline Awareness

- [ ] Start with moving video and Corrupt, Scanlines, and Luma Key all OFF.
- [ ] Pipeline shows `IMAGE FEED` with CORRUPT / SCANLINES / LUMA/COMP and summary `NONE · ENABLE A FEED`.
- [ ] Enable Symmetry only; its badge changes to `NEEDS IMAGE FEED`.
- [ ] Enable Corrupt; CORRUPT lights and Symmetry reports `PROCESSING · CORRUPT`.
- [ ] Repeat with Scanlines as the only feed.
- [ ] Repeat with Luma Key ON, TARGET = COMPOSITE, MIX > 0.
- [ ] Set Luma MIX to 0; LUMA/COMP must stop reporting as an active feed.
- [ ] Set Luma TARGET to CORRUPT or SCAN; LUMA/COMP must stop reporting as an independent feed.
- [ ] Enable Solarize with no primary feed; its badge changes to `NEEDS IMAGE FEED`.
- [ ] Enable one or more feeds and verify Solarize reports them immediately.
- [ ] Switch Pipeline RECIPE to CRISP FINISH; quick route shows the image feed after Symmetry/Solarize and enabled downstream badges show `CRISP · PRE-FEED`.
- [ ] Return to CLASSIC and confirm accepted Corrupt/Scan/Luma + Feedback/Flow/Symmetry/Solarize combinations look unchanged.
- [ ] Confirm Pass 51 Syphon 720p60 remains stable.

> Historical note: the Pass 52A/52B standalone-Symmetry/Solarize checklists below document experiments that did not become the release contract. Pass 52D intentionally makes the dependency visible instead of requiring standalone behavior.

# HUFF Classic Pass 52 — Runtime Checklist

- [ ] Confirm Pass 51 720p60 Syphon still behaves identically.
- [ ] Select Solarize → CHROMA POSTERIZE.
- [ ] LEVEL 0 is neutral.
- [ ] SOFT 100 is neutral.
- [ ] Raise LEVEL and confirm colour bands collapse while brightness structure remains recognizable.
- [ ] Sweep PHASE and confirm colour groupings reorganize without acting like a plain hue rotation.
- [ ] Confirm AMOUNT is a normal wet/dry control.
- [ ] Confirm FLUIDITY still gives the accepted viscous temporal response.
- [ ] Open profiler: `gpu poster` should advance; `gpu fall` should remain 0 on healthy WebGL.
- [ ] Test with heavy Feedback.
- [ ] Test with Global Mix and verify fusion/appearance remains stable.
- [ ] Switch repeatedly among THRESHOLD / LUMA QUANTIZE / CHROMA POSTERIZE and confirm mode-specific controls are unambiguous.

## Pass 52A — Solarize standalone regression

- [ ] Disable Glitch, Scanlines, Luma Key, Global Mix, Feedback, Flow, and Symmetry.
- [ ] Enable Solarize THRESHOLD only; confirm source motion remains live and THRESH/AMOUNT/RGB controls are visible.
- [ ] Select LUMA QUANTIZE only; confirm moving source remains live and LEVEL/SOFT/INVERT respond.
- [ ] Select CHROMA POSTERIZE only; confirm moving source remains live and LEVEL/SOFT/PHASE respond.
- [ ] Confirm profiler `sol live` advances during each isolated Solarize mode.
- [ ] Enable Feedback; confirm `sol live` stops and the accepted persistent-buffer combination remains intact.
- [ ] Disable Feedback and enable Flow; confirm `sol live` stops and Flow + Solarize retains its prior look.
- [ ] Recheck Pass 51 Syphon 720p60 output while Solarize is active.

## Pass 52B — Standalone Symmetry + Solarize ownership

- [ ] Leave the historical Feedback AMOUNT at its current/non-zero value, but switch Feedback ENABLE **OFF**.
- [ ] Disable Glitch, Scanlines, Luma Key, Global Mix, and Flow.
- [ ] Enable **Symmetry only** and confirm moving video remains live.
- [ ] Test Symmetry V / H / HV and sweep POS.
- [ ] Disable Symmetry; enable **Solarize only** and test THRESHOLD.
- [ ] Test LUMA QUANTIZE alone.
- [ ] Test CHROMA POSTERIZE alone.
- [ ] Confirm `sol live` advances for isolated Solarize with Feedback ENABLE off even if Feedback AMOUNT is still non-zero.
- [ ] Enable **Symmetry + Solarize** together; confirm Solarize processes the live mirrored result rather than bypassing Symmetry.
- [ ] Turn Feedback ENABLE back ON; confirm the established Feedback + Symmetry and Feedback + Solarize behavior remains persistent.
- [ ] Recheck 720p60 Syphon after the visual tests.
