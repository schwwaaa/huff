# HUFF Classic Pass 16S Testing Checklist

## Blocking Syphon verification

- [ ] Launch HUFF and load the same video that rendered cleanly in Pass 16.
- [ ] Start Syphon before opening or selecting the OBS Syphon source.
- [ ] Confirm the HUFF status shows bootstrap frames increasing at approximately one per second.
- [ ] Select `huff` in OBS.
- [ ] Confirm the source changes from black to the HUFF image.
- [ ] Confirm HUFF reports `receiver connected`.
- [ ] Confirm the native published-frame count increases continuously.
- [ ] Test 1280×720 at 30 fps.
- [ ] Test 1920×1080 at 30 fps.
- [ ] Test the preferred 60 fps setting where supported.
- [ ] Stop and restart Syphon while OBS remains open.
- [ ] Remove and re-add the OBS Syphon source.
- [ ] Start OBS before HUFF and repeat.
- [ ] Start HUFF before OBS and repeat.

## Rendering regression

- [ ] Compare ordinary video playback against Pass 16 with Syphon stopped.
- [ ] Confirm no FPS change while Syphon is stopped.
- [ ] Confirm Solarize remains visually identical to Pass 16.
- [ ] Confirm Glitch, Scanlines, Feedback, Flow, Symmetry, and Luma Key remain intact.
- [ ] Confirm audio remains synchronized and stable.

## Output interaction

- [ ] Run the canvas mirror and Syphon simultaneously.
- [ ] Confirm the canvas mirror remains clean.
- [ ] Confirm Syphon remains clean while the mirror opens and closes.
- [ ] Confirm Syphon stop releases the OBS source cleanly.
- [ ] Confirm application exit leaves no HUFF process.

## Diagnostic interpretation

- Published-frame count remains zero: browser/WebSocket sender is not reaching Rust.
- Published-frame count advances but OBS is black: inspect pixel content, Metal publication, and OBS version/client behavior.
- Bootstrap count advances then receiver connects: the repaired startup path is working.
- Receiver connects but FPS is low: profile Worker capture/readback separately from Canvas2D rendering.
