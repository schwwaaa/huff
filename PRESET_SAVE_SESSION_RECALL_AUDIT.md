# Preset Save + Session Recall Audit — Pass 56

## Intended user flow

```text
adjust HUFF state
    ↓
SAVE FILE…
    ├── preset.json written to local disk
    └── exact saved state added to SESSION dropdown
    ↓
continue moving controls
    ↓
select saved preset + RECALL
    ↓
return to exact saved state
```

On quit, the session dropdown is discarded. The JSON remains on disk and can be loaded on a future run, at which point it is added back to the session bank.

## Implementation detail

`savePresetToFile()` captures the preset once before opening the Save dialog. The same `documentData.preset` object is serialized to JSON and, only after a successful native write, registered through `_registerSessionLoadedPreset()`.

This prevents a subtle mismatch where the file and the temporary recall slot could represent different control states if controls moved while a file dialog was open.

The native saved path is used as the session identity. Resaving that path updates the existing slot. This reuses the same duplicate-prevention mechanism already used by LOAD FILE….

## Persistence boundaries

| Object | Lifetime |
|---|---|
| Built-in preset | Ships with HUFF |
| Saved JSON file | User-owned local persistence |
| Loaded/saved session slot | Current HUFF process only |
| Legacy localStorage preset | Read-only migration path |

Pass 56 adds no new browser persistence.

## Protected systems

- Pass 55 keyboard focus safety;
- Pass 52D three-source pipeline awareness;
- render-stage functions;
- effects implementation;
- pipeline runtime;
- Pass 51 Syphon worker transport;
- Pass 53 native preset read/write commands.
