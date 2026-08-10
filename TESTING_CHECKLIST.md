# Testing Checklist — Pass 40U

## A. BANDS regression check — do this first

Set:
- Scanlines ON
- PANEL LAYOUT = BANDS
- ZOOM = 1.00x, then 1.50x / 2.00x
- existing Shift / Skew / Focus / Drift / Roll controls as you normally use them

Expected: the Pass 40T candidate behavior is unchanged. If BANDS feels different,
reject Pass 40U before evaluating FIELD.

## B. FIELD immediacy

Switch only:
- PANEL LAYOUT = FIELD

The stored defaults are intentionally nonzero. Expected: panels immediately
separate into a collage field rather than remaining a uniform band stack.

Move one control at a time:
- SPREAD X — obvious horizontal separation;
- SPREAD Y — obvious vertical separation;
- SPREAD Z — obvious near/far panel scale variation;
- SIZE VAR — panel dimensions become less uniform;
- DRIFT — individual XY positions evolve;
- DEPTH DRIFT — individual apparent depth evolves.

Report any control as PASS / OPAQUE / DEAD / TOO SENSITIVE.

## C. Speed contract

With FIELD active and nonzero DRIFT / DEPTH DRIFT:
- SPEED 1.00x
- SPEED 0.15x
- SPEED 0.05x
- SPEED 0.00x

Expected at 0x: FIELD motion freezes, while live video continues updating inside
held panel geometry. No sample/hold should appear.

## D. General vs per-panel spatial distinction

- General POS X/Y should move the whole Scan instrument.
- General ZOOM should scale the overall panel vocabulary.
- FIELD SPREAD X/Y/Z should change relationships *between* individual panels.

If those roles are not visually distinct, the FIELD control surface needs further cleanup.

## E. Buffer composition

Test:
1. Scan FIELD alone.
2. + Feedback.
3. + Flow.
4. + Feedback + Flow.

Expected: persistent layers/tunnels can be built from differently-positioned
panels without Scan internally duplicating Feedback or Flow functionality.

## F. Performance / Luma boundary

Stress with many bands + high SPREAD Z / ZOOM:
- Luma OFF
- Luma LIVE
- Luma STENCIL

No performance improvement is claimed by Pass 40U. Note whether LIVE Luma remains
the disproportionate FPS hit.
