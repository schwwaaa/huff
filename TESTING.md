# Huff Native Milestone 07.1 test checklist

Run:

```bash
npm install
npm run dev:metal
```

Use a moving video, let GPU history fill, then test the sections below.

## Baseline regression

- Video and camera still switch exclusively.
- Video audio, transport, seeking, rate, and looping still work.
- Glitch, clusters, scanlines, Layer Priority, and feedback behave as in Milestone 06.
- Feedback does not brighten uncontrollably.
- Clear and Global Reset still clear the persistent buffer and history.

## Smoosh

1. Enable Glitch and Scanlines.
2. Enable Smoosh.
3. Confirm Layer Priority no longer changes the combined result while Smoosh is active.
4. Move Amount from 0 to 1.
5. Toggle Invert and confirm base/over roles swap.
6. Test Screen, Multiply, Difference, Overlay, Hue, and Luminosity.
7. Disable Smoosh and confirm normal Layer Priority resumes.

## Luma Key

1. Enable Glitch with obvious historical tiles.
2. Enable Luma Key and raise Mix.
3. Sweep A/B from 0 to 1.
4. Confirm clean source replaces effect regions according to source luminance.
5. Toggle Invert.
6. Repeat with Smoosh enabled and with Scanlines on top.

## Global Mix

1. Enable Global Mix with Mix around 0.5.
2. Test Screen, Multiply, Difference, and Normal.
3. Compare Before FB and After FB with visible feedback motion.
4. Enable Flow and compare After Flow against Final.
5. Disable Flow while Position is After Flow; confirm the clean source falls back to the final tail rather than disappearing.

## Flow

1. Enable Flow at Strength 6, Scale 80, Speed 1, Target Final.
2. Confirm Speed 0 freezes the field.
3. Test low and high Scale values.
4. Sweep Implode through negative, zero, and positive values.
5. Test positive and negative Swirl.
6. Increase Turbulence and Spread separately.
7. Increase Carry and confirm displacement accumulation remains bounded.
8. Set Pulse depth after history has filled.
9. With Trigger off, confirm pulse history is continuous.
10. With Trigger on, confirm pulse history is only used after pressing Fire.

## Flow target routing

- Target Glitch: glitch should be warped and scanlines should remain crisp on top.
- Target Scan: scanlines should be warped and glitch should remain crisp on top.
- Target Final: the completed chain should be warped.
- Enable Smoosh and confirm Flow behaves as Final regardless of the selected target.

## Diagnostics

Hover the `NATIVE:` status pill and confirm it reports:

- Smoosh status and blend
- Luma Key status
- Global Mix status and position
- Flow status, target, strength, and pulse-fire count

Report compile/WGSL validation failures separately from visual parameter-tuning differences.


## 07.1 lockup regression test

1. Load a moving video and allow history to fill.
2. Enable Glitch and Feedback.
3. Enable Luma Key and set a visible threshold/mix.
4. Enable Scanlines after Luma Key.
5. Leave the combination running for at least five minutes.
6. Toggle Scanlines off/on repeatedly and move Angle, Focus, Shift, Drift, and Opacity.
7. Repeat with Layer Priority set to Scan Top and Glitch Top.
8. Confirm video, audio, controls, and the native output remain responsive.

If a lock still occurs, preserve the terminal output and note whether the controls window, native output, audio, or only parameter updates stopped.


## Milestone 07.2 decoder-stall test

1. Load the same long video used during the reported freeze.
2. Recreate a heavy render state with Glitch, Feedback, Luma Key, Scanlines, and optional Smoosh/Global Mix.
3. Leave playback running for at least 20 minutes while interacting with parameters.
4. Hover `NATIVE:` and watch:
   - Video decode FPS
   - Video stalls and recoveries
   - Audio buffered milliseconds
   - Audio stalls and recoveries
5. Confirm that if either decoder stalls, playback resumes automatically within several seconds.
6. Confirm that feedback remains interactive during recovery and temporal glitching resumes when new frames arrive.
7. Confirm that Play/Pause/Seek/Rate still work after an automatic recovery.

The correction passes only if a decoder problem self-recovers instead of requiring an application restart.
