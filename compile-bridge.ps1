$ErrorActionPreference = 'Stop'
$fw = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$csc = Join-Path $fw "csc.exe"
$sysRuntime = Get-ChildItem "C:\Windows\Microsoft.NET" -Recurse -Filter "System.Runtime.dll" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
$winRuntime = Join-Path $fw "System.Runtime.WindowsRuntime.dll"
$winmds = Get-ChildItem "C:\Windows\System32\WinMetadata\*.winmd" -ErrorAction SilentlyContinue | ForEach-Object { "/r:`"$($_.FullName)`"" }

$outExe = "C:\Users\DELL\Desktop\Progammation\Kora\nusa-bridge.exe"
$sourceCs = "C:\Users\DELL\Desktop\Progammation\Kora\NusaBridge.cs"

Write-Host "Compiling $sourceCs into $outExe..."
& $csc /nologo /target:exe /platform:anycpu /out:"$outExe" /optimize+ /r:"$winRuntime" /r:"$sysRuntime" $winmds "$sourceCs"
if ($LASTEXITCODE -eq 0) {
    Write-Host "Compilation SUCCESS!"
    Copy-Item $outExe "C:\Users\DELL\Desktop\Progammation\Kora\website\update\nusa-bridge.exe" -Force
    Copy-Item $outExe "C:\Users\DELL\Desktop\Progammation\Kora\docs\update\nusa-bridge.exe" -Force
    Copy-Item $sourceCs "C:\Users\DELL\Desktop\Progammation\Kora\website\update\NusaBridge.cs" -Force
    Copy-Item $sourceCs "C:\Users\DELL\Desktop\Progammation\Kora\docs\update\NusaBridge.cs" -Force
} else {
    Write-Error "Compilation FAILED with code $LASTEXITCODE"
}
