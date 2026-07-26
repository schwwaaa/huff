# HUFF Native Milestone 19 test checklist

The goal is to verify named-bus ownership and constrained routing without beginning the larger visual-refinement cycle.

## 1. Launch

```bash
npm install
npm run dev:metal
```

Confirm the About panel reports Milestone 19 and the Constrained Routing panel appears above the main parameter groups.

## 2. Classic recipe

1. Choose **Classic HUFF**.
2. Press **Apply Recipe**.
3. Confirm Program Bus and Monitor Bus both show Program.
4. Enable glitch, scanlines, feedback, and Flow.
5. Confirm the normal HUFF output remains visually consistent with Milestone 18.

## 3. Program Clean bypass

1. Build a recognizable feedback or glitch image.
2. Change Program Bus to **Clean Source**.
3. Confirm the native window, Syphon/Spout, recording, and export all receive clean video.
4. Return Program Bus to **Program Composite**.
5. Confirm the persistent effect image continued running and returns rather than being cleared.

## 4. Raw Field Store Program

1. Enable feedback and glitch.
2. Set Program Bus to **Raw Field Store**.
3. Confirm the output shows persistent effect pixels against black rather than the final clean/effect composite.
4. Return to Program Composite.

## 5. Independent Monitor bus

1. Leave Program Bus on Program Composite.
2. Set Monitor Bus to Clean.
3. Confirm only the local native output window shows Clean.
4. Verify Syphon, Spout, recording, or a short export still follows Program Composite.
5. Repeat with Monitor Bus set to Field Store.

## 6. Flow insertion recipes

1. Enable glitch, scanlines, and Flow.
2. Apply **Glitch → Flow → Scan** and observe the result.
3. Apply **Scan → Flow → Glitch** and observe the result.
4. Apply **Isolated Smoosh Layers** and confirm Smoosh becomes enabled and Flow resolves to the final stage.
5. Do not tune visual parity yet; only confirm the routes execute and the app remains stable.

## 7. State-document routing scope

1. Save a preset with Routing enabled while Program is Clean and Monitor is Field Store.
2. Change both buses back to Program.
3. Load the preset with Routing checked and confirm both selections return.
4. Load it again with Routing unchecked and confirm they do not change.

## 8. Automation

1. Start automation recording.
2. Change Program and Monitor buses or apply a routing recipe.
3. Stop recording.
4. Confirm the clip contains step-based routing parameter events.
5. Use the clip in deterministic export only if time permits; detailed automation refinement remains deferred.

## 9. Route-plan export

1. Press **Inspect** and review the current routing summary.
2. Press **Export Plan**.
3. Confirm the JSON uses `huff-routing/v1` and contains seven buses, active edges, Program/Monitor selections, legal temporal cycles, and warnings when monitoring a diagnostic bus.

## 10. Regression smoke test

Confirm the following still launch or operate:

- video playback and audio;
- camera source;
- presets and state documents;
- MIDI/OSC mappings;
- live recording;
- deterministic export;
- Syphon or Spout where available.

## Deferred refinement

Multiple independent process chains, physical auxiliary outputs, preview/take switching, arbitrary user patching, general masks, and cross-application routing belong to later instruments or the master suite. Milestone 19 only proves explicit responsibilities inside the current HUFF recipe.
