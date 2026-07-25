# Milestone 07.1 stability correction

This release addresses a lockup reported when Scanlines were enabled after Luma Key.

## Root risk found

The scanline shader only samples the clean composite texture, but the scan pass was bound to the complete feedback bind group. Depending on the active ping-pong side after Luma Key, that group could also reference the same feedback texture being used as the scan pass render attachment. This was unnecessary and created a Metal read/write alias hazard.

## Correction

- Added a dedicated scanline bind-group layout.
- The layout contains only the clean composite texture at binding 0 and the linear sampler at binding 2.
- Every scanline pass now uses this isolated bind group.
- All target rebuild, clear, history rebuild, resize, and source-switch paths recreate the scan bind correctly.
- No shader behavior or parameter mapping was changed.

## Test focus

Reproduce the reported order: enable Luma Key, then enable Scanlines, and leave the combination running. Test both scan/glitch layer orders and feedback.
