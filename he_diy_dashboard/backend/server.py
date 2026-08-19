from __future__ import annotations

import argparse
import csv
import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


APP_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = APP_ROOT.parent
HOST = "https://common-redash.mmt.live"
QUERY_IDS = (172937, 174655)
METRICS = ["created", "saved", "sent", "downloaded", "psm_detail", "psm_review", "checkout", "bookings"]
FLAG_LABELS = {"0": "Old DIY", "1": "New DIY"}


def load_dotenv() -> dict[str, str]:
    values: dict[str, str] = {}
    env_path = WORKSPACE_ROOT / ".env"
    if not env_path.exists():
        return values
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def common_redash_key() -> str:
    dotenv = load_dotenv()
    for key in ("Common Dash", "COMMON_DASH", "COMMON_REDASH_API_KEY", "REDASH_API_KEY"):
        value = os.environ.get(key) or dotenv.get(key)
        if value:
            return value
    raise RuntimeError("Common Redash key not found. Expected `Common Dash` in .env or COMMON_REDASH_API_KEY.")


def json_request(method: str, url: str, headers: dict[str, str], body: dict[str, Any] | None = None, timeout: int = 120) -> dict[str, Any]:
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url, data=payload, method=method, headers=headers)
    context = ssl._create_unverified_context()
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        return json.loads(response.read().decode("utf-8"))


def redash_headers() -> dict[str, str]:
    key = common_redash_key()
    return {
        "Authorization": f"Key {key}",
        "X-Redash-API-Key": key,
        "Content-Type": "application/json",
    }


def run_redash_sql(headers: dict[str, str], data_source_id: int, sql: str, max_wait_seconds: int = 1800) -> dict[str, Any]:
    submitted = json_request(
        "POST",
        f"{HOST}/api/query_results",
        headers,
        {"data_source_id": data_source_id, "query": sql, "max_age": 0},
        timeout=120,
    )
    if submitted.get("query_result"):
        return submitted["query_result"]

    job_id = (submitted.get("job") or {}).get("id")
    if not job_id:
        raise RuntimeError(f"Redash returned no query result or job id: {submitted}")

    deadline = time.time() + max_wait_seconds
    last_job: dict[str, Any] | None = None
    while time.time() < deadline:
        time.sleep(5)
        job = json_request("GET", f"{HOST}/api/jobs/{job_id}", headers, timeout=90).get("job") or {}
        last_job = job
        if job.get("status") == 3:
            result_id = job.get("query_result_id")
            return json_request("GET", f"{HOST}/api/query_results/{result_id}.json", headers, timeout=300)["query_result"]
        if job.get("status") in (4, 5):
            raise RuntimeError(f"Redash job failed/cancelled: {job.get('error')}")
    raise TimeoutError(f"Timed out waiting for Redash job {job_id}: {last_job}")


def to_number(value: Any) -> int:
    if value in ("", None):
        return 0
    try:
        return int(float(str(value)))
    except ValueError:
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


def latest_snapshot_path(query_id: int) -> Path | None:
    patterns = [
        APP_ROOT / "data" / "snapshots" / "*" / f"query_{query_id}_result.csv",
        APP_ROOT / "data" / "snapshots" / "*" / f"query_{query_id}_cached_result.csv",
        WORKSPACE_ROOT / "redash_172937_174655_run_*" / f"query_{query_id}_result.csv",
        WORKSPACE_ROOT / "redash_172937_174655_run_*" / f"query_{query_id}_cached_result.csv",
    ]
    matches: list[Path] = []
    for pattern in patterns:
        matches.extend(pattern.parent.parent.glob(f"{pattern.parent.name}/{pattern.name}"))
    existing = [path for path in matches if path.exists()]
    if not existing:
        return None
    return max(existing, key=lambda path: path.stat().st_mtime)


def load_dataset(query_id: int) -> dict[str, Any]:
    path = latest_snapshot_path(query_id)
    if path is None:
        return {"query_id": query_id, "rows": [], "path": None, "metadata": {}, "error": "No snapshot CSV found."}
    metadata: dict[str, Any] = {}
    for suffix in ("_cached_summary.json", "_summary.json", "_metadata.json"):
        candidate = path.with_name(path.name.replace("_cached_result.csv", suffix).replace("_result.csv", suffix))
        if candidate.exists():
            try:
                metadata = json.loads(candidate.read_text(encoding="utf-8"))
                break
            except json.JSONDecodeError:
                metadata = {}
    return {"query_id": query_id, "rows": read_rows(path), "path": str(path), "metadata": metadata}


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
        return {"save_rate": 0, "send_rate": 0, "download_rate": 0, "booking_rate": 0}
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
        key = (str(row.get("date_part")), str(row.get("new_diy_flag", "")))
        by_key.setdefault(key, []).append(row)
    output = []
    for (date_part, flag) in sorted(by_key):
        total = sum_metrics(by_key[(date_part, flag)])
        output.append({"date_part": date_part, "new_diy_flag": flag, "label": FLAG_LABELS.get(flag, f"Flag {flag}"), **total, **conversion_rates(total)})
    return output


def flag_rollup(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_flag: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_flag.setdefault(str(row.get("new_diy_flag", "")), []).append(row)
    output = []
    for flag in sorted(by_flag):
        total = sum_metrics(by_flag[flag])
        output.append({"new_diy_flag": flag, "label": FLAG_LABELS.get(flag, f"Flag {flag}"), **total, **conversion_rates(total)})
    return output


def agent_rollup(rows: list[dict[str, Any]], sort_by: str, limit: int) -> list[dict[str, Any]]:
    by_agent: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in rows:
        key = (str(row.get("agent_id") or "Unknown"), str(row.get("new_diy_flag", "")))
        by_agent.setdefault(key, []).append(row)
    agents = []
    for (agent_id, flag), agent_rows in by_agent.items():
        total = sum_metrics(agent_rows)
        agents.append({"agent_id": agent_id, "new_diy_flag": flag, "label": FLAG_LABELS.get(flag, f"Flag {flag}"), **total, **conversion_rates(total)})
    sort_metric = sort_by if sort_by in [*METRICS, "save_rate", "send_rate", "download_rate", "booking_rate"] else "created"
    agents.sort(key=lambda row: (to_number(row.get(sort_metric)), to_number(row.get("saved"))), reverse=True)
    return agents[: max(1, min(limit, 500))]


def build_dashboard(params: dict[str, list[str]]) -> dict[str, Any]:
    day_start = params.get("day_start", params.get("start", [None]))[0]
    day_end = params.get("day_end", params.get("end", [None]))[0]
    agent_start = params.get("agent_start", params.get("start", [None]))[0]
    agent_end = params.get("agent_end", params.get("end", [None]))[0]
    flag = params.get("flag", ["all"])[0]
    agent = (params.get("agent", [""])[0] or "").strip().lower()
    sort_by = params.get("sort_by", ["created"])[0]
    limit = to_number(params.get("limit", ["50"])[0]) or 50

    funnel = load_dataset(172937)
    agent_data = load_dataset(174655)
    funnel_rows = [row for row in funnel["rows"] if in_date_range(row, day_start, day_end)]
    agent_context_rows = [row for row in agent_data["rows"] if in_date_range(row, agent_start, agent_end)]
    if agent:
        agent_context_rows = [row for row in agent_context_rows if agent in str(row.get("agent_id") or "").lower()]
    agent_rows = list(agent_context_rows)
    if flag in ("0", "1"):
        agent_rows = [row for row in agent_rows if row.get("new_diy_flag") == flag]

    day_dates = sorted({str(row.get("date_part")) for row in funnel["rows"] if row.get("date_part")})
    agent_dates = sorted({str(row.get("date_part")) for row in agent_data["rows"] if row.get("date_part")})
    funnel_total = sum_metrics(funnel_rows)
    agent_total = sum_metrics(agent_rows)
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "selected": {
            "day_start": day_start,
            "day_end": day_end,
            "agent_start": agent_start,
            "agent_end": agent_end,
            "flag": flag,
            "agent": agent,
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
            "trend_by_flag": daily_flag_rollup(agent_context_rows),
            "comparison": flag_rollup(agent_context_rows),
            "totals": {**agent_total, **conversion_rates(agent_total)},
            "row_count": len(agent_rows),
        },
    }


def refresh_queries() -> dict[str, Any]:
    headers = redash_headers()
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = APP_ROOT / "data" / "snapshots" / f"run_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    summaries = []
    for query_id in QUERY_IDS:
        summary: dict[str, Any] = {"id": query_id}
        try:
            query = json_request("GET", f"{HOST}/api/queries/{query_id}", headers, timeout=120)
            sql = query.get("query") or ""
            source_path = out_dir / f"query_{query_id}_source.sql"
            source_path.write_text(sql, encoding="utf-8")
            summary.update(
                {
                    "name": query.get("name"),
                    "data_source_id": query.get("data_source_id"),
                    "updated_at": query.get("updated_at"),
                    "source_path": str(source_path),
                }
            )
            started = time.perf_counter()
            result = run_redash_sql(headers, int(query["data_source_id"]), sql)
            elapsed = round(time.perf_counter() - started, 2)
            data = result.get("data") or {}
            rows = data.get("rows") or []
            columns = [column.get("name") for column in data.get("columns", []) if column.get("name")]
            result_path = out_dir / f"query_{query_id}_result.csv"
            write_rows(result_path, columns, rows)
            summary.update(
                {
                    "status": "success",
                    "redash_result_id": result.get("id"),
                    "retrieved_at": result.get("retrieved_at"),
                    "runtime_seconds": result.get("runtime"),
                    "elapsed_seconds": elapsed,
                    "row_count": len(rows),
                    "column_count": len(columns),
                    "result_path": str(result_path),
                }
            )
        except Exception as exc:
            summary.update({"status": "failed", "error": str(exc)})
        summaries.append(summary)
        (out_dir / f"query_{query_id}_summary.json").write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    payload = {"attempted_at": datetime.now().isoformat(timespec="seconds"), "snapshot_dir": str(out_dir), "queries": summaries}
    (out_dir / "refresh_summary.json").write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return payload


class Handler(BaseHTTPRequestHandler):
    server_version = "HeDiyDashboard/1.0"

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(encoded)

    def do_OPTIONS(self) -> None:
        self.send_json(200, {"ok": True})

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json(200, {"ok": True, "generated_at": datetime.now().isoformat(timespec="seconds")})
            return
        if parsed.path == "/api/dashboard":
            try:
                self.send_json(200, build_dashboard(urllib.parse.parse_qs(parsed.query)))
            except Exception as exc:
                self.send_json(500, {"error": str(exc)})
            return
        self.send_json(404, {"error": "Not found"})

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/refresh":
            try:
                self.send_json(200, refresh_queries())
            except (RuntimeError, urllib.error.URLError) as exc:
                self.send_json(500, {"error": str(exc)})
            return
        self.send_json(404, {"error": "Not found"})

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="HE DIY dashboard backend")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Python backend listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
