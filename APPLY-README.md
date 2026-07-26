# Apply HUFF Native Milestone 21

The changed-files archive is intended for a clean Milestone 20 tree. Copy it over the project root while preserving directory structure.

Milestone 21 adds:

- `interop.rs` and `huff-interop-report/v1`;
- the INTEROP analysis window;
- bounded CPU copy probe;
- JSON/TXT interoperability export;
- interoperability data in diagnostics bundles;
- typed `ExternalOutputFrame` Syphon/Spout submission;
- platform candidate documentation and validation;
- version and milestone tracking updates.

The production transport remains the existing bounded CPU readback/upload path. No native shared texture is enabled.

The complete archive is safer when the Milestone 20 tree has local modifications or when file additions are uncertain.
