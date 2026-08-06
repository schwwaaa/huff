#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 1 ]] || { echo "Usage: $0 path/to/huff.dmg" >&2; exit 1; }
: "${HUFF_NOTARY_PROFILE:?Set HUFF_NOTARY_PROFILE to a notarytool keychain profile}"
xcrun notarytool submit "$1" --keychain-profile "$HUFF_NOTARY_PROFILE" --wait
xcrun stapler staple "$1"
xcrun stapler validate "$1"
spctl --assess --type open --context context:primary-signature -v "$1"
