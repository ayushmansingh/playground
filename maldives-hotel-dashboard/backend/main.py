"""API and scheduled refresh service for the Maldives Hotel Dashboard.

The frontend ships with a reviewed fallback snapshot and loads the latest
persisted snapshot from this API when the internal app server is available.

Importing this module must never touch the filesystem for writing. The
deploy step imports it, and a working directory it cannot write to would
otherwise fail the whole deployment before the app is even created.
"""

import asyncio
import csv
import copy
import json
import logging
import os
import re
import threading
from datetime import datetime, time as clock_time, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Response, status
from fastapi.responses import FileResponse

try:
    from .refresh import IST, START_DATE, fetch_dashboard_rows, yesterday_ist
except ImportError:  # Internal app server imports main.py from backend/.
    from refresh import IST, START_DATE, fetch_dashboard_rows, yesterday_ist

# --- Settings -------------------------------------------------------------
# Everything is read from the environment; see launcher.yaml at the root of
# the ZIP for the list the server prompts for. No values are stored here.

HERE = Path(__file__).resolve().parent

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
REDASH_API_KEY = os.environ.get("REDASH_API_KEY", "")

# Rows per page for the paginated row endpoints.
try:
    PAGE_SIZE = int(os.environ.get("PAGE_SIZE", "50"))
except ValueError:
    PAGE_SIZE = 50
PAGE_SIZE = max(1, min(PAGE_SIZE, 1000))

# How often to re-check that the stored snapshot still covers yesterday. This is
# the recovery path behind the 00:01 IST run: without it a server started during
# the day, or a refresh that failed, leaves the dashboard behind until midnight.
try:
    REFRESH_POLL_SECONDS = int(os.environ.get("REFRESH_POLL_SECONDS", "900"))
except ValueError:
    REFRESH_POLL_SECONDS = 900
REFRESH_POLL_SECONDS = max(60, min(REFRESH_POLL_SECONDS, 21600))

# Anything written here survives the next upload; anything written elsewhere
# is erased. `data/` next to main.py resolves to the same place, so fall back
# to that rather than to a path relative to the current working directory --
# the launcher does not promise to run us from this folder.
DATA = Path(os.environ.get("APP_DATA_DIR") or (HERE / "data"))

# The snapshot that shipped inside this ZIP.
BUNDLED_SNAPSHOT = HERE / "snapshot.json"

logging.basicConfig(level=getattr(logging, LOG_LEVEL.upper(), logging.INFO))
logger = logging.getLogger("maldives-dashboard")

app = FastAPI(title="Maldives Hotel Dashboard API")

# The snapshot exactly as stored, and the cutoff-applied view derived from it.
_raw_cache: dict[str, Any] = {"path": None, "mtime": None, "snapshot": None}
_cache: dict[str, Any] = {"path": None, "mtime": None, "cutoff": None, "snapshot": None}
_refresh_lock = threading.Lock()
_refresh_status: dict[str, Any] = {
    "state": "idle",
    "trigger": None,
    "startedAt": None,
    "finishedAt": None,
    "message": "No refresh has run since this server started.",
}
# Consecutive failures and when the last one landed, so a broken upstream is
# retried with a widening gap instead of on every poll.
_refresh_failures = 0
_last_failure_at: datetime | None = None
_scheduler_task: asyncio.Task[Any] | None = None


def writable_data_dir() -> Path:
    """Create APP_DATA_DIR on first write, not at import time."""
    try:
        DATA.mkdir(parents=True, exist_ok=True)
    except OSError as error:
        logger.error("Data directory %s is not usable: %s", DATA, error)
        raise HTTPException(
            status_code=503,
            detail="The app data directory is not writable; check APP_DATA_DIR.",
        ) from error
    return DATA


def override_snapshot() -> Path:
    """Operator override, read without creating anything."""
    return DATA / "snapshot.json"


def snapshot_path() -> Path:
    candidate = override_snapshot()
    try:
        if candidate.is_file():
            return candidate
    except OSError:
        # An unreadable data directory is not fatal: fall back to the bundle.
        logger.warning("Could not check %s; using the bundled snapshot.", candidate)
    return BUNDLED_SNAPSHOT


def read_snapshot_file(path: Path) -> dict[str, Any]:
    """Return the snapshot exactly as stored, re-reading it when the file changes."""
    try:
        mtime = path.stat().st_mtime
    except OSError as error:
        raise HTTPException(status_code=500, detail="Dashboard snapshot is unavailable.") from error

    if _raw_cache["snapshot"] is None or _raw_cache["path"] != path or _raw_cache["mtime"] != mtime:
        try:
            snapshot = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            logger.exception("Could not read snapshot at %s", path)
            raise HTTPException(status_code=500, detail="Dashboard snapshot is unreadable.") from error
        _raw_cache.update(path=path, mtime=mtime, snapshot=snapshot)
        logger.info("Loaded dashboard snapshot from %s", path)

    return _raw_cache["snapshot"]


def load_snapshot() -> dict[str, Any]:
    """Return the current snapshot with the reporting cutoff applied.

    The cutoff moves at midnight IST, so it belongs in the cache key: a copy
    built yesterday would keep hiding the day that has since become reportable.
    """
    path = snapshot_path()
    raw = read_snapshot_file(path)
    cutoff = yesterday_ist().isoformat()
    if (_cache["snapshot"] is None or _cache["path"] != path
            or _cache["mtime"] != _raw_cache["mtime"] or _cache["cutoff"] != cutoff):
        _cache.update(path=path, mtime=_raw_cache["mtime"], cutoff=cutoff,
                      snapshot=apply_cutoff(raw, cutoff))
    return _cache["snapshot"]


def snapshot_data_end(snapshot: dict[str, Any]) -> str | None:
    """The newest day any query in the snapshot actually carries rows for."""
    days = [
        str(row.get("date", ""))
        for query in (snapshot.get("queries") or {}).values()
        if isinstance(query, dict)
        for row in (query.get("rows") or [])
        if isinstance(row, dict) and row.get("date")
    ]
    return max(days) if days else None


def apply_cutoff(snapshot: dict[str, Any], cutoff: str | None = None) -> dict[str, Any]:
    """Never expose rows newer than yesterday in Asia/Kolkata.

    Coverage has to describe where the rows actually stop. This used to assign
    the cutoff unconditionally, so a snapshot that had not refreshed in days
    still advertised itself as current and nothing downstream could tell.
    """
    cutoff = cutoff or yesterday_ist().isoformat()
    result = copy.deepcopy(snapshot)
    for query in result.get("queries", {}).values():
        if not isinstance(query, dict):
            continue
        rows = [
            row for row in query.get("rows", [])
            if isinstance(row, dict) and str(row.get("date", "")) <= cutoff
        ]
        query["rows"] = rows
        observed_end = max((str(row.get("date", "")) for row in rows), default="") or None
        source = query.get("source") or {}
        coverage = source.get("coverage") or {}
        coverage["endDate"] = observed_end
        coverage["cutoffDate"] = cutoff
        coverage["stale"] = bool(observed_end) and observed_end < cutoff
        source["coverage"] = coverage
        filters = source.get("filters") or []
        if filters and observed_end:
            filters[0] = (
                f"First observed quote date: {START_DATE.isoformat()} 00:00 IST "
                f"through {observed_end} 23:59 IST"
            )
        source["filters"] = filters
        query["source"] = source
    return result


def snapshot_is_current() -> bool:
    """True when the stored snapshot already covers yesterday in IST."""
    try:
        end = snapshot_data_end(read_snapshot_file(snapshot_path()))
    except HTTPException:
        return False
    return bool(end) and end >= yesterday_ist().isoformat()


def utc_now() -> str:
    return datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")


def persist_refreshed_snapshot(rows: list[dict[str, Any]], metadata: dict[str, Any]) -> None:
    # Start from the stored snapshot, not the cutoff-applied view: the file on
    # disk keeps every row that was fetched and states its own real coverage.
    snapshot = copy.deepcopy(read_snapshot_file(snapshot_path()))
    query = snapshot["queries"]["maldives_q2o"]
    query["rows"] = rows
    observed_end = max((str(row.get("date", "")) for row in rows), default="") or None
    source = query.setdefault("source", {})
    source["sql"] = json.dumps(metadata["query"], indent=2)
    source["retrievedAt"] = metadata["retrievedAt"]
    source["runtimeSeconds"] = metadata["runtimeSeconds"]
    source["resultId"] = metadata["resultId"]
    source["coverage"] = {
        "startDate": START_DATE.isoformat(),
        # What arrived, which is not always what was asked for.
        "endDate": observed_end,
        "requestedThrough": metadata["cutoffDate"],
        "timezone": "Asia/Kolkata",
        "grain": "day × cohort × setup",
    }
    window = (
        f"First observed quote date: {START_DATE.isoformat()} 00:00 IST "
        f"through {observed_end or metadata['cutoffDate']} 23:59 IST"
    )
    filters = source.get("filters") or []
    if filters:
        filters[0] = window
    else:
        filters = [window]
    source["filters"] = filters
    snapshot["generatedAt"] = metadata["retrievedAt"]
    snapshot["status"] = "reviewed"
    snapshot["buildStatus"] = "complete"

    target = writable_data_dir() / "snapshot.json"
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(target)
    _raw_cache.update(path=None, mtime=None, snapshot=None)
    _cache.update(path=None, mtime=None, cutoff=None, snapshot=None)


def run_refresh(trigger: str) -> None:
    global _refresh_failures, _last_failure_at
    try:
        def progress(message: str) -> None:
            with _refresh_lock:
                _refresh_status["message"] = message

        rows, metadata = fetch_dashboard_rows(REDASH_API_KEY, progress)
        persist_refreshed_snapshot(rows, metadata)
        observed_end = max((str(row.get("date", "")) for row in rows), default="") or None
        message = f"Loaded {len(rows)} daily rows through {observed_end or 'no data'}."
        if observed_end and observed_end < metadata["cutoffDate"]:
            message += f" Holiday Dash has nothing yet for {metadata['cutoffDate']}."
        with _refresh_lock:
            _refresh_failures = 0
            _last_failure_at = None
            _refresh_status.update(
                state="succeeded",
                finishedAt=utc_now(),
                dataThrough=observed_end,
                requestedThrough=metadata["cutoffDate"],
                message=message,
            )
    except Exception as error:  # The status endpoint must expose background failures.
        logger.exception("Dashboard refresh failed")
        with _refresh_lock:
            _refresh_failures += 1
            _last_failure_at = datetime.now(tz=timezone.utc)
            _refresh_status.update(state="failed", finishedAt=utc_now(), message=str(error))


def start_refresh(trigger: str) -> bool:
    global _refresh_status
    with _refresh_lock:
        if _refresh_status["state"] == "running":
            return False
        _refresh_status = {
            "state": "running",
            "trigger": trigger,
            "startedAt": utc_now(),
            "finishedAt": None,
            "dataThrough": None,
            "requestedThrough": yesterday_ist().isoformat(),
            "message": "Preparing Holiday Dash refresh.",
        }
    threading.Thread(target=run_refresh, args=(trigger,), daemon=True, name="maldives-refresh").start()
    return True


def refresh_due() -> bool:
    """Whether a catch-up refresh should start now."""
    if not REDASH_API_KEY or snapshot_is_current():
        return False
    with _refresh_lock:
        if _refresh_status["state"] == "running":
            return False
        failures, last_failure = _refresh_failures, _last_failure_at
    if failures and last_failure:
        # Widening gap after repeated failures, capped at two hours.
        delay = min(REFRESH_POLL_SECONDS * 2 ** (failures - 1), 7200)
        if (datetime.now(tz=timezone.utc) - last_failure).total_seconds() < delay:
            return False
    return True


def seconds_until_next_check() -> float:
    """Wake at 00:01 IST, or sooner if the recovery poll is due first."""
    now = datetime.now(IST)
    next_run = datetime.combine(now.date(), clock_time(0, 1), tzinfo=IST)
    if next_run <= now:
        next_run += timedelta(days=1)
    return max(1.0, min((next_run - now).total_seconds(), float(REFRESH_POLL_SECONDS)))


async def nightly_refresh_loop() -> None:
    """Keep the stored snapshot on yesterday in IST.

    The 00:01 IST wake is the normal path. Polling in between is what makes the
    rest hold: a server started during the day catches up without waiting for
    midnight, and a run that failed is retried rather than leaving the dashboard
    a day behind until tomorrow.
    """
    if not REDASH_API_KEY:
        logger.warning(
            "REDASH_API_KEY is not set: no refresh will run, and the dashboard "
            "will keep serving the snapshot it shipped with.",
        )
        return
    while True:
        await asyncio.sleep(seconds_until_next_check())
        if refresh_due():
            start_refresh("scheduled")


@app.on_event("startup")
async def start_scheduler() -> None:
    global _scheduler_task
    # Read coverage from the stored rows. Comparing the cutoff-applied copy with
    # the cutoff, as this once did, compares a value with the thing that derived
    # it -- always equal, so the catch-up never ran.
    if REDASH_API_KEY and not snapshot_is_current():
        logger.info("Stored snapshot does not reach %s; starting a catch-up refresh.",
                    yesterday_ist().isoformat())
        start_refresh("startup-catch-up")
    _scheduler_task = asyncio.create_task(nightly_refresh_loop())


@app.on_event("shutdown")
async def stop_scheduler() -> None:
    if _scheduler_task:
        _scheduler_task.cancel()


def get_query(query_id: str) -> dict[str, Any]:
    queries = load_snapshot().get("queries", {})
    query = queries.get(query_id)
    if not isinstance(query, dict):
        raise HTTPException(status_code=404, detail=f"No query named {query_id!r}.")
    return query


def filtered_rows(
    query: dict[str, Any],
    cohort: str | None,
    setup: str | None,
    date_from: str | None,
    date_to: str | None,
) -> list[dict[str, Any]]:
    rows = [row for row in query.get("rows", []) if isinstance(row, dict)]
    if cohort:
        rows = [row for row in rows if row.get("cohort") == cohort]
    if setup:
        rows = [row for row in rows if row.get("setup") == setup]
    if date_from:
        rows = [row for row in rows if str(row.get("date", "")) >= date_from]
    if date_to:
        rows = [row for row in rows if str(row.get("date", "")) <= date_to]
    return rows


def columns_of(rows: list[dict[str, Any]]) -> list[str]:
    columns: list[str] = []
    for row in rows:
        for key in row:
            if key not in columns:
                columns.append(key)
    return columns


# --- Routes ---------------------------------------------------------------
# Every route is under /api; anything else is not reachable.


@app.get("/api/health")
def health() -> dict[str, Any]:
    snapshot = load_snapshot()
    data_through = snapshot_data_end(snapshot)
    cutoff = yesterday_ist().isoformat()
    with _refresh_lock:
        refresh_state = _refresh_status["state"]
    return {
        "status": "ok",
        "snapshot": "override" if _cache["path"] != BUNDLED_SNAPSHOT else "bundled",
        "generatedAt": snapshot.get("generatedAt"),
        # What the rows reach, versus the newest day they are allowed to reach.
        "dataThrough": data_through,
        "cutoff": cutoff,
        "stale": data_through is None or data_through < cutoff,
        "refreshConfigured": bool(REDASH_API_KEY),
        "refreshState": refresh_state,
        "scheduledRefresh": "00:01 Asia/Kolkata",
        "refreshPollSeconds": REFRESH_POLL_SECONDS,
    }


@app.get("/api/snapshot")
def snapshot(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return load_snapshot()


@app.get("/api/refresh/status")
def refresh_status(response: Response) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    with _refresh_lock:
        return dict(_refresh_status)


@app.post("/api/refresh", status_code=status.HTTP_202_ACCEPTED)
def refresh_now(response: Response) -> dict[str, Any]:
    if not REDASH_API_KEY:
        raise HTTPException(status_code=503, detail="REDASH_API_KEY is not configured.")
    started = start_refresh("manual")
    if not started:
        response.status_code = status.HTTP_200_OK
    with _refresh_lock:
        return dict(_refresh_status)


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    """Snapshot metadata plus a summary of each query it carries."""
    snapshot = load_snapshot()
    queries = snapshot.get("queries", {})
    return {
        "id": snapshot.get("id"),
        "title": snapshot.get("title"),
        "surface": snapshot.get("surface"),
        "status": snapshot.get("status"),
        "generatedAt": snapshot.get("generatedAt"),
        "pageSize": PAGE_SIZE,
        "queries": [
            {
                "id": query_id,
                "label": (query.get("source") or {}).get("label"),
                "rowCount": len(query.get("rows", [])),
            }
            for query_id, query in queries.items()
        ],
    }


@app.get("/api/queries")
def list_queries() -> dict[str, Any]:
    snapshot = load_snapshot()
    return {
        "queries": [
            {
                "id": query_id,
                "label": (query.get("source") or {}).get("label"),
                "rowCount": len(query.get("rows", [])),
                "columns": columns_of([r for r in query.get("rows", []) if isinstance(r, dict)]),
            }
            for query_id, query in snapshot.get("queries", {}).items()
        ]
    }


@app.get("/api/queries/{query_id}")
def query_rows(
    query_id: str,
    page: int = Query(1, ge=1),
    page_size: int | None = Query(None, ge=1, le=1000),
    cohort: str | None = None,
    setup: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    """One page of rows, in the order the snapshot stores them."""
    query = get_query(query_id)
    rows = filtered_rows(query, cohort, setup, date_from, date_to)
    size = page_size or PAGE_SIZE
    start = (page - 1) * size
    return {
        "id": query_id,
        "page": page,
        "pageSize": size,
        "total": len(rows),
        "columns": columns_of(rows),
        "rows": rows[start : start + size],
    }


@app.get("/api/queries/{query_id}/source")
def query_source(query_id: str) -> dict[str, Any]:
    """Where the rows came from and how the dashboard derives its metrics."""
    query = get_query(query_id)
    return {
        "id": query_id,
        "source": query.get("source", {}),
        "methods": query.get("methods", []),
    }


@app.get("/api/queries/{query_id}/export.csv")
def export_csv(
    query_id: str,
    cohort: str | None = None,
    setup: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> FileResponse:
    """Write the (optionally filtered) rows to APP_DATA_DIR and return the file."""
    query = get_query(query_id)
    rows = filtered_rows(query, cohort, setup, date_from, date_to)
    columns = columns_of(rows)

    safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", query_id)
    target = writable_data_dir() / f"{safe_id}_export.csv"
    try:
        with target.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=columns)
            writer.writeheader()
            writer.writerows(rows)
    except OSError as error:
        logger.error("Could not write %s: %s", target, error)
        raise HTTPException(
            status_code=503,
            detail="Could not write the export; check APP_DATA_DIR.",
        ) from error
    logger.info("Wrote %d rows to %s", len(rows), target)

    return FileResponse(target, media_type="text/csv", filename=f"{safe_id}.csv")


if __name__ == "__main__":
    # The app server starts `app` itself; this block is only for running the
    # backend directly.
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
