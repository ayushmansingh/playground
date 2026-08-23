# Running the HE DIY Dashboard from scratch

Start-to-finish on a machine that has never run this before. Ten minutes,
most of it waiting for two installers.

## 1. Install Python 3

Check whether you already have it. In PowerShell:

```powershell
python --version
```

If that prints something like `Python 3.11.9`, skip to step 2.

If it prints nothing, opens the Microsoft Store, or errors, install Python from
<https://www.python.org/downloads/>. **On the first screen of the installer,
tick "Add python.exe to PATH"** before pressing Install — almost every "python
is not recognised" problem traces back to that box.

Close PowerShell and open a new one afterwards, or the new PATH will not apply.

## 2. Install Node.js

```powershell
node --version
```

If that prints something like `v20.11.1`, skip to step 3. Otherwise install the
**LTS** build from <https://nodejs.org/> and accept the defaults. Again, open a
new PowerShell window afterwards.

There is nothing to `npm install`. The dashboard has no dependencies.

## 3. Extract the zip

Right-click the zip, **Extract All**, and pick somewhere with a short path such
as `C:\Tools`. Avoid running it from inside the zip preview window — Windows
extracts to a temporary folder and the snapshot data will not be found.

You should end up with a folder containing `backend`, `frontend`, `data` and
`start_dashboard.cmd`.

> **No PowerShell?** Skip to [RUN_WITH_CMD.md](RUN_WITH_CMD.md) — the whole
> thing runs from `cmd.exe` with `run_dashboard.cmd`.

## 4. Start it

**The easy way:** double-click **`start_dashboard.cmd`**.

**From PowerShell**, if you prefer:

```powershell
cd C:\Tools\he_diy_dashboard
.\start_dashboard.ps1
```

If PowerShell refuses with *"running scripts is disabled on this system"*, that
is Windows blocking a script that came out of a zip. Either use
`start_dashboard.cmd`, which sidesteps it, or allow scripts for this one window:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\start_dashboard.ps1
```

That lasts until you close the window and changes nothing permanently.

A successful start looks like this:

```text
HE DIY Dashboard
----------------
  Using    Python 3.11.9 and Node v20.11.1
  API      http://127.0.0.1:8765  (local only, not shared)
  On this machine   http://127.0.0.1:5174

  Share this with your team:
    http://10.14.32.87:5174
```

## 5. Open it

Go to <http://127.0.0.1:5174> in Chrome or Edge.

The dashboard loads from the snapshot bundled in `data/snapshots`, so it works
straight away with no key, no VPN and no internet. Internet Explorer will not
work; any current Chrome, Edge or Firefox will.

Stop the dashboard with `Ctrl+C` in the window it is running in.

## 6. Let the team in

The launcher already shares it on your network and prints the address in step 4.
Send colleagues that `http://<your-ip>:5174` link.

If they cannot connect, Windows Firewall is blocking the port. Run this once in
an **elevated** PowerShell (right-click PowerShell, Run as Administrator):

```powershell
New-NetFirewallRule -DisplayName "HE DIY Dashboard (5174)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5174 -Profile Private,Domain
```

Or start with `.\start_dashboard.ps1 -OpenFirewall` from an elevated prompt,
which does the same thing.

The dashboard has no login, so only share it on a trusted network. To keep it to
your own machine, start it with `.\start_dashboard.ps1 -Local`.

## 7. Optional: live Redash refresh

Everything above runs on the bundled snapshot. To enable the **Refresh Redash**
button:

1. Copy `.env.example` to `.env`.
2. Replace `YOUR_COMMON_REDASH_API_KEY` with the Common Redash key.
3. Be on VPN so `common-redash.mmt.live` is reachable.

The key is read on the server side only and is never sent to the browser.

Live refresh currently fails with `INVALID_GLUE_SCHEMA` because of a Glue/Delta
mismatch on the shared tables. That is expected: the dashboard reports the
failure and keeps showing the last good snapshot.

### If the check passes but Refresh still fails

**First suspect: a second backend.** On Windows, a Python `http.server` sets
`SO_REUSEADDR`, and Windows reads that as permission to bind a port another
live socket already holds. So a second backend started while an old one is
still running **binds successfully**. Both print "listening on 127.0.0.1:8765",
and inbound requests go to whichever one wins — which can be the older copy,
started from a different folder or a window with different settings. Its
failures are what the dashboard shows, while a check run from your current
folder passes.

Section 7 of `check_connection.py` now catches this: it asks whatever is on the
port which folder it is serving from, and says so when that is not the folder
you are in.

To clear it:

```
netstat -ano | findstr :8765
taskkill /PID <pid> /F
```

Kill every PID listed, close all dashboard windows, then start exactly one
backend. `start_backend.cmd` now refuses to start when the port is taken rather
than adding another copy to the pile.

### If it is still not that

This is the confusing one, and it has a single common cause: **proxy variables
are per terminal window.** A backend started in one window can be routing
through a proxy that a check run in another window never sees. Python picks
`HTTPS_PROXY` up automatically, and if that proxy is not reachable the refresh
fails with `WinError 10061` while everything else on the machine works.

Prove it by running both in the same window:

```
start_backend.cmd -check
```

That prints the proxy variables the backend will use, runs the full connection
check in that same window, then starts the backend. If the check passes there
and the refresh still fails, the environment is not the cause and it is worth
coming back with that output.

If it shows a proxy you did not set, skip it:

```
start_backend.cmd -noproxy
```

or, if you are starting the backend by hand, clear them first:

```
set HTTP_PROXY=
set HTTPS_PROXY=
set ALL_PROXY=
set NO_PROXY=*
python backend\server.py
```

The one-command launcher takes the same option: `.\start_dashboard.ps1 -NoProxy`.

### If Refresh says "connection refused"

`[WinError 10061] ... actively refused it` means the connection never reached
Redash, so it is a network problem on this machine rather than a Redash one.

**Run the built-in check first — it makes the same authenticated call the
refresh makes and names the cause:**

```powershell
python check_connection.py
```

It reports which Python is running, whether a key is configured, what proxy that
process will use, whether the hostname resolves, whether a socket opens, and what
Redash actually answers to `GET /api/queries/172937`. It never runs a query and
never prints your key.

If the check passes but the dashboard still reports a failure, the two are not
seeing the same thing. Run the check through the launcher, which uses the same
interpreter, environment and working directory the backend gets:

```powershell
.\start_dashboard.ps1 -Check
```

A difference between the two runs is itself the answer.

The two common verdicts:

**"The proxy is the problem. Direct connections work; the proxy does not."**

Python reads the proxy from Windows Internet Settings on its own, even when
nothing asked it to. On the company network that setting is often stale, or
points at a proxy only reachable elsewhere, so Python tries it and is refused
while the browser goes direct and works. Skip it:

```powershell
.\start_dashboard.ps1 -NoProxy
```

**"The hostname does not resolve"** — connect to the VPN and try again.

If instead you are on a network that genuinely requires a proxy, name it
explicitly. Find the one your browser uses at `chrome://net-internals/#proxy`,
then:

```powershell
.\start_dashboard.ps1 -Proxy "http://your-proxy-host:8080"
```

Add credentials if needed: `-Proxy "http://user:password@host:8080"`.

Manual checks, if you would rather not run the script:

```powershell
Resolve-DnsName common-redash.mmt.live                  # does the name resolve?
Test-NetConnection common-redash.mmt.live -Port 443     # can a socket open?
(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings') | Select-Object ProxyEnable, ProxyServer, AutoConfigURL
```

`ProxyEnable = 1` with a `ProxyServer` value is the setting Python is picking
up. `AutoConfigURL` is a PAC script, which Python ignores entirely.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `python is not recognised` | Python missing or not on PATH. Reinstall with "Add python.exe to PATH" ticked, then open a new PowerShell. |
| `python` opens the Microsoft Store | That is the Store stub, not Python. Install from python.org; the launcher will also try `py -3` on its own. |
| `running scripts is disabled on this system` | Use `start_dashboard.cmd`, or `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first. |
| `EADDRINUSE` / `address already in use` | The dashboard is already running, or something else holds the port. The launcher now names the process holding it. Close that, or use `.\start_dashboard.ps1 -UiPort 5175 -ApiPort 8766`. |
| Page loads but every panel is empty | The Python side is not running. Check `backend.err.log`. Started separately, the API returns `502 Backend unavailable` until it is up, then recovers on its own. |
| Refresh: "the dashboard's own Python backend is not responding" | The Python side stopped, or a second copy is holding the port. Close every dashboard window, start it once, and check `backend.err.log`. |
| `No snapshot CSV found` | The app was run from inside the zip preview instead of an extracted folder, so `data\snapshots` is missing. Extract properly and retry. |
| Colleagues cannot open the link | Windows Firewall — see step 6. Check they are on the same network and that your machine is awake. |
| Refresh: `WinError 10061 ... actively refused` | Never reached Redash. Run `python check_connection.py`. Usually the Windows proxy setting — restart with `-NoProxy`. |
| Refresh: `Tunnel connection failed: 403/407` | A proxy refused the connection. Not a key problem. Try `-NoProxy` first. |
| The shared link stops working later | Your IP changed when DHCP renewed, or the laptop slept. Restart the launcher and send the newly printed address. |

## What runs where

| Piece | Address | Reachable from the network |
| --- | --- | --- |
| Node UI server | `0.0.0.0:5174` | Yes — this is the link you share |
| Python API | `127.0.0.1:8765` | No — only via the UI server's proxy |

Tested against Python 3.11 and Node 22. Python 3.8 or newer and Node 14 or newer
should both be fine.
