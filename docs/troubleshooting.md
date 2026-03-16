---
layout: page
title: Troubleshooting
permalink: /troubleshooting/
nav_order: 11
---

## Canvas window shows "WS: disconnected"

The canvas window connects to the Rust WebSocket relay at `ws://127.0.0.1:8787`. If it stays disconnected:

1. **Check that huff is fully started.** The relay starts asynchronously during setup — wait a second after launch before the canvas window connects.
2. **Check port 8787 is not in use** by another application. See [Caveats — Port 8787](caveats#port-8787-must-be-free) for how to check.
3. **If you opened `canvas.html` directly in a browser** (outside the Tauri app), the relay is not running. Start a standalone relay: `node src/ws-server.js`
4. On some systems the WebView connects via IPv6 (`[::1]`). huff binds both — if one fails the other should succeed within 1–2 seconds.

---

## Camera not appearing or not starting

**No camera in the dropdown:**
- Click **↻ Refresh** in the Source group. Devices connected after app launch do not appear until you refresh.
- On macOS, check System Preferences → Security & Privacy → Camera → confirm huff is listed and allowed.
- On Windows, check Settings → Privacy → Camera → allow apps to access the camera.

**Camera in the dropdown but Start produces no output:**
- On macOS distribution builds: the app must be codesigned with the camera entitlement. In dev mode (`npm run dev`) this is injected automatically. See [Caveats — Camera Permissions](caveats#camera-permissions-require-codesigning-for-distribution).
- Try a different browser in the OS to confirm the camera works at all (`camera test` websites).

---

## MIDI device not appearing or not responding

**Device not in the list:**
- Click **↻ Refresh** in the MIDI panel. The list is polled on demand, not live.
- On macOS, confirm the device appears in **Audio MIDI Setup** (Applications → Utilities).
- On Windows, check Device Manager → Sound, video and game controllers.

**Device connected but not responding:**
- Confirm the correct port is selected and **Connect** was clicked (status shows the port name when active).
- Check the `channel` field in your map file. `-1` accepts all channels. If your controller sends on channel 2 (index `1`) and your map says `"channel": 0`, it will be filtered out.
- Click **Debug: log all ports to console** in the MIDI panel and check the browser console (right-click the controls window → Inspect → Console). This logs all detected ports and any CC messages received.

---

## Syphon not appearing in receivers

1. Confirm the Syphon panel shows **active** (not just "Start clicked").
2. In your receiver (Resolume, VDMX, etc.), trigger a manual re-scan of Syphon sources. Some apps only scan on launch.
3. Confirm both apps are on the same user account. Syphon uses shared memory and does not work across user sessions or sandboxed environments.
4. If you are running huff from the `npm run dev` command (unsigned), Syphon should still work — the framework is loaded at runtime, not via App Store validation.

---

## Spout init failed (Windows)

The Spout panel shows an error on Start:

1. **Install the Spout2 runtime** from [spout.zeal.co](https://spout.zeal.co/). The bridge DLL bundled with huff requires the Spout2 system components to be installed separately.
2. Confirm `spout_bridge.dll` is present next to `huff.exe` in the installation directory. If it is missing, reinstall.
3. On Windows 10, ensure **WebView2 Runtime** is installed (required for the app to run at all).

---

## High memory usage

The frame ring grows with resolution and quality. At 1080p + quality=1 the ring can hold up to ~192 MB.

**To reduce memory:**
- Lower the **QUALITY** slider. At quality=0 the ring holds only 4 frames regardless of resolution.
- Reduce the canvas resolution. huff uses the window size — make the controls window smaller.
- Disable **Trails** and **Flow Warp** — both read the full ring depth and keep it alive.

---

## Glitch / effects stop responding to controls

All controls write directly to DOM elements that the p5 draw loop reads each frame. If controls appear unresponsive:

1. Check that **ON** is toggled for the relevant effect group.
2. Check that the overall **SYSTEM** toggle (if present) is enabled.
3. If CORRUPT % is at 0, no tiles will be displaced regardless of other settings.
4. If QUALITY is at 0, the ring holds only 4 frames — DEPTH and DEPTH SCATTER will have very little range.

---

## Output looks frozen / only one frame

- The p5 draw loop may have halted due to a JS error. Right-click the controls window → **Inspect** → **Console** to check for errors.
- If the video file is paused, the source is static — effects will still run but the input is not changing.
- On Windows, some configurations cause the WebView to throttle requestAnimationFrame when the window is not in focus. Keep the controls window visible or move it to a secondary monitor with focus.

---

## "Port already in use" error on launch

```
[huff] IPv4 listener error: Address already in use
```

Another process is using port 8787. See [Caveats — Port 8787](caveats#port-8787-must-be-free) for how to identify and resolve it. As a quick workaround, change the port in `src-tauri/src/main.rs` and `src/index.html` and rebuild.

---

## `npm run dev` fails on first run

**`cargo not found`:** Install Rust via [rustup.rs](https://rustup.rs).

**`tauri: command not found`:** Run `npm install` first — Tauri CLI is a dev dependency installed into `node_modules/.bin/`.

**Build fails with missing system library (Linux):** Install the WebKitGTK development packages for your distribution. See [Installation — Linux extra](installation#building-from-source).

**Build fails with Xcode errors (macOS):** Run `xcode-select --install` to install the Command Line Tools.

---

## tauri build fails on macOS with code signing errors

If you are not distributing the app and just want a local build:

```bash
# Build without code signing
CODESIGN_IDENTITY="-" npx tauri build
```

For a fully signed and notarised build, see [Apple's notarisation documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution).

---

## Getting More Help

- **Open an issue** on the [GitHub repository](../../issues) with the console output (right-click the controls window → Inspect → Console) and your OS/version.
- Include the huff version (`v2.0 · beta · 2025` shown in the About overlay, accessible from the top bar).
- On macOS, run `system_profiler SPSoftwareDataType` for OS version. On Windows, `winver`.
