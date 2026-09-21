"""Fetch and aggregate the Maldives dashboard source from Holiday Dash."""

from __future__ import annotations

import json
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REDASH_BASE_URL = "http://holiday-dash.mmt.com"
DATA_SOURCE_ID = 18
START_DATE = date(2026, 8, 9)
IST = timezone(timedelta(hours=5, minutes=30), name="IST")
PACKAGE_IDS = {63747, 63748, 63861, 63862}


def yesterday_ist() -> date:
    return datetime.now(IST).date() - timedelta(days=1)


def object_id_boundary(value: datetime) -> str:
    seconds = int(value.timestamp())
    return f"{seconds:08x}0000000000000000"


def build_mongo_query(start: date, end_exclusive: date) -> dict[str, Any]:
    start_at = datetime.combine(start, datetime.min.time(), tzinfo=IST)
    end_at = datetime.combine(end_exclusive, datetime.min.time(), tzinfo=IST)
    return {
        "collection": "userQuotePackage",
        "fields": {
            "date": 1,
            "ticketId": 2,
            "quoteId": 3,
            "isBookedQuote": 4,
            "packageId": 5,
            "taggedDestination": 6,
            "flightComponent": 7,
        },
        "aggregate": [
            {
                "$match": {
                    "_id": {
                        "$gte": {"$oid": object_id_boundary(start_at)},
                        "$lt": {"$oid": object_id_boundary(end_at)},
                    },
                    "$or": [
                        {"packageDetail.id": {"$in": sorted(PACKAGE_IDS)}},
                        {"packageDetail.tagDestination.name": "Maldives"},
                    ],
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "date": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": {"$toDate": "$_id"},
                            "timezone": "+05:30",
                        }
                    },
                    "ticketId": {"$toString": "$ticketId"},
                    "quoteId": {"$toString": "$quoteId"},
                    "isBookedQuote": {"$cond": ["$isBookedQuote", 1, 0]},
                    "packageId": "$packageDetail.id",
                    "taggedDestination": "$packageDetail.tagDestination.name",
                    "flightComponent": "$packageDetail.flightDetail.component",
                }
            },
        ],
    }


def request_json(api_key: str, method: str, route: str, body: Any = None) -> dict[str, Any]:
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        f"{REDASH_BASE_URL}{route}",
        data=payload,
        method=method,
        headers={
            "Authorization": f"Key {api_key}",
            "X-Redash-API-Key": api_key,
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=300) as response:
            return json.load(response)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"Holiday Dash returned HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Holiday Dash could not be reached: {error.reason}") from error


def wait_for_result(api_key: str, submission: dict[str, Any]) -> dict[str, Any]:
    if submission.get("query_result"):
        return submission["query_result"]
    job_id = (submission.get("job") or {}).get("id")
    if not job_id:
        raise RuntimeError("Holiday Dash returned neither a result nor a job ID.")
    while True:
        time.sleep(5)
        job = request_json(api_key, "GET", f"/api/jobs/{job_id}").get("job") or {}
        if job.get("status") in (4, 5):
            raise RuntimeError(f"Holiday Dash job failed: {job.get('error') or 'unknown error'}")
        if job.get("status") == 3:
            result_id = job.get("query_result_id")
            return request_json(api_key, "GET", f"/api/query_results/{result_id}.json")["query_result"]


def memberships(row: dict[str, Any]) -> list[tuple[str, str]]:
    try:
        package_id = int(row.get("packageId"))
    except (TypeError, ValueError):
        package_id = -1
    is_maldives = row.get("taggedDestination") == "Maldives"
    setup = "With flight" if row.get("flightComponent") == "FLIGHT" else "Land only"
    result: list[tuple[str, str]] = []
    if package_id in PACKAGE_IDS:
        result.extend((("Hotel config", setup), ("Hotel config", "Overall")))
    if is_maldives and package_id == 0:
        result.extend((("DIY Maldives", setup), ("DIY Maldives", "Overall")))
    if is_maldives:
        result.extend((("Overall Maldives", setup), ("Overall Maldives", "Overall")))
    return result


def aggregate_rows(raw_rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
    quote_map: dict[tuple[str, str, str], dict[str, Any]] = {}
    ticket_map: dict[tuple[str, str, str], dict[str, Any]] = {}
    diagnostics = {"rawRows": len(raw_rows), "missingTicketId": 0, "missingQuoteId": 0, "excludedRows": 0}

    for row in raw_rows:
        ticket_id = str(row.get("ticketId") or "").strip()
        quote_id = str(row.get("quoteId") or "").strip()
        if not ticket_id or ticket_id == "null":
            diagnostics["missingTicketId"] += 1
        if not quote_id or quote_id == "null":
            diagnostics["missingQuoteId"] += 1
        if not ticket_id or ticket_id == "null" or not quote_id or quote_id == "null":
            diagnostics["excludedRows"] += 1
            continue
        booked = 1 if int(row.get("isBookedQuote") or 0) > 0 else 0
        row_date = str(row.get("date") or "")
        for cohort, setup in memberships(row):
            for target, identity in ((quote_map, quote_id), (ticket_map, ticket_id)):
                key = (cohort, setup, identity)
                current = target.get(key)
                if current is None:
                    target[key] = {"date": row_date, "cohort": cohort, "setup": setup, "booked": booked}
                else:
                    current["date"] = min(current["date"], row_date)
                    current["booked"] = max(current["booked"], booked)

    daily: dict[tuple[str, str, str], dict[str, Any]] = defaultdict(dict)

    def daily_row(item: dict[str, Any]) -> dict[str, Any]:
        key = (item["date"], item["cohort"], item["setup"])
        if not daily[key]:
            daily[key] = {
                "date": item["date"],
                "cohort": item["cohort"],
                "setup": item["setup"],
                "ticketQueries": 0,
                "ticketOrders": 0,
                "quotesSent": 0,
                "quoteOrders": 0,
            }
        return daily[key]

    for ticket in ticket_map.values():
        item = daily_row(ticket)
        item["ticketQueries"] += 1
        item["ticketOrders"] += ticket["booked"]
    for quote in quote_map.values():
        item = daily_row(quote)
        item["quotesSent"] += 1
        item["quoteOrders"] += quote["booked"]

    rows = []
    for row in daily.values():
        row["ticketQ2O"] = row["ticketOrders"] / row["ticketQueries"] if row["ticketQueries"] else None
        row["quoteQ2O"] = row["quoteOrders"] / row["quotesSent"] if row["quotesSent"] else None
        rows.append(row)
    rows.sort(key=lambda row: (row["date"], row["cohort"], row["setup"]))
    diagnostics["distinctMembershipTickets"] = len(ticket_map)
    diagnostics["distinctMembershipQuotes"] = len(quote_map)
    return rows, diagnostics


def fetch_dashboard_rows(api_key: str, progress: Callable[[str], None] | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    end_exclusive = datetime.now(IST).date()
    raw_rows: list[dict[str, Any]] = []
    result_ids: list[str] = []
    runtime_seconds = 0.0
    cursor = START_DATE
    while cursor < end_exclusive:
        chunk_end = min(cursor + timedelta(days=7), end_exclusive)
        if progress:
            progress(f"Fetching {cursor.isoformat()} through {(chunk_end - timedelta(days=1)).isoformat()}")
        submission = request_json(api_key, "POST", "/api/query_results", {
            "data_source_id": DATA_SOURCE_ID,
            "query": json.dumps(build_mongo_query(cursor, chunk_end), separators=(",", ":")),
            "max_age": 0,
        })
        result = wait_for_result(api_key, submission)
        raw_rows.extend((result.get("data") or {}).get("rows") or [])
        if result.get("id") is not None:
            result_ids.append(str(result["id"]))
        runtime_seconds += float(result.get("runtime") or 0)
        cursor = chunk_end

    rows, diagnostics = aggregate_rows(raw_rows)
    return rows, {
        "cutoffDate": yesterday_ist().isoformat(),
        "retrievedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "runtimeSeconds": runtime_seconds,
        "resultId": ",".join(result_ids),
        "diagnostics": diagnostics,
        "query": build_mongo_query(START_DATE, end_exclusive),
    }
