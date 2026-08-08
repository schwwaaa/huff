# Validation Report — Pass 36

## Completed

- `validate:pass36`: PASS — 516 structural checks plus 131,072 neutral Luma-key cases.
- `validate:pass34`: PASS — accepted Gain / Stencil / Cleanup / Density / Soft Add feature contract retained.
- `validate:pass22`: PASS — Scanline/legacy optimized behavior validator retained.
- JavaScript syntax: PASS — 44 project files.
- JSON parsing: PASS — 33 project files.
- shell syntax: PASS — 8 scripts.
- static release preflight: PASS — 38 passed, 0 warnings, 0 blockers.

## Pass 36-specific deterministic regression

The validator simulates consecutive stencil-mask rebuilds with different threshold, polarity, Gain, Cleanup and Density values. The second result must equal a fresh independent calculation. This verifies that prior alpha cannot contaminate a later stencil rebuild.

## Superseded validators

Some older pass validators assert that files modified legitimately by later accepted passes must remain byte-identical to those older passes. Those source-manifest assertions are not applicable after later augmentation and are not used as evidence for Pass 36.

Pass 35's validator is specifically superseded because it requires the split CUT/FILL and 15 Hz Luma architecture intentionally removed by this corrective pass.

## Runtime still required

The Tauri/WebView application was not run in this packaging environment. Runtime verification is required for:

- the two reported freeze scenarios;
- sustained Glitch Strobe + LIVE Luma frame rate;
- Stencil repeated Invert/threshold edits;
- interaction with Feedback/Flow;
- Syphon/Spout output.
