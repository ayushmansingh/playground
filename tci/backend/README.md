# Backend

`main.py` exposes only `/api/*` routes. The app reads and updates its SQLite
database at `APP_DATA_DIR/filtered_messages_p0.sqlite3`; without that variable,
it safely defaults to `data/filtered_messages_p0.sqlite3`.

On the first deployment, the launcher copies the versioned database seed in
`backend/data/` into the persistent location. The app promotes that seed to the
live database only when the live database is absent, empty, or smaller.
Later deployments preserve a populated database. `GET /api/health` reports
whether both files are ready. No API key or `.env` file is required.

| Module | Role |
| --- | --- |
| `database.py` | Schema, seed promotion, and the search index and per-conversation summaries derived from `messages`. |
| `ingest.py` | Cleans and deduplicates chat rows, inserts them, and refreshes the derived tables. `python ingest.py exports/*.csv` loads CSV exports. |
| `search_service.py` | `GET /api/search`: phrase search over raw messages, with sender, date, and number filters, paged in SQL. |
| `insights_service.py` | `GET /api/insights`, `/api/insights/analysis`, `/api/insights/options`, `/api/meta`: filtering and aggregates over AI-profiled conversations. |
| `conversation_service.py` | `GET /api/conversation`, `POST /api/review/save`: one transcript with its AI profile and human review. |
| `conversation_profile_contract.py` | The AI profile schema, prompt, and value cleaning, shared with offline enrichment. |

AI enrichment remains an offline workflow and is not exposed by the API.
Databases built by earlier versions keep working; tables they carry for the
retired keyword classifier and DoubleTick import are simply no longer read.
