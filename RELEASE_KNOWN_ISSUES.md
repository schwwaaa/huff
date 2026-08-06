# HUFF Classic — Release Known Issues After Pass 29

## Cross-platform

- HUFF Classic remains a Canvas2D/WebView application; performance depends on the host WebView, decoder, and source material.
- 720p and 1080p are the supported capability tiers. No general 4K performance claim is made.
- Syphon and Spout use browser pixel readback before native texture publication.
- Two simultaneous HUFF instances conflict on local ports 8787 and 9000.

## macOS

- Public release still requires Developer ID signing and Apple notarization.
- Syphon endurance and receiver reconnect must be tested against the final signed universal app.
- Camera permission must be tested after the final bundle identifier change to `com.schwwaaa.huff`.

## Windows

- Spout is restored as a required build asset but still needs final native Windows compilation and receiver testing.
- The frozen installer format is MSI. NSIS is not included until adjacent `spout_bridge.dll` packaging is explicitly validated or replaced with a static bridge.
- SmartScreen warnings remain expected until a trusted code-signing certificate is used.
- WebView2 installation depends on the MSI bootstrapper mode.

## Linux

- Syphon and Spout are unavailable.
- WebKitGTK camera/media support varies by distribution and WebKit version.
- Video playback requires an adequate GStreamer plugin set.
- ALSA development headers are required to compile the MIDI dependency.
- DEB and AppImage definitions are complete, but final codec, camera, shutdown, and long-session tests remain outstanding.

## Not yet validated in this environment

- Rust compilation;
- Tauri bundling;
- macOS signing/notarization;
- Windows MSI inspection;
- Windows Spout receiver output;
- Linux DEB/AppImage execution.
