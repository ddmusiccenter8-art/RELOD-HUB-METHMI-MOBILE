@echo off
chcp 65001 >nul
title RELOD HUB METHMI MOBILE - 1-Click GitHub Deploy
cd /d "%~dp0"

:: Ensure Git is in PATH for this session
set "PATH=C:\Users\methm\.gemini\antigravity\scratch\git\cmd;%PATH%"

echo ======================================================================
echo    🚀 RELOD HUB METHMI MOBILE - Auto GitHub Upload
echo ======================================================================
echo.

where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Git was not found!
    echo Please contact support or run from scratch folder.
    pause
    exit /b 1
)

echo 1. Checking git status...
git status --short
echo.

echo 2. Staging all changes...
git add -A
echo.

echo 3. Committing latest changes...
git commit -m "Live Update: %date% %time%" 2>nul
echo.

echo 4. Pushing to GitHub (origin main)...
echo.
echo **********************************************************************
echo  NOTE: If a browser window opens asking to 'Sign in to GitHub', 
echo  please click 'Sign in with your browser' and authorize ddmusiccenter8-art.
echo **********************************************************************
echo.

git push origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ======================================================================
    echo   [SUCCESS] ✅ Uploaded to GitHub successfully!
    echo.
    echo   Live Website:
    echo   👉 https://ddmusiccenter8-art.github.io/RELOD-HUB-METHMI-MOBILE/
    echo.
    echo   (Browser එකේදී Ctrl + Shift + R ඔබා Refresh කරන්න)
    echo ======================================================================
) else (
    echo.
    echo ======================================================================
    echo   [FAILED] ❌ Push failed!
    echo   කරුණාකර GitHub Login / Internet connection එක පරීක්ෂා කරන්න.
    echo ======================================================================
)

echo.
pause
