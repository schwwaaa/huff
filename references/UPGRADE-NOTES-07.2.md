# Huff Native wgpu — Milestone 07.2

## Decoder stall recovery

Milestone 07.1 could remain visually interactive while file playback and temporal glitching stopped. The renderer and feedback loop were still running, but the native FFmpeg video/audio workers used blocking `read_exact()` calls directly on child-process pipes. If an FFmpeg process remained alive without producing enough bytes to complete the next frame or audio chunk, the worker had no opportunity to observe cancellation or recover.

That state matched the reported behavior:

- `NATIVE: PLAY` remained visible.
- The wgpu renderer and feedback parameters continued responding.
- Audio stopped.
- The displayed video frame stopped advancing.
- Glitch stopped because the temporal history ring received no new source sequence.

## Changes

- Long-running video and audio pipe reads now occur in dedicated bounded reader threads.
- Decoder workers receive complete frames/chunks through bounded channels.
- Both workers use a three-second liveness timeout.
- A stalled FFmpeg child is killed and restarted at the current media position.
- Unexpected early video EOF is treated as a recoverable decoder failure rather than the actual end of the file.
- Video frame buffers are recycled through a bounded pool to avoid adding a full-frame allocation on every decode.
- Audio chunk buffers are recycled as well.
- Recovery counters are exposed in `VideoStatus` and `VideoAudioInfo`:
  - `decoderStalls`
  - `watchdogRestarts`
- The `NATIVE:` tooltip now displays video and audio decode/recovery diagnostics.
- Package versions are synchronized at `0.7.2`.

## Scope

This correction does not change the visual render graph, feedback behavior, glitch generation, scanlines, Smoosh, luma key, Global Mix, or Flow. It only changes native media-pipe supervision and diagnostics.

## Expected recovery behavior

When a pipe stalls, the current frame may remain visible for roughly three seconds. Huff then terminates the stalled decoder and resumes near the last confirmed media position. The GPU history ring continues from the recovered source sequence; it is not unnecessarily cleared.

A recovery count above zero is not itself an error. It indicates that the watchdog prevented a permanent playback lock.
