# HUFF Classic Optimization Roadmap

1. Pass 39N — accepted Corrupt/Feedback/readability checkpoint.
2. Scan review:
   - 40 / 40R rejected;
   - 40S recovery;
   - 40T free-panel Zoom;
   - 40U successful Panel FIELD;
   - 40V Luma target/cache handoff repair;
   - 40W current CONTINUOUS Scan/Luma/Corrupt layer-presence repair.
3. Runtime-validate Pass 40W before adding another Scan mode/filter.
4. If accepted, decide whether STROBE/MULTIGRAB need retained-layer semantics when combined with Scan.
5. Freeze Scan/Corrupt/Luma front-stage behavior for endurance testing.
6. Review Symmetry.
7. Review Solarize with special attention to synchronous readback cost.
8. Overall interaction/redundancy audit.
9. Classic release hardening and cross-platform packaging verification.

Rule: do not solve front-stage layering by silently adding full-resolution buffers.
Any future retained-layer architecture must be explicit, profiled, and justified.
