#!/usr/bin/env bash
# HUFF Classic native-platform release builder.
# macOS bundles must be built on macOS, Windows installers on Windows, and
# Linux bundles on Linux. Cross-platform release packaging is intentionally
# rejected because Tauri v1 depends on native system toolchains and bundlers.

set -euo pipefail

APP_NAME="huff"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="${ROOT}/src-tauri"
APP_VERSION="$(node -e 'const c=require(process.argv[1]); process.stdout.write(c.version)' "${ROOT}/release/release-config.json")"

log()  { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m ✔  %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m ⚠  %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m ✖  %s\033[0m\n' "$*" >&2; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

detect_os() {
  case "$(uname -s)" in
    Darwin*) echo macos ;;
    Linux*) echo linux ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) echo unknown ;;
  esac
}

preflight() {
  node "${ROOT}/scripts/release-preflight.mjs" "--platform=$1"
}

require_common() {
  require_cmd node
  require_cmd npm
  require_cmd cargo
  require_cmd rustup
  [[ -d "${ROOT}/node_modules" ]] || (cd "${ROOT}" && npm ci)
  (cd "${ROOT}" && npx tauri --version >/dev/null 2>&1) || fail "Tauri CLI unavailable; run npm ci"
}

require_rust_target() {
  rustup target list --installed | grep -qx "$1" || rustup target add "$1"
}

tauri_build() {
  (cd "${ROOT}" && npx tauri build "$@")
}

verify_syphon_bundle() {
  local app="$1"
  local framework="${app}/Contents/Frameworks/Syphon.framework"
  local binary="${framework}/Versions/A/Syphon"
  [[ -d "${framework}" ]] || fail "Syphon.framework missing from ${app}"
  [[ -f "${binary}" ]] || binary="${framework}/Syphon"
  [[ -f "${binary}" ]] || fail "Syphon.framework binary missing from ${app}"
}

thin_frameworks() {
  local app="$1" arch="$2"
  [[ -d "${app}/Contents/Frameworks" ]] || return 0
  while IFS= read -r binary; do
    if file "${binary}" | grep -q 'Mach-O universal'; then
      lipo "${binary}" -thin "${arch}" -output "${binary}.thin"
      mv "${binary}.thin" "${binary}"
    fi
  done < <(find "${app}/Contents/Frameworks" -type f)
}

sign_mac_app() {
  local app="$1"
  local identity="${HUFF_CODESIGN_IDENTITY:-${APPLE_SIGNING_IDENTITY:--}}"
  local options=()
  if [[ "${identity}" != "-" ]]; then options=(--options runtime --timestamp); fi

  while IFS= read -r nested; do
    codesign --force --sign "${identity}" "${options[@]}" "${nested}"
  done < <(find "${app}/Contents/Frameworks" -maxdepth 1 -name '*.framework' -type d)

  codesign --force --sign "${identity}" "${options[@]}" \
    --entitlements "${TAURI_DIR}/entitlements.plist" "${app}"
  codesign --verify --deep --strict --verbose=2 "${app}"
  ok "macOS signature verified (${identity})"
}

notarize_dmg_if_configured() {
  local dmg="$1"
  if [[ -n "${HUFF_NOTARY_PROFILE:-}" ]]; then
    xcrun notarytool submit "${dmg}" --keychain-profile "${HUFF_NOTARY_PROFILE}" --wait
    xcrun stapler staple "${dmg}"
    xcrun stapler validate "${dmg}"
    ok "DMG notarized and stapled"
  else
    warn "HUFF_NOTARY_PROFILE is not set; DMG was not notarized"
  fi
}

build_mac_arch() {
  local target="$1" arch_label="$2"
  [[ "$(detect_os)" == macos ]] || fail "macOS bundles must be built on macOS"
  require_common
  preflight macos
  require_rust_target "${target}"
  log "Building macOS ${arch_label}"
  tauri_build --target "${target}" --bundles app
  local app="${TAURI_DIR}/target/${target}/release/bundle/macos/${APP_NAME}.app"
  verify_syphon_bundle "${app}"
  ok "${arch_label} app built"
}

build_mac_universal() {
  [[ "$(detect_os)" == macos ]] || fail "macOS bundles must be built on macOS"
  require_cmd lipo
  require_cmd codesign
  build_mac_arch aarch64-apple-darwin arm64
  build_mac_arch x86_64-apple-darwin x86_64

  local arm_app="${TAURI_DIR}/target/aarch64-apple-darwin/release/bundle/macos/${APP_NAME}.app"
  local x86_app="${TAURI_DIR}/target/x86_64-apple-darwin/release/bundle/macos/${APP_NAME}.app"
  local out_root="${TAURI_DIR}/target/universal/release/bundle/macos"
  local out_app="${out_root}/${APP_NAME}.app"
  rm -rf "${out_app}"
  mkdir -p "${out_root}"

  thin_frameworks "${arm_app}" arm64
  thin_frameworks "${x86_app}" x86_64
  cp -R "${arm_app}" "${out_app}"

  while IFS= read -r arm_binary; do
    local rel="${arm_binary#${arm_app}/}"
    local x86_binary="${x86_app}/${rel}"
    local out_binary="${out_app}/${rel}"
    if [[ -f "${x86_binary}" ]] && file "${arm_binary}" | grep -q 'Mach-O'; then
      lipo -create -output "${out_binary}" "${arm_binary}" "${x86_binary}"
    fi
  done < <(find "${arm_app}" -type f)

  verify_syphon_bundle "${out_app}"
  sign_mac_app "${out_app}"

  local dmg="${TAURI_DIR}/target/universal/release/bundle/${APP_NAME}-${APP_VERSION}-universal.dmg"
  require_cmd create-dmg
  rm -f "${dmg}"
  create-dmg --volname "HUFF Classic" --window-size 540 380 --icon-size 128 \
    --icon "${APP_NAME}.app" 150 185 --hide-extension "${APP_NAME}.app" \
    --app-drop-link 390 185 "${dmg}" "${out_root}"
  notarize_dmg_if_configured "${dmg}"
  node "${ROOT}/scripts/verify-release-artifacts.mjs" --platform=macos
  ok "Universal macOS release built"
}

build_windows() {
  [[ "$(detect_os)" == windows ]] || fail "Windows MSI must be built natively on Windows"
  require_common
  preflight windows
  require_cmd cmake
  require_rust_target x86_64-pc-windows-msvc
  tauri_build --target x86_64-pc-windows-msvc --bundles msi
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ROOT}/scripts/package-windows.ps1"
  node "${ROOT}/scripts/verify-release-artifacts.mjs" --platform=windows
  ok "Windows MSI and portable ZIP built"
}

build_linux() {
  [[ "$(detect_os)" == linux ]] || fail "Linux bundles must be built natively on Linux"
  require_common
  preflight linux
  require_cmd cmake
  tauri_build --bundles deb,appimage
  node "${ROOT}/scripts/verify-release-artifacts.mjs" --platform=linux
  ok "Linux DEB and AppImage built"
}

case "${1:-auto}" in
  auto)
    case "$(detect_os)" in
      macos) build_mac_universal ;;
      windows) build_windows ;;
      linux) build_linux ;;
      *) fail "Unsupported host" ;;
    esac ;;
  preflight) node "${ROOT}/scripts/release-preflight.mjs" --platform=all --static ;;
  mac-universal) build_mac_universal ;;
  mac-arm) build_mac_arch aarch64-apple-darwin arm64 ;;
  mac-x86) build_mac_arch x86_64-apple-darwin x86_64 ;;
  windows) build_windows ;;
  linux) build_linux ;;
  verify) node "${ROOT}/scripts/verify-release-artifacts.mjs" "--platform=${2:-$(detect_os)}" ;;
  all) fail "Release bundles must be built on native hosts; use the platform matrix or CI" ;;
  *) echo "Usage: $0 [auto|preflight|mac-universal|mac-arm|mac-x86|windows|linux|verify]"; exit 1 ;;
esac
