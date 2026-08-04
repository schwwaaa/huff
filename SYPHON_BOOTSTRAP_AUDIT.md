# HUFF Classic Syphon Bootstrap Audit

## Transport after Pass 16S

```text
HUFF final p5 canvas
  → ImageBitmap capture
  → optional output-size capture
  → Worker / OffscreenCanvas RGBA readback
  → raw RGBA WebSocket payload
  → Rust fixed-dimension Syphon sender
  → persistent shared Metal texture
  → SyphonMetalServer
  → OBS / other client
```

## Startup states

### Syphon stopped

- No capture loop work.
- No WebSocket frame payloads.
- No Metal upload.

### Syphon active, no confirmed client

- Server remains discoverable.
- One bootstrap frame is attempted per second.
- Native publication is allowed even if `hasClients` has not yet turned true.
- This gives a newly attaching client a current surface.

### Syphon active, client confirmed

- Browser uses the selected 30 or 60 fps cap.
- One frame remains in flight until Rust acknowledges it.
- WebSocket `bufferedAmount` prevents queue growth.
- Triple-buffered shared Metal textures remain unchanged.

## Preserved optimizations

- receiver-aware full-rate pacing;
- one-frame-in-flight acknowledgement;
- Worker-assisted scaling/readback;
- fixed-size raw RGBA payloads;
- persistent Metal device, queue, textures, and server;
- latest-state runtime polling;
- autorelease pools around Objective-C calls.

## Added output-size ImageBitmap request

When supported, the browser asks `createImageBitmap()` for the selected Syphon output dimensions before transferring the bitmap to the Worker. Older WebViews retain the full-size capture and Worker scaling path.

## Non-goals

Pass 16S does not:

- merge Syphon with the JPEG canvas mirror;
- move Syphon capture into `draw()`;
- change effect rendering;
- change color format or alpha handling;
- change the Metal texture format;
- alter Spout.
