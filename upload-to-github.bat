@echo off
title RELOD HUB METHMI MOBILE - Auto GitHub Deploy
cd /d "%~dp0"

echo =======================================================
echo    RELOD HUB METHMI MOBILE - Auto GitHub Deploy
echo =======================================================
echo.
echo 1. Checking git status...
git status --short
echo.
echo 2. Staging and committing changes...
git add -A
git commit -m "Update website: %date% %time%"
echo.
echo 3. Pushing directly to GitHub (main)...
git push origin main
if %ERRORLEVEL% equ 0 (
    echo.
    echo =======================================================
    echo   [SUCCESS] Uploaded to GitHub successfully!
    echo   Live URL: https://ddmusiccenter8-art.github.io/RELOD-HUB-METHMI-MOBILE/
    echo =======================================================
) else (
    echo.
    echo =======================================================
    echo   [NOTICE] Git push needs authorization or failed.
    echo   If a browser or login prompt appeared, please sign in.
    echo   Or check your internet connection.
    echo =======================================================
)
echo.
pause
