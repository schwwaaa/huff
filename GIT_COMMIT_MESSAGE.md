# Git Commit Message

```text
revert: restore HUFF Classic working video decode path

- reject the Pass 12 direct-renderer migration after supported media produced a decode error
- restore the complete Pass 11 runtime and native baseline
- restore File-to-Blob-URL loading through p5 createVideo
- remove asset-protocol video loading and renderer-window decode ownership from the release path
- retain all validated canvas, buffer, Flow, Scanline, no-op, Syphon, and Spout optimizations from Passes 1–11
- document the decode regression, configuration mismatch, rollback boundary, and required runtime checks
```

## Command

```bash
git add . && git commit \
  -m "revert: restore HUFF Classic working video decode path" \
  -m "Reject the Pass 12 direct-renderer migration after supported media produced a decode error." \
  -m "Restore the complete Pass 11 runtime and native baseline." \
  -m "Restore File-to-Blob-URL loading through p5 createVideo." \
  -m "Remove asset-protocol video loading and renderer-window decode ownership from the release path." \
  -m "Retain all validated canvas, buffer, Flow, Scanline, no-op, Syphon, and Spout optimizations from Passes 1–11." \
  -m "Document the decode regression, rollback boundary, and required runtime checks."
```
