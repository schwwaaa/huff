# HUFF Native wgpu · Milestone 18 upgrade notes

## Summary

Milestone 18 adds the formal `huff-state/v1` document model and a State Library interface without removing the earlier local quick-preset workflow.

## Native additions

- `src-tauri/src/state_documents.rs`
- parameter-domain and live-safety catalog for all canonical parameters
- Preset, Snapshot, Sequence, and Project document serialization
- selective capture and recall scopes
- source and transport references
- active automation inclusion and restoration
- MIDI/OSC map inclusion and restoration
- explicit persistent-image manifest with no implicit pixel embedding
- state-model JSON export
- native Open and Save As dialogs

## Frontend additions

The State Library provides:

- document name;
- document kind;
- explicit scope checkboxes;
- Save and Load actions;
- exported state-model metadata;
- warnings for missing sources or unsupported persistent-pixel recall.

## Compatibility

The existing `huffNativePresetsV2` local-storage format remains functional. It is now considered a quick/legacy preset system rather than the formal project-state format.

## Version

```text
Application: 0.18.0
Native build: HNW-18
State schema: huff-state/v1
```
