@echo off
REM Starts the dashboard UI (the Node server) for the two-terminal workflow.
REM
REM   start_ui.cmd           share on the local network (default)
REM   start_ui.cmd -local    this machine only
REM
REM Only this server listens on the network. The Python API stays on
REM 127.0.0.1 and is reached through this server's proxy.

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "UI_BIND=0.0.0.0"
:parse
if /i "%~1"=="-local" set "UI_BIND=127.0.0.1"
if not "%~1"=="" ( shift & goto parse )

python -c "import socket,sys; s=socket.socket(); s.settimeout(1); r=s.connect_ex(('127.0.0.1',5174)); s.close(); sys.exit(1 if r==0 else 0)"
if errorlevel 1 (
    echo.
    echo   Port 5174 is already in use - the dashboard UI is already running.
    echo   Stop it first:
    echo.
    netstat -ano ^| findstr ":5174" ^| findstr LISTENING
    echo.
    echo     taskkill /PID ^<pid^> /F
    echo.
    exit /b 1
)

set "UI_HOST=%UI_BIND%"
set "UI_PORT=5174"
set "API_HOST=127.0.0.1"
set "API_PORT=8765"

echo.
echo === HE DIY Dashboard UI ===
echo   On this machine   http://127.0.0.1:5174
if "%UI_BIND%"=="0.0.0.0" (
    echo.
    echo   Share these with your team:
    for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
        for /f "tokens=*" %%B in ("%%A") do echo     http://%%B:5174
    )
    echo.
    echo   If nobody can connect, Windows Firewall is blocking the port.
    echo   Run this once in an Administrator command prompt:
    echo     netsh advfirewall firewall add rule name="HE DIY Dashboard" dir=in action=allow protocol=TCP localport=5174 profile=private,domain
    echo.
    echo   The dashboard has no login. Only share it on a trusted network.
    echo   Use  start_ui.cmd -local  to keep it to this machine.
) else (
    echo   Local only - not shared on the network.
)
echo.
echo   Start the backend in another window with:  start_backend.cmd
echo   Press Ctrl+C to stop.
echo.

node frontend\server.js
