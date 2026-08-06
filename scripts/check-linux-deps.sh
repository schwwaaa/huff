#!/usr/bin/env bash
set -euo pipefail
missing=0
for cmd in cargo rustup cmake pkg-config; do
  if command -v "$cmd" >/dev/null 2>&1; then echo "PASS command $cmd"; else echo "BLOCK command $cmd"; missing=1; fi
done
if command -v pkg-config >/dev/null 2>&1; then
  for dep in webkit2gtk-4.0 gtk+-3.0 alsa; do
    if pkg-config --exists "$dep"; then echo "PASS pkg-config $dep"; else echo "BLOCK pkg-config $dep"; missing=1; fi
  done
fi
exit "$missing"
