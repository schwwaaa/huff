---
layout: page
title: Caveats & Known Limitations
permalink: /caveats/
nav_order: 10
---

This page documents the intentional trade-offs, known limitations, and platform-specific edge cases in huff. Reading this before a performance or installation will save you surprises.

---

## CPU Pixel Readback for Syphon and Spout

**What it means:** Both Syphon and Spout routes use `getImageData()` to read the canvas pixels back from the GPU to CPU inside the WebView, ship them over the loopback WebSocket, then re-upload them to a Metal texture (Syphon) or D3D11 texture (Spout) in Rust.

This is a full **GPU → CPU → GPU** round-trip per frame.

**Why it works anyway:** At 720p and 30fps the readback costs roughly 3–6ms per frame on modern hardware — well within budget. The FPS cap in the Syphon/Spout panels exists specifically to pace this. Do not set the FPS cap higher than your canvas draw rate.

**Why zero-copy isn't implemented:** The WebView (WKWebView on macOS, WebView2 on Windows) does not expose its render surface as a native texture handle. There is no supported path to get the Metal or D3D11 texture backing the canvas element from Rust without writing a native plugin. This is a Tauri/browser architecture constraint, not a fixable bug.

**Mitigation:** Keep your canvas resolution at 720p or 1080p. If you need 4K output, Syphon/Spout at 4K with this path is not practical — use OBS window capture instead.

---

## Frame Ring Memory at High Resolution

The ring buffer is capped at **192 MB** measured in frame count, not pixel budget. The formula is:

```
max_frames = min(quality × 60, floor(192MB / bytes_per_frame))
bytes_per_frame = width × height × 4
```

| Resolution | Bytes/frame | Max frames at quality=1 |
|------------|-------------|------------------------|
| 720p (1280×720) | ~3.7 MB | 51 frames |
| 1080p (1920×1080) | ~8.3 MB | 23 frames |
| 1440p (2560×1440) | ~14.7 MB | 13 frames |
| 4K (3840×2160) | ~33.2 MB | 5 frames |

At 4K the datamosh effect loses most of its temporal depth — you effectively have only 5 frames of history and the DEPTH parameter becomes nearly meaningless. **720p or 1080p is the practical sweet spot** for huff's effect character.

---

## Syphon is macOS-Only. Spout is Windows-Only.

These are platform protocols with no cross-platform equivalent. If you need to share huff's output to software on a different machine, or across platforms, options are:

- **OBS window capture** → NDI (via OBS-NDI plugin) for network distribution
- **OBS window capture** → stream/record directly
- **Canvas mirror window** → opened on any browser on the local network (set `WS_MIRROR_URL` to your machine's LAN IP)

NDI native support is not implemented in huff.

---

## Camera Permissions Require Codesigning for Distribution

In development (`npm run dev`) Tauri injects the `NSCameraUsageDescription` entitlement automatically. In **distribution builds on macOS**, the app must be codesigned with the entitlement for the permission dialog to appear.

Without codesigning, `getUserMedia()` will fail silently on macOS 12+. The camera dropdown will show available devices but starting the camera will produce no output and no error message visible to the user.

**For distribution:** codesign the app bundle with `--entitlements src-tauri/entitlements.plist` before packaging.

---

## SmartScreen Warning on Windows

Unsigned Windows binaries trigger a Windows Defender SmartScreen warning on first launch. This is expected behaviour for any unsigned EXE — it is not a virus detection, it is a lack-of-reputation notice.

Users can bypass it by clicking **More info → Run anyway**. This only happens once per machine per binary hash.

A code-signing certificate will resolve this for future releases.

---

## Port 8787 Must Be Free

huff binds the WS relay on `127.0.0.1:8787` and `[::1]:8787` at startup. If another application is using this port, the relay starts silently without the socket — the canvas window shows "WS: disconnected" and never receives frames.

**To change the port:**

1. Edit `const PORT: u16 = 8787;` in `src-tauri/src/main.rs`
2. Edit the `__getWSURL__` return value in `src/index.html` to match
3. Rebuild

**To find what is using the port:**

```bash
# macOS / Linux
lsof -i :8787

# Windows
netstat -ano | findstr :8787
```

---

## No Multi-Instance Support

Running two huff instances simultaneously causes a port conflict on 8787. The second instance's relay will fail to bind and its canvas window will not work.

If you genuinely need parallel instances (e.g. two independent effect chains for two projectors), build two copies from source with different `PORT` values.

---

## OSC Map Stored in localStorage

The active OSC map is persisted in the WebView's `localStorage`, keyed to the Tauri app origin. This means:

- The map survives app restarts ✓
- The map is lost if you clear WebView data or uninstall + reinstall ✗
- The map is not portable between machines unless you export it as a JSON file ✗

**Best practice:** Always save your OSC maps as JSON files alongside your project. Treat `localStorage` as a cache, not a primary store.

The MIDI map has the same behaviour.

---

## Linux is Untested

The Tauri scaffolding supports Linux and the build prerequisites are documented in [Installation](installation#linux-extra). However, no binary has been tested against a Linux runtime in this release.

Syphon and Spout do not exist on Linux. The canvas mirror window and MIDI/OSC will work if the build succeeds.

Community-tested Linux builds and bug reports are welcome.

---

## Video Format Support

huff uses the browser's native `<video>` element for video playback. Supported formats depend on the WebView implementation:

- **macOS (WKWebView):** MP4 (H.264, HEVC), MOV, WebM (VP8/VP9). ProRes is supported but may be slow.
- **Windows (WebView2):** MP4 (H.264), WebM (VP8/VP9). HEVC requires the HEVC Video Extensions from the Microsoft Store.

Large files (>1GB) are loaded via a blob URL. Files that require hardware-accelerated decode and have slow seeks may produce stuttering at high DEPTH values because the frame ring is being primed faster than the decoder can supply frames.

---

## Cluster Physics State is Not Saved in Presets

Cluster centre positions and velocities are maintained as JavaScript runtime state (`_cluPhysics[]`). They are **not** serialised into preset files. Loading a preset restores all slider values but cluster centres will be at whatever position they were in at load time.

This is intentional — cluster physics evolve continuously during a performance and saving/restoring their state would create discontinuities on preset load.

---

## Feedback Instability at High Values

The FEEDBACK parameter above ~2.5 combined with non-neutral FB Z (zoom) values can cause the buffer to saturate (full white or full black) within seconds. This is not a bug — it is the natural behaviour of a positive-feedback system.

**Recovery:** lower FEEDBACK to 0, or click **↺ Reset** in the Feedback group to reset all FB parameters to neutral. The buffer will clear over the next few frames.
