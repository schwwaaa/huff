# HUFF Classic Optimization Pass 18 — Testing Checklist

## A. Baseline stability

- [ ] Launch Pass 18 and load the same video used to validate Pass 17.
- [ ] Confirm playback and audio are as stable as Pass 17 with Glitch disabled.
- [ ] Confirm no video decode error.
- [ ] Confirm normal shutdown leaves no HUFF process buildup.

## B. Glitch visual parity

Compare directly against Pass 17 using the same seed and controls.

- [ ] Glitch with SMEAR 0.
- [ ] Glitch with default SMEAR 6.
- [ ] Glitch with high SMEAR values.
- [ ] DEPTH and DEPTH SCATTER across low, medium, and high values.
- [ ] SPATIAL GAP enabled and disabled.
- [ ] Cluster Tiles disabled.
- [ ] Cluster Tiles enabled with stationary centers.
- [ ] Cluster travel, steering, inertia, bounce, pulse, breathe, and coherence.
- [ ] Negative and positive Glitch Base X/Y offsets.
- [ ] Glitch combined with Pipeline Luma Key and Scanlines.
- [ ] Glitch combined with Feedback and Flow Pulse.

Expected result: identical tile selection, history selection, smear positions, alpha, overlap behavior, and cluster motion.

## C. Profiler checks

Toggle the profiler with backtick.

- [ ] `gl tiles` rises and falls with CORRUPT, BLOCK, GAP, and cluster settings.
- [ ] `gl draws` equals approximately `gl tiles × (1 + SMEAR)`.
- [ ] `gl ring` shows rebuilds after decoded frames and reuses between them.
- [ ] Profiler hidden performance remains equal to or better than Pass 17.
- [ ] Record `applyGlitch` time at representative draw counts.

Suggested measurements:

| Resolution | BLOCK | CORRUPT | SMEAR | gl tiles | gl draws | applyGlitch ms | FPS |
|---|---:|---:|---:|---:|---:|---:|---:|
| 720p |  |  | 0 |  |  |  |  |
| 720p |  |  | 6 |  |  |  |  |
| 1080p |  |  | 0 |  |  |  |  |
| 1080p |  |  | 6 |  |  |  |  |
| 1080p |  |  | 20 |  |  |  |  |

## D. Temporal-ring invalidation

- [ ] Play normally and verify history moves forward.
- [ ] Pause and resume.
- [ ] Seek to a different point.
- [ ] Change QUALITY so ring capacity changes.
- [ ] Resize the renderer repeatedly.
- [ ] Replace the video source.
- [ ] Confirm Glitch never displays frozen references from a retired ring generation.

## E. Output regression

- [ ] Start Syphon before selecting OBS source.
- [ ] Confirm the one-fps bootstrap appears and OBS receives frames.
- [ ] Confirm full selected Syphon rate after attachment.
- [ ] Test Glitch with high SMEAR while Syphon is connected.
- [ ] Disconnect and reconnect the Syphon receiver.
- [ ] Confirm canvas mirror still works.
- [ ] Confirm Spout code was not changed; runtime verification remains a Windows task.

## F. Endurance

- [ ] Run Glitch at a representative heavy setting for at least 30 minutes.
- [ ] Watch FPS, `applyGlitch`, ring memory, and Syphon drops.
- [ ] Confirm no progressive latency, memory climb, audio degradation, or output black frame.

## Acceptance gate

Pass 18 becomes the next stable baseline only when:

1. normal playback remains as stable as Pass 17;
2. Glitch visuals match Pass 17;
3. Syphon remains functional;
4. profiler-hidden performance is equal or better;
5. no stale temporal frames appear after source, resize, or QUALITY changes.
