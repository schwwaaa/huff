#!/usr/bin/env bash
# ============================================================
#  huff — Universal Build Script
#  Supports: macOS Universal (arm64 + x86_64), Windows (x86_64)
#
#  Usage:
#    ./build.sh                  # Build for current OS (auto-detect)
#    ./build.sh mac-universal    # macOS arm64 + x86_64 → universal .app + .dmg
#    ./build.sh mac-arm          # macOS arm64 only
#    ./build.sh mac-x86          # macOS x86_64 only
#    ./build.sh windows          # Windows MSVC x86_64 (via cross or native)
#    ./build.sh all              # All targets (requires cross-compile toolchain)
#
#  Requirements:
#    - Node.js + npm  (npm install run once before building)
#    - Rust + rustup
#    - @tauri-apps/cli installed via npm (npx tauri)
# ============================================================

set -euo pipefail

# ── Project config ────────────────────────────────────────────
# APP_NAME must match "productName" in src-tauri/tauri.conf.json
APP_NAME="huff"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAURI_DIR="${SCRIPT_DIR}/src-tauri"

# ── Helpers ───────────────────────────────────────────────────

log()  { echo -e "\033[1;36m==> $*\033[0m"; }
ok()   { echo -e "\033[1;32m ✔  $*\033[0m"; }
warn() { echo -e "\033[1;33m ⚠  $*\033[0m"; }
fail() { echo -e "\033[1;31m ✖  $*\033[0m"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

require_rust_target() {
  if ! rustup target list --installed 2>/dev/null | grep -q "$1"; then
    log "Installing Rust target: $1"
    rustup target add "$1" || fail "Failed to install Rust target: $1"
  fi
}

detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "mac" ;;
    Linux*)  echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)       echo "unknown" ;;
  esac
}

# Run tauri build via npx (Tauri v1, npm-managed)
tauri_build() {
  cd "${SCRIPT_DIR}"
  npx tauri build "$@"
}

# ── Syphon framework thinning ─────────────────────────────────
#
# Tauri copies Syphon.framework (fat: arm64+x86_64) into each arch bundle.
# Before our lipo pass combines the two bundles, we thin each bundle's copy
# to its own arch — otherwise lipo errors:
#   "same architectures (x86_64) can't be in the same fat output file"
#
# Works on macOS system bash (3.2) — no associative arrays needed.
#
# Usage: thin_bundle_frameworks <app_bundle_path> <lipo_arch>
#   e.g. thin_bundle_frameworks ".../huff.app" "arm64"
#
verify_syphon_bundle() {
  local app="$1"
  local framework="${app}/Contents/Frameworks/Syphon.framework"
  local binary_a="${framework}/Versions/A/Syphon"
  local binary_root="${framework}/Syphon"

  [[ -d "${framework}" ]] || fail "Syphon.framework missing from bundle: ${framework}"
  if [[ ! -f "${binary_a}" && ! -f "${binary_root}" ]]; then
    fail "Syphon.framework binary missing from bundle: ${framework}"
  fi
  ok "Bundled Syphon.framework verified"
}

resign_mac_app() {
  local app="$1"
  local identity="${HUFF_CODESIGN_IDENTITY:--}"

  if ! command -v codesign >/dev/null 2>&1; then
    warn "codesign not found — universal app signature was not repaired after lipo"
    return 0
  fi

  log "Signing assembled app (identity: ${identity})…"
  codesign --force --deep --sign "${identity}" \
    --entitlements "${TAURI_DIR}/entitlements.plist" \
    "${app}"
  codesign --verify --deep --strict --verbose=2 "${app}"
  ok "App signature verified"
}

thin_bundle_frameworks() {
  local app="$1"
  local arch="$2"
  local fw_dir="${app}/Contents/Frameworks"

  if [[ ! -d "${fw_dir}" ]]; then
    return 0  # no frameworks in this bundle, nothing to do
  fi

  # Find every fat Mach-O inside Contents/Frameworks/ and thin it in-place
  while IFS= read -r bin; do
    if file "${bin}" | grep -q "Mach-O universal"; then
      log "  thin ${arch}: ${bin#${app}/}"
      lipo "${bin}" -thin "${arch}" -output "${bin}.thin"
      mv "${bin}.thin" "${bin}"
    fi
  done < <(find "${fw_dir}" -type f)
}

# ── Build functions ───────────────────────────────────────────

build_mac_arm() {
  log "Building macOS arm64 (Apple Silicon)…"
  require_rust_target "aarch64-apple-darwin"
  tauri_build --target aarch64-apple-darwin
  verify_syphon_bundle "${TAURI_DIR}/target/aarch64-apple-darwin/release/bundle/macos/${APP_NAME}.app"
  ok "macOS arm64 build complete"
}

build_mac_x86() {
  log "Building macOS x86_64 (Intel)…"
  require_rust_target "x86_64-apple-darwin"
  tauri_build --target x86_64-apple-darwin
  verify_syphon_bundle "${TAURI_DIR}/target/x86_64-apple-darwin/release/bundle/macos/${APP_NAME}.app"
  ok "macOS x86_64 build complete"
}

build_mac_universal() {
  log "Building macOS Universal Binary (arm64 + x86_64)…"
  require_cmd lipo

  build_mac_arm
  build_mac_x86

  ARM_APP="${TAURI_DIR}/target/aarch64-apple-darwin/release/bundle/macos/${APP_NAME}.app"
  INTEL_APP="${TAURI_DIR}/target/x86_64-apple-darwin/release/bundle/macos/${APP_NAME}.app"

  [[ -d "${ARM_APP}" ]]   || fail "ARM .app not found: ${ARM_APP}"
  [[ -d "${INTEL_APP}" ]] || fail "Intel .app not found: ${INTEL_APP}"

  # Thin each bundle's framework copies to their arch before lipo combines them.
  # Syphon.framework ships as a fat binary (arm64+x86_64); lipo can't merge two
  # fat binaries with overlapping architectures, so we strip each down first.
  log "Thinning bundled frameworks…"
  thin_bundle_frameworks "${ARM_APP}"   "arm64"
  thin_bundle_frameworks "${INTEL_APP}" "x86_64"

  UNIVERSAL_ROOT="${TAURI_DIR}/target/universal/release/bundle/macos"
  UNIVERSAL_APP="${UNIVERSAL_ROOT}/${APP_NAME}.app"

  log "Assembling universal .app bundle…"
  rm -rf "${UNIVERSAL_APP}"
  mkdir -p "${UNIVERSAL_ROOT}"
  cp -R "${ARM_APP}" "${UNIVERSAL_APP}"

  # Lipo all Mach-O binaries found in the ARM bundle (now thin) with their
  # x86_64 counterparts from the Intel bundle
  _TMPFILE="$(mktemp)"
  find "${ARM_APP}" -type f > "${_TMPFILE}"
  while IFS= read -r arm_bin; do
    rel="${arm_bin#${ARM_APP}/}"
    intel_bin="${INTEL_APP}/${rel}"
    universal_bin="${UNIVERSAL_APP}/${rel}"

    if [[ -f "${intel_bin}" ]] && file "${arm_bin}" | grep -q "Mach-O"; then
      log "  lipo: ${rel}"
      lipo -create -output "${universal_bin}" "${arm_bin}" "${intel_bin}"
    fi
  done < "${_TMPFILE}"
  rm -f "${_TMPFILE}"

  verify_syphon_bundle "${UNIVERSAL_APP}"
  resign_mac_app "${UNIVERSAL_APP}"
  ok "Universal .app → ${UNIVERSAL_APP}"

  # Optional: create a DMG if create-dmg is available
  if command -v create-dmg >/dev/null 2>&1; then
    log "Creating DMG…"
    DMG_OUT="${TAURI_DIR}/target/universal/release/bundle/${APP_NAME}-universal.dmg"
    create-dmg \
      --volname "${APP_NAME}" \
      --window-size 540 380 \
      --icon-size 128 \
      --icon "${APP_NAME}.app" 150 185 \
      --hide-extension "${APP_NAME}.app" \
      --app-drop-link 390 185 \
      "${DMG_OUT}" \
      "${UNIVERSAL_APP}" \
    && ok "DMG → ${DMG_OUT}" \
    || warn "create-dmg failed; skipping DMG creation"
  else
    warn "create-dmg not found — skipping DMG (install with: brew install create-dmg)"
  fi
}

build_windows() {
  log "Building Windows x86_64…"

  # On macOS/Linux, attempt cross-compilation via cargo-xwin or cross
  if [[ "$(detect_os)" != "windows" ]]; then
    if command -v cargo-xwin >/dev/null 2>&1; then
      log "Cross-compiling with cargo-xwin…"
      require_rust_target "x86_64-pc-windows-msvc"
      cd "${TAURI_DIR}"
      cargo xwin build --release --target x86_64-pc-windows-msvc
    elif command -v cross >/dev/null 2>&1; then
      log "Cross-compiling with 'cross'…"
      require_rust_target "x86_64-pc-windows-gnu"
      cd "${TAURI_DIR}"
      cross build --release --target x86_64-pc-windows-gnu
    else
      warn "Neither cargo-xwin nor cross found."
      warn "To build Windows from macOS/Linux, install one:"
      warn "  cargo install cargo-xwin"
      warn "  cargo install cross && cross build …"
      warn "Or run this script natively on a Windows machine."
      exit 1
    fi
  else
    # Native Windows build
    require_rust_target "x86_64-pc-windows-msvc"
    tauri_build --target x86_64-pc-windows-msvc
  fi

  ok "Windows build complete"
}

build_all() {
  local os
  os="$(detect_os)"
  if [[ "${os}" == "mac" ]]; then
    build_mac_universal
    build_windows
  elif [[ "${os}" == "windows" ]]; then
    build_windows
  else
    warn "Unsupported OS for 'all' target: ${os}"
    exit 1
  fi
}

build_current_os() {
  local os
  os="$(detect_os)"
  case "${os}" in
    mac)     build_mac_universal ;;
    windows) build_windows ;;
    *)       fail "Unsupported OS: ${os}. Use explicit target argument." ;;
  esac
}

# ── Dependency checks ─────────────────────────────────────────
require_cmd node
require_cmd npm
require_cmd cargo
require_cmd rustup

# Ensure npm deps are installed
if [[ ! -d "${SCRIPT_DIR}/node_modules" ]]; then
  log "node_modules not found — running npm install…"
  cd "${SCRIPT_DIR}"
  npm install
fi

# Check @tauri-apps/cli is available via npx
if ! npx tauri --version >/dev/null 2>&1; then
  fail "@tauri-apps/cli not found. Run: npm install  (it is in devDependencies)"
fi

# ── Dispatch ──────────────────────────────────────────────────
TARGET="${1:-auto}"

case "${TARGET}" in
  auto)           build_current_os ;;
  mac-universal)  build_mac_universal ;;
  mac-arm)        build_mac_arm ;;
  mac-x86)        build_mac_x86 ;;
  windows)        build_windows ;;
  all)            build_all ;;
  *)
    echo "Usage: $0 [auto|mac-universal|mac-arm|mac-x86|windows|all]"
    exit 1
    ;;
esac

echo ""
ok "Build finished successfully."
