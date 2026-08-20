# HUFF Classic — Release Candidate Test Matrix

**Baseline:** Pass 57 / Pass 56 runtime

Use this as the integrated manual release gate. Do not change multiple systems at once when a failure appears; first reproduce the smallest failing state.

## A. Launch and source playback

- [ ] Launch HUFF from a clean app start.
- [ ] Load a known-good video file.
- [ ] Confirm playback begins and remains moving.
- [ ] Scrub forward/backward repeatedly.
- [ ] Pause and resume.
- [ ] Load a second file without restarting HUFF.
- [ ] Confirm the second source replaces the first cleanly.
- [ ] Resize the HUFF window and confirm processing remains stable.
- [ ] Leave playback running for at least 15 minutes before continuing the deeper tests.

## B. Three-source image-entry model

Test each primary feed independently with moving footage.

- [ ] CORRUPT only produces live imagery.
- [ ] SCANLINES only produces live imagery.
- [ ] LUMA KEY with TARGET=COMPOSITE and MIX>0 produces live imagery.
- [ ] Luma TARGET=CORRUPT does not claim an independent LUMA/COMP feed.
- [ ] Luma TARGET=SCAN does not claim an independent LUMA/COMP feed.
- [ ] Multiple primary feeds can coexist and the IMAGE FEED status reflects them.
- [ ] Layer Priority SCAN TOP behaves correctly.
- [ ] Layer Priority CORRUPT TOP behaves correctly.

## C. Downstream processing

Start from each of the three primary feeds where practical.

- [ ] FEEDBACK behaves as accepted.
- [ ] FLOW behaves as the protected Pass 22-derived behavior.
- [ ] SYMMETRY works when fed imagery and its downstream status is understandable.
- [ ] SOLARIZE Threshold works when fed imagery.
- [ ] SOLARIZE Luma Quantize works when fed imagery.
- [ ] SOLARIZE Chroma Posterize works when fed imagery.
- [ ] Solarize Fluidity retains the accepted slow/viscous response.
- [ ] Symmetry + Solarize combination behaves correctly.
- [ ] Feedback + Flow combination behaves correctly.
- [ ] Heavy Feedback + Luma + Solarize combination remains usable.

## D. Global Mix and route recipes

- [ ] Global Mix LINEAR response behaves correctly.
- [ ] Global Mix SMOOTH response behaves correctly.
- [ ] Global Mix PUNCH response behaves correctly.
- [ ] Test available Global Mix positions.
- [ ] CLASSIC quick-route label matches observed behavior.
- [ ] CRISP FINISH quick-route label matches observed behavior.
- [ ] Switching recipe does not produce a stale/black frame or leave a broken state.

## E. Luma Key

- [ ] LIVE source responds continuously.
- [ ] STENCIL source recalls and remains usable.
- [ ] CLIP / GAIN respond correctly.
- [ ] CLEANUP / DENSITY respond correctly.
- [ ] INVERT responds correctly.
- [ ] MIX responds correctly.
- [ ] X-FADE works.
- [ ] SOFT ADD works.
- [ ] LIGHTEN works.
- [ ] DARKEN works.
- [ ] MULTIPLY works.
- [ ] OVERLAY works.
- [ ] HARD LIGHT works.
- [ ] DIFFERENCE works.
- [ ] Confirm acceptable FPS in representative Luma-only and combined states.

## F. Preset workflow

Create at least three visibly different presets during this regression.

- [ ] Type a name containing `P` and `F`; ordinary typing is not intercepted.
- [ ] SAVE FILE… opens the native save dialog.
- [ ] Saving writes a JSON file to the chosen local folder.
- [ ] The same save immediately adds the preset under SESSION — SAVED / LOADED.
- [ ] Move many controls, then RECALL the newly saved preset without using LOAD FILE.
- [ ] The exact saved state returns.
- [ ] Save the same path again after changing the state; the session slot refreshes rather than duplicating.
- [ ] Save a second and third preset; all remain available during the session.
- [ ] LOAD FILE… adds a local JSON to the same session bank.
- [ ] Quit HUFF completely and relaunch; session entries are gone.
- [ ] Local JSON files remain on disk.
- [ ] Reload one JSON and confirm it returns to the session bank.
- [ ] Classic Default remains available as a built-in preset.

### Optional curation during this test

- [ ] If a test state is genuinely strong, save its JSON into a separate `factory-candidates` folder outside the build.
- [ ] Do not add those files to HUFF's built-in preset directory during Pass 57.
- [ ] Note which source/effect conditions made the preset useful.

## G. Syphon — macOS

- [ ] Start 1280×720 / 60 FPS before opening the receiver.
- [ ] Receiver connects and begins displaying current imagery.
- [ ] Confirm worker-direct route when available.
- [ ] Disconnect/reconnect receiver repeatedly.
- [ ] Stop/Start Syphon repeatedly.
- [ ] Change source while Syphon is active.
- [ ] Recall several presets while Syphon is active.
- [ ] Run a heavy Feedback/Luma/Solarize patch while Syphon is active.
- [ ] Confirm no accumulating output latency.
- [ ] Run 30+ minutes continuously.
- [ ] Test 720p30 safe mode.
- [ ] Quit HUFF while Syphon is active; no orphaned HUFF process/output remains.

## H. Windows Spout

- [ ] Launch Windows package on an actual Windows machine.
- [ ] Start Spout and connect a known receiver.
- [ ] Confirm moving output.
- [ ] Change sources and presets while active.
- [ ] Stop/restart output repeatedly.
- [ ] Quit while active and confirm cleanup.
- [ ] Record any performance ceiling separately; do not infer Syphon results apply to Spout.

## I. Linux

- [ ] Launch packaged Linux build.
- [ ] Load/play/scrub known-good media.
- [ ] Exercise Corrupt, Scanlines, Luma, Feedback, Flow, Symmetry, and Solarize.
- [ ] Save and load preset JSON files through the available dialogs.
- [ ] Quit/relaunch repeatedly without process buildup.
- [ ] Record any codec/backend-specific limitations in RELEASE_KNOWN_ISSUES.md.

## J. Lifecycle and endurance

- [ ] Sleep/wake with HUFF open and video loaded.
- [ ] Resume playback after wake.
- [ ] Repeat with output active where safe/available.
- [ ] Close and reopen HUFF at least five times.
- [ ] Confirm no zombie/orphaned HUFF processes.
- [ ] Run a representative patch for 30–60 minutes.
- [ ] Confirm FPS does not progressively collapse.
- [ ] Confirm memory does not show obvious unbounded growth.

## Release-candidate decision

- [ ] No blocker remains in core playback.
- [ ] No blocker remains in the three-source pipeline.
- [ ] No blocker remains in preset save/load/session recall.
- [ ] macOS Syphon is acceptable for the promised Classic contract.
- [ ] Windows and Linux results are documented honestly.
- [ ] Any remaining non-blocking issue is written in RELEASE_KNOWN_ISSUES.md.
- [ ] Candidate can be frozen without adding another feature.
