# HUFF Classic — Current Status

## Current candidate

**Pass 57 — Release Candidate Regression Freeze**, built directly from committed Pass 56.

Pass 57 makes **no runtime, rendering, effect, preset-runtime, Syphon, or native-output changes**. It freezes the current instrument as a release-candidate target and adds one authoritative automated regression runner plus an integrated manual test matrix.

### Current accepted product contracts

- Three primary image feeds: **Corrupt / Scanlines / Luma Key COMPOSITE**.
- Symmetry and Solarize are downstream processors and the UI makes that dependency visible.
- Flow remains protected; do not reopen casually.
- Layer Priority is SCAN TOP / CORRUPT TOP; Neutral and Pulse are removed.
- Global Mix remains a restrained clean-source reinjection/mix stage.
- Luma includes the accepted key shaping and expanded fade vocabulary.
- Solarize family includes THRESHOLD, LUMA QUANTIZE, and CHROMA POSTERIZE.
- Syphon: **1280×720 60 fps primary / 30 fps safe fallback**.
- User presets: portable local JSON files plus a temporary SESSION — SAVED / LOADED bank.
- Saving a JSON immediately adds that exact saved state to the session dropdown.
- Session presets disappear on quit; user JSON files remain local and user-owned.
- Future factory-preset promotion is intentionally deferred.

### Automated gate

Run:

```bash
npm run regress:pass57
```

### Manual gate

Use `RELEASE_CANDIDATE_TEST_MATRIX.md` on target machines. Actual visual behavior, native dialogs, long-session output, Windows Spout, Linux behavior, and sleep/wake remain runtime tests rather than static claims.

### Freeze rule

If Pass 57 testing exposes a blocker, make the smallest isolated corrective pass and rerun the complete Pass 57 regression suite. Do not mix release fixes with new creative features.
