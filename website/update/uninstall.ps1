# ============================================================================
# KORA — Désinstalleur Officiel Propre (par Mr Paul)
# Ferme Kora, supprime le démarrage auto, les raccourcis, l'entrée Windows
# et les dossiers d'installation (%LOCALAPPDATA%\Kora).
# ============================================================================

$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "   KORA - Desinstallation complete (par Mr Paul)" -ForegroundColor White
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "  [1/4] Fermeture de Kora en cours d'exécution..." -ForegroundColor Yellow
Stop-Process -Name "Kora", "nusa-bridge", "electron" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 600

Write-Host "  [2/4] Suppression du démarrage automatique et des raccourcis..." -ForegroundColor Yellow
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "Kora" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "electron.app.Kora" -ErrorAction SilentlyContinue
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "electron.app.kora-notch" -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Kora" -Recurse -Force -ErrorAction SilentlyContinue

$DesktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) "Kora.lnk"
$StartMenuDir    = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Kora"
if (Test-Path $DesktopShortcut) { Remove-Item $DesktopShortcut -Force -ErrorAction SilentlyContinue }
if (Test-Path $StartMenuDir)    { Remove-Item $StartMenuDir -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "  [3/4] Suppression des données d'application..." -ForegroundColor Yellow
$AppDataKora = Join-Path $env:APPDATA "kora-notch"
if (Test-Path $AppDataKora) { Remove-Item $AppDataKora -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host "  [4/4] Suppression du dossier d'installation (%LOCALAPPDATA%\Kora)..." -ForegroundColor Yellow
$TargetDir = Join-Path $env:LOCALAPPDATA "Kora"
if (Test-Path $TargetDir) {
  # Launch a detached cmd to remove TargetDir in case uninstall.ps1 was run from inside TargetDir
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c timeout /t 1 /nobreak >nul & rmdir /s /q `"$TargetDir`"" -WindowStyle Hidden
}

Write-Host ""
Write-Host "  [OK] Kora a ete completement desinstallee de votre ordinateur." -ForegroundColor Green
Start-Sleep -Seconds 2
