@echo off
title Desinstallation de Kora — par Mr Paul
color 0C
echo.
echo   ======================================================
echo    KORA — Desinstallation Complete (par Mr Paul)
echo   ======================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '%~dp0uninstall.ps1') { & '%~dp0uninstall.ps1' } else { irm 'https://raw.githubusercontent.com/botooooh/Kora/main/website/uninstall.ps1' | iex }"
exit
