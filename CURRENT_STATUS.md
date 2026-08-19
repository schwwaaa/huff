# HUFF Classic — Current Status

## Current candidate

**Pass 56 — Preset Save + Session Recall**, built directly from working Pass 55.

SAVE FILE… now writes the local JSON and immediately adds the exact saved snapshot to the RAM-only session preset dropdown. The saved JSON persists on disk; the session entry disappears on quit. LOAD FILE… continues to add local JSON files to the same temporary session bank. No render, effect, pipeline, Syphon, or factory-preset behavior is changed.

---

# HUFF Classic — Current Status

## Current candidate

**Pass 55 — Keyboard Focus Safety**, built directly from runtime-accepted Pass 54.

Pass 55 removes the global `P` hide-controls shortcut so preset names can contain ordinary `p/P` characters. It also establishes a small keyboard-ownership rule: while an editable control has focus, remaining global shortcuts defer to the control; outside editing, fullscreen `F` and HUFF undo `Ctrl/Cmd+Z` continue to work.

No preset, rendering, effect, pipeline, Syphon, or native I/O behavior changes.

### Runtime gate

Type a preset name containing `P`, `F`, and spaces; verify normal typing. While still editing, verify Ctrl/Cmd+Z edits the field rather than HUFF state. Defocus the field and verify `F` fullscreen and Ctrl/Cmd+Z HUFF undo still work.

# HUFF Classic — Current Status

## Current candidate

**Pass 54 — Session Preset Bank**, built directly from runtime-accepted Pass 53.

Pass 54 keeps portable JSON as the only durable user-preset format while making loaded files practical for performance preparation. Every loaded JSON is added to a RAM-only `SESSION — LOADED FILES` group in the normal preset dropdown. Multiple files accumulate and can be recalled repeatedly until HUFF closes. Relaunching HUFF starts with a clean session bank; the user's JSON files remain on disk.

No image pipeline, native preset I/O, or Syphon behavior changes.

### Runtime gate

Load at least two separate JSON presets, alternate between them during moving playback, quit/relaunch HUFF, and verify that the temporary menu entries disappear while the original files remain loadable.

# HUFF Classic — Current Status

## Current candidate

**Pass 53 — Preset File Workflow Repair**, built directly from accepted Pass 52D.

Pass 53 does not alter the image pipeline. It replaces the browser-local preset workflow with explicit desktop semantics: immutable built-in recall plus native SAVE FILE… / LOAD FILE… dialogs for portable JSON user presets. `Classic Default` is the first built-in slot. Existing pre-Pass-53 localStorage presets are read-only migration sources, and old exported preset-bank JSON remains loadable.

### Runtime gate

On the target Mac, verify native Save/Open dialogs, save a preset to an ordinary local folder, change controls, reload the file, quit/relaunch, and reload again. Pass 52D pipeline behavior and Pass 51 Syphon must remain unchanged.

# HUFF Classic — Current Status

## Current candidate

**Pass 52D — Three-Source Pipeline Awareness**, built directly from Pass 52B.

Pass 52C is rejected and is not part of this candidate. Pass 51 remains the runtime-accepted Syphon baseline: fixed 1280×720 output, 60 fps worker-direct primary, 30 fps safe fallback.

Pass 52 Chroma Posterize remains visually accepted. The unresolved issue was not Posterize itself but the expectation that Symmetry and Solarize should behave like independent first-stage filters. Target-machine testing showed that the attempted 52A/52B/52C standalone fixes did not provide a reliable standalone contract.

### Product decision

HUFF Classic now intentionally preserves the constrained three-source image-entry model:

1. **Corrupt**
2. **Scanlines**
3. **Luma Key / COMPOSITE** with nonzero Mix

Symmetry and Solarize are presented as **downstream processors**. Pass 52D changes UI awareness only: it shows the active image feed(s), warns when a downstream processor is enabled without a primary feed, and exposes the CLASSIC / CRISP FINISH ordering at a glance.

No fourth CLEAN feed is added. No source is auto-enabled. No Pass 52B render-stage function is changed. Global Mix remains the existing position-selectable clean-source reinjection utility rather than a fourth primary starter.

### Runtime gate

Confirm on the target Mac that the new status indicators are immediately understandable and that accepted combinations are visually unchanged. Hold the final Pass 52 Git commit until this UI contract is accepted.
