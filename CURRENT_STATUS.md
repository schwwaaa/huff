# HUFF Classic Current Status

**Current candidate:** Pass 39N — Corrupt Clock Separation + UI Readability  
**Baseline lineage:** accepted Pass 38 → Pass 39 rejected → Pass 39R recovery → Pass 39M merge candidate → Pass 39N repair candidate  
**Runtime acceptance:** pending user test

## Candidate contents
- Pass 39M Feedback merge preserved exactly.
- Current Corrupt/XYZ/Cluster feature set preserved.
- RANDOM SPEED and CLUSTER SPEED now have explicit independent ownership.
- CONTINUOUS speed below 1x genuinely slows/holds visible Corrupt updates.
- Neon-green text replaced with black UI text.

## Exact regression test
Corrupt ON → Clusters ON → Clusters OFF → RANDOM SPEED 0x.

Expected: Random Corrupt establishes one state and then holds rather than continuing at full visible speed.

## Protected constraints
- Flow frozen.
- Luma unchanged.
- no new full-resolution framebuffer.
- no new synchronous pixel readback/upload.
- native runtime unchanged.
