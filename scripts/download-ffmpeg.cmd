@echo off
REM scripts\download-ffmpeg.cmd
REM
REM Downloads a minimal static FFmpeg build for Windows x64 and places it in
REM src-tauri\binariesaries\ with the Tauri sidecar naming convention:
REM
REM   ffmpeg-x86_64-pc-windows-msvc.exe
REM
REM Source: gyan.dev — full-static FFmpeg builds for Windows
REM Run this once before `npm run build`.
REM
REM Usage:
REM   scripts\download-ffmpeg.cmd

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "BIN_DIR=%SCRIPT_DIR%..\src-tauri\binaries"
if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"

set "DEST=%BIN_DIR%\ffmpeg-x86_64-pc-windows-msvc.exe"

if exist "%DEST%" (
    echo [skip] %DEST% already exists. Delete it to re-download.
    goto :done
)

REM gyan.dev hosts minimal essentials builds — libx264, aac, ~70MB zip
set "ZIP_URL=https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
set "TMP_ZIP=%TEMP%\ffmpeg-download.zip"
set "TMP_DIR=%TEMP%\ffmpeg-extract"

echo Downloading FFmpeg from %ZIP_URL% ...
powershell -Command "Invoke-WebRequest -Uri '%ZIP_URL%' -OutFile '%TMP_ZIP%' -UseBasicParsing"
if errorlevel 1 ( echo ERROR: Download failed. & exit /b 1 )

echo Extracting ...
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"
powershell -Command "Expand-Archive -Path '%TMP_ZIP%' -DestinationPath '%TMP_DIR%' -Force"
if errorlevel 1 ( echo ERROR: Extraction failed. & exit /b 1 )

REM The zip contains ffmpeg-X.Y.Z-essentials_build\bin\ffmpeg.exe
for /r "%TMP_DIR%" %%f in (ffmpeg.exe) do (
    copy /y "%%f" "%DEST%" >nul
    echo Copied %%f to %DEST%
    goto :cleanup
)
echo ERROR: Could not find ffmpeg.exe in extracted archive.
exit /b 1

:cleanup
del /q "%TMP_ZIP%" 2>nul
rmdir /s /q "%TMP_DIR%" 2>nul

:done
echo.
echo [OK] FFmpeg binary ready at:
echo      %DEST%
echo.
echo Now run: npm run build
endlocal
