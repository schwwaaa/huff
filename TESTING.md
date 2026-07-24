# Huff Native Milestone 06 test checklist

First confirm Milestone 05 playback, history, glitch, cluster, and feedback behavior still works. Then test Scanlines with moving video and a populated history ring.

## Build and regression

- [ ] Application compiles without Rust, WGSL, or wgpu validation errors
- [ ] Video/audio and camera switching remain stable
- [ ] Glitch and cluster behavior remain unchanged from Milestone 05
- [ ] Feedback remains non-additive and does not blow out brightness
- [ ] Clear and Global Reset clear feedback/history and reset scan phases

## Scanline activation

- [ ] Scanline controls are enabled rather than marked pending
- [ ] ON displays clean-source bands inside the persistent effect buffer
- [ ] OFF removes new bands without breaking glitch/feedback
- [ ] Count changes the number of bands
- [ ] Radius changes band thickness
- [ ] Alpha changes only scanline opacity

## Motion and placement

- [ ] Speed 0 freezes band drift while glitch speed remains independent
- [ ] Speed increases scanline drift without changing glitch motion
- [ ] Angle 0 is horizontal
- [ ] +90 and -90 are vertical in opposite orientations
- [ ] Spin Right advances continuously
- [ ] Spin Left advances continuously in the opposite direction
- [ ] Right wins when both spin toggles are enabled
- [ ] With spin off, the manual angle slider is authoritative
- [ ] Place X/Y shifts the complete field in screen space

## Shape

- [ ] Gap 0 produces touching/evenly packed bands
- [ ] Increasing Gap spreads the comb apart
- [ ] Drift 0 preserves a regular comb
- [ ] Drift adds local wander without destroying Gap spacing
- [ ] Focus 0.5 is neutral
- [ ] Focus below/above 0.5 pulls bands toward opposite regions
- [ ] Shift changes sampled displacement across the band
- [ ] Skew changes displacement progressively across the band field

## Zoom

- [ ] Content zoom magnifies video inside stationary bands
- [ ] Pattern zoom scales the whole band field around the center
- [ ] Both applies both behaviors
- [ ] Rotated bands cover the corners rather than only the center strip
- [ ] Out-of-bounds source regions are clipped, not smeared from edge pixels

## Layer priority

Test with Glitch and Scanlines both enabled:

- [ ] Scan Top paints scanlines last
- [ ] Glitch Top paints glitch tiles last
- [ ] Neutral alternates order every frame
- [ ] Pulse alternates order at Pulse Speed
- [ ] Layer Priority does not change glitch or scanline opacity
- [ ] Feedback transforms the already ordered combined buffer

## Diagnostics

Hover `NATIVE:` or `H:`:

- [ ] Scanline on/off is reported
- [ ] Band count matches the generated band count
- [ ] Effective spin angle updates
- [ ] Layer Priority is reported
- [ ] Scan generation time remains small and stable

Parameter-calibration differences can be recorded for the later parity-fix pass. Report validation errors, black output, pipeline resets, layer-order inversions, or large behavioral differences immediately.
