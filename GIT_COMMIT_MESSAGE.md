```text
fix: add saved presets to session recall bank in HUFF Classic Pass 56

- keep native JSON files as the durable user-owned preset format
- add each successfully saved preset to the current in-memory session bank
- select the newly saved session preset immediately in the dropdown
- allow instant recall after further slider and control changes
- use the exact snapshot written to disk for the temporary recall slot
- refresh an existing session entry when the same preset path is saved again
- keep newly saved session presets temporary and clear them when HUFF quits
- retain LOAD FILE behavior that adds local JSON presets to the session bank
- relabel the session group to cover both saved and loaded presets
- preserve Pass 55 keyboard focus safety and removed P shortcut
- preserve the HUFF Classic render pipeline, effects, Flow, Luma, Solarize, and Symmetry
- preserve Pass 51 720p60 Syphon transport and fallback behavior
- add Pass 56 validation and documentation

HUFF Classic Pass 56
```
