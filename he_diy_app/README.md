# HE DIY Performance Console

Day-on-day and agent-level HE DIY funnel performance, from two Redash queries:

- `172937` — Day-on-Day New HE DIY funnel
- `174655` — Agent-level New vs Old HE DIY performance

```
backend/    FastAPI. app = FastAPI() at module level in main.py. All routes /api
frontend/   React + Vite. npm run build -> frontend/dist
```

## How the launcher runs it

The app lives in `backend/` and `frontend/`. The package root also carries
`package.json`, `requirements.txt` and `main.py`, each of which delegates into
those folders — so the same commands are correct whether a launcher runs them
from the root or from a component's own directory:

| Command | From the root | From the component folder |
| --- | --- | --- |
| `pip install -r requirements.txt` | root file pulls in `backend/requirements.txt` | installs `backend/requirements.txt` |
| `npm install` | root `postinstall` installs `frontend/` | installs `frontend/` |
| `npm run build` | delegates to `frontend` | runs `vite build` |
| `uvicorn main:app` | root `main.py` re-exports the app | imports `backend/main.py` |

Nothing is duplicated: the root `main.py` loads the one real module from
`backend/main.py` and re-exports `app`.

The build output is always `frontend/dist`, and the backend listens on
`0.0.0.0:8000`. `python main.py` binds the same address.

By hand:

```bash
pip install -r requirements.txt
npm install && npm run build          # -> frontend/dist
uvicorn main:app --host 0.0.0.0 --port 8000
```

The app server serves `frontend/dist` and routes `/api` to the backend on the
same origin, which is why every call in the app is a relative `/api` path.

## Configuration

Every setting comes from the **environment**. Nothing is read from a file on
disk — no `.env`, no config file — because nobody is at the server to create
one. Each setting is declared in [`launcher.yaml`](launcher.yaml) at the root
of the package, so the server can prompt for what it needs.

**Nothing is required.** The app starts as soon as it is uploaded and serves
the snapshot bundled in `backend/seed_data/`.

| Setting | Kind | Default | Effect |
| --- | --- | --- | --- |
| `REDASH_API_KEY` | secret, optional | none | Enables the Refresh Redash button. Without it the dashboard still works from the snapshot |
| `REDASH_HOST` | app's own | `https://common-redash.mmt.live` | Redash base URL |
| `PAGE_SIZE` | app's own | `100` | Agent rows per request, and the starting value of the Show control |
| `REDASH_TIMEOUT_SECONDS` | app's own | `900` | How long a refresh waits for a query |
| `SYNC_ENABLED` | app's own | `true` | Refresh automatically on a timer |
| `SYNC_INTERVAL_MINUTES` | app's own | `60` | Minutes between automatic refreshes |
| `SYNC_ON_STARTUP` | app's own | `false` | Also refresh the moment the app starts |
| `SNAPSHOT_RETENTION` | app's own | `48` | Refreshed snapshots kept in the data directory |
| `REDASH_VERIFY_TLS` | app's own | `true` | Set `false` only for an internal private certificate chain |

`REDASH_API_KEY` is deliberately **not** marked required. The dashboard is
snapshot-first and fully usable without it, so requiring it would stop the app
from starting for no good reason. `COMMON_REDASH_API_KEY` is accepted as an
alias if your platform already sets that name.

`APP_DATA_DIR` is supplied by the app server itself and is not declared in
`launcher.yaml` — declaring it would invite someone to override the platform's
own directory.

Confirm what the app picked up with `GET /api/health`, which reports every
effective setting and whether the key is set — never its value.

## Automatic refresh

With a Redash key configured the app refreshes itself every `SYNC_INTERVAL_MINUTES`
(60 by default). The Refresh button still works and shares the same history.

Three things make it safe to leave running unattended:

- **A failed attempt leaves nothing behind.** Each run is assembled in a
  `.partial` directory and only published if at least one query returned rows.
  Without this, a broken upstream would deposit an empty run every hour — about
  8,700 dead directories a year.
- **Failures back off.** The wait doubles after each consecutive failure, up to
  six times the interval, and resets on the first success. A Redash outage costs
  a handful of queries a day rather than one an hour.
- **Old snapshots are pruned.** After a successful refresh only the newest
  `SNAPSHOT_RETENTION` runs are kept. At hourly with the default of 48 that is
  two days of history in roughly 16 MB, instead of ~3 GB a year.

Only one process syncs at a time, guarded by a lock file in the data directory,
so extra workers cannot run the same query concurrently. A lock older than an
hour is treated as abandoned.

`GET /api/sync` reports the state — last success, consecutive failures, when the
next attempt is due and whether it is backing off. The dashboard shows the same
in the freshness panel, and reloads itself when a sync brings in new data.

## API

```
GET  /api/health      liveness, data directory, whether live refresh is possible
GET  /api/dashboard   both tabs' data, filtered
POST /api/refresh     pull both queries from Redash; always 200
GET  /api/snapshots   every snapshot the app can see
GET  /api/sync        state of the automatic refresh
```

`/api/refresh` returns 200 with a failure body rather than a 5xx: a failed
refresh is an expected state the UI renders, not a server error.

## Local development

```bash
# terminal 1
APP_DATA_DIR=./backend/data uvicorn main:app --app-dir backend --port 8000

# terminal 2 - proxies /api to :8000
cd frontend && npm run dev
```

## Design and packaging notes

[UI_AND_PACKAGING.md](UI_AND_PACKAGING.md) covers the charting and UI decisions
and the deployment rules this build satisfies.
