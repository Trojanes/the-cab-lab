# The Cab Lab - create "The Cab Lab.exe" next to electron.exe and a desktop shortcut to it.
# Run:  npm run shortcut   (or double-click TheCabLab.bat once; it calls this too)

$ErrorActionPreference = "Stop"
$appDir = $PSScriptRoot
$distDir = Join-Path $appDir "node_modules\electron\dist"
$electronExe = Join-Path $distDir "electron.exe"
$labExe = Join-Path $distDir "The Cab Lab.exe"

if (-not (Test-Path $electronExe)) {
  Write-Error "electron.exe not found. Run 'node ensure-electron.js' first."
}

# Electron finds its resources relative to the executable directory, so a
# renamed copy in the same folder behaves identically but shows a proper name
# in the taskbar and Task Manager.
if (-not (Test-Path $labExe) -or (Get-Item $labExe).Length -ne (Get-Item $electronExe).Length) {
  Copy-Item -LiteralPath $electronExe -Destination $labExe -Force
}

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop "The Cab Lab.lnk"

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $labExe
$lnk.Arguments = '"' + $appDir + '"'
$lnk.WorkingDirectory = $appDir
$lnk.Description = "The Cab Lab - cabinet CAD workspace"
$lnk.IconLocation = "$labExe,0"
$lnk.Save()

Write-Output "Shortcut created: $lnkPath"
Write-Output "Target: $labExe `"$appDir`""
