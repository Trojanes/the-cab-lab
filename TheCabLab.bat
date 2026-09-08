@echo off
rem The Cab Lab - first-time setup + launch.
rem After this runs once, use the "The Cab Lab" shortcut on the desktop.
cd /d "%~dp0"
if not exist "node_modules\electron\package.json" (
  echo Installing The Cab Lab dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)
node ensure-electron.js
if errorlevel 1 (
  echo Electron binary could not be prepared.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create-desktop-shortcut.ps1"
start "" "%~dp0node_modules\electron\dist\The Cab Lab.exe" "%~dp0."
