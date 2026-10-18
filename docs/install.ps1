# ============================================================================
# KORA — Installeur Officiel Sans Alerte SmartScreen (par Mr Paul)
# Compile les composants natifs localement via Microsoft .NET pour éviter
# tout faux-positif Windows Defender / SmartScreen ("Mark-of-the-Web").
# ============================================================================

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$TargetDir = Join-Path $env:LOCALAPPDATA "Kora"
$DistDir   = Join-Path $TargetDir "node_modules\electron\dist"
$BaseUrl   = "https://raw.githubusercontent.com/botooooh/Kora/main"
$ElectronZipUrl = "https://github.com/electron/electron/releases/download/v35.0.0/electron-v35.0.0-win32-x64.zip"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "   KORA — Installation & Configuration (par Mr Paul)" -ForegroundColor White
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host ""

New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
New-Item -ItemType Directory -Force -Path $DistDir   | Out-Null

$Files = @(
  "package.json",
  "main.js",
  "preload.js",
  "index.html",
  "styles.css",
  "renderer.js",
  "NusaBridge.cs",
  "KoraLauncher.cs",
  "kora-logo.png",
  "kora.ico",
  "Desinstaller-Kora.cmd"
)

Write-Host "  [1/4] Synchronisation des fichiers sources Kora..." -ForegroundColor Cyan
foreach ($f in $Files) {
  $dest = Join-Path $TargetDir $f
  $localCandidate = Join-Path $PSScriptRoot $f
  if (Test-Path $localCandidate) {
    Copy-Item $localCandidate $dest -Force
  } else {
    Invoke-WebRequest -Uri "$BaseUrl/$f`?t=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -UseBasicParsing -OutFile $dest
  }
  Unblock-File -Path $dest -ErrorAction SilentlyContinue
}

# Copy uninstall.ps1 as well
$UninstallDest = Join-Path $TargetDir "uninstall.ps1"
$LocalUninstall = Join-Path $PSScriptRoot "uninstall.ps1"
if (Test-Path $LocalUninstall) {
  Copy-Item $LocalUninstall $UninstallDest -Force
} else {
  Invoke-WebRequest -Uri "$BaseUrl/website/uninstall.ps1?t=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -UseBasicParsing -OutFile $UninstallDest
}
Unblock-File -Path $UninstallDest -ErrorAction SilentlyContinue

Write-Host "  [2/4] Compilation locale sécurisée (Microsoft .NET)..." -ForegroundColor Cyan
$fw = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$csc = Join-Path $fw "csc.exe"
$sysRuntime = Get-ChildItem "C:\Windows\Microsoft.NET" -Recurse -Filter "System.Runtime.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
$winmds = Get-ChildItem "C:\Windows\System32\WinMetadata\*.winmd" | ForEach-Object { "/r:`"$($_.FullName)`"" }

& $csc /nologo /target:exe /out:"$(Join-Path $TargetDir 'nusa-bridge.exe')" /optimize+ /r:"$fw\System.Runtime.WindowsRuntime.dll" /r:"$sysRuntime" $winmds "$(Join-Path $TargetDir 'NusaBridge.cs')" | Out-Null
& $csc /nologo /target:winexe /out:"$(Join-Path $TargetDir 'Kora.exe')" /win32icon:"$(Join-Path $TargetDir 'kora.ico')" /optimize+ "$(Join-Path $TargetDir 'KoraLauncher.cs')" | Out-Null

$ElectronExe = Join-Path $DistDir "electron.exe"
if (-not (Test-Path $ElectronExe)) {
  $devElectron = Join-Path ([Environment]::GetFolderPath("Desktop")) "Progammation\Kora\node_modules\electron\dist\electron.exe"
  if (Test-Path $devElectron) {
    Write-Host "  [3/4] Copie du moteur graphique local..." -ForegroundColor Cyan
    Copy-Item (Join-Path ([Environment]::GetFolderPath("Desktop")) "Progammation\Kora\node_modules\electron\dist\*") $DistDir -Recurse -Force
  } else {
    Write-Host "  [3/4] Téléchargement du moteur graphique (1 seule fois)..." -ForegroundColor Cyan
    $zipPath = Join-Path $TargetDir "runtime.zip"
    & curl.exe -L -s $ElectronZipUrl -o $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $DistDir -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host "  [3/4] Moteur graphique déjà installé." -ForegroundColor Cyan
}

Write-Host "  [4/4] Création des raccourcis et du désinstalleur Windows..." -ForegroundColor Cyan
try {
  $WshShell = New-Object -ComObject WScript.Shell
  $DesktopPath = [Environment]::GetFolderPath("Desktop")
  $Shortcut = $WshShell.CreateShortcut((Join-Path $DesktopPath "Kora.lnk"))
  $Shortcut.TargetPath = Join-Path $TargetDir "Kora.exe"
  $Shortcut.WorkingDirectory = $TargetDir
  $Shortcut.IconLocation = Join-Path $TargetDir "kora.ico"
  $Shortcut.Description = "Kora — Une encoche vivante pour Windows (par Mr Paul)"
  $Shortcut.Save()

  # Register in Windows Installed Apps (Paramètres Windows -> Applications -> Kora -> Désinstaller)
  $UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Kora"
  New-Item -Path $UninstallKey -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name "DisplayName" -Value "Kora — Dynamic Island pour Windows" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name "DisplayVersion" -Value "2.0.0" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name "Publisher" -Value "Mr Paul" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name "DisplayIcon" -Value (Join-Path $TargetDir "kora.ico") -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name "InstallLocation" -Value $TargetDir -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name "UninstallString" -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$UninstallDest`"" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name "NoModify" -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name "NoRepair" -Value 1 -PropertyType DWord -Force | Out-Null
} catch {}

Start-Process -FilePath (Join-Path $TargetDir "Kora.exe") -WorkingDirectory $TargetDir
Write-Host ""
Write-Host "  ✓ Kora est installée et lancée en haut de votre écran !" -ForegroundColor Green
Start-Sleep -Seconds 2
