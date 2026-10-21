$ErrorActionPreference = 'Stop'

Get-Process -Name 'electron', 'nusa-bridge' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 1000

$src = 'C:\Users\DELL\Desktop\Progammation\Kora'
$dst = 'C:\Users\DELL\AppData\Local\Kora'

$files = @(
  'main.js',
  'preload.js',
  'renderer.js',
  'styles.css',
  'index.html',
  'settings.html',
  'settings.js',
  'settings.css',
  'nusa-bridge.exe',
  'NusaBridge.cs',
  'package.json',
  'kora-logo.png',
  'kora.ico',
  'LICENSE.txt'
)

foreach ($f in $files) {
  $s = Join-Path $src $f
  if (Test-Path $s) {
    Copy-Item $s $dst -Force
  }
}

Write-Host "Kora files updated successfully in $dst"

$electronExe = Join-Path $dst 'node_modules\electron\dist\electron.exe'
if (Test-Path $electronExe) {
    Start-Process -FilePath $electronExe -ArgumentList "`"$dst`"" -WorkingDirectory $dst
    Write-Host "Kora restarted successfully!"
}
