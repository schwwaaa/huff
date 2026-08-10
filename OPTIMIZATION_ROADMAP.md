# HUFF Classic Optimization Roadmap

1. Pass 39N — accepted Corrupt/Feedback/readability checkpoint.
2. Scan review — 40U FIELD became the successful collage direction; 40V/40W repaired Luma/Corrupt layering interactions.
3. Pass 41A — current playback fidelity / 1080p Classic boundary candidate.
4. Runtime-test 41A with:
   - 1080p30/60 H.264 MP4;
   - at least one >1080p source downprocessed to 1080P;
   - 4:3 source using FIT/FILL/1:1;
   - long seek/scrub session;
   - heavy Scan + Corrupt + Luma load while profiler playback rows are visible.
5. If accepted, freeze Classic playback resolution at 1080p maximum and document the paid HUFF HD 4K+ boundary.
6. Continue feature review with Symmetry.
7. Review Solarize with special attention to synchronous CPU readback.
8. Overall interaction/redundancy audit.
9. Classic release-hardening, endurance, and cross-platform codec/package verification.

Do not add a native/FFmpeg decoder to Classic unless runtime evidence shows the WebView decode path is the limiting release blocker.
