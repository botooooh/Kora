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
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& { [System.Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192 -bor 48; $s = Join-Path (Get-Location).Path 'install.ps1'; Unblock-File $s -ErrorAction SilentlyContinue; & $s }"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo   [!] Une erreur est survenue pendant l'installation.
    echo.
    pause
) else (
    echo.
    echo   ======================================================
    echo    Installation terminee avec succes !
    echo   ======================================================
    echo.
    echo   Appuyez sur une touche pour fermer cette fenetre...
    pause >nul
)
exit /b %ERRORLEVEL%
