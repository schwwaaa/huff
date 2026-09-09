$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

$ArtifactsDir = Join-Path $Root "artifacts"
New-Item -ItemType Directory -Force -Path $ArtifactsDir | Out-Null
$LogPath = Join-Path $ArtifactsDir "windows-build.log"
$TranscriptStarted = $false
try {
    Start-Transcript -Path $LogPath -Force | Out-Null
    $TranscriptStarted = $true
} catch {
    Write-Warning ("Could not start PowerShell transcript: {0}" -f $_.Exception.Message)
}

function Stop-BuildTranscript {
    if ($script:TranscriptStarted) {
        try { Stop-Transcript | Out-Null } catch {}
        $script:TranscriptStarted = $false
    }
}

function Fail([string]$Message) {
    Stop-BuildTranscript
    throw $Message
}

function Step([string]$Name, [scriptblock]$Action) {
    Write-Host ""
    Write-Host ("==> {0}" -f $Name) -ForegroundColor Cyan
    $global:LASTEXITCODE = 0
    & $Action
    $Code = $LASTEXITCODE
    if ($Code -ne 0) {
        Fail ("{0} failed with exit code {1}. Full log: {2}" -f $Name, $Code, $LogPath)
    }
}

function Require-Command([string]$Name) {
    $Command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $Command) {
        Fail ("Required command not found: {0}" -f $Name)
    }
    return $Command
}

function Import-VsDevEnvironment {
    $ExistingCl = Get-Command cl.exe -ErrorAction SilentlyContinue
    if ($ExistingCl) {
        Write-Host ("MSVC environment already active: {0}" -f $ExistingCl.Source)
        return
    }

    $VsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $VsWhere -PathType Leaf)) {
        Fail "vswhere.exe not found. Install Visual Studio 2022 Build Tools with Desktop development with C++."
    }

    $InstallPath = (& $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Select-Object -First 1)
    if (-not $InstallPath) {
        Fail "Visual Studio C++ x64 tools were not found. Install Desktop development with C++."
    }

    $VsDevCmd = Join-Path $InstallPath "Common7\Tools\VsDevCmd.bat"
    if (-not (Test-Path $VsDevCmd -PathType Leaf)) {
        Fail ("VsDevCmd.bat not found at {0}" -f $VsDevCmd)
    }

    Write-Host ("Loading MSVC x64 environment from: {0}" -f $VsDevCmd)
    $CmdLine = 'call "{0}" -no_logo -arch=x64 -host_arch=x64 >nul && set' -f $VsDevCmd
    $EnvironmentLines = & $env:ComSpec /d /s /c $CmdLine
    if ($LASTEXITCODE -ne 0) {
        Fail ("VsDevCmd.bat failed with exit code {0}" -f $LASTEXITCODE)
    }

    foreach ($Line in $EnvironmentLines) {
        $Index = $Line.IndexOf('=')
        if ($Index -le 0) { continue }
        $Name = $Line.Substring(0, $Index)
        $Value = $Line.Substring($Index + 1)
        Set-Item -Path ("Env:{0}" -f $Name) -Value $Value
    }

    Require-Command cl.exe | Out-Null
    Require-Command link.exe | Out-Null
}

function Assert-File([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path -PathType Leaf)) {
        Fail ("{0} missing: {1}" -f $Label, $Path)
    }
}

function Get-RustHost {
    $Lines = & rustc.exe -vV
    if ($LASTEXITCODE -ne 0) {
        Fail "rustc -vV failed"
    }
    $HostLine = $Lines | Where-Object { $_ -like 'host:*' } | Select-Object -First 1
    if (-not $HostLine) {
        Fail "Could not determine Rust host triple from rustc -vV"
    }
    return $HostLine.Substring(5).Trim()
}

function Get-LatestMsi([string]$Directory) {
    if (-not (Test-Path $Directory -PathType Container)) { return $null }
    return Get-ChildItem $Directory -File -Filter "*.msi" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
}

function Assert-MsiContainsFile([string]$MsiPath, [string]$RequiredFileName) {
    Write-Host ("Checking MSI File table for {0}" -f $RequiredFileName)
    $Installer = New-Object -ComObject WindowsInstaller.Installer
    $Database = $Installer.GetType().InvokeMember("OpenDatabase", "InvokeMethod", $null, $Installer, @($MsiPath, 0))
    $View = $Database.GetType().InvokeMember("OpenView", "InvokeMethod", $null, $Database, @("SELECT * FROM File"))
    $View.GetType().InvokeMember("Execute", "InvokeMethod", $null, $View, $null) | Out-Null

    $Found = $false
    while ($true) {
        $Record = $View.GetType().InvokeMember("Fetch", "InvokeMethod", $null, $View, $null)
        if (-not $Record) { break }
        $FileName = $Record.GetType().InvokeMember("StringData", "GetProperty", $null, $Record, 3)
        if ($FileName -and $FileName.ToString().ToLowerInvariant().Contains($RequiredFileName.ToLowerInvariant())) {
            $Found = $true
            break
        }
    }
    $View.GetType().InvokeMember("Close", "InvokeMethod", $null, $View, $null) | Out-Null
    if (-not $Found) {
        Fail ("MSI does not contain required runtime file: {0}" -f $RequiredFileName)
    }
}

try {
    Write-Host "HUFF Classic - Windows x64 release build v4"
    Write-Host ("Root: {0}" -f $Root)
    Write-Host "Runtime architecture: original dynamic spout_bridge.dll (unchanged)"
    Write-Host "Build strategy: native x64 host, no explicit --target override"

    foreach ($CommandName in @('node.exe', 'npm.cmd', 'cargo.exe', 'rustc.exe', 'cmake.exe')) {
        Require-Command $CommandName | Out-Null
    }

    Import-VsDevEnvironment

    $RustHost = Get-RustHost
    Write-Host ("Rust host: {0}" -f $RustHost)
    if ($RustHost -ne "x86_64-pc-windows-msvc") {
        Fail ("HUFF Windows release requires native x86_64-pc-windows-msvc Rust host. Current host: {0}. This build intentionally does not force --target because the native path matches the validated dev configuration." -f $RustHost)
    }

    $LocalTauri = Join-Path $Root "node_modules\.bin\tauri.cmd"
    if (-not (Test-Path $LocalTauri -PathType Leaf)) {
        Step "Install locked Node dependencies" { & npm.cmd ci }
    }
    Assert-File $LocalTauri "Local Tauri CLI"

    Step "Windows release preflight" {
        & node.exe scripts\release-preflight.mjs --platform=windows
    }

    $ReleaseRoot = Join-Path $Root "src-tauri\target\release"
    $ExePath = Join-Path $ReleaseRoot "huff.exe"
    $SpoutDllPath = Join-Path $ReleaseRoot "spout_bridge.dll"
    $MsiDir = Join-Path $ReleaseRoot "bundle\msi"
    $RuntimeStageDir = Join-Path $Root "src-tauri\windows-runtime"
    $RuntimeStageDll = Join-Path $RuntimeStageDir "spout_bridge.dll"

    if (Test-Path $MsiDir -PathType Container) {
        Remove-Item $MsiDir -Recurse -Force
    }
    if (Test-Path $RuntimeStageDir -PathType Container) {
        Remove-Item $RuntimeStageDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $RuntimeStageDir | Out-Null

    # Compile the real release executable first using the native host triple.
    # This isolates Rust/CMake/Spout release compilation from MSI bundling and
    # deliberately mirrors the target layout used by the working dev build:
    #   dev     -> src-tauri/target/debug
    #   release -> src-tauri/target/release
    Step "Compile HUFF release with original dynamic Spout bridge" {
        & cargo.exe build --locked --release --features custom-protocol --manifest-path src-tauri\Cargo.toml
    }

    Assert-File $ExePath "Windows release executable"
    Assert-File $SpoutDllPath "Original dynamic Spout bridge DLL"

    # Stage the exact DLL produced by build.rs. The temporary --config overlay
    # below tells Tauri/WiX to install this DLL next to huff.exe. No Spout code,
    # CMake source, Rust FFI, or runtime behavior is changed.
    Copy-Item $SpoutDllPath $RuntimeStageDll -Force
    Assert-File $RuntimeStageDll "Staged Spout bridge DLL"

    # IMPORTANT: do not pass JSON inline through PowerShell -> tauri.cmd.
    # On Windows that command chain can strip the JSON quotes, which produces:
    #   failed to parse config to merge: key must be a string at line 1 column 2
    # Write a real UTF-8 (no BOM) JSON file instead and pass its path to --config.
    # Tauri v1 explicitly accepts either a JSON string OR a path to a JSON file.
    $BundleOverlayPath = Join-Path $ArtifactsDir "tauri-windows-bundle-overlay.json"
    $Resources = [ordered]@{}
    $Resources[$RuntimeStageDll] = "."
    $BundleOverlayObject = [ordered]@{
        tauri = [ordered]@{
            bundle = [ordered]@{
                resources = $Resources
            }
        }
    }
    $BundleOverlayJson = $BundleOverlayObject | ConvertTo-Json -Depth 8
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($BundleOverlayPath, $BundleOverlayJson, $Utf8NoBom)
    Assert-File $BundleOverlayPath "Tauri Windows bundle overlay"

    Step "Validate Tauri Windows bundle overlay JSON" {
        & node.exe -e "const fs=require('fs'); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,'utf8')); if(!j.tauri || !j.tauri.bundle || !j.tauri.bundle.resources) process.exit(2); console.log('Valid overlay:', p);" $BundleOverlayPath
    }

    Write-Host ("Tauri bundle overlay: {0}" -f $BundleOverlayPath)
    Write-Host ("Spout resource source: {0}" -f $RuntimeStageDll)

    Step "Bundle HUFF MSI with Spout DLL resource" {
        & $LocalTauri build --bundles msi --config $BundleOverlayPath
    }

    Assert-File $ExePath "Windows executable after Tauri bundle"
    Assert-File $SpoutDllPath "Spout bridge DLL after Tauri bundle"

    $Msi = Get-LatestMsi $MsiDir
    if (-not $Msi) {
        Fail ("MSI installer missing under {0}" -f $MsiDir)
    }

    Step "Verify MSI contains Spout bridge DLL" {
        Assert-MsiContainsFile $Msi.FullName "spout_bridge.dll"
    }

    Step "Create portable ZIP" {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\package-windows.ps1
    }

    Step "Verify Windows release artifacts" {
        & node.exe scripts\verify-release-artifacts.mjs --platform=windows
    }

    Write-Host ""
    Write-Host "SUCCESS: Windows MSI and portable ZIP built." -ForegroundColor Green
    Write-Host ("MSI: {0}" -f $Msi.FullName)
    Write-Host ("Executable: {0}" -f $ExePath)
    Write-Host ("Spout DLL: {0}" -f $SpoutDllPath)
    Write-Host ("Build log: {0}" -f $LogPath)
} finally {
    Stop-BuildTranscript
}
