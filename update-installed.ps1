$ErrorActionPreference = 'SilentlyContinue'

Get-Process -Name 'electron', 'nusa-bridge' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 600

$src = 'C:\Users\DELL\Desktop\Progammation\Kora'
$dst = 'C:\Users\DELL\AppData\Local\Kora'

Copy-Item (Join-Path $src 'main.js') $dst -Force
Copy-Item (Join-Path $src 'renderer.js') $dst -Force
Copy-Item (Join-Path $src 'styles.css') $dst -Force
Copy-Item (Join-Path $src 'index.html') $dst -Force
Copy-Item (Join-Path $src 'settings.html') $dst -Force
Copy-Item (Join-Path $src 'nusa-bridge.exe') $dst -Force
Copy-Item (Join-Path $src 'NusaBridge.cs') $dst -Force
Copy-Item (Join-Path $src 'package.json') $dst -Force
Copy-Item (Join-Path $src 'LICENSE.txt') $dst -Force

Write-Host "Kora updated in $dst"

$electronExe = Join-Path $dst 'node_modules\electron\dist\electron.exe'
if (Test-Path $electronExe) {
    Start-Process -FilePath $electronExe -ArgumentList "`"$dst`"" -WorkingDirectory $dst
    Write-Host "Kora restarted successfully!"
}
