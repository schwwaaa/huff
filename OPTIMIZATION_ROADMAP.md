# HUFF Classic Optimization Roadmap

1. Pass 41A playback fidelity / 1080p Classic boundary — **accepted**.
2. Symmetry expansion — **parked**.
3. Pass 42 LUMA QUANTIZE — **strong positive runtime response / protected**.
4. Pass 43 FLUIDITY — **strong positive runtime response / protected**.
5. Pass 44 active-parameter UI — **retained**.
6. Passes 45–46 Solarize GPU optimization and stage timing — **material improvement / protected**.
7. Luma isolation — Pass 46 target-machine result showed LIVE/COMPOSITE Luma alone at approximately 52 FPS.
8. Pass 47 self-calibrating LIVE Luma GPU handoff + scratch budget repair — **current candidate**.
9. After Luma is accepted, continue one-effect-at-a-time runtime analysis before adding another creative effect.

## Pass 47 acceptance

The immediate gate is the isolated Luma comparison, not a full heavy patch.
Confirm first that Luma itself recovers useful headroom. Then reintroduce Solarize,
Global Mix, Feedback/Persistence and the other stages one at a time so future
optimization decisions are grounded in measured stage cost.
