# Huff Native Milestone 10 test checklist

## Build and launch

```bash
npm install
npm run dev:metal
```

Confirm FFmpeg is available:

```bash
ffmpeg -version
```

## Native-size still

1. Load a moving video or start the camera.
2. Create a recognizable state with Glitch, Feedback, Scanlines, Luma, or Flow.
3. Select `PNG NATIVE`, `SMOOTH`, and `FIT`.
4. Press `PNG` and choose a destination.
5. Wait for `EXPORT: … ✓`.
6. Open the PNG and confirm it matches the native output orientation, color, and brightness.
7. Confirm a matching `.huff-export.json` file exists beside it.

## Resolution profiles

Export the same state at:

- 1920×1080
- 3840×2160
- 7680×4320
- a custom size such as 2048×2048

Confirm the dimensions with Preview, Finder/Get Info, or:

```bash
ffprobe -v error -show_entries stream=width,height -of default=nw=1 exported.png
```

## Aspect policies

Use a live render size whose aspect ratio differs from the export target.

- `FIT`: complete image remains visible with black letterboxing.
- `CROP`: target is filled and edge content is cropped.
- `STRETCH`: target is filled and proportions change.

## Sampling

Use large pixel blocks or sharply defined scanlines.

- `SMOOTH` should interpolate during scaling.
- `CRISP` should retain nearest-neighbor edges.

## State preservation

During and after a 4K export, verify:

- feedback continues from the same buffer;
- temporal history is not cleared;
- video transport continues;
- audio continues;
- Syphon remains at the live `R:` size;
- Spout remains at the live `R:` size when available;
- the native output window does not resize.

## Minimized output

1. Minimize the native output window.
2. Request a still from the controls window.
3. Confirm the export completes.
4. Restore the output and confirm the live state continued.

## Recording exclusion

1. Start native recording.
2. Attempt a PNG export.
3. Confirm Huff rejects the request instead of competing for a large export readback.
4. Stop and finalize recording.
5. Start an 8K PNG export and immediately attempt to begin recording.
6. Confirm recording is rejected until the export completes.
7. Confirm PNG export and recording both work again afterward.

## Bounded failure tests

- Try custom width `8193`.
- Try a custom size whose total exceeds 35 megapixels.
- Start a second export while an 8K export is active.

Each request should fail visibly without crashing or altering the live renderer.

## Metadata inspection

Open the `.huff-export.json` sidecar and confirm it contains:

- `engineBuild: HNW-10`
- source path and position for file playback
- render and export dimensions
- sampling and fit mode
- parameter revision and values
