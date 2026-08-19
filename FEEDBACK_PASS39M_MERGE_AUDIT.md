# Feedback Pass 39M Merge Audit

Pass 39 replaced parts of the established Feedback instrument. Pass 39R proved the correct recovery strategy: restore Pass 38 first and keep experiments additive. Pass 39M completes the merge.

## Preserved core
`FEEDBACK`, `PERSISTENCE`, `FB X`, `FB Y`, `FB Z`, `FB theta`, and the historical Reset Motion defaults are retained. PERSISTENCE remains the same independent persistent-buffer stage used by Pass 38.

## Additive behavior
`ENABLE` bypasses only the Feedback transform and Restore layer. `FB STROBE` gates only the transform. `RESTORE` is a source-over clean-image recovery layer and defaults to zero.

## Motion range
`RANGE = CLASSIC` uses the original limits. `RANGE = WIDE` changes only the UI limits for the existing FB X/Y/Z/theta parameters:

| Parameter | Classic | Wide |
|---|---:|---:|
| FB X | -1..1 | -8..8 |
| FB Y | -1..1 | -8..8 |
| FB Z | 0.98..1.03 | 0.95..1.05 |
| FB theta | -2..2 | -5..5 |

Switching back to CLASSIC clamps an out-of-range Wide value into the Classic range. This is an explicit user action, not silent preset migration.

## Runtime acceptance requirement
Static validation proves the original parameter ranges/equations are present and the PERSISTENCE function remains source-equivalent to Pass 38. It cannot prove the old performance gesture feels identical; user runtime confirmation remains required.
