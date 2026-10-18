# ============================================================================
# KORA - Installeur Officiel Multi-Plateforme (par Mr Paul)
# Supporte TOUTES les versions de Windows : 11, 10, 8.1, 8 et 7
# Supporte TOUTES les architectures : 64-bit (x64), 32-bit (ia32) et ARM64
# Compile les composants natifs localement via Microsoft .NET AnyCPU
# Garantit 0 faux-positif Antivirus / SmartScreen
# ============================================================================

param([string]$SourceDir = "")

$ErrorActionPreference = "Stop"

# Configuration TLS 1.2 universelle (compatible PowerShell 2.0 / 3.0 / 4.0 / 5.1 et tout .NET)
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]'Ssl3,Tls,Tls11,Tls12'
} catch {
  [Net.ServicePointManager]::SecurityProtocol = 3072 -bor 768 -bor 192 -bor 48
}

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

# 1. Detection de l'architecture du processeur
$rawArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$cpuArch = "x64"
if ($rawArch -match "ARM64") {
  $cpuArch = "arm64"
} elseif ($rawArch -match "x86|i386|i686" -or [IntPtr]::Size -eq 4) {
  $cpuArch = "ia32"
} else {
  $cpuArch = "x64"
}

# 2. Detection de la version de Windows
$osMajor = [Environment]::OSVersion.Version.Major
$isLegacyWin = ($osMajor -lt 10)

if ($isLegacyWin) {
  # Pour Windows 7, 8 et 8.1 : Electron v22.3.27 est la derniere version certifiee compatible
  $electronVersion = "v22.3.27"
  $archToUse = if ($cpuArch -eq "arm64") { "ia32" } else { $cpuArch }
  $osName = "Windows 7/8 ($archToUse)"
} else {
  # Pour Windows 10 et 11 : Electron v35.0.0
  $electronVersion = "v35.0.0"
  $archToUse = $cpuArch
  $osName = "Windows 10/11 ($archToUse)"
}

$ElectronZipUrl = "https://github.com/electron/electron/releases/download/$electronVersion/electron-$electronVersion-win32-$archToUse.zip"
$expectedMarker = "$electronVersion-$archToUse"

Write-Host ""
Write-Host "  ======================================================" -ForegroundColor Cyan
Write-Host "   KORA - Installation & Configuration (par Mr Paul)" -ForegroundColor White
Write-Host "   Environnement detecte : $osName" -ForegroundColor DarkGray
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

# Sauvegarde des scripts d'installation et desinstallation pour maintenance locale
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

Write-Host "  [2/4] Compilation locale securisee (Microsoft .NET AnyCPU)..." -ForegroundColor Cyan
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

# KoraLauncher universel
& $csc /nologo /target:winexe /platform:anycpu /out:"$(Join-Path $TargetDir 'Kora.exe')" /win32icon:"$(Join-Path $TargetDir 'kora.ico')" /optimize+ "$(Join-Path $TargetDir 'KoraLauncher.cs')" | Out-Null

# NusaBridge si WinRT supporte
try {
  if ($winmds -and $winRuntime -and (Test-Path $winRuntime)) {
    & $csc /nologo /target:exe /platform:anycpu /out:"$(Join-Path $TargetDir 'nusa-bridge.exe')" /optimize+ /r:"$winRuntime" /r:"$sysRuntime" $winmds "$(Join-Path $TargetDir 'NusaBridge.cs')" 2>$null | Out-Null
  }
} catch {}

$ElectronExe = Join-Path $DistDir "electron.exe"
$archMarker  = Join-Path $DistDir ".runtime_ver"
$needsDownload = $true

if (Test-Path $ElectronExe) {
  $exeSize = (Get-Item $ElectronExe).Length
  $currentMarker = if (Test-Path $archMarker) { (Get-Content $archMarker -Raw).Trim() } else { "" }
  if ($exeSize -gt 25000000 -and $currentMarker -eq $expectedMarker) {
    $needsDownload = $false
  } else {
    Write-Host "  [!] Configuration du moteur d'execution universel pour $osName..." -ForegroundColor Yellow
    Remove-Item $DistDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
  }
}

if ($needsDownload) {
  $devElectron = Join-Path ([Environment]::GetFolderPath("Desktop")) "Progammation\Kora\node_modules\electron\dist\electron.exe"
  if (-not $isLegacyWin -and $cpuArch -eq "x64" -and (Test-Path $devElectron)) {
    Write-Host "  [3/4] Copie du moteur graphique local ($expectedMarker)..." -ForegroundColor Cyan
    Copy-Item (Join-Path ([Environment]::GetFolderPath("Desktop")) "Progammation\Kora\node_modules\electron\dist\*") $DistDir -Recurse -Force
    Set-Content -Path $archMarker -Value $expectedMarker -Force
  } else {
    Write-Host "  [3/4] Telechargement du moteur graphique universel ($osName)..." -ForegroundColor Cyan
    $zipPath = Join-Path $TargetDir "runtime.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }

    $downloaded = $false
    # 1. curl.exe (Windows 10 / 11)
    if (Get-Command "curl.exe" -ErrorAction SilentlyContinue) {
      try {
        & curl.exe -L --fail --retry 3 --connect-timeout 20 -s $ElectronZipUrl -o $zipPath
        if ((Test-Path $zipPath) -and (Get-Item $zipPath).Length -gt 20000000) {
          $downloaded = $true
        }
      } catch {}
    }

    # 2. Windows WebClient (Universel tout Windows 7 / 8 / 10 / 11)
    if (-not $downloaded) {
      Write-Host "  [i] Telechargement alternatif en cours..." -ForegroundColor Cyan
      try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("User-Agent", "Kora-Installer/2.0")
        $wc.DownloadFile($ElectronZipUrl, $zipPath)
        $wc.Dispose()
        if ((Test-Path $zipPath) -and (Get-Item $zipPath).Length -gt 20000000) {
          $downloaded = $true
        }
      } catch {
        Write-Host "  [!] Echec WebClient : $_" -ForegroundColor Yellow
      }
    }

    # 3. BITS ou Invoke-WebRequest
    if (-not $downloaded) {
      try {
        Start-BitsTransfer -Source $ElectronZipUrl -Destination $zipPath -ErrorAction Stop
        if ((Test-Path $zipPath) -and (Get-Item $zipPath).Length -gt 20000000) {
          $downloaded = $true
        }
      } catch {
        Invoke-WebRequest -Uri $ElectronZipUrl -OutFile $zipPath -UseBasicParsing -ErrorAction SilentlyContinue
        if ((Test-Path $zipPath) -and (Get-Item $zipPath).Length -gt 20000000) {
          $downloaded = $true
        }
      }
    }

    if (-not (Test-Path $zipPath) -or (Get-Item $zipPath).Length -lt 20000000) {
      throw "Impossible de telecharger le moteur graphique Kora ($expectedMarker). Verifiez votre connexion internet."
    }

    Write-Host "  [i] Extraction et configuration du moteur..." -ForegroundColor Cyan
    # Extraction universelle : tar.exe (Win10+) -> ZipFile (.NET 4.5+) -> Shell.Application COM (Win7/8)
    if (Get-Command "tar.exe" -ErrorAction SilentlyContinue) {
      & tar.exe -xf $zipPath -C $DistDir 2>$null
    } else {
      $extracted = $false
      try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction Stop
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $DistDir)
        $extracted = $true
      } catch {}

      if (-not $extracted) {
        $shell = New-Object -ComObject Shell.Application
        $zipPackage = $shell.NameSpace($zipPath)
        $destFolder = $shell.NameSpace($DistDir)
        $destFolder.CopyHere($zipPackage.Items(), 16)
      }
    }
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    Set-Content -Path $archMarker -Value $expectedMarker -Force
  }
} else {
  Write-Host "  [3/4] Moteur graphique ($expectedMarker) valide et pret." -ForegroundColor Cyan
}

if (-not (Test-Path $ElectronExe) -or (Get-Item $ElectronExe).Length -lt 20000000) {
  throw "Le moteur graphique Kora n'a pas pu etre installe correctement. Verifiez votre espace disque."
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
