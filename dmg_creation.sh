# #! /bin/bash

# sh scripts/remove_artifacts.sh
# sleep 2
# sh scripts/create_mac_builds.sh
# sleep 2
# sh scripts/create_universal.sh
# sleep 2
# sh scripts/create_universal_dmg.sh

#!/usr/bin/env bash
set -euo pipefail

# Resolve project root to the folder that contains this script
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

APP_NAME="huff-v2"                  # productName (no spaces)
APP_BUNDLE="${APP_NAME}.app"
BIN_REL="Contents/MacOS/${APP_NAME}"

ARTIFACTS="${ROOT}/artifacts"
STAGE="${ARTIFACTS}/dmg-stage"
UNI_DIR="${ARTIFACTS}/universal-app"
UNI_APP="${UNI_DIR}/${APP_BUNDLE}"
DMG_PATH="${ARTIFACTS}/${APP_NAME}-universal.dmg"
VOL_NAME="${APP_NAME}"

# Clean outputs from previous runs
rm -rf "$ARTIFACTS" "${ROOT}/src-tauri/target"
mkdir -p "$ARTIFACTS"

# Make sure we have both Rust targets
rustup target add aarch64-apple-darwin x86_64-apple-darwin

# Build ARM64 and x64 app bundles (skip DMG)
npm run tauri -- build -- --target aarch64-apple-darwin --bundles app
npm run tauri -- build -- --target x86_64-apple-darwin --bundles app

# Paths to the two app bundles we just built
ARM_APP="${ROOT}/src-tauri/target/aarch64-apple-darwin/release/bundle/app/${APP_BUNDLE}"
X64_APP="${ROOT}/src-tauri/target/x86_64-apple-darwin/release/bundle/app/${APP_BUNDLE}"

# Sanity check
[ -d "$ARM_APP" ] || { echo "Missing $ARM_APP"; exit 1; }
[ -d "$X64_APP" ] || { echo "Missing $X64_APP"; exit 1; }

# Create universal .app by lipo-ing the executable
rm -rf "$UNI_DIR"; mkdir -p "$UNI_DIR"
cp -R "$ARM_APP" "$UNI_APP"

lipo -create -output "${UNI_APP}/${BIN_REL}" \
  "${ARM_APP}/${BIN_REL}" \
  "${X64_APP}/${BIN_REL}"

# Verify it's universal
file "${UNI_APP}/${BIN_REL}"

# Build the DMG from the universal app
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$UNI_APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

hdiutil create -volname "$VOL_NAME" \
  -srcfolder "$STAGE" \
  -ov -format UDZO "$DMG_PATH"

echo "✓ Universal .app: $UNI_APP"
echo "✓ Universal DMG : $DMG_PATH"
