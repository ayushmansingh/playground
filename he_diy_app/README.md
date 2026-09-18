# HE DIY Performance Console

Day-on-day and agent-level HE DIY funnel performance, from two Redash queries:

- `172937` — Day-on-Day New HE DIY funnel
- `174655` — Agent-level New vs Old HE DIY performance

```
backend/    FastAPI. app = FastAPI() at module level in main.py. All routes /api
frontend/   React + Vite. npm run build -> frontend/dist
```

## How the launcher runs it

`launcher.yaml` at the package root describes both components:

```yaml
backend:
  directory: backend
  install: pip install -r requirements.txt
  start: uvicorn main:app --host 0.0.0.0 --port 8000
  port: 8000
  health_check: /api/health

frontend:
  directory: frontend
  install: npm install
  build: npm run build
  output: dist
```

The backend listens on `0.0.0.0:8000`. `python backend/main.py` binds the same
address, so either way of starting it behaves identically.

To do it by hand:

```bash
pip install -r backend/requirements.txt
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000

cd frontend && npm install && npm run build   # -> frontend/dist
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
