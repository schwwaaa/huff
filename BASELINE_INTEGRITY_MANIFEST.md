# HUFF Classic Pass 24 — Baseline Integrity Manifest

The authoritative behavioral runtime remains the user-supplied Pass 22 archive used to create Pass 23.

## Exact retained core hashes

```text
src/canvas.js
3fdb5fb540be2d42173ddfd1aa355db930bac8e2cc758930e6eeddca05477798

src/effects.js
2b352fa279c728ba292485fe22a0e580c6a3f36d669bd9741f79d5af4454dd44

src/index.html
a8648e98ab3f0dae2883adadba843754889e70a22efd2c9e1e3b91933f5116dc

package.json
cf608e2bcdf638c613e9480f2df01d46dcadde138be4696f7ae7943a47640b2d
```

## Complete retained file manifests

```text
baseline/pass22-src.sha256
baseline/pass22-src-tauri.sha256
```

The manifests record every file or symbolic-link target under the authoritative Pass 22 `src/` and `src-tauri/` trees. `scripts/validate-pass24.mjs` verifies every entry and rejects missing, changed, or additional files.

## Pass 24 additions outside the runtime trees

```text
pipeline/stage-contracts.mjs
baseline/pass22-src.sha256
baseline/pass22-src-tauri.sha256
scripts/validate-pass24.mjs
Pass 24 documentation
```

No Pass 24 file is imported or loaded by the application runtime.

## Pass 25 constrained-change manifest

`baseline/pass24-src.sha256` records the complete confirmed-working Pass 24 source tree before runtime recipe integration. Pass 25 validation permits changes only to `src/canvas.js`, `src/index.html`, and the added `src/pipeline-runtime.js`; every other source file must still match the Pass 24 manifest. The complete native tree must continue to match `baseline/pass22-src-tauri.sha256`.
