# Huff Native wgpu · Milestone 11 upgrade notes

Milestone 11 adds a **frame-driven deterministic MP4 export mode** to the native Huff engine.

## Why this is different from recording

Milestone 09 records the live renderer at a CFR timeline. It is designed to preserve a performance as it happens and duplicates the most recent completed frame if the real-time renderer is late.

Milestone 11 temporarily places the renderer in a separate export mode:

```text
selected source interval
        ↓
FFmpeg exact-frame decoder
        ↓
fixed simulation step (1 / 24, 1 / 30, or 1 / 60 second)
        ↓
Huff native history / glitch / clusters / scan / flow / feedback graph
        ↓
independent GPU scale pass
        ↓
synchronous bounded readback
        ↓
FFmpeg MP4 encoder
        ↓
optional source-audio retime and AAC mux
```

The exporter does not wait for the wall clock and does not drop an output frame because the GPU or encoder is slower than real time. A ten-second 4K export may take much longer than ten seconds, but it still contains exactly the requested number of CFR frames.

## Deterministic state boundary

At export start Huff freezes:

- the complete canonical parameter snapshot;
- the source seed;
- MIDI snapshot;
- OSC snapshot;
- microphone/audio-analysis snapshot;
- gesture snapshot;
- playback rate;
- source-loop state;
- source interval, output FPS, and duration.

The renderer then resets its procedural phases, frame number, temporal history, cluster state, feedback store, scan state, and flow-pulse state to a known initial condition. The same supported source interval, state, seed, and export settings should therefore follow the same native simulation path.

A `.huff-offline.json` sidecar stores the frozen parameter snapshot and export configuration.

## Exact source-frame decoding

The offline decoder uses its own bounded FFmpeg process and does not depend on Huff's live decoder queue. It produces one BGRA source frame for every output frame using a playback-rate-aware timestamp filter.

The queue holds at most three decoded frames. The renderer consumes exactly one frame, advances exactly one simulation step, renders, reads back, and writes exactly one encoder frame before requesting the next step.

## Output scaling

The completed authoritative Huff image is scaled by the existing native export shader using:

- Smooth or Crisp sampling;
- Fit, Crop, or Stretch;
- Native, 1080p, 4K, 8K, or custom dimensions. MP4 dimensions must be even for broad H.264 compatibility.

As in Milestone 10, a 4K/8K export currently resamples the completed internal render. It does not reallocate and rerun every history, glitch, feedback, and flow resource at the output dimensions.

## Audio

`SOURCE AUDIO` seeks the loaded file to the same start point, applies the selected playback rate with a bounded FFmpeg `atempo` chain, applies Huff's video-audio volume, encodes AAC at 192 kbps, and muxes it after the video render completes.

`SILENT` writes video only.

Microphone capture and mixed source-plus-microphone export are intentionally outside this milestone.

## Live-engine handoff

The exporter:

1. remembers the loaded video's position and play/pause state;
2. pauses live video and its audio;
3. runs the deterministic export;
4. returns the source to the remembered position;
5. resumes playback only if it was playing before export.

The live feedback and history pixel contents are not checkpointed. They are cleared to establish deterministic export state and are cleared again when returning to live mode. Canonical parameters are restored from the current parameter store.

While offline export is active:

- recording and PNG still export are excluded;
- source/transport/reset/render-target actions are disabled or ignored;
- live parameter changes are not applied to the export;
- Syphon and Spout hold their most recent live frame, then resume afterward;
- the output window may display the frames being rendered.

## Cancellation and cleanup

Cancel terminates the private decoder and encoder, removes partial temporary/output files, restores the live source position, and returns the renderer to live mode.

Application shutdown also cancels and cleans up the session.

## Current scope boundaries

- File-video source only; camera offline rendering is not included.
- Static frozen parameter state; no automation or keyframe replay yet.
- Source audio or silent only.
- No image-sequence, ProRes, FFV1, or alpha-output profiles yet.
- Determinism is defined for one build/backend and the same inputs; cross-GPU floating-point bit identity is not claimed.
- The live temporal pixel state is reset rather than serialized and restored.
