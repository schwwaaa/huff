chore: freeze HUFF Classic Pass 57 release-candidate regression baseline

- preserve the committed Pass 56 runtime byte-for-byte
- add a unified Pass 57 release-candidate regression validator
- add an automated regression runner for current authoritative checks
- protect the render pipeline, effects, preset runtime, native preset I/O, and Syphon runtime hashes
- verify Save File continues to write locally and register the exact state for session recall
- verify user session presets remain RAM-only and disappear on quit
- verify the P shortcut remains removed and editable controls retain keyboard ownership
- verify the three-source Corrupt / Scanlines / Luma Composite pipeline-awareness contract
- verify Syphon remains limited to 720p60 primary and 720p30 safe profiles
- check index.html for duplicate element IDs
- add an integrated release-candidate manual test matrix
- use regression sessions as an optional source of future factory-preset candidate JSON files without baking them into the build
- document superseded historical validators separately from current release gates
- make no creative, rendering, pipeline, output, or native runtime changes

HUFF Classic Pass 57
