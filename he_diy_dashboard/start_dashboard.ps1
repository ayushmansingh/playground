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
#>
[CmdletBinding()]
param(
    [switch]$Local,
    [switch]$OpenFirewall,
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

$backend = Start-Process -FilePath python `
    -ArgumentList @("backend\server.py", "--host", "127.0.0.1", "--port", "$ApiPort") `
    -WorkingDirectory $root -PassThru -WindowStyle Hidden

try {
    Write-Host ""
    Write-Host "HE DIY Dashboard" -ForegroundColor Cyan
    Write-Host "----------------"
    Write-Host "  API      http://127.0.0.1:$ApiPort  (local only, not shared)"

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
