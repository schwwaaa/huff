# Pass 56 Runtime Test

- [ ] Change multiple controls and enter a preset name.
- [ ] Click SAVE FILE… and save the JSON locally.
- [ ] Confirm the preset immediately appears under SESSION — SAVED / LOADED.
- [ ] Move several controls away from the saved state.
- [ ] Select the saved preset and press RECALL without using LOAD FILE….
- [ ] Confirm the exact saved state returns.
- [ ] Save the same named/path preset again after modifying controls; confirm the existing session entry refreshes rather than duplicates.
- [ ] Save a second preset file; confirm both entries are available for performance recall.
- [ ] Quit HUFF and relaunch; confirm session entries are gone.
- [ ] Confirm both JSON files still exist locally.
- [ ] LOAD FILE… one of them; confirm it reappears in the temporary session bank.

---

# Pass 55 — Runtime Testing Checklist

- [ ] Click PRESET NAME and type `Purple Feedback Pass`.
- [ ] Confirm both lowercase and uppercase `P` type normally.
- [ ] Confirm typing `F` in the field does not toggle fullscreen.
- [ ] Confirm Ctrl/Cmd+Z while editing stays with the editable field.
- [ ] Save the preset and confirm Pass 54 SAVE FILE… still works.
- [ ] Load the JSON and confirm it enters the temporary session bank.
- [ ] Defocus all editable fields and confirm `F` still toggles fullscreen.
- [ ] Defocus all editable fields and confirm Ctrl/Cmd+Z still invokes HUFF undo.
- [ ] Recheck moving playback/effects for no visual change.
- [ ] Recheck Syphon 720p60 if output is part of the current smoke test.

## Pass 54 — Session preset bank

- [ ] Start HUFF and confirm no prior user JSON presets appear under `SESSION — LOADED FILES`.
- [ ] LOAD FILE… `A.json`; confirm A applies immediately and appears in the dropdown session group.
- [ ] LOAD FILE… `B.json`; confirm A remains present and B is added.
- [ ] Use RECALL to alternate A -> B -> A while video is moving.
- [ ] Recall a built-in preset, then return to A without reopening its file.
- [ ] Load the same `A.json` path again; confirm its session slot refreshes rather than duplicating.
- [ ] Load a different file whose internal preset name also matches A; confirm both remain selectable and the second label is disambiguated.
- [ ] Load an old multi-preset export; confirm its entries are added without removing A/B.
- [ ] SAVE FILE… a current state and confirm the JSON is written locally as in Pass 53.
- [ ] Quit HUFF completely and relaunch. Confirm session-loaded A/B/bank entries are gone from HUFF.
- [ ] Confirm the JSON files remain on disk and can be loaded again.
- [ ] Recheck Pass 52D image-feed awareness and Pass 51 Syphon output.

# HUFF Classic Pass 53 — Preset File Workflow

- [ ] Change several obvious parameters so the current state is easy to recognize.
- [ ] Enter a preset name.
- [ ] Click **SAVE FILE…** and confirm the macOS native Save dialog appears.
- [ ] Save the preset into a normal user-selected folder.
- [ ] Confirm the saved file uses `.json`.
- [ ] Change the controls to a visibly different state.
- [ ] Click **LOAD FILE…** and confirm the macOS native Open dialog appears.
- [ ] Choose the saved JSON and confirm the exact preset state is restored.
- [ ] Quit HUFF completely, relaunch it, and load the same file again.
- [ ] Recall **Classic Default** under BUILT-IN and confirm it returns the shipped control defaults.
- [ ] If pre-Pass-53 local presets exist, confirm they appear under LEGACY LOCAL and can be recalled.
- [ ] Recall one legacy local preset, then SAVE FILE… and reload the resulting JSON to confirm migration.
- [ ] If an old multi-preset Export JSON exists, load it and confirm its entries appear under LOADED LEGACY FILE BANK.
- [ ] Confirm no new saved preset appears merely because the app was relaunched; user files live where the user saved them.
- [ ] Confirm Pass 52D image-feed awareness still works.
- [ ] Confirm Pass 51 Syphon 720p60 remains stable.

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
