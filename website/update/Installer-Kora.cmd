@echo off
title Installation de Kora - par Mr Paul
color 0B
cls
echo.
echo   ======================================================
echo    KORA - Installation Rapide et Securisee (Mr Paul)
echo   ======================================================
echo.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo   [!] Une erreur est survenue pendant l installation.
    pause
)
exit /b %ERRORLEVEL%
