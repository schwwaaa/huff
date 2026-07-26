# Apply HUFF Native Milestone 16

The complete archive is the safest baseline.

The changed-files archive is intended for a clean Milestone 15 tree and contains only files added or modified by Milestone 16. Copy it over the project root while preserving directory structure.

## New files

```text
MILESTONES.md
UPGRADE-NOTES-16.md
scripts/validate-parity.mjs
src-tauri/src/parity.rs
src-tauri/src/legacy_parameter_contract.json
```

## Modified files

```text
README.md
TESTING.md
VALIDATION.md
MIGRATION-STATUS.md
APPLY-README.md
package.json
package-lock.json
src/app.js
src/index.html
src-tauri/Cargo.toml
src-tauri/Cargo.lock
src-tauri/tauri.conf.json
src-tauri/src/main.rs
src-tauri/src/offline_export.rs
src-tauri/src/automation.rs
src-tauri/src/export_queue.rs
```

## Required tracking file

`MILESTONES.md` is now mandatory in every future complete and changed-files package. It is the authoritative milestone index and must be updated rather than recreated from memory.

## First check

```bash
npm run validate:parity
```

Then launch with the normal backend command and verify the PARITY LAB row.
