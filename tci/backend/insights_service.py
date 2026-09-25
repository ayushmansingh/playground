"""Insights over AI-enriched conversations: filter options, filtering, analysis.

Only conversations with a completed AI profile take part. Filtering,
paging and counting all happen in SQL, so a request touches one page of
cards (or one pass over the matching profiles for the analysis).
"""

from __future__ import annotations

import math
from typing import Any

from conversation_profile_contract import (
    CONFIDENCE_OPTIONS,
    DSAT_REASON_OPTIONS,
    SENTIMENT_OPTIONS,
    SEVERITY_OPTIONS,
    TRAVEL_COHORT_OPTIONS,
    TRAVEL_INTENT_OPTIONS,
)
from conversation_service import profile_from_row
from database import DB_PATH, format_timestamp, get_connection
from search_service import escape_like, min_messages, page_args


def label_options(options: list[tuple[str, str]]) -> list[dict[str, str]]:
    return [{"value": value, "label": label} for value, label in options]


# Display labels for the UI. Several differ from the contract's wording.
FIELD_OPTIONS = {
    "travel_intents": label_options(TRAVEL_INTENT_OPTIONS),
    "travel_cohorts": label_options(TRAVEL_COHORT_OPTIONS),
    "budget_options": label_options([("yes", "Sensitive"), ("no", "Not sensitive"), ("unclear", "Unclear")]),
    "discount_levels": label_options([
        ("none", "Not discount-seeking"), ("low", "Low"), ("medium", "Medium"),
        ("high", "High"), ("unclear", "Unclear"),
    ]),
    "coupon_options": label_options([
        ("yes", "Actively asks for coupons"), ("no", "No coupon seeking"), ("unclear", "Unclear"),
    ]),
    "sentiments": label_options(SENTIMENT_OPTIONS),
    "dissatisfaction_reasons": label_options(DSAT_REASON_OPTIONS),
    "severities": label_options(SEVERITY_OPTIONS),
    "willingness_levels": label_options([
        ("low", "Low readiness"), ("medium", "Medium readiness"),
        ("high", "High readiness"), ("unclear", "Unclear"),
    ]),
    "blockers": label_options([
        ("price", "Price"), ("availability", "Availability"), ("slow_followup", "Slow follow-up"),
        ("quote_uncertainty", "Quote clarity"), ("visa_documents", "Visa or documents"),
        ("payment_booking", "Payment or booking"), ("package_fit", "Package fit"),
        ("low_intent", "Low customer intent"), ("unclear", "Unclear"),
    ]),
    "next_actions": label_options([
        ("callback", "Callback"), ("revised_quote", "Share revised quote"),
        ("alternate_destination", "Suggest alternate destination"),
        ("alternate_dates", "Suggest alternate dates"), ("clarify_quote", "Clarify quote"),
        ("visa_guidance", "Share visa guidance"), ("payment_support", "Help with payment"),
        ("booking_support", "Help with booking"), ("close_loop", "Close the loop"),
        ("monitor", "Monitor"), ("unclear", "Unclear"),
    ]),
    "confidence_levels": label_options(CONFIDENCE_OPTIONS),
    "profile_statuses": label_options([
        ("complete", "Ready"), ("unclear", "Unclear"), ("insufficient_signal", "Insufficient signal"),
    ]),
    "signal_qualities": label_options([("strong", "Strong"), ("moderate", "Moderate"), ("weak", "Weak")]),
}


def value_sql(column: str) -> str:
    """A profile column as the UI sees it: blank or missing reads as 'unclear'."""
    return f"COALESCE(NULLIF(p.{column}, ''), 'unclear')"


# The dissatisfaction reasons as a JSON array (bad JSON reads as none).
REASONS_SQL = (
    "CASE WHEN json_valid(p.dissatisfaction_reasons_json) "
    "THEN p.dissatisfaction_reasons_json ELSE '[]' END"
)


def has_reason_sql(reason_sql: str) -> str:
    return f"EXISTS (SELECT 1 FROM json_each({REASONS_SQL}) WHERE value = {reason_sql})"


PROFILED_FROM = """
    FROM conversation_profiles AS p
    JOIN conversations AS c ON c.conversation_id = p.conversation_id
    WHERE p.status = 'complete' AND c.total_messages > 0
"""

# Preset views over the profiled conversations: label and SQL condition.
QUICK_VIEWS = {
    "low_confidence": ("Low confidence", f"{value_sql('confidence_overall')} IN ('low', 'unclear')"),
    "other_dsat": ("Other dissatisfaction", has_reason_sql("'other'")),
    "insufficient_signal": (
        "Insufficient signal",
        "(p.profile_status = 'insufficient_signal' OR c.signal_quality = 'weak')",
    ),
    "high_value_negative": (
        "Negative but ready to book",
        f"{value_sql('overall_customer_sentiment')} = 'negative' AND {value_sql('conversion_willingness')} = 'high'",
    ),
}

# Filter parameter -> profile column it must equal.
EXACT_PROFILE_FILTERS = {
    "travel_intent": "travel_intent_primary",
    "travel_cohort": "travel_cohort",
    "budget_conscious": "budget_conscious",
    "discount_readiness": "discount_readiness",
    "coupon_seeking": "coupon_seeking",
    "sentiment": "overall_customer_sentiment",
    "severity": "severity",
    "conversion_willingness": "conversion_willingness",
    "primary_blocker": "primary_blocker",
    "next_best_action": "next_best_action",
    "profile_status": "profile_status",
}
CONFIDENCE_RANK = {"low": 1, "medium": 2, "high": 3}
CONFIDENCE_RANK_SQL = (
    f"CASE {value_sql('confidence_overall')} WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 ELSE 0 END"
)


def filter_sql(args) -> tuple[str, list[Any]]:
    """The profiled-conversation FROM/WHERE for the request's filters."""
    def arg(key: str) -> str:
        return (args.get(key) or "").strip()

    where: list[str] = []
    params: list[Any] = []
    if arg("destination"):
        where.append(f"{value_sql('destination_primary')} LIKE ? ESCAPE '\\'")
        params.append(f"%{escape_like(arg('destination'))}%")
    for key, column in EXACT_PROFILE_FILTERS.items():
        if arg(key):
            where.append(f"{value_sql(column)} = ?")
            params.append(arg(key))
    if arg("dissatisfaction_reason"):
        where.append(has_reason_sql("?"))
        params.append(arg("dissatisfaction_reason"))
    if arg("confidence") in CONFIDENCE_RANK:
        where.append(f"{CONFIDENCE_RANK_SQL} >= ?")
        params.append(CONFIDENCE_RANK[arg("confidence")])
    if arg("signal_quality"):
        where.append("c.signal_quality = ?")
        params.append(arg("signal_quality"))
    if min_messages(args):
        where.append("c.total_messages >= ?")
        params.append(min_messages(args))
    view = QUICK_VIEWS.get(arg("view"))
    if view:
        where.append(view[1])
    return PROFILED_FROM + "".join(f" AND {condition}" for condition in where), params


def fetch_meta() -> dict[str, Any]:
    with get_connection(DB_PATH) as conn:
        counts = conn.execute(
            """
            SELECT COALESCE(SUM(total_messages), 0), COUNT(*)
            FROM conversations WHERE total_messages > 0
            """
        ).fetchone()
        synced_to = conn.execute(
            "SELECT MAX(window_to) FROM sync_runs WHERE status = 'succeeded'"
        ).fetchone()[0]
        return {
            "message_count": counts[0],
            "conversation_count": counts[1],
            "profile_count": conn.execute(
                f"SELECT COUNT(*) {PROFILED_FROM}"
            ).fetchone()[0],
            "synced_to": format_timestamp(synced_to),
        }


def fetch_filter_options() -> dict[str, Any]:
    with get_connection(DB_PATH) as conn:
        destinations = [
            row[0]
            for row in conn.execute(
                """
                SELECT destination_primary FROM conversation_profiles
                WHERE status = 'complete' AND COALESCE(destination_primary, '') NOT IN ('', 'unclear')
                GROUP BY destination_primary
                ORDER BY COUNT(*) DESC, destination_primary
                LIMIT 200
                """
            )
        ]
    return {
        **FIELD_OPTIONS,
        "destination_suggestions": destinations,
        "quick_views": [{"value": key, "label": label} for key, (label, _) in QUICK_VIEWS.items()],
    }


def list_insights(args) -> dict[str, Any]:
    page, page_size, offset = page_args(args)
    source, params = filter_sql(args)
    with get_connection(DB_PATH) as conn:
        rows = [
            dict(row)
            for row in conn.execute(
                f"""
                SELECT p.*, c.he_id, c.total_messages, c.signal_quality, c.latest_message_id, c.latest_message_at
                {source}
                ORDER BY c.latest_message_at DESC, c.conversation_id
                LIMIT ? OFFSET ?
                """,
                [*params, page_size, offset],
            )
        ]
        total = conn.execute(f"SELECT COUNT(*) {source}", params).fetchone()[0]

    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": [
            {
                "conversation_id": row["conversation_id"],
                "he_id": row["he_id"],
                "latest_message_id": row["latest_message_id"],
                "latest_message_datetime": format_timestamp(row["latest_message_at"]),
                "total_messages": row["total_messages"],
                "signal_quality": row["signal_quality"],
                "profile": profile_from_row(row),
            }
            for row in rows
        ],
    }


def sample_quality(count: int) -> str:
    if count >= 100:
        return "strong"
    if count >= 30:
        return "directional"
    if count >= 10:
        return "small"
    return "tiny"


# Distribution key -> profile column it counts (top N kept for the long ones).
DISTRIBUTIONS = {
    "intent": "travel_intent_primary",
    "destination": "destination_primary",
    "cohort": "travel_cohort",
    "budget": "budget_conscious",
    "discount": "discount_readiness",
    "coupon": "coupon_seeking",
    "sentiment": "overall_customer_sentiment",
    "severity": "severity",
    "willingness": "conversion_willingness",
    "blocker": "primary_blocker",
}
TOP_N = {"intent": 10, "destination": 10, "dissatisfaction": 10}


def analyze_insights(args) -> dict[str, Any]:
    source, params = filter_sql(args)
    # Filter once into a materialized CTE, then count every distribution from it.
    columns = ",\n".join(f"{value_sql(column)} AS {key}" for key, column in DISTRIBUTIONS.items())
    groups = "\nUNION ALL\n".join(
        f"SELECT '{key}', {key}, COUNT(*) FROM matched GROUP BY {key}"
        for key in [*DISTRIBUTIONS, "signal_quality", "has_dissatisfaction"]
    )
    sql = f"""
        WITH matched AS MATERIALIZED (
            SELECT
                {columns},
                c.signal_quality,
                {REASONS_SQL} AS reasons,
                EXISTS (SELECT 1 FROM json_each({REASONS_SQL}) WHERE value != 'none') AS has_dissatisfaction
            {source}
        )
        {groups}
        UNION ALL
        SELECT 'dissatisfaction', reason.value, COUNT(*)
        FROM matched, json_each(CASE WHEN json_array_length(matched.reasons) > 0
                                     THEN matched.reasons ELSE '["none"]' END) AS reason
        GROUP BY reason.value
    """
    counts: dict[str, dict[Any, int]] = {}
    with get_connection(DB_PATH) as conn:
        for key, value, count in conn.execute(sql, params):
            counts.setdefault(key, {})[value] = count

    total = sum(counts.get("signal_quality", {}).values())

    def percent(key: str, value: Any) -> float:
        return round(counts.get(key, {}).get(value, 0) / total * 100, 1) if total else 0.0

    def distribution(key: str) -> list[dict[str, Any]]:
        ordered = sorted(counts.get(key, {}).items(), key=lambda item: (-item[1], str(item[0])))
        return [{"value": value, "count": count} for value, count in ordered[: TOP_N.get(key)]]

    return {
        "sample_size": total,
        "sample_quality": sample_quality(total),
        "kpis": {
            "conversations": total,
            "negative_percent": percent("sentiment", "negative"),
            "dissatisfaction_percent": percent("has_dissatisfaction", 1),
            "budget_conscious_percent": percent("budget", "yes"),
            "high_willingness_percent": percent("willingness", "high"),
        },
        "distributions": {
            key: distribution(key) for key in [*DISTRIBUTIONS, "dissatisfaction", "signal_quality"]
        },
    }
