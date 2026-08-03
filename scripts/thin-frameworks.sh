#!/usr/bin/env bash
# thin-frameworks.sh
#
# Tauri's universal .app assembler calls `lipo` on every binary it finds in
# each arch bundle's Contents/Frameworks/. If the framework is already a fat
# (universal) binary it fails with:
#   "have the same architectures (x86_64) and can't be in the same fat output file"
#
# Fix: before Tauri runs lipo, pre-populate each arch bundle with a single-arch
# (thin) slice of the framework. Tauri can then lipo arm64 + x86_64 → universal.
#
# Run via tauri.conf.json: "beforeBundleCommand": "bash scripts/thin-frameworks.sh"

set -euo pipefail

FRAMEWORK_SRC="src-tauri/frameworks/Syphon.framework"
BINARY_REL="Versions/A/Syphon"

# Map Rust target triple → lipo arch name
declare -A ARCH_MAP=(
  ["aarch64-apple-darwin"]="arm64"
  ["x86_64-apple-darwin"]="x86_64"
)

for TRIPLE in "${!ARCH_MAP[@]}"; do
  LIPO_ARCH="${ARCH_MAP[$TRIPLE]}"
  TARGET_DIR="src-tauri/target/${TRIPLE}/release/bundle/macos/huff.app/Contents/Frameworks"

  # Only process arches that were actually built
  if [ ! -d "src-tauri/target/${TRIPLE}/release/bundle/macos" ]; then
    echo "[thin-frameworks] skipping ${TRIPLE} (not built)"
    continue
  fi

  DEST="${TARGET_DIR}/Syphon.framework"
  echo "[thin-frameworks] staging ${LIPO_ARCH} slice → ${DEST}"

  # Mirror full framework structure (headers, resources, modules, codesig)
  rsync -a --exclude="${BINARY_REL}" \
    "${FRAMEWORK_SRC}/" "${DEST}/"

  # Thin the binary to this arch only
  mkdir -p "${DEST}/Versions/A"
  lipo "${FRAMEWORK_SRC}/${BINARY_REL}" \
       -thin "${LIPO_ARCH}" \
       -output "${DEST}/${BINARY_REL}"

  echo "[thin-frameworks] done: $(file "${DEST}/${BINARY_REL}")"
done

echo "[thin-frameworks] complete"
