# Backend

`main.py` exposes only `/api/*` routes. The app reads and updates its SQLite
database at `APP_DATA_DIR/filtered_messages_p0.sqlite3`; without that variable,
it safely defaults to `data/filtered_messages_p0.sqlite3`.

On the first deployment, the launcher copies the versioned database seed in
`backend/data/` into the persistent location. The app promotes that seed to the
live database only when the live database is absent or empty. Later deployments
preserve a populated database. `GET /api/health` reports whether both files are ready.

No API key or `.env` file is required to start the app. Enrichment remains an
offline workflow and is intentionally not exposed by the deployed API.

The Import chats tab accepts `.xlsx` workbooks and defaults to `HE Phone` and
`Phone number` when present. Uploads and resumable job state live under
`APP_DATA_DIR`; authorization keys are held only in memory for the active run.
