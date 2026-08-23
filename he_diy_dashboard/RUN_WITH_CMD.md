# Running without PowerShell

Everything here uses `cmd.exe` only. No PowerShell, no execution policy, no
admin rights except for the one optional firewall command.

## Once, on a new machine

**1. Python 3.** Check it:

```
python --version
```

If that errors or opens the Microsoft Store, install from
<https://www.python.org/downloads/> and tick **"Add python.exe to PATH"** on the
first screen. Open a new command prompt afterwards.

**2. Node.js.** Check it:

```
node --version
```

If missing, install the **LTS** build from <https://nodejs.org/> with the
defaults, then open a new command prompt.

Nothing to install with npm or pip. The dashboard has no dependencies.

**3. Extract the zip** somewhere with a short path, such as `C:\Tools`. Extract
properly — do not run it from inside the zip preview window, or the bundled data
will not be found.

## Every time: the easy way

Double-click **`run_dashboard.cmd`**, or from a command prompt:

```
cd C:\Tools\he_diy_dashboard
run_dashboard.cmd
```

Two windows open — the Python backend and the dashboard UI. The UI window prints
the address. Open <http://127.0.0.1:5174> in Chrome or Edge.

Close both windows to stop it.

Options, which pass through to the right window:

| Command | Effect |
| --- | --- |
| `run_dashboard.cmd` | Both servers, shared on the network |
| `run_dashboard.cmd -local` | Both servers, this machine only |
| `run_dashboard.cmd -check` | Backend runs the connection check first |
| `run_dashboard.cmd -noproxy` | Backend ignores any configured proxy |

## Every time: two windows by hand

Useful when you want to watch each side separately.

**Window 1 — the Python backend:**

```
cd C:\Tools\he_diy_dashboard
start_backend.cmd
```

It prints the proxy settings it will use, refuses to start if port 8765 is
already taken, and then runs the API on `127.0.0.1:8765`.

**Window 2 — the dashboard UI:**

```
cd C:\Tools\he_diy_dashboard
start_ui.cmd
```

It prints the addresses to open and share, and refuses to start if port 5174 is
already taken.

Add `-local` to `start_ui.cmd` to keep the dashboard off the network.

## The raw commands, if you prefer

```
cd C:\Tools\he_diy_dashboard
python backend\server.py --host 127.0.0.1 --port 8765
```

```
cd C:\Tools\he_diy_dashboard
set UI_HOST=0.0.0.0
set UI_PORT=5174
set API_HOST=127.0.0.1
set API_PORT=8765
node frontend\server.js
```

Leave out the `UI_HOST` line to keep it on this machine only. `set` applies to
that command window alone.

## Sharing it with the team

`start_ui.cmd` prints your addresses. If you would rather look them up:

```
ipconfig
```

Use the **IPv4 Address** of your active adapter, so colleagues open
`http://<that address>:5174`.

If nobody can connect, Windows Firewall is blocking the port. Open an
**Administrator** command prompt (right-click Command Prompt, *Run as
administrator*) and run this once:

```
netsh advfirewall firewall add rule name="HE DIY Dashboard" dir=in action=allow protocol=TCP localport=5174 profile=private,domain
```

It is scoped to private and domain networks on purpose, so the port stays shut
on public Wi-Fi.

The dashboard has no login. Anyone on the network who opens the link sees
agent-level data and can press Refresh Redash. Only share it on a trusted
network, and use `-local` when you would rather not.

## Live Redash refresh

The dashboard runs from the bundled snapshot with no key and no VPN. To enable
the **Refresh Redash** button:

1. Copy `.env.example` to `.env` **in the folder above `he_diy_dashboard`**.
2. Replace `YOUR_COMMON_REDASH_API_KEY` with the Common Redash key.
3. Be on VPN.

To confirm it can reach Redash:

```
start_backend.cmd -check
```

That runs the full connection check in the same window the backend will use,
then starts the backend.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `python is not recognised` | Python missing or not on PATH. Reinstall with "Add python.exe to PATH", open a new window. |
| `python` opens the Microsoft Store | That is the Store stub. Install from python.org. |
| `Port 8765 is already in use` | A backend is already running. `netstat -ano \| findstr :8765` then `taskkill /PID <pid> /F`. |
| `Port 5174 is already in use` | Same, for the UI: `netstat -ano \| findstr :5174`. |
| Refresh says the backend is not responding | The Python window has stopped. Look at it for the reason. |
| Refresh fails but the check passes | A second backend is answering. `start_backend.cmd -check` names the folder the answering one is serving from. |
| `INVALID_GLUE_SCHEMA` on refresh | Expected. The shared Holidays tables have a Glue/Delta mismatch upstream. The dashboard keeps the last good snapshot. |
| Colleagues cannot open the link | Windows Firewall — see the `netsh` command above. |

## Stopping everything

Close the windows, or:

```
netstat -ano | findstr ":8765 :5174"
taskkill /PID <pid> /F
```

Kill every PID listed. On Windows a second backend can bind a port that is
already in use, so if the dashboard behaves oddly, check for more than one.
