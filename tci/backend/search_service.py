"""Plain chat search: full-text matches over raw messages, no classification.

Everything is filtered, grouped per conversation, and paged in SQL, so a
query only ever materializes one page of results.
"""

from __future__ import annotations

import math
import re
from datetime import date, datetime, time, timezone
from typing import Any

from database import DB_PATH, format_timestamp, get_connection

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


def min_messages(args) -> int:
    """The ?min_messages= filter as a positive count, or 0 when absent or invalid."""
    try:
        return max(0, int(args.get("min_messages") or 0))
    except (TypeError, ValueError):
        return 0


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
    date_to (YYYY-MM-DD, on message dates), lead_id and he_id (substring
    match), min_messages (stored messages in the conversation). With no
    message-level criteria, every conversation matching the conversation
    filters is listed, newest first.
    """
    query = (args.get("q") or "").strip()
    sender = SENDER_TYPES.get((args.get("sender") or "").strip().lower())
    date_from = day_bound(args.get("date_from"), end=False)
    date_to = day_bound(args.get("date_to"), end=True)
    lead_id = (args.get("lead_id") or "").strip()
    he_id = (args.get("he_id") or "").strip()
    page, page_size, offset = page_args(args)

    conversation_where = ["c.total_messages > 0"]
    conversation_params: list[Any] = []
    if lead_id:
        conversation_where.append("c.conversation_id LIKE ? ESCAPE '\\'")
        conversation_params.append(f"%{escape_like(lead_id)}%")
    if he_id:
        conversation_where.append("c.he_id LIKE ? ESCAPE '\\'")
        conversation_params.append(f"%{escape_like(he_id)}%")
    if min_messages(args):
        conversation_where.append("c.total_messages >= ?")
        conversation_params.append(min_messages(args))
    conversation_sql = " AND ".join(conversation_where)

    message_where: list[str] = []
    message_params: list[Any] = []
    source = "messages AS m"
    if query:
        phrase = fts_phrase(query)
        if phrase:
            source = "message_search JOIN messages AS m ON m.id = message_search.rowid"
            message_where.append("message_search MATCH ?")
            message_params.append(phrase)
        # FTS stems words ("prices" matches "price"); the LIKE (case-insensitive
        # for ASCII) keeps the exact text the user typed, punctuation included.
        message_where.append("m.content LIKE ? ESCAPE '\\'")
        message_params.append(f"%{escape_like(query)}%")
    if sender:
        message_where.append("m.sender_type = ?")
        message_params.append(sender)
    if date_from is not None:
        message_where.append("m.sent_at >= ?")
        message_params.append(date_from)
    if date_to is not None:
        message_where.append("m.sent_at <= ?")
        message_params.append(date_to)

    has_profile_sql = """
        EXISTS (
            SELECT 1 FROM conversation_profiles p
            WHERE p.conversation_id = c.conversation_id AND p.status = 'complete'
        ) AS has_profile
    """
    if message_where:
        if len(conversation_where) > 1:
            # Narrow to the matching leads first so only their messages are scanned.
            message_where.append(
                f"m.conversation_key IN (SELECT c.id FROM conversations c WHERE {conversation_sql})"
            )
            message_params.extend(conversation_params)
        # One row per conversation: its hit count and newest matching message.
        # (SQLite fills the bare columns from the row that supplied MAX().)
        sql = f"""
            WITH hits AS (
                SELECT
                    m.conversation_key, COUNT(*) AS hit_count, MAX(m.sent_at) AS snippet_at,
                    m.id AS snippet_id, m.content AS snippet_content, m.sender_type AS snippet_sender_type
                FROM {source}
                WHERE {" AND ".join(message_where)}
                GROUP BY m.conversation_key
            )
            SELECT COUNT(*) OVER () AS total, c.*, {has_profile_sql}, hits.*
            FROM hits
            JOIN conversations AS c ON c.id = hits.conversation_key
            ORDER BY hits.snippet_at DESC, hits.snippet_id DESC
            LIMIT ? OFFSET ?
        """
        with get_connection(DB_PATH) as conn:
            rows = [dict(row) for row in conn.execute(sql, [*message_params, page_size, offset])]
        total = rows[0]["total"] if rows else 0
    else:
        # The page walks idx_conversations_latest; the total is a separate count.
        sql = f"""
            SELECT
                c.*, {has_profile_sql},
                0 AS hit_count, m.id AS snippet_id, m.sent_at AS snippet_at,
                m.content AS snippet_content, NULL AS snippet_sender_type
            FROM conversations AS c
            JOIN messages AS m ON m.id = c.latest_message_id
            WHERE {conversation_sql}
            ORDER BY c.latest_message_at DESC
            LIMIT ? OFFSET ?
        """
        with get_connection(DB_PATH) as conn:
            rows = [dict(row) for row in conn.execute(sql, [*conversation_params, page_size, offset])]
            total = conn.execute(
                f"SELECT COUNT(*) FROM conversations AS c WHERE {conversation_sql}", conversation_params
            ).fetchone()[0]

    results = [
        {
            "conversation_id": row["conversation_id"],
            "he_id": row["he_id"],
            "total_messages": row["total_messages"],
            "latest_message_datetime": format_timestamp(row["latest_message_at"]),
            "hit_count": row["hit_count"],
            "has_profile": bool(row["has_profile"]),
            "snippet": {
                "message_id": row["snippet_id"],
                "message_datetime": format_timestamp(row["snippet_at"]),
                "message_content": row["snippet_content"],
                "sender_type": row["snippet_sender_type"],
                "is_match": row["hit_count"] > 0,
            },
        }
        for row in rows
    ]
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": results,
    }
