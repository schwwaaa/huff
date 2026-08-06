$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Config = Get-Content (Join-Path $Root "release\release-config.json") | ConvertFrom-Json
$Release = Join-Path $Root "src-tauri\target\x86_64-pc-windows-msvc\release"

$ExePath = Join-Path $Release "huff.exe"
$DllPath = Join-Path $Release "spout_bridge.dll"
$Msi = Get-ChildItem (Join-Path $Release "bundle\msi") -File -Filter "*.msi" | Select-Object -First 1

if (-not (Test-Path $ExePath -PathType Leaf)) { throw "huff.exe not found at $ExePath" }
if (-not (Test-Path $DllPath -PathType Leaf)) { throw "spout_bridge.dll not found at $DllPath" }
if (-not $Msi) { throw "MSI installer not found under $(Join-Path $Release 'bundle\msi')" }

$Artifacts = Join-Path $Root "artifacts"
$Portable = Join-Path $Artifacts "huff-$($Config.version)-windows-x64-portable"
$Zip = "$Portable.zip"
Remove-Item $Portable -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $Zip -Force -ErrorAction SilentlyContinue
New-Item $Portable -ItemType Directory -Force | Out-Null
Copy-Item $ExePath (Join-Path $Portable "huff.exe")
Copy-Item $DllPath (Join-Path $Portable "spout_bridge.dll")
Copy-Item (Join-Path $Root "LICENSE") (Join-Path $Portable "LICENSE")
Compress-Archive -Path "$Portable\*" -DestinationPath $Zip -CompressionLevel Optimal
Write-Host "Portable ZIP: $Zip"
Write-Host "MSI: $($Msi.FullName)"
