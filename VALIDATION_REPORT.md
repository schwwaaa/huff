# Validation Report — HUFF Classic Pass 39N

## Passed
- `npm run validate:pass39n`
  - Pass 22 Flow/Scanline validator inherited: PASS
  - 57 Pass 39N speed/readability/protection checks: PASS
  - executable gate tests reproduce the reported Clusters ON → OFF → RANDOM SPEED 0x sequence and verify it holds
  - RANDOM/CLUSTER speed independence tests: PASS
  - STROBE explicit timing preservation test: PASS
  - no neon-green text declarations in readable UI: PASS
  - no new Canvas pixel readback/upload/buffer in the speed gate: PASS
- JavaScript syntax for `src/**` and `scripts/**`: PASS
- inline scripts in `src/index.html`: PASS (7)
- `package.json` parse: PASS
- release static preflight: 38 passed / 0 warnings / 0 blockers

## Protected exact hashes
- `src/effects.js` matches Pass 39M exactly: `2bafe602c11d121da981dbbef09fc003b4ff9472571db099a22f9f56b8298230`
- `src/pipeline-runtime.js` matches Pass 39M exactly: `f5c80efe0c052fbdac5ddc6b14c91b23d531fff543929fd4d99e7e37757a6188`
- `_runPersistentDecayStage`: exact Pass 39M hash
- `_runFeedbackStage`: exact Pass 39M hash
- `_shouldApplyFeedbackTransformThisRender`: exact Pass 39M hash

## Historical validator note
Pass 38/39M textual validators expect the old master-speed implementation literally, so they are not directly applicable after intentionally changing the speed clock. Pass 39N replaces those assertions with behavior-level tests while retaining exact hashes for protected code.

## Not proven statically
- subjective slow/evolving feel;
- actual runtime FPS;
- whether every black-text surface meets the user's preferred contrast on their display.
