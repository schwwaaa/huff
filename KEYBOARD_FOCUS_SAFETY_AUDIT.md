# HUFF Classic Pass 55 — Keyboard Focus Safety Audit

## Issue

Pass 54's global keydown handler ran in capture phase and treated `P` as an application command regardless of focus:

```text
P -> toggleUI()
```

The preset-name field is an ordinary editable input, so a preset such as `PURPLE FEEDBACK` could not be typed normally. The same handler also meant `F` could invoke fullscreen from an editable field and `Ctrl/Cmd+Z` could invoke HUFF's instrument undo instead of the field's normal text undo.

## Pass 55 contract

`P` is no longer a global shortcut at all.

The remaining global keyboard commands now follow this boundary:

```text
EDITABLE CONTROL HAS FOCUS
        |
        +-> keyboard belongs to the control

NO EDITABLE CONTROL HAS FOCUS
        |
        +-> F = fullscreen
        +-> Ctrl/Cmd+Z = HUFF undo
```

Editable ownership includes:

- `input`
- `textarea`
- `select`
- `contenteditable`
- `[role="textbox"]`

## Why remove P instead of merely guarding it?

The user explicitly does not need the letter `P` to be a hidden global UI command, and ordinary typing is more important than an invisible shortcut. Keeping P only outside text fields would still make a common letter capable of unexpectedly hiding the application's controls whenever focus was lost.

The old `toggleUI()` helper is left unbound rather than restructuring unrelated UI code in this pass.

## Orthogonal benefit

The local bug exposed a broader keyboard-ownership problem. A single editable-focus guard also prevents the same class of conflict for the remaining shortcuts without altering their normal non-editing behavior.

This follows the project's development principle: solve the immediate problem, then identify a real adjacent problem that can be addressed by the same small primitive without broadening scope unnecessarily.

## Protected systems

Pass 55 does not alter:

- Pass 54 session preset bank;
- Pass 53 native preset file I/O;
- Pass 52D three-source pipeline awareness;
- Corrupt / Scanlines / Luma routing;
- Feedback / Flow / Symmetry / Solarize;
- Pass 51 Syphon transport;
- native Tauri runtime.
