# HUFF Native Milestone 20 test checklist

Milestone 20 is a verification and recovery milestone. Complete the relevant sections on every production machine, then preserve the exported diagnostics folder with the observed results.

## 1. Launch and baseline

```bash
npm install
npm run dev:metal   # macOS
npm run dev:dx12    # Windows
```

Confirm:

- the About panel reports Milestone 20;
- **VERIFY** opens Production Verification;
- normal Milestone 19 routing and effects still run;
- the native output continues rendering while the verification window is open.

## 2. Repository production check

```bash
npm run validate:production
```

On a configured build computer also run:

```bash
npm run validate:production:strict
```

Resolve strict failures before packaging. Warnings should be documented rather than silently ignored.

## 3. In-app report with video

1. Load a representative video with audio.
2. Let it play for at least 30 seconds with Glitch, Scanlines, Feedback, Flow, and Luma Key active.
3. Open **VERIFY** and run the check.
4. Confirm GPU, renderer, surface, FFmpeg, FFprobe, encoders, video decoder, audio, and temporary storage appear.
5. Confirm the report identifies the expected production backend and current adapter.
6. Review warnings against the detailed text rather than treating every warning as a defect.

## 4. Surface recovery

1. Minimize and restore the native output window, or move it between displays.
2. Press **Recover Surface**.
3. Confirm rendering continues and effect buffers are not cleared.
4. Re-run the report and confirm the surface-recovery count can increase without creating a fatal condition.

## 5. Source recovery — video

1. Leave video playing at a recognizable position.
2. Press **Restart Source**.
3. Confirm picture and source audio resume near the same position.
4. Confirm parameters, automation clip, routing recipe, and persistent effect state are not reset.
5. Re-run the report and inspect decoder restart/watchdog counters.

## 6. Source recovery — camera

1. Start a camera using the intended profile.
2. Press **Restart Source**.
3. Confirm the same device/profile resumes.
4. Confirm camera permission, dimensions, source format, and capture FPS are represented in the report.

## 7. Syphon — macOS

1. Start Syphon output.
2. Open a real receiver such as Resolume, VDMX, MadMapper, OBS with Syphon support, or Syphon Simple Client.
3. Confirm the HUFF Program bus appears and updates.
4. Run the check while the receiver is active.
5. Press **Restart Outputs** and confirm the receiver reconnects or the source reappears.
6. Test at 30 and 60 FPS caps and at the intended render resolution.

## 8. Spout — Windows

1. Refresh adapters and choose the GPU used by the receiver.
2. Start Spout output.
3. Confirm the `huff` sender appears in Resolume, MadMapper, OBS Spout, or Spout Demo Receiver.
4. Run the check and confirm worker, adapter, initialization, and frame counts.
5. Press **Restart Outputs** and confirm receiver recovery.
6. Repeat on integrated and discrete adapters when available.

## 9. Recording and export ownership

1. Start a short live recording and run the check.
2. Confirm the report identifies recording ownership and does not report simultaneous offline-export ownership.
3. Stop/finalize recording and inspect the file.
4. Queue or start a short deterministic export and run the check.
5. Confirm source recovery is rejected while deterministic export owns the private graph.
6. Verify completed, failed, and interrupted queue counts are reported honestly.

## 10. MIDI and OSC

1. Connect the controller or start the OSC listener used in production.
2. Move controls/send messages.
3. Run the check and confirm connected/listening state and mapping counts.
4. Disconnect or stop and confirm the report treats the idle service as nonfatal.

## 11. Diagnostics export

1. Press **Export Diagnostics…**.
2. Confirm the timestamped folder contains all seven documented files.
3. Open `production-report.json` and confirm the schema is `huff-production-report/v1`.
4. Open `app-info.json`, `parameter-state.json`, and `routing-plan.json`.
5. Review file paths and device names before sharing the folder.

## 12. Long-session observation

For the final refinement cycle, run at least one two-hour session per production platform with the intended source, outputs, and effects. Record:

- frame rate and frame-time drift;
- decoder stalls and watchdog recoveries;
- surface skips/recoveries;
- output readback drops/map errors;
- Syphon/Spout sender continuity;
- audio underflows;
- memory behavior observed through the operating system;
- recording/export success and finalization.

Export a diagnostics folder at the beginning and end.

## 13. Production package

```bash
npm run build:metal   # macOS
npm run build:dx12    # Windows
```

Install or copy the resulting package outside the development tree. Confirm startup, video/audio, camera permission, Syphon/Spout assets, recording, deterministic export, state documents, and diagnostics export from the packaged application.
