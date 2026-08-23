<#
.SYNOPSIS
    Starts the HE DIY Dashboard and shares it on the local network.

.DESCRIPTION
    The Node UI binds to every interface so colleagues on the same LAN can open
    it. The Python API stays bound to 127.0.0.1 and is reached only through the
    UI server's proxy, so the Redash key and the raw API are never exposed
    directly to the network.

    The dashboard has no login. Only run it on a trusted network.

.EXAMPLE
    .\start_dashboard.ps1
    Shares the dashboard on the LAN and prints the URL to send round.

.EXAMPLE
    .\start_dashboard.ps1 -Local
    Loopback only — nobody else can reach it.

.EXAMPLE
    .\start_dashboard.ps1 -OpenFirewall
    Also adds the inbound Windows Firewall rule. Needs an elevated PowerShell.

.EXAMPLE
    .\start_dashboard.ps1 -Check
    Runs check_connection.py with the same interpreter and environment the
    backend gets, then exits. Use this when the dashboard reports a connection
    failure but running the check by hand says everything is fine -- it rules
    out the two processes seeing different settings.

.EXAMPLE
    .\start_dashboard.ps1 -NoProxy
    Makes the Redash calls go direct, ignoring any proxy Windows has configured.
    Use this when the browser reaches Redash but Refresh Redash fails with
    "connection refused": Python picks up the Windows Internet Settings proxy on
    its own, and on the company network that proxy is often stale or unused.
    Run check_connection.py first if you are not sure which applies.

.EXAMPLE
    .\start_dashboard.ps1 -Proxy "http://proxy.example.com:8080"
    Routes the Redash calls through a corporate proxy. Needed when the browser
    reaches Redash but Refresh Redash fails with "connection refused": Python
    reads only the manual proxy setting from Windows, not an auto-config (PAC)
    script, so a PAC-based proxy has to be named explicitly.
#>
[CmdletBinding()]
param(
    [switch]$Local,
    [switch]$OpenFirewall,
    [string]$Proxy,
    [switch]$NoProxy,
    [switch]$Check,
    [int]$UiPort = 5174,
    [int]$ApiPort = 8765
)

$ErrorActionPreference = "Stop"

$root = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

# The UI is the only thing that listens on the network; the API stays local.
$uiBind = if ($Local) { "127.0.0.1" } else { "0.0.0.0" }
$env:UI_HOST = $uiBind
$env:UI_PORT = "$UiPort"
$env:API_HOST = "127.0.0.1"
$env:API_PORT = "$ApiPort"

function Get-LanAddress {
    try {
        Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and
                $_.InterfaceAlias -notmatch 'Loopback|vEthernet|VirtualBox|VMware|WSL'
            } |
            Select-Object -ExpandProperty IPAddress
    }
    catch {
        # Older Windows without the NetTCPIP module.
        [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
            Where-Object { $_.AddressFamily -eq 'InterNetwork' -and $_.IPAddressToString -notmatch '^(127\.|169\.254\.)' } |
            Select-Object -ExpandProperty IPAddressToString
    }
}

function Test-Elevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-PythonCommand {
    # A fresh Windows box may have no python at all, or the Microsoft Store
    # stub, which sits on PATH and does nothing useful. Only accept a candidate
    # that actually reports a Python 3 version.
    foreach ($candidate in @(
            @{ File = "python";  Prefix = @() },
            @{ File = "py";      Prefix = @("-3") },
            @{ File = "python3"; Prefix = @() })) {
        try {
            $reported = & $candidate.File @($candidate.Prefix + "--version") 2>&1
            if ($LASTEXITCODE -eq 0 -and "$reported" -match "Python 3") {
                $candidate.Version = "$reported".Trim()
                return $candidate
            }
        }
        catch { }
    }
    return $null
}

$python = Resolve-PythonCommand
if (-not $python) {
    Write-Host ""
    Write-Error @"
Python 3 was not found.

Install it from https://www.python.org/downloads/ and tick
"Add python.exe to PATH" on the first screen of the installer.
Then close this window, open a new PowerShell, and run this script again.
"@
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host ""
    Write-Error @"
Node.js was not found.

Install the LTS build from https://nodejs.org/ and accept the defaults.
Then close this window, open a new PowerShell, and run this script again.
"@
    exit 1
}

$ruleName = "HE DIY Dashboard ($UiPort)"
$ruleExists = $false
try { $ruleExists = [bool](Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) } catch { }

if ($OpenFirewall -and -not $Local -and -not $ruleExists) {
    if (Test-Elevated) {
        # Private and Domain only, deliberately not Public: this should be
        # reachable from the office LAN, never from a coffee-shop network.
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $UiPort -Profile Private, Domain | Out-Null
        Write-Host "Added firewall rule '$ruleName' for TCP $UiPort (Private and Domain profiles)." -ForegroundColor Green
        $ruleExists = $true
    }
    else {
        Write-Warning "-OpenFirewall needs an elevated PowerShell. Re-run 'Run as Administrator', or add the rule manually (command printed below)."
    }
}

# Python's urllib picks up proxy environment variables and the *manual* Windows
# proxy setting, but not an auto-config (PAC) script or WPAD. On a network that
# uses one, Redash is unreachable from Python even though the browser is fine,
# so -Proxy names it explicitly. Start-Process inherits these variables.
if ($Proxy -and $NoProxy) {
    Write-Error "Use either -Proxy or -NoProxy, not both."
    exit 1
}
if ($Proxy) {
    $env:HTTPS_PROXY = $Proxy
    $env:HTTP_PROXY = $Proxy
    $env:NO_PROXY = $null
}
elseif ($NoProxy) {
    # getproxies() is getproxies_environment() OR getproxies_registry(), and it
    # takes the first that is non-empty. NO_PROXY on its own is enough to make
    # the environment win, so the Windows registry proxy is never consulted and
    # the request goes direct.
    $env:HTTP_PROXY = $null
    $env:HTTPS_PROXY = $null
    $env:ALL_PROXY = $null
    $env:NO_PROXY = "*"
}
$activeProxy = if ($NoProxy) { "none (direct)" } elseif ($env:HTTPS_PROXY) { $env:HTTPS_PROXY } else { $null }

if ($Check) {
    # Same interpreter, same environment, same working directory the backend
    # would get -- so a difference between this and running the script by hand
    # is itself the finding.
    Write-Host ""
    Write-Host "Running the connection check as the backend would see it." -ForegroundColor Cyan
    if ($activeProxy) { Write-Host "  Proxy for this run: $activeProxy" }
    Write-Host ""
    Push-Location $root
    try { & $python.File @($python.Prefix + @("check_connection.py")) }
    finally { Pop-Location }
    exit $LASTEXITCODE
}

function Test-PortInUse([int]$Port) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $false
    }
    catch { return $true }
}

function Show-PortHolder([int]$Port) {
    try {
        $owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($owner in $owners) {
            $process = Get-Process -Id $owner -ErrorAction SilentlyContinue
            if ($process) { Write-Host "    PID $owner  $($process.ProcessName)" }
        }
        Write-Host "  Stop it with:  Stop-Process -Id <PID> -Force"
    }
    catch { }
}

# The backend runs in a hidden window, so if it fails to start nothing is shown
# and the UI silently proxies to whatever else holds the port -- usually an
# older copy still running from a previous launch. Refuse to start in that
# state rather than serve stale results from a process nobody can see.
foreach ($entry in @(@{ Port = $ApiPort; Name = "Python API" }, @{ Port = $UiPort; Name = "dashboard UI" })) {
    if (Test-PortInUse $entry.Port) {
        Write-Host ""
        Write-Host "Port $($entry.Port) is already in use, so the $($entry.Name) cannot start." -ForegroundColor Red
        Write-Host "  A dashboard is probably already running. Close it, or find the process:" -ForegroundColor Yellow
        Show-PortHolder $entry.Port
        Write-Host "  Or start on different ports:  .\start_dashboard.ps1 -UiPort 5175 -ApiPort 8766" -ForegroundColor Yellow
        Write-Host ""
        exit 1
    }
}

# Keep the backend's output where it can be read after the fact.
$backendLog = Join-Path $root "backend.log"
$backendErrorLog = Join-Path $root "backend.err.log"

$backend = Start-Process -FilePath $python.File `
    -ArgumentList @($python.Prefix + @("backend\server.py", "--host", "127.0.0.1", "--port", "$ApiPort")) `
    -WorkingDirectory $root -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $backendLog -RedirectStandardError $backendErrorLog

# Confirm it actually came up instead of assuming it did.
$ready = $false
foreach ($attempt in 1..20) {
    Start-Sleep -Milliseconds 400
    if ($backend.HasExited) { break }
    if (-not (Test-PortInUse $ApiPort)) { continue }
    $ready = $true
    break
}

if (-not $ready) {
    Write-Host ""
    Write-Host "The Python backend did not start." -ForegroundColor Red
    if (Test-Path $backendErrorLog) {
        $errorText = Get-Content $backendErrorLog -Tail 20
        if ($errorText) {
            Write-Host "  Last lines of backend.err.log:" -ForegroundColor Yellow
            $errorText | ForEach-Object { Write-Host "    $_" }
        }
    }
    Write-Host "  Full log: $backendErrorLog" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

try {
    Write-Host ""
    Write-Host "HE DIY Dashboard" -ForegroundColor Cyan
    Write-Host "----------------"
    Write-Host "  Using    $($python.Version) and Node $(node --version)"
    Write-Host "  API      http://127.0.0.1:$ApiPort  (local only, not shared)"
    if ($activeProxy) {
        Write-Host "  Proxy    $activeProxy  (used for Redash refresh)"
    }

    if ($Local) {
        Write-Host "  Dashboard  http://127.0.0.1:$UiPort  (this machine only)"
    }
    else {
        Write-Host "  On this machine   http://127.0.0.1:$UiPort"
        $addresses = @(Get-LanAddress)
        if ($addresses.Count -gt 0) {
            Write-Host ""
            Write-Host "  Share this with your team:" -ForegroundColor Green
            foreach ($address in $addresses) {
                Write-Host "    http://${address}:$UiPort" -ForegroundColor Green
            }
        }
        else {
            Write-Warning "Could not detect a LAN address. Run 'ipconfig' and use the IPv4 address of your active adapter."
        }

        if (-not $ruleExists) {
            Write-Host ""
            Write-Host "  If colleagues cannot connect, Windows Firewall is blocking the port." -ForegroundColor Yellow
            Write-Host "  Run this once in an elevated PowerShell:" -ForegroundColor Yellow
            Write-Host "    New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $UiPort -Profile Private,Domain" -ForegroundColor Yellow
        }

        Write-Host ""
        Write-Host "  Note: the dashboard has no login. Anyone on this network who opens" -ForegroundColor DarkYellow
        Write-Host "  the link can see agent-level data and press Refresh Redash." -ForegroundColor DarkYellow
        Write-Host "  Use -Local to keep it to this machine." -ForegroundColor DarkYellow
    }

    Write-Host ""
    Write-Host "Press Ctrl+C to stop."
    Write-Host ""

    node "$root\frontend\server.js"
}
finally {
    Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue
}
