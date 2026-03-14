#!/usr/bin/env bash
# scripts/download-ffmpeg.sh
#
# Downloads minimal static FFmpeg builds for macOS (arm64 + x86_64) and
# places them in src-tauri/binaries/ with the Tauri sidecar naming convention:
#
#   ffmpeg-aarch64-apple-darwin     ← Apple Silicon
#   ffmpeg-x86_64-apple-darwin      ← Intel Mac
#
# Source: evermeet.cx — static FFmpeg builds for macOS
# Run this once before `npm run build` or `npm run dev`.
# The binaries are ~70MB each. Add src-tauri/binaries/ffmpeg-* to .gitignore.
#
# Usage:
#   chmod +x scripts/download-ffmpeg.sh
#   ./scripts/download-ffmpeg.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$SCRIPT_DIR/../src-tauri/binaries"
mkdir -p "$BIN_DIR"

# ── evermeet.cx static builds ─────────────────────────────────────────────────
# These are minimal builds: libx264, aac, no GUI, stripped symbols.
# Version pinned to 7.x; update URL for newer releases if needed.

ARM_URL="https://evermeet.cx/ffmpeg/getrelease/arm64/zip"
X86_URL="https://evermeet.cx/ffmpeg/getrelease/zip"

download_and_extract() {
  local url="$1"
  local dest="$2"
  local tmp_zip
  tmp_zip="$(mktemp /tmp/ffmpeg-XXXXXX.zip)"

  echo "→ Downloading from $url …"
  curl -L --progress-bar "$url" -o "$tmp_zip"

  echo "→ Extracting to $dest …"
  # The zip contains a single 'ffmpeg' binary at the root
  unzip -p "$tmp_zip" ffmpeg > "$dest"
  chmod +x "$dest"
  rm -f "$tmp_zip"
  echo "✔ $(basename "$dest") ready ($(du -sh "$dest" | cut -f1))"
}

# ── Apple Silicon ─────────────────────────────────────────────────────────────
ARM_OUT="$BIN_DIR/ffmpeg-aarch64-apple-darwin"
if [[ -f "$ARM_OUT" ]]; then
  echo "⚡ $ARM_OUT already exists — skipping (delete to re-download)"
else
  download_and_extract "$ARM_URL" "$ARM_OUT"
fi

# ── Intel Mac ─────────────────────────────────────────────────────────────────
X86_OUT="$BIN_DIR/ffmpeg-x86_64-apple-darwin"
if [[ -f "$X86_OUT" ]]; then
  echo "⚡ $X86_OUT already exists — skipping (delete to re-download)"
else
  download_and_extract "$X86_URL" "$X86_OUT"
fi

echo ""
echo "✔ FFmpeg binaries ready in src-tauri/binaries/"
echo "  Now run: npm run dev   or   npm run build"
