# Git Commit Message — use after runtime acceptance

```bash
git add . && git commit \
  -m "feat: add Classic Solarize luma quantize mode" \
  -m "Extend HUFF Classic Solarize with a second LUMA QUANTIZE mode inspired by the documented Magic DaVE Solarise model while preserving the accepted THRESHOLD algorithm as the default compatibility path." \
  -m "Add LEVEL, SOFT and INVERT controls, use AMOUNT as shared wet/dry strength, preserve chroma via a luminance-delta transform, and map LEVEL 1-99 from fine quantisation toward two luma levels with 100 reserved for luma removal." \
  -m "Reuse the existing bounded 640px Solarize scratch, single getImageData/putImageData cycle and adaptive load guard; add no full-resolution buffer or second synchronous readback." \
  -m "Migrate old presets to THRESHOLD, leave factory presets and Flow untouched, preserve Pass 41A playback plus Corrupt/Scan/Luma/Feedback/pipeline/native boundaries, and add Pass 42 validation and documentation."
```
