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
  "kora.ico"
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

Write-Host "  [2/4] Compilation locale sécurisée (Microsoft .NET)..." -ForegroundColor Cyan
$fw = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$csc = Join-Path $fw "csc.exe"
$sysRuntime = Get-ChildItem "C:\Windows\Microsoft.NET" -Recurse -Filter "System.Runtime.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
$winmds = Get-ChildItem "C:\Windows\System32\WinMetadata\*.winmd" | ForEach-Object { "/r:`"$($_.FullName)`"" }

& $csc /nologo /target:exe /out:"$(Join-Path $TargetDir 'nusa-bridge.exe')" /optimize+ /r:"$fw\System.Runtime.WindowsRuntime.dll" /r:"$sysRuntime" $winmds "$(Join-Path $TargetDir 'NusaBridge.cs')" | Out-Null
& $csc /nologo /target:winexe /out:"$(Join-Path $TargetDir 'Kora.exe')" /win32icon:"$(Join-Path $TargetDir 'kora.ico')" /optimize+ "$(Join-Path $TargetDir 'KoraLauncher.cs')" | Out-Null

$ElectronExe = Join-Path $DistDir "electron.exe"
if (-not (Test-Path $ElectronExe)) {
  # Check if already present in Desktop\Progammation\Kora
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

Write-Host "  [4/4] Création du raccourci 'Kora' sur le Bureau et lancement..." -ForegroundColor Cyan
try {
  $WshShell = New-Object -ComObject WScript.Shell
  $DesktopPath = [Environment]::GetFolderPath("Desktop")
  $Shortcut = $WshShell.CreateShortcut((Join-Path $DesktopPath "Kora.lnk"))
  $Shortcut.TargetPath = Join-Path $TargetDir "Kora.exe"
  $Shortcut.WorkingDirectory = $TargetDir
  $Shortcut.IconLocation = Join-Path $TargetDir "kora.ico"
  $Shortcut.Description = "Kora — Une encoche vivante pour Windows (par Mr Paul)"
  $Shortcut.Save()
} catch {}

Start-Process -FilePath (Join-Path $TargetDir "Kora.exe") -WorkingDirectory $TargetDir
Write-Host ""
Write-Host "  ✓ Kora est installée et lancée en haut de votre écran !" -ForegroundColor Green
Start-Sleep -Seconds 2
