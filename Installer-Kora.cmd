@echo off
title Installation de Kora — par Mr Paul
color 0B
echo.
echo   ======================================================
echo    KORA — Installation Rapide et Securisee (Mr Paul)
echo   ======================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Test-Path '%~dp0install.ps1') { & '%~dp0install.ps1' } else { irm 'https://raw.githubusercontent.com/botooooh/Kora/main/website/install.ps1' | iex }"
exit
