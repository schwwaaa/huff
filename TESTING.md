# HUFF Native Milestone 21 test checklist

Milestone 21 is an observation and architecture milestone. The pass condition is not “zero-copy works.” The pass condition is that existing Syphon/Spout behavior remains intact, the current copy path is reported honestly, the probe is bounded, and reports can be exported without disrupting HUFF.

## 1. Launch

```bash
npm install
npm run dev:metal   # macOS
npm run dev:dx12    # Windows
```

Confirm:

- About reports Milestone 21;
- **VERIFY** still opens Production Verification;
- **INTEROP** opens the Lower-Copy Interoperability Lab;
- effects, routing recipes, recording, and export still operate normally.

## 2. Static validation

```bash
npm run validate:interop
npm run validate:production
npm run validate:routing
npm run validate:state-model
npm run validate:parity
```

On a configured production build computer:

```bash
npm run validate:production:strict
```

## 3. Analysis with no platform output active

1. Open **INTEROP**.
2. Press **Analyze Current Path**.
3. Confirm backend, adapter, dimensions, frame bytes, and current transport are populated.
4. Confirm the current transport is `cpu-readback-upload`.
5. Confirm native sharing is described as research-only or disabled.
6. Confirm values use a 60 fps reference when no platform output is active.

## 4. Syphon test — macOS

1. Start Syphon output at 30 fps.
2. Confirm a receiver sees the HUFF Program output.
3. Analyze the path.
4. Confirm the active output lists Syphon at 30 fps.
5. Confirm the Metal direct and IOSurface candidates are marked candidate/secondary candidate.
6. Repeat at 60 fps and confirm estimated per-stage traffic approximately doubles.
7. Stop Syphon and confirm normal rendering continues.

## 5. Spout test — Windows

1. Select the intended adapter and start Spout.
2. Confirm a receiver sees the `huff` sender.
3. Analyze the path.
4. Confirm the report includes the active adapter and Spout rate.
5. Confirm D3D12 and D3D11On12 candidates are shown when DX12 is active.
6. Repeat on another adapter when available and preserve both reports.

## 6. CPU Copy Probe

1. Run the probe at the normal render resolution.
2. Confirm the interface returns rather than hanging indefinitely.
3. Record throughput, estimated full-frame copy time, and 60 fps share.
4. Change render resolution and repeat.
5. Treat the result only as host memcpy, not end-to-end output latency.

The probe samples at most 64 MiB per allocation and approximately 512 MiB of total copy work, with bounded iteration limits.

## 7. Existing output regression

With Syphon or Spout active:

- run Glitch, Scanlines, Feedback, Flow, and Luma Key;
- switch routing recipes;
- switch Program and Monitor buses;
- run **Restart Outputs** in VERIFY;
- confirm the receiver returns;
- confirm no parameter or persistent-state reset is introduced by Milestone 21.

## 8. Report export

1. Press **Export Report…** in INTEROP.
2. Confirm JSON and TXT files are written.
3. Confirm JSON schema is `huff-interop-report/v1`.
4. Run **Export Diagnostics…** in VERIFY.
5. Confirm the diagnostics folder contains both interop report files in addition to Milestone 20 files.

## 9. Long-session observation

For later refinement, leave a real receiver connected for at least one hour and compare beginning/end reports:

- renderer frame rate;
- readback completions and busy drops;
- map errors;
- sender frames and rejected frames;
- last upload time;
- receiver continuity;
- system CPU/GPU use observed externally.

Milestone 21 itself does not modify the production transport, so a regression here should be treated as a bug in the new typed submission seam or metadata changes.

## 10. Future proof-of-concept gate

Do not promote a native shared-texture path until it passes the acceptance criteria in `INTEROP-RESEARCH.md`, including frame identity, GPU completion, adapter safety, receiver compatibility, recovery, shutdown, and automatic readback fallback.
