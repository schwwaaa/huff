$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Config = Get-Content -Raw (Join-Path $Root "release\release-config.json") | ConvertFrom-Json

$NativeRelease = Join-Path $Root "src-tauri\target\release"
$ExplicitRelease = Join-Path $Root "src-tauri\target\x86_64-pc-windows-msvc\release"

if (Test-Path (Join-Path $NativeRelease "huff.exe") -PathType Leaf) {
    $Release = $NativeRelease
} elseif (Test-Path (Join-Path $ExplicitRelease "huff.exe") -PathType Leaf) {
    $Release = $ExplicitRelease
} else {
    throw "Windows huff.exe not found in native or explicit-target release directories"
}

$ExePath = Join-Path $Release "huff.exe"
$DllPath = Join-Path $Release "spout_bridge.dll"
$MsiDir = Join-Path $Release "bundle\msi"
$Msi = Get-ChildItem $MsiDir -File -Filter "*.msi" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

if (-not (Test-Path $ExePath -PathType Leaf)) { throw "huff.exe not found at $ExePath" }
if (-not (Test-Path $DllPath -PathType Leaf)) { throw "spout_bridge.dll not found at $DllPath" }
if (-not $Msi) { throw "MSI installer not found under $MsiDir" }

$Artifacts = Join-Path $Root "artifacts"
New-Item -ItemType Directory -Force -Path $Artifacts | Out-Null
$Portable = Join-Path $Artifacts ("huff-{0}-windows-x64-portable" -f $Config.version)
$Zip = "{0}.zip" -f $Portable
Remove-Item $Portable -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $Zip -Force -ErrorAction SilentlyContinue
New-Item $Portable -ItemType Directory -Force | Out-Null
Copy-Item $ExePath (Join-Path $Portable "huff.exe")
Copy-Item $DllPath (Join-Path $Portable "spout_bridge.dll")
Copy-Item (Join-Path $Root "LICENSE") (Join-Path $Portable "LICENSE")
Compress-Archive -Path (Join-Path $Portable "*") -DestinationPath $Zip -CompressionLevel Optimal
Write-Host ("Portable ZIP: {0}" -f $Zip)
Write-Host ("MSI: {0}" -f $Msi.FullName)
