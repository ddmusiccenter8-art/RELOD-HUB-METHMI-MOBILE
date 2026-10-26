@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   RELOD HUB - Methmi Mobile GitHub Auto-Deploy
echo ===================================================
echo.

set "GIT_CMD=C:\Users\methm\.gemini\antigravity\scratch\git\cmd\git.exe"
if not exist "%GIT_CMD%" set "GIT_CMD=git"

echo [1/3] Adding modified files...
"%GIT_CMD%" add .

echo [2/3] Committing changes...
"%GIT_CMD%" commit -m "Auto update: %date% %time%"

echo [3/3] Pushing to GitHub...
"%GIT_CMD%" push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo   [SUCCESS] Uploaded successfully!
    echo   Changes will be live in 1-2 minutes:
    echo   https://ddmusiccenter8-art.github.io/RELOD-HUB-METHMI-MOBILE/
    echo ===================================================
) else (
    echo.
    echo ===================================================
    echo   [ERROR] Push failed. Check your internet connection.
    echo ===================================================
)

echo.
pause
