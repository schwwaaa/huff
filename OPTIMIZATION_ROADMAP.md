# HUFF Classic Development Roadmap

1. Pass 41A — **accepted** playback fidelity / 1080p Classic boundary.
2. Symmetry review — **parked**; current binary/mode behavior remains unchanged.
3. Existing Solarize THRESHOLD — **accepted and protected**.
4. Pass 42 — **current candidate:** add Magic DaVE-inspired LUMA QUANTIZE as a second Solarize mode.
5. Runtime-test Pass 42 with:
   - clean source + LUMA QUANTIZE at LEVEL 0 / 50 / 90 / 99 / 100;
   - SOFT sweep 0 → 100;
   - INVERT on/off;
   - AMOUNT 0 → 1;
   - THRESHOLD mode against the accepted Pass 41A visual reference;
   - LUMA QUANTIZE combined with Feedback, Corrupt, Scanlines, Luma Key, and frozen Flow;
   - profiler visible to compare Solarize read/xform/upload/present behavior.
6. If accepted, freeze Pass 42 and consider the separate chroma-oriented Posterize effect.
7. Overall interaction/redundancy audit.
8. Classic release-hardening, endurance, and cross-platform codec/package verification.

Do not modify Flow unless it is explicitly reopened. Do not introduce wgpu/native-renderer work into HUFF Classic.
