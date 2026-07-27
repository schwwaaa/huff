# HUFF Native 1.0 — Next Chat Starter

I am beginning the HUFF Native 1.0 testing and feature-retention cycle.

## Source of truth

Use my locally tested HUFF Native wgpu `0.21.0 / HNW-21` tree as authoritative. The 21-milestone roadmap is complete. Do not add Milestone 22 by default and do not reconstruct the project from older packages.

## Goal

Test the integrated systems and decide whether each feature should be:

- KEEP
- HIDE
- SIMPLIFY
- REMOVE
- FIX
- CALIBRATE

Preserve the full-study branch and all design/changelog knowledge even if the streamlined production branch removes features.

## Priority order

1. Crashes and renderer/device failures
2. Video/audio stalls and leaks
3. State loss and broken recovery
4. Recording/export/output failures
5. Usability and interface complexity
6. Visual calibration
7. New effects only after the baseline is trustworthy

## Known evaluation candidates

- Export Queue — provisional
- Automation — integrated deterministic replay; live transport UI incomplete
- Milestone 15 full-resolution export — mixed local test results
- Parity Lab UI — optional; contract/validator should remain
- State Library complexity — model should remain; UI may simplify
- Interop Lab UI — research; typed boundary/report should remain
- Diagnostics placement — likely Advanced/Help rather than primary performance UI

## Response preference

Provide only specifically changed files/projects unless a repository-wide package is required.
