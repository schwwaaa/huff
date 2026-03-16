---
layout: page
title: Installation
permalink: /installation/
nav_order: 3
---

## macOS

1. Download `huff-1.0.2-universal.dmg` from the [Releases](../../releases) page.
2. Open the DMG and drag **huff** to your Applications folder.
3. On first launch macOS may show a Gatekeeper warning. Right-click the app icon → **Open** → **Open** to bypass it once.
4. Grant camera access when prompted if you plan to use webcam input.

**No extra software needed.** The Syphon.framework is bundled inside the `.app` bundle — nothing to install separately.

<div class="callout note">
  <strong>Apple Silicon + Intel:</strong> The DMG ships as a Universal binary built with <code>lipo</code>. It runs natively on both M-series and Intel Macs.
</div>

---

## Windows

1. Download `huff-1.0.2-x64-setup.exe` (or the `.msi`) from the [Releases](../../releases) page.
2. Run the installer. Windows SmartScreen may warn about an unsigned binary — click **More info → Run anyway**.
3. For **Spout output**, install the [Spout2 runtime](https://spout.zeal.co/) separately. huff's SpoutDX bridge DLL is bundled, but it requires the Spout2 system components.
4. [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) is required on Windows 10. It is pre-installed on Windows 11.

<div class="callout warning">
  <strong>SmartScreen warning:</strong> Expected on unsigned builds. This will be resolved in future releases with a code-signing certificate. Click <em>More info → Run anyway</em> to proceed.
</div>

---

## Building from Source

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18 LTS | [nodejs.org](https://nodejs.org) |
| Rust + Cargo | stable | Install via [rustup](https://rustup.rs) |
| Tauri CLI | 1.x | Installed via `npm install` |

**macOS extra:** Xcode Command Line Tools

```bash
xcode-select --install
```

**Windows extra:** [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with **Desktop development with C++**. Add the MSVC Rust target:

```powershell
rustup target add x86_64-pc-windows-msvc
```

**Linux extra:** WebKitGTK development libraries.

```bash
# Ubuntu / Debian
sudo apt install -y libwebkit2gtk-4.0-dev build-essential libssl-dev libgtk-3-dev

# Arch
sudo pacman -S --needed webkit2gtk base-devel openssl gtk3

# Fedora
sudo dnf install webkit2gtk4.0-devel openssl-devel
```

### Clone and run

```bash
git clone https://github.com/your-org/huff.git
cd huff
npm install

# Development — hot reload
npm run dev

# Production build
npm run build         # macOS: Universal DMG
npx tauri build       # Windows / Linux: native installer
```

### macOS Universal DMG

```bash
bash scripts/create_universal_dmg.sh
# Output: artifacts/huff-universal.dmg
```

This script builds ARM64 + x64 targets separately via `tauri build --target`, runs `lipo` to combine them, and packages the result as a DMG using `hdiutil`.

### Windows Artifacts

```cmd
node scripts/tauri-build.cjs
REM Output: artifacts\<timestamp>\
REM   huff_0.1.0_x64.exe
REM   huff_0.1.0_x64-setup.exe
REM   huff_0.1.0_x64_en-US.msi
REM   portable-<timestamp>.zip
REM   SHA256SUMS.txt
```

<div class="img-placeholder">
  <span class="ph-label">📸 SCREENSHOT PLACEHOLDER</span>
  <span>huff first-launch screenshot on macOS showing Gatekeeper dialog<br/>
  <em>Replace with: actual first-launch screenshot</em></span>
</div>
