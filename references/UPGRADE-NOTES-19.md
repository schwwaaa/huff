# Upgrade Notes — Milestone 19

## Constrained Routing and Named Buses

Milestone 19 formalizes HUFF’s fixed render topology without replacing it with a general node editor.

### Added

- `huff-routing/v1` route-plan schema.
- Named Clean, History, Process, Field Store, Mask, Program, and Monitor buses.
- Canonical `routing.program_bus` and `routing.monitor_bus` parameters.
- Program selection between normal composite, Clean bypass, and raw Field Store.
- Independent native-window Monitor selection between Program, Clean, and Field Store.
- Six constrained routing recipes.
- Route inspector and JSON route-plan export.
- Explicit legal temporal-cycle documentation.
- Routing-domain integration with presets, snapshots, and projects.
- `npm run validate:routing` static validator.

### Renderer changes

The complete effect recipe still runs every frame. Selecting Clean Program does not destroy or reset the Field Store, so returning to the normal Program Composite preserves temporal continuity. External consumers always follow Program. The local native window can monitor another bus without changing Syphon, Spout, recording, or export.

### Compatibility

Existing Milestone 18 state files load normally because both new routing parameters have safe defaults. Older documents simply omit the new fields and therefore retain Program Composite and Program monitoring.

### Deferred

Milestone 19 does not add arbitrary patch cables, multiple independent process chains, multiple physical auxiliary outputs, a preview/take switcher, or user-created graph cycles. Those capabilities belong to later instruments or the planned master suite rather than the core HUFF parity recipe.
