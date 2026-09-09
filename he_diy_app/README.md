# HE DIY Performance Console

Day-on-day and agent-level HE DIY funnel performance, from two Redash queries:

- `172937` — Day-on-Day New HE DIY funnel
- `174655` — Agent-level New vs Old HE DIY performance

```
backend/    FastAPI. app = FastAPI() at module level in main.py. All routes /api
frontend/   React + Vite. npm run build -> frontend/dist
```

## Build

```bash
pip install -r backend/requirements.txt
cd frontend && npm install && npm run build
```

The app server imports `backend.main:app` and chooses the port. It serves
`frontend/dist` and routes `/api` to the backend on the same origin, which is
why every call in the app is a relative `/api` path.

## Configuration

Nothing is required. The app boots with no `.env` and serves the snapshot
bundled in `backend/seed_data/`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_DATA_DIR` | `backend/data` | Where refreshed snapshots are written; survives a redeploy |
| `COMMON_REDASH_API_KEY` | unset | Enables the Refresh Redash button; unset is fine |
| `REDASH_HOST` | `https://common-redash.mmt.live` | Redash base URL |
| `REDASH_VERIFY_TLS` | `1` | Set `0` only for an internal private certificate chain |

Without a key the dashboard is fully usable; only live refresh is disabled, and
the UI says so.

## API

```
GET  /api/health      liveness, data directory, whether live refresh is possible
GET  /api/dashboard   both tabs' data, filtered
POST /api/refresh     pull both queries from Redash; always 200
GET  /api/snapshots   every snapshot the app can see
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
