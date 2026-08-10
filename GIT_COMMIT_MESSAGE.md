# Git Commit Message — use only after runtime acceptance

```bash
git add . && git commit \
  -m "fix: stabilize slowed Corrupt in Scan composites" \
  -m "Separate CONTINUOUS Corrupt layer presence from RANDOM/CLUSTER SPEED so Corrupt remains composited every render instead of disappearing between sub-1x updates while Scan continues repainting the shared persistent buffer." \
  -m "Add a speed-scaled decoded-frame Corrupt source clock so historical AGE choice evolves with RANDOM/CLUSTER SPEED: 1x follows decoded cadence, low values evolve slowly, and 0x locks patch/cluster geometry plus delay choice while delayed video remains live inside the held regions." \
  -m "Keep STROBE and MULTIGRAB as the explicit temporal update policies, preserve Pass 40V Luma TARGET/cache behavior and Pass 40U Scan FIELD geometry, and add no framebuffer, image readback/upload, FrameRing storage or native-runtime change." \
  -m "Add Pass 40W layer-handoff simulation, validation, documentation and updated MIDI/OSC/parameter-reference semantics."
```
