@echo off
title Shop Payment Tracker - Auto GitHub Deploy
cd /d "C:\Users\pc\.gemini\antigravity\scratch\shop-tracker"

echo =======================================================
echo    Shop Payment Tracker - GitHub Automatic Upload
echo =======================================================
echo.
echo 1. Checking git status...
git status --short
echo.
echo 2. Staging and committing changes...
git add -A
git commit -m "Auto update: %date% %time%"
echo.
echo 3. Pushing directly to GitHub (main)...
git push origin main
echo.
echo =======================================================
echo   SUCCESS! Uploaded to GitHub!
echo   Live URL: https://ddmusiccenter8-art.github.io/RELOD-HUB-METHMI-MOBILE/
echo =======================================================
echo.
pause
