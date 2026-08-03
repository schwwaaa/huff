# HUFF Classic Pass 12R Testing Checklist

## Primary regression confirmation

- [ ] Load the same video that failed in rejected Pass 12.
- [ ] Confirm it loads through the normal file control without a decode error.
- [ ] Confirm video begins rendering.
- [ ] Confirm audio plays.
- [ ] Confirm seeking works.
- [ ] Confirm pause/resume and looping work.
- [ ] Replace the source repeatedly and confirm old playback stops.

## Pass 11 regression coverage

- [ ] Clean playback with all effects neutral.
- [ ] Glitch only.
- [ ] Scanlines only.
- [ ] Luma Key only.
- [ ] Feedback identity and non-identity states.
- [ ] Flow with zero and non-zero strength.
- [ ] Symmetry boundary and active states.
- [ ] Solarize identity and active states.
- [ ] Combined heavy-effects scene.

## Outputs

- [ ] Canvas mirror connects and displays.
- [ ] Canvas mirror disconnect/reconnect remains stable.
- [ ] Syphon starts and publishes.
- [ ] Syphon stops cleanly.
- [ ] Spout remains unchanged for Windows testing.

## Lifecycle

- [ ] Camera starts and stops.
- [ ] Camera-to-file and file-to-camera switching works.
- [ ] Closing HUFF leaves no accumulated processes.
- [ ] Long playback does not develop audio drift or increasing latency.
