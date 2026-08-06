# HUFF Classic Optimization Pass 28 — Testing Checklist

## Completed static and deterministic checks

- [x] Pass 9–22 visual/arithmetic behavior validators passed.
- [x] Pass 13S independent render/transport/mirror/profiler clock checks passed.
- [x] Pass 28 source-boundary validator passed.
- [x] 10,000 deterministic output lifecycle sequences passed.
- [x] Flow/effects file matches Pass 27 exactly.
- [x] Validated pipeline runtime matches Pass 27 exactly.
- [x] Capability instrumentation matches Pass 27 exactly.
- [x] No new p5 Graphics render surface.
- [x] All project JavaScript and inline scripts passed Node syntax checks.
- [x] JSON and TOML files parsed.
- [x] Shell scripts passed `bash -n`.
- [x] Syphon framework universal binary check completed.
- [x] ZIP integrity test completed.

## Required macOS runtime tests

- [ ] Start/Stop Syphon 20 times.
- [ ] Attach/detach/reattach OBS while Syphon remains active.
- [ ] Confirm one-fps bootstrap becomes selected full rate after receiver attachment.
- [ ] Disconnect local relay during active Syphon and confirm recovery.
- [ ] Open/close canvas mirror 20 times.
- [ ] Leave video + mirror + Syphon active for at least 60 minutes.
- [ ] Close the control window while Syphon is active.
- [ ] Close the canvas window and confirm complete HUFF process exit.
- [ ] Confirm TCP 8787 and UDP 9000 release immediately.
- [ ] Relaunch immediately after close.

## Required Windows runtime tests

- [ ] Start/Stop Spout 20 times.
- [ ] Attach/detach/reattach a Spout receiver.
- [ ] Confirm buffered-frame skips do not create latency accumulation.
- [ ] Open/close canvas mirror 20 times.
- [ ] Leave video + mirror + Spout active for at least 60 minutes.
- [ ] Close HUFF while Spout is active.
- [ ] Confirm process and ports release immediately.
- [ ] Relaunch immediately after close.

## Required Linux runtime tests

- [ ] Canvas mirror reconnect and shutdown.
- [ ] File playback endurance.
- [ ] Camera/file replacement endurance where supported.
- [ ] Process and port release.
- [ ] Confirm no output lifecycle errors despite Syphon/Spout being unavailable.

## Regression checks

- [ ] Flow looks and responds exactly as confirmed in Pass 22.
- [ ] Scanline/Glitch priority modes remain unchanged.
- [ ] Video playback pacing remains unchanged.
- [ ] MIDI and OSC input still work before shutdown.
- [ ] No hidden process remains after either HUFF window is closed.
