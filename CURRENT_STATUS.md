# HUFF Classic — Current Status

**Current candidate:** Pass 38 — CORRUPT XYZ + Cluster Toggle + Master Speed

**Runtime-positive baseline:** Pass 37 for CORRUPT semantics; Pass 36 for Luma stability; Pass 22 remains the frozen Flow reference.

## CORRUPT model

```text
CORRUPT
├── UPDATE
│   ├── ON
│   ├── SPEED
│   ├── CONTINUOUS
│   ├── STROBE / INTERVAL
│   └── MULTIGRAB / HOLD / LIVE
├── TIME
│   ├── AGE
│   └── AGE SPREAD
├── REGIONS
│   ├── AMOUNT / AMOUNT DRIFT
│   ├── GRID / PATCH SIZE / GAP / JITTER
│   └── MASK FULL / STENCIL
├── CLUSTERS ON/OFF
│   ├── GROUP SHAPE
│   │   ├── GROUPS / AMOUNT / SIZE / HOLLOW
│   │   ├── Z SPREAD
│   │   ├── SHAPE HOLD
│   │   └── PULSE SIZE
│   ├── GROUP XYZ
│   │   └── MOVE X / Y / Z
│   └── GROUP DYNAMICS
│       └── ORGANIC SPEED / TURN / WANDER / VAR / KICK / MOMENTUM / EDGE
├── PATCH XYZ
│   ├── POSITION X / Y / Z
│   └── MOVE X / Y / Z
├── PATCH REPEAT
│   ├── REPEATS / DIRECTION
│   └── FIELD RATE
└── COMPOSITE
    └── MIX
```

## Luma performance status

No Luma runtime code changed in Pass 38. The known cost remains LIVE mode's bounded synchronous readback/CPU transform/upload on decoded-frame rebuilds. STENCIL avoids normal-playback readback after capture.

Use the backtick profiler to compare `luma read/xform/upload/cache` with `gl draws` before changing the Luma architecture again.

## Protected systems

- Flow frozen at accepted Pass 22 behavior.
- Luma implementation exact from Pass 36/37.
- CLASSIC / CRISP FINISH routes unchanged.
- no new full-resolution buffer;
- no native Tauri changes;
- no decoder/output clock changes.

## Decision after runtime test

Judge controls by immediacy. The strongest Pass 38 questions are:

1. Does master SPEED make CORRUPT substantially more playable?
2. Is Z immediately understandable in RANDOM mode?
3. Does Clusters ON now feel like a genuinely different spatial mode?
4. Are Group Z SPREAD and Group XYZ useful enough to keep?
5. Does LIVE Luma still create unacceptable FPS loss under high CORRUPT draw-call load?
