# Testing Checklist — Pass 36

## Critical regression test

Use the same media/settings that produced the Pass 35 freezes.

1. Enable Glitch.
2. Enable Glitch Strobe; try EVERY 4, 8 and 16.
3. Enable Luma Key with KEY SRC = LIVE.
4. Toggle INVERT repeatedly while video is playing.
5. Sweep threshold, Gain, Cleanup and Density.
6. Disable Luma, use several other effects, then return and enable Luma again.

### Success
- no freeze or single-digit collapse;
- Luma remains responsive after leaving and returning to it;
- held/strobed Glitch is visibly affected by Luma in the familiar pre-Pass-35 manner.

## Stencil test

1. Set KEY SRC = STENCIL.
2. Confirm `CAPTURE FIRST` is shown.
3. Press CAPTURE on a high-contrast frame.
4. Confirm `STENCIL STORED WxH` appears.
5. Sweep threshold several times.
6. Toggle INVERT repeatedly.
7. Sweep Gain, Cleanup and Density.
8. Return all controls toward prior values and verify the stencil remains responsive rather than progressively disappearing.
9. Switch to LIVE and back to STENCIL; confirm the stored stencil remains valid until source change, resize or Clear Buffers.

## Pipeline interaction

Test both:

```text
CLASSIC
CRISP FINISH
```

with:

- Glitch Strobe + LIVE Luma;
- Glitch Strobe + STENCIL Luma;
- Scanlines;
- Feedback;
- Flow.

## Lifecycle

- replace the video source;
- resize/fullscreen cycle;
- Clear Buffers;
- close and relaunch.

Stencil should intentionally invalidate after source replacement, resize, or Clear Buffers.

## Output

Confirm Canvas mirror and, where available, Syphon/Spout continue without disconnect or frozen frames.
