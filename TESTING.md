# HUFF Native Milestone 18 test checklist

The goal is to test distinctions and recall boundaries rather than refine every earlier effect or export path.

## 1. Launch

```bash
npm install
npm run dev:metal
```

Confirm the About panel reports Milestone 18 and the State Library appears above the main parameter groups.

## 2. Preset boundary

1. Load a video and move it to a recognizable position.
2. Change several Look, Temporal, and Routing controls.
3. Save a Preset using its default scope.
4. Change the video position, playback rate, render resolution, and parameters.
5. Load the preset.
6. Confirm artistic parameters return while source path, transport, and render resolution remain unchanged.

## 3. Snapshot boundary

1. Select Snapshot and keep the default broad scope.
2. Save while a video is paused at a known position.
3. Change the parameters and transport.
4. Load the snapshot.
5. Confirm selected parameters and transport return.
6. Confirm temporal buffers clear when temporal or render state changes.

## 4. Sequence document

1. Record a short automation clip.
2. Select Sequence and save it.
3. Clear the active automation.
4. Load the sequence with Automation checked.
5. Confirm the active clip returns and can be selected for deterministic export.
6. Attempt to save a Sequence with no active clip and confirm the operation is rejected.

## 5. Project and controller maps

1. Create or load non-default MIDI and OSC maps.
2. Record or import an automation clip.
3. Select Project and save with Control Maps and Automation enabled.
4. Replace the maps and clear automation.
5. Load the project with those scopes checked.
6. Confirm the map names, rows, and active automation return.

## 6. Missing source handling

1. Save a Snapshot or Project containing a video source reference.
2. Move or rename the video file outside HUFF.
3. Load the document with Source enabled.
4. Confirm the parameter recall succeeds, the application remains running, and a missing-file warning is shown.

## 7. Scope intersection

1. Save a Project with all supported domains.
2. Before loading, check only Look and Routing.
3. Confirm Render, Transport, Automation, and maps do not change.
4. Save a Preset, then check every load scope. Confirm the preset still cannot restore domains it did not capture.

## 8. Persistent image separation

1. Build an obvious feedback/history image.
2. Save a preset or snapshot.
3. Change the image-memory contents.
4. Load the document.
5. Confirm the parameter state can return, but the old GPU pixel contents are not secretly restored.

## 9. State-model export

Press Export State Model and inspect the JSON. Confirm all 98 canonical parameters have domain, preset, sequence, interpolation, project, and live-safety metadata.

## Deferred refinement

Project-relative media paths, embedded still/store resources, project folders, migration between future schema versions, camera-device identities, asset relinking, and a visual state browser remain later work. The first objective is proving the distinctions and safe recall rules.
