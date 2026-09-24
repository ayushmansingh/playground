"""Plain chat search: full-text matches over raw messages, no classification.

Everything is filtered, grouped per conversation, and paged in SQL, so a
query only ever materializes one page of results.
"""

from __future__ import annotations

import math
import re
from datetime import date, datetime, time, timezone
from typing import Any

from database import DB_PATH, get_connection

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
SENDER_TYPES = {"customer": "customer", "he": "he"}  # accepted ?sender= values


def page_args(args) -> tuple[int, int, int]:
    def as_int(key: str, default: int) -> int:
        try:
            return int(args.get(key) or default)
        except (TypeError, ValueError):
            return default

    page = max(1, as_int("page", 1))
    page_size = max(1, min(as_int("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE))
    return page, page_size, (page - 1) * page_size


def fts_phrase(query: str) -> str | None:
    """Quote the query's word tokens as one FTS5 phrase, or None if it has none."""
    tokens = re.findall(r"[A-Za-z0-9]+", query.lower())
    if not tokens:
        return None
    return '"' + " ".join(tokens) + '"'


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def day_bound(value: str | None, end: bool) -> int | None:
    """A YYYY-MM-DD date as a UTC epoch second at the start or end of that day."""
    if not value:
        return None
    try:
        day = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"Invalid date: {value}") from exc
    moment = datetime.combine(day, time.max if end else time.min, tzinfo=timezone.utc)
    return int(moment.timestamp())


def search_chats(args) -> dict[str, Any]:
    """Conversations with at least one message matching every given criterion.

    Criteria: q (text, matched as a phrase), sender (customer|he), date_from and
    date_to (YYYY-MM-DD, on message dates), he_number and customer_number
    (substring match). With no message-level criteria, every conversation
    matching the number filters is listed, newest first.
    """
    query = (args.get("q") or "").strip()
    sender = SENDER_TYPES.get((args.get("sender") or "").strip().lower())
    date_from = day_bound(args.get("date_from"), end=False)
    date_to = day_bound(args.get("date_to"), end=True)
    he_number = (args.get("he_number") or "").strip()
    customer_number = (args.get("customer_number") or "").strip()
    page, page_size, offset = page_args(args)

    message_where: list[str] = []
    message_params: list[Any] = []
    source = "messages AS m"
    if query:
        phrase = fts_phrase(query)
        if phrase:
            source = "message_search JOIN messages AS m ON m.id = message_search.rowid"
            message_where.append("message_search MATCH ?")
            message_params.append(phrase)
        # FTS stems words ("prices" matches "price"); the LIKE keeps the exact
        # text the user typed, punctuation included.
        message_where.append("m.message_content_lower LIKE ? ESCAPE '\\'")
        message_params.append(f"%{escape_like(query.lower())}%")
    if sender:
        # Anything not from the customer counts as the agent (HE) side.
        operator = "=" if sender == "customer" else "!="
        message_where.append(f"LOWER(COALESCE(m.sender_type, '')) {operator} 'customer'")
    if date_from is not None:
        message_where.append("m.message_timestamp >= ?")
        message_params.append(date_from)
    if date_to is not None:
        message_where.append("m.message_timestamp <= ?")
        message_params.append(date_to)

    conversation_where: list[str] = []
    conversation_params: list[Any] = []
    if he_number:
        conversation_where.append("ci.he_number LIKE ? ESCAPE '\\'")
        conversation_params.append(f"%{escape_like(he_number)}%")
    if customer_number:
        conversation_where.append("ci.customer_number LIKE ? ESCAPE '\\'")
        conversation_params.append(f"%{escape_like(customer_number)}%")
    conversation_sql = " AND ".join(conversation_where) or "1 = 1"

    if message_where:
        # One row per conversation: its newest matching message plus a hit count.
        sql = f"""
            WITH hits AS (
                SELECT
                    m.id, m.conversation_id, m.message_timestamp, m.message_datetime,
                    m.message_content, m.sender_type,
                    COUNT(*) OVER (PARTITION BY m.conversation_id) AS hit_count,
                    ROW_NUMBER() OVER (
                        PARTITION BY m.conversation_id
                        ORDER BY m.message_timestamp DESC, m.id DESC
                    ) AS position
                FROM {source}
                WHERE {" AND ".join(message_where)}
            )
            SELECT
                COUNT(*) OVER () AS total,
                ci.*,
                hits.hit_count,
                hits.id AS match_id,
                hits.message_datetime AS match_datetime,
                hits.message_content AS match_content,
                hits.sender_type AS match_sender_type
            FROM hits
            JOIN conversation_index AS ci ON ci.conversation_id = hits.conversation_id
            WHERE hits.position = 1 AND {conversation_sql}
            ORDER BY hits.message_timestamp DESC, hits.id DESC
            LIMIT ? OFFSET ?
        """
        params = [*message_params, *conversation_params, page_size, offset]
    else:
        sql = f"""
            SELECT COUNT(*) OVER () AS total, ci.*
            FROM conversation_index AS ci
            WHERE {conversation_sql}
            ORDER BY ci.latest_message_timestamp DESC
            LIMIT ? OFFSET ?
        """
        params = [*conversation_params, page_size, offset]

    with get_connection(DB_PATH) as conn:
        rows = [dict(row) for row in conn.execute(sql, params)]
        profiled = {
            row["conversation_id"]
            for row in conn.execute(
                f"""
                SELECT DISTINCT conversation_id FROM conversation_profiles
                WHERE status = 'complete' AND conversation_id IN ({",".join("?" for _ in rows)})
                """,
                [row["conversation_id"] for row in rows],
            )
        } if rows else set()

    total = rows[0]["total"] if rows else 0
    results = []
    for row in rows:
        has_match = "match_id" in row
        results.append({
            "conversation_id": row["conversation_id"],
            "he_number": row["he_number"],
            "customer_number": row["customer_number"],
            "total_messages": row["total_messages"],
            "latest_message_datetime": row["latest_message_datetime"],
            "hit_count": row["hit_count"] if has_match else 0,
            "has_profile": row["conversation_id"] in profiled,
            "snippet": {
                "message_id": row["match_id"] if has_match else row["latest_message_id"],
                "message_datetime": row["match_datetime"] if has_match else row["latest_message_datetime"],
                "message_content": row["match_content"] if has_match else row["latest_message_content"],
                "sender_type": row["match_sender_type"] if has_match else None,
                "is_match": has_match,
            },
        })
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": results,
    }
