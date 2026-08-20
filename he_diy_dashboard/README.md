# HE DIY Dashboard

Local dashboard for:

- `172937`: Day-On-Day New HE DIY Dashboard
- `174655`: Agent Level Day-on-Day New vs Old HE DIY performance

The Python backend reads the latest local Redash snapshot first. The Refresh Redash button uses the Common Redash API key from `../.env` (`Common Dash`) or `COMMON_REDASH_API_KEY` and attempts a live `max_age: 0` refresh. If Redash fails, the UI keeps using the latest available snapshot.

The Day tab only exposes date and metric filters because query `172937` is already New DIY only. The Agent tab owns the New/Old, agent, sort, top-N, date, and trend metric filters.

## What the UI shows

Everything is derived from the two Redash results the backend already returns — no extra queries.

### Day-on-Day New DIY

| Panel | What it answers |
| --- | --- |
| Stat tiles | Volume for each funnel stage, its share of created, a sparkline, and the latest day against the day before |
| Daily trend | How the selected metric moves per day, with an optional 7-day average to separate signal from spikes |
| Conversion funnel | Where volume is lost, stage by stage, with the step conversion and the count that stops at each step |
| Conversion rates | Save / send / download / booking rate, one small panel each, so no two rates share an axis |
| Where the funnel leaks, by day | Conversion from created to each stage across every day — a weak day shows up as a pale column |
| Day-on-day change | Percent change against the previous day, growth above the zero line and decline below |
| Weekday profile | Average per weekday, weekends muted, for spotting staffing patterns |
| Daily detail | Every metric per day, sortable, exportable |

### Agent · New vs Old

| Panel | What it answers |
| --- | --- |
| Stat tiles | Same tiles plus the New-vs-Old volume mix |
| New vs Old daily trend | Three readings of the same data. **Absolute** is raw volume per day. **Indexed** rebases both cohorts to 100 on the first day, so New DIY's growth shape is readable next to Old DIY's much larger volume. **Share %** plots each cohort as a percentage of that day's combined total, as stacked bands adding to 100% |
| Funnel volume by DIY type | The same eight stages for both cohorts on one shared scale |
| Conversion rate comparison | Percent of created reaching each stage, New against Old |
| Save rate spread | How save rate is distributed across agents, with the median called out |
| Volume against quality | Created against save rate per agent, bubble sized by sent. Median guides split the coaching quadrants — high volume with a low save rate is where a conversation is worth having |
| Agent leaderboard | One row per agent and DIY type, sortable, exportable |

### Across both tabs

- **Every chart has a table twin.** The Chart / Table switch on each card shows the same numbers as a table, and `↓` exports that view as CSV.
- **Filters are shared.** One filter row scopes everything below it; active filters appear as removable chips.
- **The URL is the state.** Range, cohort, agent search, ranking and metric all live in the query string, so a view is a link you can paste to someone.
- **Light, dark and system themes**, remembered per browser.
- **Keyboard**: `1` / `2` switch tabs, `/` jumps to agent search, `R` refreshes, `T` cycles theme.
- **Snapshot honesty.** The freshness pill turns amber past 24 hours; clicking it shows retrieval time, row count and query runtime per source. A failed live refresh keeps the last good snapshot on screen and says so.

Design and charting rationale, including what would need a backend change, is in [`docs/UI_GUIDE.md`](docs/UI_GUIDE.md).

## Run

Never run it on this machine before? Follow [RUN_STEPS.md](RUN_STEPS.md), which
covers installing Python and Node and the usual Windows snags.

One-command launcher — double-click `start_dashboard.cmd`, or from PowerShell:

```powershell
cd "C:\Users\mmt11842\Downloads\SQL Stuff\he_diy_dashboard"
.\start_dashboard.ps1
```

It checks that Python and Node are present, starts both servers, shares the
dashboard on your LAN and prints the URL to send round. See
[Sharing on the LAN](#sharing-on-the-lan) below.

Requirements: Python 3.8+ and Node 14+ (tested on Python 3.11 and Node 22), and
a current Chrome, Edge or Firefox. There is nothing to install with npm or pip —
the dashboard has no dependencies.

### Running the two servers separately

Use two terminals when you want to watch the logs, restart one side on its own,
or change ports. The launcher does nothing the two commands below don't.

**Terminal 1 — Python API.** Leave this on `127.0.0.1`; it does not need to be
reachable from the network, only from the UI server on the same machine.

```powershell
cd "C:\Users\mmt11842\Downloads\SQL Stuff\he_diy_dashboard"
python backend\server.py
```

```text
Python backend listening on http://127.0.0.1:8765
```

**Terminal 2 — Node UI.** Set `UI_HOST` first to share it on the LAN; without
it the UI is reachable from this machine only.

```powershell
cd "C:\Users\mmt11842\Downloads\SQL Stuff\he_diy_dashboard"
$env:UI_HOST = "0.0.0.0"
node frontend\server.js
```

```text
Node dashboard listening on http://0.0.0.0:5174
Proxying API requests to http://127.0.0.1:8765
```

Then open `http://127.0.0.1:5174` yourself, and give colleagues
`http://<your-ip>:5174` — run `ipconfig` to find it.

`$env:UI_HOST` only applies to that PowerShell window. In `cmd` use
`set UI_HOST=0.0.0.0` instead.

**Ports and hosts** are all environment variables, so either server can move:

| Variable | Default | Used by |
| --- | --- | --- |
| `UI_HOST` | `127.0.0.1` | Node — the address the dashboard listens on |
| `UI_PORT` | `5174` | Node — the dashboard port |
| `API_HOST` | `127.0.0.1` | Node — where to proxy `/api/*` |
| `API_PORT` | `8765` | Node — the API port to proxy to |

The Python side takes flags rather than variables: `python backend\server.py --host 127.0.0.1 --port 8765`.
If you move the API, change it in both places so the proxy still finds it.

**Order does not matter.** Starting the UI first is fine — API calls return
`502 Backend unavailable` until the Python side is up, and the dashboard
recovers on its own once it is, with no restart. Stop each with `Ctrl+C`;
unlike the launcher, running separately means nothing cleans up the other
process for you.

No install step and no internet access is required for the UI: the charts are hand-rolled SVG with no npm packages and no CDN.

## Sharing on the LAN

`start_dashboard.ps1` binds the UI to every interface, so anyone on the same
network can open it. On start it prints your machine's address:

```text
  Share this with your team:
    http://10.14.32.87:5174
```

The Python API stays bound to `127.0.0.1` and is only reachable through the UI
server's proxy. The Redash key never leaves the machine and the API is not
exposed to the network directly.

| Command | Effect |
| --- | --- |
| `.\start_dashboard.ps1` | Shared on the LAN (default) |
| `.\start_dashboard.ps1 -Local` | This machine only |
| `.\start_dashboard.ps1 -OpenFirewall` | Also adds the inbound firewall rule (needs an elevated PowerShell) |
| `.\start_dashboard.ps1 -UiPort 8080` | Serve on a different port |

If colleagues cannot connect, Windows Firewall is almost always the reason. Run
this once in an elevated PowerShell:

```powershell
New-NetFirewallRule -DisplayName "HE DIY Dashboard (5174)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5174 -Profile Private,Domain
```

The rule is scoped to the Private and Domain profiles on purpose, so the port
does not open on a public network.

**Worth knowing before you share the link:**

- **There is no login.** Anyone on the network who opens the URL sees
  agent-level performance data. Keep it to a trusted office LAN or VPN.
- **Anyone can press Refresh Redash.** That runs both queries against your key
  (roughly 22 seconds each). The key itself stays server-side, but the button is
  not rate-limited.
- **Your machine is the server.** The link dies when the laptop sleeps or
  disconnects, and the IP can change when DHCP renews. For anything permanent,
  host it somewhere rather than on a laptop.

## Move To Another Laptop

Use the portable zip package if available. It includes the app and the current cached snapshot under `data/snapshots`.

For live refresh, create `.env` from `.env.example` and set:

```text
Common Dash=YOUR_COMMON_REDASH_API_KEY
```

## API

- `GET /api/dashboard?day_start=YYYY-MM-DD&day_end=YYYY-MM-DD&agent_start=YYYY-MM-DD&agent_end=YYYY-MM-DD&flag=all|1|0&agent=hes&sort_by=created&limit=100`
- `POST /api/refresh`

## Notes

Live refresh can fail while Redash data source `18` has the current Glue/Delta schema mismatch. That failure is shown in the UI and recorded under `data/snapshots/run_*/refresh_summary.json`.
