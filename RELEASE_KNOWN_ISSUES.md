# Pass 58 Candidate Notes / Known Issues

- The five new pipeline recipes have passed static structural validation but have **not yet been visually accepted on the target machine**.
- `FEEDBACK FINISH` is explicitly experimental because the accepted Feedback stage owns persistent `gBuf` state and performs a snapshot/clear/redraw operation. Its implementation is unchanged, but its new late position requires creative/endurance review.
- The existing Global Mix → Solarize fusion optimization is intentionally disabled for the five new reordered recipes. This favors serial correctness over an optimization proof that was written for the original transform order.
- Historical Pass 57/56 whole-file freeze validators are expected to fail after the authorized Pass 58 routing/UI changes. Use `npm run regress:pass58` as the current automated gate.
- No runtime claim is made yet about visual distinction among all five new recipes. Redundant routes should be removed after testing.

## Pass 53 preset runtime gate

Native preset Save/Open dialogs require final validation in the target macOS Tauri runtime. Static validation confirms the dialog wiring, JSON format, migration paths, and protected render behavior, but this container cannot launch the target system dialogs.

# HUFF Classic — Release Known Issues After Pass 29

## Cross-platform

- Symmetry and Solarize are downstream processors in the HUFF Classic instrument model. They are not release-promised standalone source stages. Pass 52D makes this dependency visible and directs users to start imagery with Corrupt, Scanlines, or Luma Key / COMPOSITE.
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
