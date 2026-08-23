@echo off
REM One-click start for machines without PowerShell access.
REM Opens the backend and the UI in their own command windows.
REM
REM   run_dashboard.cmd            start both, shared on the network
REM   run_dashboard.cmd -local     start both, this machine only
REM   run_dashboard.cmd -noproxy   backend ignores any configured proxy
REM   run_dashboard.cmd -check     backend runs the connection check first

cd /d "%~dp0"

echo Opening the Python backend window...
start "HE DIY backend" cmd /k "%~dp0start_backend.cmd" %*

REM Give the backend a moment to bind before the UI starts proxying to it.
timeout /t 4 /nobreak >nul

echo Opening the dashboard UI window...
start "HE DIY dashboard UI" cmd /k "%~dp0start_ui.cmd" %*

echo.
echo Two windows have opened. The UI window prints the address to open.
echo Close both windows to stop the dashboard.
echo.
