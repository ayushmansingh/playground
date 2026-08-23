@echo off
REM Starts the Python backend for the two-terminal workflow, and shows the
REM network settings the backend will actually use.
REM
REM Proxy variables live per terminal window, so a backend started in one
REM window can behave differently from a check run in another. This prints
REM them before starting, so the two can never silently disagree.
REM
REM   start_backend.cmd            start it, showing the environment
REM   start_backend.cmd -check     run the full connection check first
REM   start_backend.cmd -noproxy   ignore any proxy, connect directly
REM   start_backend.cmd -noproxy -check

setlocal
cd /d "%~dp0"

set "RUN_CHECK="
set "CLEAR_PROXY="
:parse
if /i "%~1"=="-check"   set "RUN_CHECK=1"
if /i "%~1"=="-noproxy" set "CLEAR_PROXY=1"
if not "%~1"=="" ( shift & goto parse )

if defined CLEAR_PROXY (
    set "HTTP_PROXY="
    set "HTTPS_PROXY="
    set "ALL_PROXY="
    set "NO_PROXY=*"
    echo Proxy variables cleared for this window - connecting directly.
    echo.
)

echo === Network settings this backend will use ===
if defined HTTP_PROXY  (echo   HTTP_PROXY  = %HTTP_PROXY%)  else (echo   HTTP_PROXY  = ^(not set^))
if defined HTTPS_PROXY (echo   HTTPS_PROXY = %HTTPS_PROXY%) else (echo   HTTPS_PROXY = ^(not set^))
if defined ALL_PROXY   (echo   ALL_PROXY   = %ALL_PROXY%)   else (echo   ALL_PROXY   = ^(not set^))
if defined NO_PROXY    (echo   NO_PROXY    = %NO_PROXY%)    else (echo   NO_PROXY    = ^(not set^))
echo.
if defined HTTPS_PROXY (
    echo   NOTE: HTTPS_PROXY is set in this window, so the backend will send
    echo         Redash traffic through it. If that proxy is not reachable the
    echo         refresh fails with WinError 10061. Use -noproxy to skip it.
    echo.
)

REM Windows lets a second process bind a port that is already in use, because
REM http.server sets SO_REUSEADDR and Windows reads that as permission to share.
REM Both copies then report "listening" and requests go to whichever wins, so a
REM leftover backend can answer for the one you just started. Refuse to add to
REM the pile.
python -c "import socket,sys; s=socket.socket(); s.settimeout(1); r=s.connect_ex(('127.0.0.1',8765)); s.close(); sys.exit(1 if r==0 else 0)"
if errorlevel 1 (
    echo.
    echo   Port 8765 is already in use, so a backend is already running.
    echo   Windows would let this one bind anyway, and requests would go to
    echo   whichever copy wins - which is how a stale backend ends up
    echo   answering for a new one. Stop it first:
    echo.
    netstat -ano ^| findstr ":8765" ^| findstr LISTENING
    echo.
    echo     taskkill /PID ^<pid^> /F
    echo.
    exit /b 1
)

if defined RUN_CHECK (
    echo === Connection check, run in this same window ===
    python check_connection.py
    echo.
    echo === Starting the backend ===
    echo.
)

python backend\server.py --host 127.0.0.1 --port 8765
