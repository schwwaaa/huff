# Pass Notes

## Pass 40W — Corrupt / Scan layer-presence repair candidate

Pass 40V correctly separated Luma targets/readback caches, but runtime testing
exposed a second issue: CONTINUOUS Corrupt below 1x was being removed from most
render frames by its speed gate. Scan continued repainting the shared persistent
composite, so slowing Corrupt produced intermittent layer presence rather than a
slow, stable composition. A speed edit could force one isolated Corrupt frame,
which looked like a frame glitch even while FPS stayed healthy.

Pass 40W separates **layer presence** from **evolution**:

- CONTINUOUS Corrupt is composited every render;
- Random/Cluster Speed controls geometry/motion/age-choice evolution;
- 0x locks geometry and historical delay choice while delayed video remains live;
- STROBE/MULTIGRAB remain the explicit temporal update policies.

No new full-resolution buffer or pixel readback is introduced. Pass 40V's Luma
TARGET/cache architecture and the successful Scan FIELD design remain intact.
