# HUFF Classic — Platform Package Matrix

## Release artifacts

| Platform | Architecture | Primary artifact | Secondary artifact | Native output |
|---|---:|---|---|---|
| macOS | arm64 + x86_64 | Universal DMG | `.app` | Syphon |
| Windows | x86_64 MSVC | MSI | Portable ZIP | Spout |
| Linux | x86_64 | DEB | AppImage | Canvas mirror |

## macOS build host

Required:

```text
Node.js + npm
Rust + rustup
Tauri CLI 1.6.3
Xcode command-line tools
lipo
codesign
create-dmg
```

Public distribution additionally requires:

```text
Developer ID Application identity
notarytool credentials or keychain profile
stapling validation
```

## Windows build host

Required:

```text
Node.js + npm
Rust stable with x86_64-pc-windows-msvc
Visual Studio C++ build tools
CMake
WiX toolchain used by Tauri
bundled build-required Spout2 SDK source set
```

Pass 29 produces:

```text
MSI built from the release directory; final installation inspection must confirm the adjacent Spout DLL
portable ZIP containing huff.exe and spout_bridge.dll
```

## Linux reference host

Reference distribution:

```text
Ubuntu 22.04 x86_64
```

Recommended Debian/Ubuntu development packages:

```bash
sudo apt update
sudo apt install \
  build-essential curl wget file pkg-config cmake \
  libssl-dev libgtk-3-dev libwebkit2gtk-4.0-dev \
  libayatana-appindicator3-dev librsvg2-dev \
  libasound2-dev \
  gstreamer1.0-tools \
  gstreamer1.0-plugins-base \
  gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-ugly \
  gstreamer1.0-libav
```

Fedora-family equivalents generally require:

```text
webkit2gtk4.0-devel
openssl-devel
gtk3-devel
libappindicator-gtk3-devel
librsvg2-devel
alsa-lib-devel
cmake
pkgconf-pkg-config
GStreamer 1 plugin packages
```

Arch-family equivalents generally require:

```text
webkit2gtk
gtk3
libappindicator-gtk3
librsvg
alsa-lib
cmake
pkgconf
gst-plugins-base/good/bad/ugly
gst-libav
```

Package names can vary by distribution release. The preflight script verifies `webkit2gtk-4.0`, `gtk+-3.0`, and `alsa` through `pkg-config` on the actual build host.
