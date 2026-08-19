# HUFF Classic Pass 55 — Changed Files

Compared with runtime-accepted Pass 54:

## Runtime

- `src/canvas.js`
  - removes the global `P` hide-controls key binding;
  - adds editable-focus ownership for remaining global shortcuts;
  - removes stale `P to show` indicator text.

No other runtime/render/effect/native file is changed.

## Validation

- `scripts/validate-pass55.mjs` — new Pass 55 keyboard-focus/regression validator.
- `package.json` — adds `validate:pass55` script only.

## Documentation

- `HUFF_CLASSIC_USABILITY_PASS_55.txt`
- `KEYBOARD_FOCUS_SAFETY_AUDIT.md`
- `CURRENT_STATUS.md`
- `PASS_NOTES.md`
- `CHANGELOG.md`
- `VALIDATION_REPORT.md`
- `TESTING_CHECKLIST.md`
- `DOCUMENTATION_INDEX.md`
- `README.md`
- `GIT_COMMIT_MESSAGE.md`
- `CHANGED_FILES_PASS55.md`
