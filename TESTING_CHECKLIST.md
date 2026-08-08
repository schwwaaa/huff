# HUFF Classic Pass 38 — Testing Checklist

## 1. Baseline

- [ ] App launches normally.
- [ ] Video loads/plays with audio.
- [ ] CORRUPT OFF remains visually neutral.
- [ ] Flow behavior matches the accepted baseline.
- [ ] Luma LIVE and STENCIL still operate as in Pass 36/37 before stressing CORRUPT.

## 2. Master SPEED

With Clusters OFF and CORRUPT ON:

- [ ] MOVE X is clearly visible.
- [ ] SPEED 0 stops autonomous spatial movement.
- [ ] SPEED 0.25 is visibly slower than 1.
- [ ] SPEED 2 is visibly faster than 1.
- [ ] SPEED 4 remains controllable rather than immediately unusable.
- [ ] FIELD RATE changes the internal Corrupt motion/noise character independently enough to justify remaining separate.

### Update policy separation

- [ ] STROBE INTERVAL does not change when SPEED changes.
- [ ] MULTIGRAB HOLD/LIVE durations do not change when SPEED changes.

## 3. RANDOM / Patch XYZ

Clusters OFF:

- [ ] POSITION X visibly shifts corrupted patches horizontally.
- [ ] POSITION Y visibly shifts corrupted patches vertically.
- [ ] POSITION Z -1 clearly recedes/shrinks.
- [ ] POSITION Z 0 is neutral.
- [ ] POSITION Z +1 clearly approaches/enlarges.
- [ ] MOVE X continuously travels horizontally.
- [ ] MOVE Y continuously travels vertically.
- [ ] MOVE Z continuously moves near/far and reverses at depth bounds.
- [ ] Reset XYZ restores all six patch XYZ controls to neutral.

## 4. Cluster toggle

- [ ] Clusters OFF shows RANDOM status and hides group controls.
- [ ] Clusters ON shows CLUSTERED status and reveals group controls.
- [ ] Repeated ON/OFF switching does not freeze or corrupt the renderer.
- [ ] Existing MIDI/OSC `clusterTiles` mapping still toggles the same mode if available.

## 5. Cluster identity

Start with `ORGANIC SPEED = 0`, `WANDER = 0`, `KICK = 0`.

- [ ] GROUPS changes number of persistent bodies.
- [ ] GROUP AMOUNT changes the share of patches assigned to groups.
- [ ] GROUP SIZE changes visible group radius.
- [ ] HOLLOW opens/closes the group center.
- [ ] SHAPE HOLD makes boil vs locked-body behavior understandable.
- [ ] Z SPREAD 0 is flat.
- [ ] Increasing Z SPREAD visibly separates groups in near/far scale/placement.
- [ ] GROUP MOVE X directly translates groups horizontally.
- [ ] GROUP MOVE Y directly translates groups vertically.
- [ ] GROUP MOVE Z is visible even when Z SPREAD = 0.
- [ ] PULSE SIZE expands/contracts group size at a rate scaled by master SPEED.

Then add organic dynamics:

- [ ] ORGANIC SPEED adds noise-steered travel rather than replacing direct XYZ.
- [ ] TURN RATE visibly changes heading-change rate.
- [ ] WANDER adds irregularity.
- [ ] SPEED VAR differentiates group travel enough to be understandable.
- [ ] KICK creates identifiable impulses.
- [ ] MOMENTUM changes glide vs responsiveness.
- [ ] EDGE BOUNCE/WRAP are visually distinct.

## 6. Luma FPS investigation

Open the backtick profiler.

### CORRUPT baseline

- [ ] Record FPS with CORRUPT on, Luma off.
- [ ] Record `gl tiles` and `gl draws`.

### LIVE Luma

- [ ] Enable LIVE Luma with the same Corrupt state.
- [ ] Record FPS.
- [ ] Record `luma read`, `luma xform`, `luma upload`, `luma pres`, and `luma cache`.
- [ ] Confirm Luma remains responsive to Clip/Gain/Cleanup/Density/Invert.
- [ ] Confirm no freeze when toggling Invert.

### STENCIL Luma

- [ ] Capture a stencil.
- [ ] Confirm status says stored/ready.
- [ ] Switch to STENCIL and record FPS under the same Corrupt settings.
- [ ] Compare against LIVE Luma.

### Draw-call stress

Repeat LIVE Luma tests with:

- [ ] REPEATS = 0.
- [ ] moderate REPEATS.
- [ ] high REPEATS.
- [ ] positive POSITION Z.

Report actual runtime behavior; do not infer performance from static checks.

## 7. Pipeline / output regression

- [ ] CLASSIC route works.
- [ ] CRISP FINISH route works.
- [ ] Syphon still publishes on macOS if available.
- [ ] Spout path remains structurally untouched on Windows.
- [ ] closing the app does not leave child processes/windows behind.
