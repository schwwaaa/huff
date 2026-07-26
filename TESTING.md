# Huff Native Milestone 15 test checklist

Milestone 15 changes GPU allocation and export topology. Begin with short jobs and increase resolution gradually.

## Build and launch

```bash
npm install
npm run dev:metal
```

Windows:

```powershell
npm run dev:dx12
```

Confirm FFmpeg:

```bash
ffmpeg -version
```

## 1. Native-resolution regression

1. Load a short video with obvious motion.
2. Enable feedback, glitch, scanlines, and Flow.
3. Export five seconds using **NATIVE**, H.264, 30 FPS, and STATIC STATE.
4. Confirm frame count, audio, temporal behavior, and completion metadata.
5. Confirm the offline tooltip reports `FULL RESOLUTION` and history dimensions/capacity.

This should establish that removing the final resampling pass did not break the normal path.

## 2. Full-resolution proof

1. Set the live render window to a clearly lower resolution such as 960×540.
2. Create fine spatial content using small glitch regions, narrow scanline bands, or detailed source imagery.
3. Export the same five-second interval at 1080p and 4K.
4. Inspect decoded frames at 100% magnification.
5. Confirm the 4K image contains effect geometry evaluated at 4K rather than a 960×540 composite enlarged to 4K.

A useful comparison is to downscale the 4K export to the live size and compare edge structure, tile boundaries, and scanline placement.

## 3. History topology

Repeat a short 4K export for each history setting:

- Full;
- 75%;
- 50%;
- 25%;
- Custom.

For every job, inspect the offline tooltip and `.huff-offline.json` file. Confirm:

- graph history width and height follow the selected rule;
- capacity remains within the bounded history memory policy;
- history effects continue to render when capacity is low;
- the application does not claim more retained frames than allocated.

## 4. Source mapping before effects

Using a source with a different aspect ratio than the export:

1. Export with FIT and confirm background bars enter history/feedback as part of the graph.
2. Export with CROP and confirm the centered crop is used by glitch, keying, feedback, and Flow.
3. Export with STRETCH and confirm the source fills the graph.
4. Repeat SMOOTH and CRISP with pixel-detailed source material.
5. Confirm the source mapping is stable across frames and does not occur as a final post-effect resize.

## 5. Static and automated exports

1. Export a short static 4K job.
2. Record a clip containing parameter changes, one Flow pulse, and one Clear action.
3. Export the clip at 4K with ACTIVE AUTOMATION.
4. Confirm automation changes do not cause renderer/history dimensions to return to live size.
5. Repeat the automated export and compare decoded frame hashes.

## 6. Temporal reset and Clear action

1. Build visible history and feedback before export.
2. Start an offline export and confirm its first frame begins from reset deterministic state.
3. Replay an automation clip with Clear in the middle.
4. Confirm the clear happens on the intended frame without rebuilding the direct readback path or changing output dimensions.

## 7. Live graph restoration

For completion, cancellation, and intentional failure:

1. Note the current live render dimensions, history dimensions/capacity, source position, and play state.
2. Start a higher-resolution export.
3. End the job through the selected path.
4. Confirm the prior live dimensions are restored.
5. Confirm video returns to the previous position and play/pause state.
6. Confirm subsequent live feedback/history begins cleanly.
7. Confirm a new still export and a second offline export can start.

## 8. Deferred window resize

1. Start a 4K deterministic export.
2. Resize or minimize the live output window while the job is active.
3. Allow completion or cancel.
4. Confirm the deferred live surface size is applied after restoration.
5. Confirm the export itself remains 4K throughout.

## 9. Syphon and Spout regression

On the supported platform:

1. Start Syphon or Spout at the live render size.
2. Start a high-resolution offline export.
3. Confirm the deterministic job does not attempt to publish export-sized readback frames.
4. Complete or cancel the job.
5. Confirm external output resumes with the restored live dimensions and no stale-size error.

## 10. Profile regression

Run a short 1080p export for:

- H.264 MP4;
- ProRes 422 HQ;
- ProRes 4444;
- FFV1;
- PNG sequence.

Confirm each path receives the direct full-resolution RGBA frames, commits transactionally, and writes the expected metadata/manifests.

The current final graph is normally opaque; alpha-capable profile plumbing remains available but should not be interpreted as a new alpha-compositing feature in Milestone 15.

## 11. 8K and resource boundary

1. Start with a one-second 8K H.264 or PNG-sequence job.
2. Observe graph-history capacity and resource estimate.
3. Confirm unsupported device dimensions are rejected clearly.
4. Confirm requests above the bounded 3 GiB estimate are rejected before rendering.
5. If a driver still rejects a permitted allocation, record the adapter, backend, dimensions, history mode, and error; the estimate is not an available-VRAM guarantee.

## 12. Deterministic frame comparison

Export the same short 1080p or 4K job twice. Decode both outputs:

```bash
mkdir -p /tmp/huff-a /tmp/huff-b
ffmpeg -i first.mp4 -vsync 0 /tmp/huff-a/%06d.png
ffmpeg -i second.mp4 -vsync 0 /tmp/huff-b/%06d.png
shasum -a 256 /tmp/huff-a/*.png | awk '{print $1}' > /tmp/huff-a.txt
shasum -a 256 /tmp/huff-b/*.png | awk '{print $1}' > /tmp/huff-b.txt
diff /tmp/huff-a.txt /tmp/huff-b.txt
```

Container metadata may differ. Decoded frame identity is the relevant comparison.

## Queue note

The Milestone 13 queue remains provisional. For this testing cycle, one job at a time is sufficient. Queue-specific refinement is not required before moving into visual calibration.
