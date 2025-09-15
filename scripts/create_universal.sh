# variables (no spaces)
APP="datamosh-desktop.app"
ARM="src-tauri/target/aarch64-apple-darwin/release/bundle/macos/$APP"
X64="src-tauri/target/x86_64-apple-darwin/release/bundle/macos/$APP"

OUT_DIR="artifacts/universal-app"
OUT_APP="$OUT_DIR/$APP"

# the executable inside .app also uses the productName
BIN_REL="Contents/MacOS/datamosh-desktop"

# make output + copy one bundle as base
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
cp -R "$ARM" "$OUT_APP"

# replace its binary with a single lipo-universal binary
lipo -create -output "$OUT_APP/$BIN_REL" \
  "$ARM/$BIN_REL" \
  "$X64/$BIN_REL"

# sanity-check archs (should print: arm64 x86_64)
file "$OUT_APP/$BIN_REL"
