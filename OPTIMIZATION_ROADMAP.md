# HUFF Classic — Release Roadmap

## Current phase: Pass 57 release-candidate regression

HUFF Classic is no longer in open-ended effect augmentation. The current priority is to prove the committed Pass 56 instrument as a release candidate.

1. Run `npm run regress:pass57` — automated/static gate.
2. Run `RELEASE_CANDIDATE_TEST_MATRIX.md` on the primary macOS target.
3. Test Windows package with Spout on actual Windows hardware.
4. Test Linux package/runtime and document platform limitations honestly.
5. Fix only reproducible blockers with small isolated corrective passes.
6. Repeat the complete regression suite after each correction.
7. Freeze the release candidate when no core blocker remains.
8. Perform release packaging/signing/notarization/version work.

## Deliberately deferred

- New major effects.
- Reopening protected Flow behavior.
- Reworking the accepted three-source image-entry model.
- Further Syphon architecture changes without a measured regression.
- Factory preset curation inside the build.

## Orthogonal release work

During regression, strong states may be saved as normal user JSON presets into an external candidate folder. Those files can later be reviewed and promoted into the built-in preset bank. This turns real release testing into future preset-content creation without changing the current candidate.

## Accepted lineage summary

- Pass 41A playback fidelity boundary — accepted lineage.
- Passes 42–47 Solarize/Luma augmentation and performance — accepted lineage.
- Pass 48 Layer Priority / Global Mix / Luma fades — retained.
- Pass 49 Syphon Stability Contract — accepted.
- Pass 50 Worker-owned Syphon transport — accepted lineage.
- Pass 51 720p60 bounded Syphon pipeline — runtime accepted.
- Pass 52 Chroma Posterize — retained.
- Pass 52D three-source pipeline awareness — accepted product model.
- Passes 53–56 portable preset/session workflow + keyboard safety — committed current runtime.
- Pass 57 — release-candidate regression freeze.
