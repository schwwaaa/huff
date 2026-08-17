# HUFF Classic Pass 51 — Runtime Testing Checklist

## A. Product boundary

- [ ] Open Syphon and confirm only **60 FPS — 1280×720** and **30 FPS — 1280×720 (safe)** exist.
- [ ] Confirm 60 FPS is selected by default.
- [ ] Confirm there is no 1080p Syphon option.

## B. 720p60 worker-direct

- [ ] Start Syphon at 60 FPS with a receiver attached.
- [ ] Confirm status shows `worker-direct`.
- [ ] Confirm moving output is stable and visually current.
- [ ] Open the backtick profiler and watch `sy credit`; it should remain bounded at `/2`.
- [ ] Confirm `sy fall` does not increase in a normal healthy session.
- [ ] Compare receiver motion cadence against Pass 50 / 720p30.

## C. Backpressure / heavy HUFF state

- [ ] Enable a heavy accepted state: Feedback/Persistence + Luma + Solarize + other normal effects.
- [ ] Confirm HUFF rendering does not stall because Syphon is busy.
- [ ] Confirm Syphon does not accumulate visible latency over time.
- [ ] If `sy credit` sits at `2/2`, confirm output opportunities are dropped rather than queued and latency remains current.

## D. Receiver lifecycle

- [ ] Start HUFF Syphon before opening the receiver; confirm bootstrap discovery still works.
- [ ] Close receiver while streaming, wait, then reopen it.
- [ ] Repeat receiver connect/disconnect several times.
- [ ] Confirm no discoverable-but-black regression.

## E. Start / stop / restart

- [ ] Start → Stop → Start at 60 FPS at least five times.
- [ ] Stop while receiver is connected.
- [ ] Stop while no receiver is connected.
- [ ] Close HUFF while Syphon is streaming and confirm no orphan process/publisher state.

## F. 720p30 safe mode

- [ ] Select 30 FPS and confirm worker-direct can run at 720p30.
- [ ] Confirm the same receiver lifecycle behavior.

## G. Forced fallback

- [ ] Force/unavailable Worker transport (or otherwise trigger the existing fallback path).
- [ ] Confirm status changes to `main-socket fallback` / equivalent.
- [ ] With 60 FPS selected, confirm the effective streaming status reports **1280×720 @ 30 fps**.
- [ ] Confirm moving output continues instead of stopping/going black.
- [ ] Stop and restart; confirm HUFF makes a fresh worker-direct attempt and returns to selected 60 FPS when healthy.

## H. Long run

- [ ] Run 720p60 worker-direct for at least 30 minutes with moving video.
- [ ] Include several minutes of heavy Feedback/Luma/Solarize use.
- [ ] Confirm no increasing latency, runaway memory, frozen worker, socket buildup, or lifecycle instability.

## Acceptance

Accept Pass 51 if 720p60 is materially smoother than Pass 50 without weakening Pass 49/50 stability, and if any direct-transport failure reliably degrades to current 720p30 output rather than accumulating latency or losing Syphon publication.
