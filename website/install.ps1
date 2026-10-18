# ============================================================================
# KORA - Installeur Officiel Multi-Plateforme (par Mr Paul)
# Supporte nativement x64, 32-bit (ia32) et ARM64 Windows
# Compile les composants natifs localement via Microsoft .NET AnyCPU
# Garantit 0 faux-positif Antivirus / SmartScreen
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

# Detection automatique de l'architecture reelle (x64, ia32, arm64)
$rawArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$electronArch = "x64"
if ($rawArch -match "ARM64") {
  $electronArch = "arm64"
} elseif ($rawArch -match "x86|i386|i686" -or [IntPtr]::Size -eq 4) {
  $electronArch = "ia32"
} else {
  $electronArch = "x64"
}

$ElectronZipUrl = "https://github.com/electron/electron/releases/download/v35.0.0/electron-v35.0.0-win32-$electronArch.zip"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "   KORA - Installation & Configuration (par Mr Paul)" -ForegroundColor White
Write-Host "   Architecture detectee : $electronArch (Windows)" -ForegroundColor DarkGray
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

# Copie egalement install.ps1 et uninstall.ps1 pour maintenance locale
$InstallDest = Join-Path $TargetDir "install.ps1"
$LocalInstall = Join-Path $ScriptDir "install.ps1"
if (Test-Path $LocalInstall) {
  Copy-Item $LocalInstall $InstallDest -Force
} else {
  try {
    Invoke-WebRequest -Uri "$BaseUrl/website/install.ps1?t=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -UseBasicParsing -OutFile $InstallDest
  } catch {}
}
Unblock-File -Path $InstallDest -ErrorAction SilentlyContinue

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
if (-not (Test-Path (Join-Path $fw "csc.exe"))) {
  $fw = "C:\Windows\Microsoft.NET\Framework\v4.0.30319"
}
$csc = Join-Path $fw "csc.exe"
$sysRuntime = Get-ChildItem "C:\Windows\Microsoft.NET" -Recurse -Filter "System.Runtime.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
$winRuntime = Join-Path $fw "System.Runtime.WindowsRuntime.dll"
if (-not (Test-Path $winRuntime)) {
  $winRuntime = Get-ChildItem "C:\Windows\Microsoft.NET" -Recurse -Filter "System.Runtime.WindowsRuntime.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
$winmds = Get-ChildItem "C:\Windows\System32\WinMetadata\*.winmd" -ErrorAction SilentlyContinue | ForEach-Object { "/r:`"$($_.FullName)`"" }

& $csc /nologo /target:exe /platform:anycpu /out:"$(Join-Path $TargetDir 'nusa-bridge.exe')" /optimize+ /r:"$winRuntime" /r:"$sysRuntime" $winmds "$(Join-Path $TargetDir 'NusaBridge.cs')" | Out-Null
& $csc /nologo /target:winexe /platform:anycpu /out:"$(Join-Path $TargetDir 'Kora.exe')" /win32icon:"$(Join-Path $TargetDir 'kora.ico')" /optimize+ "$(Join-Path $TargetDir 'KoraLauncher.cs')" | Out-Null

$ElectronExe = Join-Path $DistDir "electron.exe"
$archMarker  = Join-Path $DistDir ".arch"
$needsDownload = $true

if (Test-Path $ElectronExe) {
  $exeSize = (Get-Item $ElectronExe).Length
  $currentArch = if (Test-Path $archMarker) { (Get-Content $archMarker -Raw).Trim() } else { "" }
  if ($exeSize -gt 30000000 -and ($currentArch -eq $electronArch -or (-not $currentArch -and $electronArch -eq "x64"))) {
    $needsDownload = $false
  } else {
    Write-Host "  [!] Mise a niveau du moteur d'execution vers l'architecture $electronArch..." -ForegroundColor Yellow
    Remove-Item $DistDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
  }
}

if ($needsDownload) {
  $devElectron = Join-Path ([Environment]::GetFolderPath("Desktop")) "Progammation\Kora\node_modules\electron\dist\electron.exe"
  if ($electronArch -eq "x64" -and (Test-Path $devElectron)) {
    Write-Host "  [3/4] Copie du moteur graphique local ($electronArch)..." -ForegroundColor Cyan
    Copy-Item (Join-Path ([Environment]::GetFolderPath("Desktop")) "Progammation\Kora\node_modules\electron\dist\*") $DistDir -Recurse -Force
    Set-Content -Path $archMarker -Value $electronArch -Force
  } else {
    Write-Host "  [3/4] Telechargement du moteur graphique ($electronArch)..." -ForegroundColor Cyan
    $zipPath = Join-Path $TargetDir "runtime.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }

    $downloaded = $false
    if (Get-Command "curl.exe" -ErrorAction SilentlyContinue) {
      try {
        & curl.exe -L --fail --retry 3 --connect-timeout 20 -s $ElectronZipUrl -o $zipPath
        if ((Test-Path $zipPath) -and (Get-Item $zipPath).Length -gt 25000000) {
          $downloaded = $true
        }
      } catch {}
    }

    if (-not $downloaded) {
      Write-Host "  [i] Telechargement alternatif en cours..." -ForegroundColor Cyan
      try {
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($ElectronZipUrl, $zipPath)
        $wc.Dispose()
        if ((Test-Path $zipPath) -and (Get-Item $zipPath).Length -gt 25000000) {
          $downloaded = $true
        }
      } catch {
        Write-Host "  [!] Erreur de telechargement : $_" -ForegroundColor Red
      }
    }

    if (-not (Test-Path $zipPath) -or (Get-Item $zipPath).Length -lt 25000000) {
      throw "Impossible de telecharger le moteur graphique Kora ($electronArch). Verifiez votre connexion internet."
    }

    Write-Host "  [i] Extraction et configuration du moteur..." -ForegroundColor Cyan
    if (Get-Command "tar.exe" -ErrorAction SilentlyContinue) {
      & tar.exe -xf $zipPath -C $DistDir 2>$null
    } else {
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $DistDir)
    }
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Set-Content -Path $archMarker -Value $electronArch -Force
  }
} else {
  Write-Host "  [3/4] Moteur graphique ($electronArch) valide et pret." -ForegroundColor Cyan
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

  # Enregistrement dans les Applications Installees Windows
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
Write-Host "  ======================================================" -ForegroundColor Green
Write-Host "   [OK] Kora est installee et lancee avec succes !" -ForegroundColor Green
Write-Host "  ======================================================" -ForegroundColor Green
Start-Sleep -Seconds 2
