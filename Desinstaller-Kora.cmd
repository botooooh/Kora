@echo off
title Desinstallation de Kora - par Mr Paul
color 0C
cls
echo.
echo   ======================================================
echo    KORA - Desinstallation Complete (par Mr Paul)
echo   ======================================================
echo.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo   [!] Une erreur est survenue pendant la desinstallation.
    pause
)
exit /b %ERRORLEVEL%
