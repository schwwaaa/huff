@echo off
setlocal enabledelayedexpansion

REM ==== CONFIG (edit these) ================================================
set "TARGET=x86_64-pc-windows-msvc"
set "KEEP=5"                      REM keep this many artifact folders
set "CLEAN_ARTIFACTS=0"           REM 1 = delete artifacts\ before build
set "DEEP_NPM_CLEAN=0"            REM 1 = delete node_modules + reinstall
REM ========================================================================

REM Resolve project root to script's folder
pushd "%~dp0"
set "ROOT=%CD%"
set "ARTIFACTS=%ROOT%\artifacts"
echo [Info] Project root: %ROOT%

REM --- Clean prior build outputs (Cargo/Tauri) ---
echo.
echo === Cleaning previous build outputs ===
set "T1=%ROOT%\src-tauri\target\release"
set "T2=%ROOT%\src-tauri\target\%TARGET%\release"
if exist "%T1%" (echo - rm "%T1%" & rmdir /s /q "%T1%")
if exist "%ROOT%\src-tauri\target\%TARGET%" (echo - rm "%ROOT%\src-tauri\target\%TARGET%" & rmdir /s /q "%ROOT%\src-tauri\target\%TARGET%")
if exist "%ROOT%\src-tauri\target" (for /f %%D in ('dir "%ROOT%\src-tauri\target" /ad /b') do rem)

REM --- Optional: clean artifacts history ---
if "%CLEAN_ARTIFACTS%"=="1" (
  echo.
  echo === Removing artifacts\ (full wipe) ===
  if exist "%ARTIFACTS%" (rmdir /s /q "%ARTIFACTS%")
)

REM --- Optional: deep npm clean ---
if "%DEEP_NPM_CLEAN%"=="1" (
  echo.
  echo === Deep npm clean ===
  if exist "%ROOT%\node_modules" (rmdir /s /q "%ROOT%\node_modules")
  if exist "%ROOT%\package-lock.json" (del /f /q "%ROOT%\package-lock.json")
  call npm cache clean --force
  call npm install || (echo [ERROR] npm install failed & popd & exit /b 1)
)

REM --- Build (use on-demand CLI so local install isn't required) ---
echo.
echo === Building Windows Tauri App ===
call npx --yes --package @tauri-apps/cli tauri build --target %TARGET%
if errorlevel 1 (echo [ERROR] Tauri build failed & popd & exit /b 1)

REM --- Timestamped output dir ---
for /f %%I in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyyMMdd-HHmmss')"') do set "STAMP=%%I"
if not exist "%ARTIFACTS%" mkdir "%ARTIFACTS%"
set "OUTDIR=%ARTIFACTS%\%STAMP%"
mkdir "%OUTDIR%" >nul 2>&1
echo [Info] Output folder: %OUTDIR%

REM --- Locate build outputs (both layouts) ---
set "BIN_DIR1=%ROOT%\src-tauri\target\release"
set "BIN_DIR2=%ROOT%\src-tauri\target\%TARGET%\release"
set "BUNDLE_DIR1=%BIN_DIR1%\bundle"
set "BUNDLE_DIR2=%BIN_DIR2%\bundle"

set "BIN_DIR=%BIN_DIR1%"
if exist "%BIN_DIR2%" set "BIN_DIR=%BIN_DIR2%"
set "BUNDLE_DIR=%BUNDLE_DIR1%"
if exist "%BUNDLE_DIR2%" set "BUNDLE_DIR=%BUNDLE_DIR2%"

echo.
echo === Collecting artifacts ===
echo [Info] Using BIN_DIR: %BIN_DIR%
echo [Info] Using BUNDLE_DIR: %BUNDLE_DIR%

REM Portable exe(s)
set "FOUND_EXE=0"
for %%F in ("%BIN_DIR%\*.exe") do (
  echo - EXE: %%~nxF
  set "FOUND_EXE=1"
  copy /y "%%~fF" "%OUTDIR%\%%~nxF" >nul
)
if "%FOUND_EXE%"=="0" echo [WARN] No portable EXE found in "%BIN_DIR%"

REM MSI
if exist "%BUNDLE_DIR%\msi" (
  for %%M in ("%BUNDLE_DIR%\msi\*.msi") do (
    echo - MSI: %%~nxM
    copy /y "%%~fM" "%OUTDIR%\%%~nxM" >nul
  )
)

REM NSIS installer
if exist "%BUNDLE_DIR%\nsis" (
  for %%S in ("%BUNDLE_DIR%\nsis\*.exe") do (
    echo - NSIS: %%~nxS
    copy /y "%%~fS" "%OUTDIR%\%%~nxS" >nul
  )
)

echo.
echo === Current build contents ===
dir "%OUTDIR%"

REM --- ZIP portable exe(s) only ---
echo.
echo === Creating ZIP of portable EXE(s) ===
set "PORTABLE_STAGE=%OUTDIR%\portable-stage"
rmdir /s /q "%PORTABLE_STAGE%" >nul 2>&1
mkdir "%PORTABLE_STAGE%" >nul 2>&1

set "COPIED_ANY=0"
for %%F in ("%OUTDIR%\*.exe") do (
  echo %%~nxF | findstr /i "setup installer msi nsis" >nul
  if errorlevel 1 (
    copy /y "%%~fF" "%PORTABLE_STAGE%\%%~nxF" >nul
    set "COPIED_ANY=1"
  )
)

set "ZIPNAME=%OUTDIR%\portable-%STAMP%.zip"
if "%COPIED_ANY%"=="1" (
  > "%PORTABLE_STAGE%\README.txt" echo Portable build
  >>"%PORTABLE_STAGE%\README.txt" echo.
  >>"%PORTABLE_STAGE%\README.txt" echo - Double-click the EXE to run.
  >>"%PORTABLE_STAGE%\README.txt" echo - If blank on a fresh PC, install Microsoft Edge WebView2 Runtime.
  >>"%PORTABLE_STAGE%\README.txt" echo - Unsigned builds may trigger SmartScreen.
  >>"%PORTABLE_STAGE%\README.txt" echo.
  >>"%PORTABLE_STAGE%\README.txt" echo Built on: %DATE% %TIME%
  powershell -NoProfile -Command "Compress-Archive -Path '%PORTABLE_STAGE%\*' -DestinationPath '%ZIPNAME%' -Force" || echo [WARN] ZIP creation failed
  if exist "%ZIPNAME%" echo - ZIP: %ZIPNAME%
) else (
  echo [WARN] No portable EXE detected to ZIP (skipping).
)

REM --- SHA256 checksums ---
echo.
echo === Writing SHA256 checksums ===
set "SUMS=%OUTDIR%\SHA256SUMS.txt"
if exist "%SUMS%" del /f /q "%SUMS%"
for %%F in ("%OUTDIR%\*.exe") do (
  for /f "tokens=1" %%H in ('certutil -hashfile "%%~fF" SHA256 ^| findstr /R /V /C:"hash of" /C:"CertUtil"') do >>"%SUMS%" echo %%H  %%~nxF
)
for %%F in ("%OUTDIR%\*.msi") do (
  for /f "tokens=1" %%H in ('certutil -hashfile "%%~fF" SHA256 ^| findstr /R /V /C:"hash of" /C:"CertUtil"') do >>"%SUMS%" echo %%H  %%~nxF
)
for %%F in ("%OUTDIR%\*.zip") do (
  for /f "tokens=1" %%H in ('certutil -hashfile "%%~fF" SHA256 ^| findstr /R /V /C:"hash of" /C:"CertUtil"') do >>"%SUMS%" echo %%H  %%~nxF
)
if exist "%SUMS%" echo - Checksums: %SUMS%

REM --- Prune old artifact folders ---
echo.
echo === Cleanup: keeping latest %KEEP% builds in "%ARTIFACTS%" ===
if exist "%ARTIFACTS%" (
  for /f "skip=%KEEP% delims=" %%D in ('dir "%ARTIFACTS%" /ad /o-d /b') do (
    echo - Removing old build: "%ARTIFACTS%\%%D"
    rmdir /s /q "%ARTIFACTS%\%%D"
  )
)

echo.
echo === DONE ===
echo Latest build folder:
echo   %OUTDIR%
popd
exit /b 0
