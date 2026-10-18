# ============================================================================
# KORA - Installeur Officiel Sans Alerte SmartScreen (par Mr Paul)
# Compile les composants natifs localement via Microsoft .NET pour eviter
# tout faux-positif Windows Defender / SmartScreen ("Mark-of-the-Web").
# ============================================================================

param([string]$SourceDir = "")

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $SourceDir) {
  if ($PSScriptRoot) {
    $SourceDir = $PSScriptRoot
  } elseif ($MyInvocation.MyCommand.Definition) {
    $SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
  } else {
    $SourceDir = (Get-Location).Path
  }
}

# Si execute depuis le sous-dossier website en dev, remonter a la racine
if (-not (Test-Path (Join-Path $SourceDir "package.json")) -and (Test-Path (Join-Path (Split-Path -Parent $SourceDir) "package.json"))) {
  $SourceDir = Split-Path -Parent $SourceDir
}

$ScriptDir = $SourceDir
$TargetDir = Join-Path $env:LOCALAPPDATA "Kora"
$DistDir   = Join-Path $TargetDir "node_modules\electron\dist"
$BaseUrl   = "https://raw.githubusercontent.com/botooooh/Kora/main"
$ElectronZipUrl = "https://github.com/electron/electron/releases/download/v35.0.0/electron-v35.0.0-win32-x64.zip"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "   KORA - Installation & Configuration (par Mr Paul)" -ForegroundColor White
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
  $localCandidate = Join-Path $ScriptDir $f
  if (Test-Path $localCandidate) {
    Copy-Item $localCandidate $dest -Force
  } else {
    try {
      Invoke-WebRequest -Uri "$BaseUrl/$f`?t=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -UseBasicParsing -OutFile $dest
    } catch {
      Write-Host "  [!] Fichier source introuvable localement : $localCandidate" -ForegroundColor Yellow
    }
  }
  Unblock-File -Path $dest -ErrorAction SilentlyContinue
}

# Copie egalement uninstall.ps1
$UninstallDest = Join-Path $TargetDir "uninstall.ps1"
$LocalUninstall = Join-Path $ScriptDir "uninstall.ps1"
if (Test-Path $LocalUninstall) {
  Copy-Item $LocalUninstall $UninstallDest -Force
} else {
  try {
    Invoke-WebRequest -Uri "$BaseUrl/website/uninstall.ps1?t=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -UseBasicParsing -OutFile $UninstallDest
  } catch {}
}
Unblock-File -Path $UninstallDest -ErrorAction SilentlyContinue

Write-Host "  [2/4] Compilation locale securisee (Microsoft .NET)..." -ForegroundColor Cyan
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
    Write-Host "  [3/4] Telechargement du moteur graphique..." -ForegroundColor Cyan
    $zipPath = Join-Path $TargetDir "runtime.zip"
    & curl.exe -L --fail --retry 3 -s $ElectronZipUrl -o $zipPath

    # Extraction ultra-rapide et robuste (tar.exe natif Windows 10/11 sans bogue d'encodage)
    if (Get-Command "tar.exe" -ErrorAction SilentlyContinue) {
      & tar.exe -xf $zipPath -C $DistDir 2>$null
    } else {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $DistDir)
    }
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host "  [3/4] Moteur graphique deja installe." -ForegroundColor Cyan
}

Write-Host "  [4/4] Creation des raccourcis et du desinstalleur Windows..." -ForegroundColor Cyan
try {
  $WshShell = New-Object -ComObject WScript.Shell
  $DesktopPath = [Environment]::GetFolderPath("Desktop")
  $Shortcut = $WshShell.CreateShortcut((Join-Path $DesktopPath "Kora.lnk"))
  $Shortcut.TargetPath = Join-Path $TargetDir "Kora.exe"
  $Shortcut.WorkingDirectory = $TargetDir
  $Shortcut.IconLocation = Join-Path $TargetDir "kora.ico"
  $Shortcut.Description = "Kora - Dynamic Island pour Windows (par Mr Paul)"
  $Shortcut.Save()

  # Raccourci dans le Menu Demarrer
  $StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Kora"
  New-Item -ItemType Directory -Path $StartMenuDir -Force | Out-Null
  $StartShortcut = $WshShell.CreateShortcut((Join-Path $StartMenuDir "Kora.lnk"))
  $StartShortcut.TargetPath = Join-Path $TargetDir "Kora.exe"
  $StartShortcut.WorkingDirectory = $TargetDir
  $StartShortcut.IconLocation = Join-Path $TargetDir "kora.ico"
  $StartShortcut.Description = "Kora - Dynamic Island pour Windows (par Mr Paul)"
  $StartShortcut.Save()

  $UninstShortcut = $WshShell.CreateShortcut((Join-Path $StartMenuDir "Desinstaller Kora.lnk"))
  $UninstShortcut.TargetPath = "powershell.exe"
  $UninstShortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$UninstallDest`""
  $UninstShortcut.WorkingDirectory = $TargetDir
  $UninstShortcut.IconLocation = "shell32.dll,31"
  $UninstShortcut.Description = "Desinstaller Kora de votre ordinateur"
  $UninstShortcut.Save()

  # Enregistrement dans les Applications Installees Windows (Parametres Windows -> Applications -> Kora -> Desinstaller)
  $UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Kora"
  New-Item -Path $UninstallKey -Force | Out-Null
  New-ItemProperty -Path $UninstallKey -Name "DisplayName" -Value "Kora - Dynamic Island pour Windows" -PropertyType String -Force | Out-Null
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
Write-Host "  [OK] Kora est installee et lancee en haut de votre ecran !" -ForegroundColor Green
Start-Sleep -Seconds 2
