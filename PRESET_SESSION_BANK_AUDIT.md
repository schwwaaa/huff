# HUFF Classic Pass 54 — Preset Session Bank Audit

## Product intent

Pass 53 established portable JSON as the user-preset persistence boundary. Pass 54 adds a deliberately temporary **performance bank** on top of that file model.

The desired workflow is:

```text
HUFF starts
  -> built-in presets available
  -> LOAD FILE… A.json
  -> A applies immediately + enters SESSION — LOADED FILES
  -> LOAD FILE… B.json
  -> B applies immediately + A and B are both recallable
  -> perform by recalling A / B / built-ins
  -> quit HUFF
  -> session bank disappears
  -> A.json / B.json remain on disk
```

This keeps HUFF itself stateless between launches while letting a performer assemble a temporary show bank quickly.

## Runtime model

The session bank is an in-memory JavaScript `Map`. It is created from scratch on launch and has no persistence hook.

```text
BUILT-IN                     permanent app content
LEGACY LOCAL                 read-only migration bridge
SESSION — LOADED FILES       RAM only; current app process
USER JSON FILES              persistent because the user owns the files
```

A loaded single-preset JSON is registered before it is applied. The dropdown selects that new session entry, so the immediate load and later recall refer to the same captured preset state.

## Duplicate handling

The native selected path acts as the session identity. Loading the same path again refreshes that slot. This supports editing/re-exporting a preset and reloading it during preparation without accumulating duplicate menu entries.

Different files may intentionally share the same internal preset name. They remain separate and are displayed as:

```text
LOOK
LOOK (2)
LOOK (3)
```

No file is renamed and no JSON content is modified. The suffix is display-only.

## Legacy banks

Old multi-preset JSON exports remain compatible. Their entries are added to the same temporary session group rather than replacing previously loaded files. This makes old banks usable for a performance while keeping the new one-file-per-user-preset format as the normal persistence model.

## Persistence boundary

Pass 54 intentionally does **not**:

- write session-loaded files to `localStorage`;
- write them to `sessionStorage`;
- copy them into an application preset directory;
- automatically reopen files on next launch;
- create a hidden project/database concept.

The disk JSON is the durable object. The HUFF dropdown is only the current performance workspace.

## Protected systems

Pass 54 changes only preset frontend/UI behavior and documentation. The Pass 53 Rust JSON read/write commands and Tauri dialog permissions remain byte-identical. Accepted Pass 52D render-stage functions, Pass 52 effects, and Pass 51 Syphon Worker remain protected.
