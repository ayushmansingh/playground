@echo off
REM Double-click this on Windows. It runs start_dashboard.ps1 without the
REM PowerShell execution policy blocking a script that came out of a zip.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_dashboard.ps1" %*
if errorlevel 1 pause
