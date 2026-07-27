# HUFF Native wgpu · Milestone 16 upgrade notes

## Purpose

Milestone 16 was originally described as the parameter-by-parameter calibration and parity pass. Because the full application is still being assembled and the user intends to perform a larger refinement cycle later, this milestone avoids making unverified subjective visual changes. Instead, it establishes the exact parameter contract and the reproducible testing tools required for that later pass.

## Exact legacy contract

`src-tauri/src/legacy_parameter_contract.json` was extracted from the supplied legacy HUFF control interface. It contains every legacy control that maps to the native canonical registry:

```text
87 mapped legacy parameters
98 native registry parameters
11 native-only parameters
```

Each contract entry records:

```text
canonical ID
legacy DOM/control ID
label
group
kind
default
minimum
maximum
step
select options
```

The native registry currently matches all 87 mapped controls exactly for those fields.

The eleven native-only controls are expected additions:

```text
render.resolution_mode
render.custom_width
render.custom_height
color.brightness
color.contrast
history.preset
history.resolution
history.custom_width
history.custom_height
history.capture_rate
history.sampling
```

They are reported separately and do not reduce the legacy parity score.

## Native parity module

`src-tauri/src/parity.rs` adds:

- embedded contract loading through `include_str!`;
- registry-versus-contract comparison;
- tolerant numeric comparison;
- current-state comparison against legacy defaults;
- native-only parameter reporting;
- versioned parity reports;
- reproducible calibration profiles.

The module does not sit in the render hot path. It is invoked only when the UI requests a comparison, applies a profile, or exports a report.

## Calibration profiles

Profiles are diagnostic states, not new artistic factory presets.

### Legacy Defaults

Restores all mapped legacy controls to their exact source defaults. Native-only resolution and history configuration remains untouched so applying the profile does not unexpectedly resize the renderer or reallocate the history ring.

### Glitch Isolation

Enables historical glitch tiles and disables cluster motion, scanlines, Smoosh, Luma Key, Global Mix, Flow, and recursive feedback. This provides a controlled view of tile density, temporal depth, smear, alpha, jitter, and movement.

### Cluster Isolation

Builds on Glitch Isolation, enables cluster bodies, and supplies conservative deterministic drift, speed, and variance values. The profile is intended to reveal cluster cohesion, center motion, spread, bounds, and persistence without unrelated effects.

### Scanline Isolation

Enables scanline bands while disabling glitch, clusters, feedback recursion, Flow, and composite modifiers. This isolates band placement, source sampling, angle, focus, shift, drift, scale, spin, skew, and alpha.

### Feedback Reference

Uses the original feedback defaults while disabling other effect families. It is intended for transform, persistence, decay, and clean-source relationship testing.

### Flow Reference

Uses bounded feedback as a visible image source and enables the default final Flow route. It provides a repeatable state for displacement strength, scale, speed, pull, swirl, turbulence, spread, and carry.

## Buffer policy

Applying any profile sends `ClearFeedback` before the next comparison. This is necessary because persistent image memory can otherwise make two identical parameter states look different due to prior frame history.

When automation recording is active, the profile is recorded as one canonical batch followed by a clear-buffers action. Deterministic export can therefore reproduce the profile boundary.

## UI additions

A compact **PARITY LAB** row appears between Automation and the provisional Export Queue.

```text
profile selector
Apply Profile
Compare
Export Report
contract/current-difference status
```

The status distinguishes two concepts:

- **Contract score:** whether the native parameter definitions still match the embedded legacy interface.
- **Current delta:** how many mapped controls currently differ from legacy defaults because the user has edited them or applied another profile.

A nonzero current delta is normal. A contract mismatch indicates a source-code/schema change and is presented as an error.

## Report format

`Export Report` writes `huff-parity-report.json` with:

```text
schema and build version
generation time
parameter revision
legacy source information
contract counts
field-level mismatches
native-only controls
current-value differences
calibration profile inventory
```

The report can be retained alongside screenshots, still exports, or short deterministic renders during the later visual-calibration cycle.

## Static validator

`scripts/validate-parity.mjs` parses `parameters.rs`, reads the embedded contract, and verifies the same definition fields without launching Tauri.

Run:

```bash
npm run validate:parity
```

This validator is intentionally part of the normal source tree so later parameter edits cannot silently alter legacy semantics.

## Master milestone record

`MILESTONES.md` is introduced in this milestone. It contains a title and explanatory paragraph for Milestones 01 through 21, marks provisional or partially validated features honestly, and defines the corrective-build naming convention.

From Milestone 16 onward, `MILESTONES.md` must be present in:

- every complete HUFF project archive;
- every changed-files archive.

## Version

```text
Application: 0.16.0
Native build: HNW-16
```
