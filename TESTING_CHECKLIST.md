# HUFF Classic Optimization Pass 31 — Testing Checklist

## Static/deterministic

- [x] STROBE off updates Glitch every render, matching Pass 30 dispatch.
- [x] STROBE on updates Glitch once per decoded-frame bucket.
- [x] Luma Key call remains outside the strobe condition.
- [x] Disabling/re-enabling Glitch forces an immediate update.
- [x] Changing EVERY forces an immediate update.
- [x] Legacy presets recover to STROBE off.
- [x] No rejected whole-frame Frame Store code exists.
- [x] No additional render surface exists.
- [x] Effects, pipeline runtime, outputs, and native code match Pass 30.

## Runtime test

1. Start in `CLASSIC`, Glitch on, STROBE off. Confirm Pass 30 behavior.
2. Enable STROBE and set EVERY to 4, 8, 16, then 30. Confirm only new Glitch injections slow down.
3. Enable Pipeline Luma Key. Confirm the clean video inside/outside the key continues moving in real time while glitch material updates in steps.
4. Add Scanlines and confirm they continue moving every frame.
5. Add Feedback and Flow and confirm they continue processing between Glitch updates.
6. Repeat in `CRISP FINISH`.
7. Save/recall a strobe preset; then load an older preset and confirm STROBE turns off.
8. Clear buffers, replace the source, and resize; confirm the next Glitch update appears immediately.

## Failure indicators

- the complete image freezes;
- Luma Key movement freezes with Glitch;
- Scanlines stop between Glitch updates;
- enabling STROBE blanks the image;
- old presets inherit an active strobe unexpectedly.
