# HUFF Classic Pass 53 — Preset File I/O Audit

## Finding

The pre-Pass-53 preset UI looked like a desktop preset manager but used three unrelated browser mechanisms:

```text
SAVE
  -> localStorage['huff_presets_v1']

LOAD
  -> same hidden localStorage map

EXPORT JSON
  -> Blob + temporary <a download>

IMPORT JSON
  -> hidden <input type=file>
```

`src/index.html` also contained two elements with the same `presetLoadInput` ID. This did not create a reliable native Save/Open contract and made the meaning of Save versus Export ambiguous.

## Pass 53 contract

```text
                 HUFF PRESETS
                      |
          +-----------+-----------+
          |                       |
      BUILT-IN                   FILE
   immutable recall       portable user preset
          |                       |
       RECALL             SAVE FILE… / LOAD FILE…
                                  |
                             native dialog
                                  |
                               .json
```

### Built-in presets

Built-ins are application-owned states. `Classic Default` is the first built-in slot. Future curated factory presets can be added to the same registry without changing user-file persistence.

### User presets

SAVE FILE… captures the existing canonical `PRESET_IDS` state and serializes one versioned preset document. The user decides where the file lives.

LOAD FILE… selects one JSON file and applies its canonical preset state through the established `applyPreset()` migration path.

## Compatibility

Pass 53 intentionally preserves beta-era work:

- raw `{ _v: 1, ... }` single-preset files still load;
- old exported `{ name: preset, ... }` banks are detected and loaded into a temporary in-memory FILE BANK group;
- existing `huff_presets_v1` localStorage entries are read-only and shown under LEGACY LOCAL;
- recalling a legacy preset followed by SAVE FILE… converts it into the new portable single-preset format.

No Pass 53 save path writes to localStorage.

## Native boundary

The frontend uses Tauri's native Open/Save dialogs. The Rust layer exposes only two small preset commands:

```text
write_preset_file(path, contents)
read_preset_file(path)
```

Both are JSON-only and enforce a 1 MiB size ceiling. Writes validate JSON before touching disk; reads validate JSON before returning it to the WebView.

## Render safety

The pass changes preset/UI/native file plumbing only. The Pass 53 validator hash-protects every accepted render-stage function plus `effects.js`, `pipeline-runtime.js`, and the Pass 51 Syphon Worker.

## Remaining runtime gate

The container cannot launch the target macOS Tauri/WebKit native dialogs, so the user-machine test is authoritative for dialog presentation and returned paths.
