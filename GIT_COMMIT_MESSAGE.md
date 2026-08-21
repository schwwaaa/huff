feat: expand HUFF Classic constrained pipeline recipes

- preserve CLASSIC as the exact Pass 22 compatibility route
- preserve the existing CRISP FINISH route
- add TEMPORAL UNDERLAY, SYMMETRY MEMORY, COLOR MEMORY, FLOW FINISH, and experimental FEEDBACK FINISH
- keep every route serial with the existing gCur/gBuf/gScratch resource topology
- add no parallel branches, same-frame cycles, or full-resolution buffers
- keep Feedback, Flow, Symmetry, Solarize, Corrupt, Scanlines, and Luma effect math unchanged
- keep Global Mix BEFORE FB / AFTER FB / AFTER FLOW / FINAL semantics
- restrict the existing Global Mix/Solarize fusion optimization to the original compatible routes
- add a minimal live routing diagram beneath the Pipeline selector
- generate the diagram from the same immutable recipe definitions used for execution
- validate diagram order against executable stage order
- accept all built-in recipe IDs in preset recall while retaining CLASSIC fallback for legacy/unknown routes
- preserve Syphon, Spout, native preset I/O, and HUFF Classic's non-wgpu architecture
- add Pass 58 validation, regression tooling, manual test guidance, and cumulative documentation

HUFF Classic Pass 58
