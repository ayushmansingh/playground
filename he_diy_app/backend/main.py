"""HE DIY performance dashboard - API.

Serves two Redash datasets:
  172937  Day-on-day New HE DIY funnel
  174655  Agent-level New vs Old HE DIY performance

Design notes that matter for deployment:

* The app is created at module level as ``app`` and boots with no
  configuration at all. A missing ``.env``, a missing API key and an
  unreachable Redash are all normal states: the dashboard falls back to the
  most recent snapshot and reports why live refresh is unavailable.
* Everything written at runtime goes under ``APP_DATA_DIR`` so it survives a
  redeploy. The bundled snapshot under ``seed_data`` is read-only and acts as
  the floor, so a fresh install has data on first load.
* Every route lives under ``/api``.
"""

from __future__ import annotations

import csv
import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI, Query
from fastapi.middleware.gzip import GZipMiddleware

APP_ROOT = Path(__file__).resolve().parent

# Runtime writes go here and survive a redeploy. "data" next to main.py points
# at the same place, so the default is correct even when the variable is unset.
DATA_DIR = Path(os.environ.get("APP_DATA_DIR", APP_ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Shipped with the app, never written to.
SEED_DIR = APP_ROOT / "seed_data"

REDASH_HOST = os.environ.get("REDASH_HOST", "https://common-redash.mmt.live")
QUERY_IDS = (172937, 174655)
METRICS = ["created", "saved", "sent", "downloaded", "psm_detail", "psm_review", "checkout", "bookings"]
FLAG_LABELS = {"0": "Old DIY", "1": "New DIY"}
KEY_NAMES = ("Common Dash", "COMMON_DASH", "COMMON_REDASH_API_KEY", "REDASH_API_KEY")

app = FastAPI(
    title="HE DIY Performance Dashboard",
    version="2.0.0",
    description="Day-on-day and agent-level HE DIY funnel performance.",
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

api = APIRouter(prefix="/api")


# --------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------

def load_dotenv() -> dict[str, str]:
    """Read a .env if one happens to be there. Absence is a normal state."""
    values: dict[str, str] = {}
    for candidate in (DATA_DIR / ".env", APP_ROOT / ".env", APP_ROOT.parent / ".env"):
        if not candidate.exists():
            continue
        try:
            for raw in candidate.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                values.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        except OSError:
            continue
    return values


def redash_key() -> str | None:
    """The API key, or None. Never raises, so a missing key cannot stop boot."""
    dotenv = load_dotenv()
    for name in KEY_NAMES:
        value = os.environ.get(name) or dotenv.get(name)
        if value and "YOUR_COMMON_REDASH_API_KEY" not in value:
            return value.strip()
    return None


# --------------------------------------------------------------------------
# snapshots
# --------------------------------------------------------------------------

def snapshot_path(query_id: int) -> Path | None:
    """Newest result CSV for a query.

    Runs written at runtime win over the bundled seed, and within each source
    the directory name (run_YYYYmmdd_HHMMSS) orders them, which is stable
    across a redeploy in a way file mtimes are not.
    """
    found: list[tuple[int, str, Path]] = []
    for base, rank in ((DATA_DIR / "snapshots", 1), (SEED_DIR / "snapshots", 0)):
        if not base.is_dir():
            continue
        for run in base.iterdir():
            if not run.is_dir():
                continue
            for name in (f"query_{query_id}_result.csv", f"query_{query_id}_cached_result.csv"):
                candidate = run / name
                if candidate.exists():
                    found.append((rank, run.name, candidate))
    if not found:
        return None
    found.sort(key=lambda entry: (entry[0], entry[1]))
    return found[-1][2]


def to_number(value: Any) -> int:
    if value in ("", None):
        return 0
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return 0


def read_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            cleaned: dict[str, Any] = dict(row)
            for metric in METRICS:
                cleaned[metric] = to_number(cleaned.get(metric))
            if "new_diy_flag" in cleaned:
                cleaned["new_diy_flag"] = str(cleaned.get("new_diy_flag", "")).strip()
            rows.append(cleaned)
    return rows


def write_rows(path: Path, columns: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_dataset(query_id: int) -> dict[str, Any]:
    path = snapshot_path(query_id)
    if path is None:
        return {"query_id": query_id, "rows": [], "path": None, "metadata": {}, "error": "No snapshot found for this query."}
    metadata: dict[str, Any] = {}
    for suffix in ("_cached_summary.json", "_summary.json", "_metadata.json"):
        candidate = path.with_name(path.name.replace("_cached_result.csv", suffix).replace("_result.csv", suffix))
        if candidate.exists():
            try:
                metadata = json.loads(candidate.read_text(encoding="utf-8"))
                break
            except (OSError, json.JSONDecodeError):
                metadata = {}
    try:
        rows = read_rows(path)
    except OSError as exc:
        return {"query_id": query_id, "rows": [], "path": str(path), "metadata": metadata, "error": f"Could not read the snapshot: {exc}"}
    return {"query_id": query_id, "rows": rows, "path": str(path), "metadata": metadata}


# --------------------------------------------------------------------------
# rollups
# --------------------------------------------------------------------------

def in_date_range(row: dict[str, Any], start: str | None, end: str | None) -> bool:
    date_part = str(row.get("date_part") or "")
    if start and date_part < start:
        return False
    if end and date_part > end:
        return False
    return True


def sum_metrics(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {metric: sum(to_number(row.get(metric)) for row in rows) for metric in METRICS}


def conversion_rates(total: dict[str, int]) -> dict[str, float]:
    created = total.get("created") or 0
    if created == 0:
        return {"save_rate": 0.0, "send_rate": 0.0, "download_rate": 0.0, "booking_rate": 0.0}
    return {
        "save_rate": round(total["saved"] / created * 100, 2),
        "send_rate": round(total["sent"] / created * 100, 2),
        "download_rate": round(total["downloaded"] / created * 100, 2),
        "booking_rate": round(total["bookings"] / created * 100, 2),
    }


def daily_rollup(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_date: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_date.setdefault(str(row.get("date_part")), []).append(row)
    output = []
    for date_part in sorted(by_date):
        total = sum_metrics(by_date[date_part])
        output.append({"date_part": date_part, **total, **conversion_rates(total)})
    return output


def daily_flag_rollup(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        by_key.setdefault((str(row.get("date_part")), str(row.get("new_diy_flag", ""))), []).append(row)
    output = []
    for date_part, flag in sorted(by_key):
        total = sum_metrics(by_key[(date_part, flag)])
        output.append({
            "date_part": date_part,
            "new_diy_flag": flag,
            "label": FLAG_LABELS.get(flag, f"Flag {flag}"),
            **total,
            **conversion_rates(total),
        })
    return output


def flag_rollup(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_flag: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_flag.setdefault(str(row.get("new_diy_flag", "")), []).append(row)
    output = []
    for flag in sorted(by_flag):
        total = sum_metrics(by_flag[flag])
        output.append({
            "new_diy_flag": flag,
            "label": FLAG_LABELS.get(flag, f"Flag {flag}"),
            **total,
            **conversion_rates(total),
        })
    return output


def agent_rollup(rows: list[dict[str, Any]], sort_by: str, limit: int) -> list[dict[str, Any]]:
    by_agent: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        key = (str(row.get("agent_id") or "Unknown"), str(row.get("new_diy_flag", "")))
        by_agent.setdefault(key, []).append(row)
    agents = []
    for (agent_id, flag), agent_rows in by_agent.items():
        total = sum_metrics(agent_rows)
        agents.append({
            "agent_id": agent_id,
            "new_diy_flag": flag,
            "label": FLAG_LABELS.get(flag, f"Flag {flag}"),
            **total,
            **conversion_rates(total),
        })
    allowed = [*METRICS, "save_rate", "send_rate", "download_rate", "booking_rate"]
    metric = sort_by if sort_by in allowed else "created"
    agents.sort(key=lambda row: (to_number(row.get(metric)), to_number(row.get("saved"))), reverse=True)
    return agents[: max(1, min(limit, 500))]


# --------------------------------------------------------------------------
# Redash refresh
# --------------------------------------------------------------------------

def json_request(method: str, url: str, headers: dict[str, str], body: dict[str, Any] | None = None, timeout: int = 120) -> dict[str, Any]:
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=payload, method=method, headers=headers)
    context = ssl.create_default_context()
    if os.environ.get("REDASH_VERIFY_TLS", "1") == "0":
        # Opt-in only, for an internal host with a private certificate chain.
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        return json.loads(response.read().decode("utf-8"))


def redash_headers(key: str) -> dict[str, str]:
    return {"Authorization": f"Key {key}", "X-Redash-API-Key": key, "Content-Type": "application/json"}


def run_redash_sql(headers: dict[str, str], data_source_id: int, sql: str, max_wait_seconds: int = 900) -> dict[str, Any]:
    submitted = json_request(
        "POST",
        f"{REDASH_HOST}/api/query_results",
        headers,
        {"data_source_id": data_source_id, "query": sql, "max_age": 0},
        timeout=120,
    )
    if submitted.get("query_result"):
        return submitted["query_result"]

    job_id = (submitted.get("job") or {}).get("id")
    if not job_id:
        raise RuntimeError(f"Redash returned neither a result nor a job id: {submitted}")

    deadline = time.time() + max_wait_seconds
    last_job: dict[str, Any] | None = None
    while time.time() < deadline:
        time.sleep(5)
        job = json_request("GET", f"{REDASH_HOST}/api/jobs/{job_id}", headers, timeout=90).get("job") or {}
        last_job = job
        if job.get("status") == 3:
            result_id = job.get("query_result_id")
            return json_request("GET", f"{REDASH_HOST}/api/query_results/{result_id}.json", headers, timeout=300)["query_result"]
        if job.get("status") in (4, 5):
            raise RuntimeError(f"Redash job failed or was cancelled: {job.get('error')}")
    raise TimeoutError(f"Timed out waiting for Redash job {job_id}: {last_job}")


def refresh_queries() -> dict[str, Any]:
    """Pull both queries live. Snapshots land in APP_DATA_DIR so they persist."""
    key = redash_key()
    if not key:
        return {
            "attempted_at": datetime.now().isoformat(timespec="seconds"),
            "ok": False,
            "reason": "no_api_key",
            "message": "No Redash API key is configured, so live refresh is unavailable. The dashboard is running on the last saved snapshot.",
            "queries": [],
        }

    headers = redash_headers(key)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = DATA_DIR / "snapshots" / f"run_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    summaries: list[dict[str, Any]] = []
    for query_id in QUERY_IDS:
        summary: dict[str, Any] = {"id": query_id}
        try:
            query = json_request("GET", f"{REDASH_HOST}/api/queries/{query_id}", headers, timeout=120)
            sql = query.get("query") or ""
            (out_dir / f"query_{query_id}_source.sql").write_text(sql, encoding="utf-8")
            summary.update({
                "name": query.get("name"),
                "data_source_id": query.get("data_source_id"),
                "updated_at": query.get("updated_at"),
            })
            started = time.perf_counter()
            result = run_redash_sql(headers, int(query["data_source_id"]), sql)
            data = result.get("data") or {}
            rows = data.get("rows") or []
            columns = [column.get("name") for column in data.get("columns", []) if column.get("name")]
            result_path = out_dir / f"query_{query_id}_result.csv"
            write_rows(result_path, columns, rows)
            summary.update({
                "status": "success",
                "retrieved_at": result.get("retrieved_at"),
                "runtime_seconds": result.get("runtime"),
                "elapsed_seconds": round(time.perf_counter() - started, 2),
                "row_count": len(rows),
                "column_count": len(columns),
                "result_path": str(result_path),
            })
        except Exception as exc:  # noqa: BLE001 - every failure is reported, never raised
            summary.update({"status": "failed", "error": str(exc)})
        summaries.append(summary)
        (out_dir / f"query_{query_id}_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")

    failed = [item for item in summaries if item.get("status") != "success"]
    payload = {
        "attempted_at": datetime.now().isoformat(timespec="seconds"),
        "ok": not failed,
        "reason": None if not failed else "query_failed",
        "snapshot_dir": str(out_dir),
        "queries": summaries,
    }
    (out_dir / "refresh_summary.json").write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return payload


# --------------------------------------------------------------------------
# dashboard payload
# --------------------------------------------------------------------------

def build_dashboard(
    day_start: str | None,
    day_end: str | None,
    agent_start: str | None,
    agent_end: str | None,
    flag: str,
    agent: str,
    sort_by: str,
    limit: int,
) -> dict[str, Any]:
    funnel = load_dataset(172937)
    agent_data = load_dataset(174655)

    funnel_rows = [row for row in funnel["rows"] if in_date_range(row, day_start, day_end)]
    agent_context = [row for row in agent_data["rows"] if in_date_range(row, agent_start, agent_end)]
    needle = (agent or "").strip().lower()
    if needle:
        agent_context = [row for row in agent_context if needle in str(row.get("agent_id") or "").lower()]

    agent_rows = list(agent_context)
    if flag in ("0", "1"):
        agent_rows = [row for row in agent_rows if row.get("new_diy_flag") == flag]

    day_dates = sorted({str(row.get("date_part")) for row in funnel["rows"] if row.get("date_part")})
    agent_dates = sorted({str(row.get("date_part")) for row in agent_data["rows"] if row.get("date_part")})
    funnel_total = sum_metrics(funnel_rows)
    agent_total = sum_metrics(agent_rows)

    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "live_refresh_available": redash_key() is not None,
        "selected": {
            "day_start": day_start,
            "day_end": day_end,
            "agent_start": agent_start,
            "agent_end": agent_end,
            "flag": flag,
            "agent": needle,
            "sort_by": sort_by,
            "limit": limit,
        },
        "available_dates": {
            "day": {"min": day_dates[0] if day_dates else None, "max": day_dates[-1] if day_dates else None, "dates": day_dates},
            "agent": {"min": agent_dates[0] if agent_dates else None, "max": agent_dates[-1] if agent_dates else None, "dates": agent_dates},
        },
        "sources": {
            "172937": {"path": funnel.get("path"), "metadata": funnel.get("metadata"), "error": funnel.get("error")},
            "174655": {"path": agent_data.get("path"), "metadata": agent_data.get("metadata"), "error": agent_data.get("error")},
        },
        "day_dashboard": {
            "rows": daily_rollup(funnel_rows),
            "totals": {**funnel_total, **conversion_rates(funnel_total)},
            "row_count": len(funnel_rows),
        },
        "agent_dashboard": {
            "rows": agent_rollup(agent_rows, sort_by, limit),
            "daily": daily_rollup(agent_rows),
            "trend_by_flag": daily_flag_rollup(agent_context),
            "comparison": flag_rollup(agent_context),
            "totals": {**agent_total, **conversion_rates(agent_total)},
            "row_count": len(agent_rows),
        },
    }


# --------------------------------------------------------------------------
# routes - every one under /api
# --------------------------------------------------------------------------

@api.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "data_dir": str(DATA_DIR),
        "live_refresh_available": redash_key() is not None,
        "snapshots": {str(query_id): str(snapshot_path(query_id) or "") for query_id in QUERY_IDS},
    }


@api.get("/dashboard")
def dashboard(
    day_start: str | None = Query(None, description="YYYY-MM-DD"),
    day_end: str | None = Query(None, description="YYYY-MM-DD"),
    agent_start: str | None = Query(None, description="YYYY-MM-DD"),
    agent_end: str | None = Query(None, description="YYYY-MM-DD"),
    flag: str = Query("all", pattern="^(all|0|1)$"),
    agent: str = Query(""),
    sort_by: str = Query("created"),
    limit: int = Query(100, ge=1, le=500),
) -> dict[str, Any]:
    return build_dashboard(day_start, day_end, agent_start, agent_end, flag, agent, sort_by, limit)


@api.post("/refresh")
def refresh() -> dict[str, Any]:
    """Always 200. A failure is data the UI renders, not an HTTP error."""
    try:
        return refresh_queries()
    except Exception as exc:  # noqa: BLE001
        return {
            "attempted_at": datetime.now().isoformat(timespec="seconds"),
            "ok": False,
            "reason": "unexpected_error",
            "message": str(exc),
            "queries": [],
        }


@api.get("/snapshots")
def snapshots() -> dict[str, Any]:
    """Every snapshot the app can see, newest first, seed included."""
    runs: list[dict[str, Any]] = []
    for base, source in ((DATA_DIR / "snapshots", "saved"), (SEED_DIR / "snapshots", "bundled")):
        if not base.is_dir():
            continue
        for run in sorted(base.iterdir(), reverse=True):
            if not run.is_dir():
                continue
            runs.append({
                "name": run.name,
                "source": source,
                "files": sorted(item.name for item in run.iterdir() if item.is_file()),
            })
    return {"data_dir": str(DATA_DIR), "runs": runs}


app.include_router(api)
