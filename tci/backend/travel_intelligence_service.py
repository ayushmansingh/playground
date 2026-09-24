from __future__ import annotations

import json
import math
from collections import Counter
from typing import Any

from chat_search_index import DB_PATH, build_match_query, escape_like, get_connection
from chat_search_service import (
    arg_value,
    decode_json_list,
    normalize_page_args,
    resolve_country_values,
    resolve_destination_values,
)
from conversation_profile_contract import (
    BUDGET_CONSCIOUS_OPTIONS,
    COUPON_SEEKING_OPTIONS,
    CONFIDENCE_OPTIONS,
    DISCOUNT_READINESS_OPTIONS,
    DSAT_REASON_OPTIONS,
    NEXT_ACTION_OPTIONS,
    PRIMARY_BLOCKER_OPTIONS,
    PROFILE_STATUS_OPTIONS,
    REVIEW_STATUS_OPTIONS,
    SENTIMENT_OPTIONS,
    SEVERITY_OPTIONS,
    TRAVEL_INTENT_OPTIONS,
    TRAVEL_COHORT_OPTIONS,
    WILLINGNESS_OPTIONS,
    merge_profile_overrides,
    sanitize_review_corrections,
)


def label_options(options: list[tuple[str, str]]) -> list[dict[str, str]]:
    return [{"value": value, "label": label} for value, label in options]


def custom_label_options(mapping: list[tuple[str, str]]) -> list[dict[str, str]]:
    return [{"value": value, "label": label} for value, label in mapping]


def latest_profile_cte_sql() -> str:
    return """
        latest_profiles AS (
            SELECT *
            FROM (
                SELECT
                    cp.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY cp.conversation_id
                        ORDER BY COALESCE(cp.enriched_at, '') DESC, cp.model_name DESC, cp.prompt_version DESC
                    ) AS row_number
                FROM conversation_profiles cp
                WHERE cp.status = 'complete'
            )
            WHERE row_number = 1
        )
    """


def compute_signal_quality(total_messages: int, customer_messages: int, he_messages: int) -> str:
    if customer_messages >= 3 and he_messages >= 1 and total_messages >= 6:
        return "strong"
    if customer_messages >= 2 and total_messages >= 4:
        return "moderate"
    return "weak"


def confidence_rank(value: str | None) -> int:
    return {"unclear": 0, "low": 1, "medium": 2, "high": 3}.get(
        str(value or "unclear").strip().lower(),
        0,
    )


def parse_json_object(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        data = json.loads(value)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def fetch_app_metadata() -> dict[str, int]:
    with get_connection(DB_PATH) as conn:
        rows = conn.execute("SELECT key, value FROM metadata").fetchall()
        profile_count = conn.execute(
            "SELECT COUNT(DISTINCT conversation_id) FROM conversation_profiles WHERE status = 'complete'"
        ).fetchone()[0]
        reviewed_count = conn.execute(
            "SELECT COUNT(*) FROM conversation_reviews WHERE review_status != 'unreviewed'"
        ).fetchone()[0]
    payload = {row["key"]: int(row["value"]) for row in rows if str(row["value"]).isdigit()}
    payload["profile_count"] = int(profile_count)
    payload["reviewed_count"] = int(reviewed_count)
    return payload


def fetch_filter_options() -> dict[str, Any]:
    with get_connection(DB_PATH) as conn:
        city_rows = conn.execute(
            "SELECT canonical_label FROM destination_catalog ORDER BY country, city"
        ).fetchall()
        country_rows = conn.execute(
            "SELECT DISTINCT country FROM destination_catalog ORDER BY country"
        ).fetchall()
    return {
        "destination_suggestions": [row["canonical_label"] for row in city_rows]
        + [row["country"] for row in country_rows],
        "travel_intents": label_options(TRAVEL_INTENT_OPTIONS),
        "travel_cohorts": label_options(TRAVEL_COHORT_OPTIONS),
        "budget_options": custom_label_options(
            [
                ("yes", "Sensitive"),
                ("no", "Not sensitive"),
                ("unclear", "Unclear"),
            ]
        ),
        "discount_levels": custom_label_options(
            [
                ("none", "Not discount-seeking"),
                ("low", "Low"),
                ("medium", "Medium"),
                ("high", "High"),
                ("unclear", "Unclear"),
            ]
        ),
        "coupon_options": custom_label_options(
            [
                ("yes", "Actively asks for coupons"),
                ("no", "No coupon seeking"),
                ("unclear", "Unclear"),
            ]
        ),
        "cash_payment_options": custom_label_options(
            [
                ("yes", "Cash payment mentioned"),
                ("no", "No cash payment mention"),
            ]
        ),
        "sentiments": label_options(SENTIMENT_OPTIONS),
        "dissatisfaction_reasons": label_options(DSAT_REASON_OPTIONS),
        "severities": label_options(SEVERITY_OPTIONS),
        "willingness_levels": custom_label_options(
            [
                ("low", "Low readiness"),
                ("medium", "Medium readiness"),
                ("high", "High readiness"),
                ("unclear", "Unclear"),
            ]
        ),
        "blockers": custom_label_options(
            [
                ("price", "Price"),
                ("availability", "Availability"),
                ("slow_followup", "Slow follow-up"),
                ("quote_uncertainty", "Quote clarity"),
                ("visa_documents", "Visa or documents"),
                ("payment_booking", "Payment or booking"),
                ("package_fit", "Package fit"),
                ("low_intent", "Low customer intent"),
                ("unclear", "Unclear"),
            ]
        ),
        "next_actions": custom_label_options(
            [
                ("callback", "Callback"),
                ("revised_quote", "Share revised quote"),
                ("alternate_destination", "Suggest alternate destination"),
                ("alternate_dates", "Suggest alternate dates"),
                ("clarify_quote", "Clarify quote"),
                ("visa_guidance", "Share visa guidance"),
                ("payment_support", "Help with payment"),
                ("booking_support", "Help with booking"),
                ("close_loop", "Close the loop"),
                ("monitor", "Monitor"),
                ("unclear", "Unclear"),
            ]
        ),
        "confidence_levels": label_options(CONFIDENCE_OPTIONS),
        "profile_statuses": custom_label_options(
            [
                ("complete", "Ready"),
                ("unclear", "Unclear"),
                ("insufficient_signal", "Insufficient signal"),
            ]
        ),
        "review_statuses": label_options(REVIEW_STATUS_OPTIONS),
        "signal_qualities": label_options(
            [
                ("strong", "Strong"),
                ("moderate", "Moderate"),
                ("weak", "Weak"),
            ]
        ),
        "review_queues": [
            {"value": "unreviewed", "label": "Unreviewed"},
            {"value": "low_confidence", "label": "Low-confidence profiles"},
            {"value": "other_dsat", "label": "Other dissatisfaction"},
            {"value": "insufficient_signal", "label": "Insufficient signal"},
            {"value": "high_value_negative", "label": "Negative but high-readiness"},
        ],
    }


def fetch_query_match_map(query: str) -> dict[str, dict[str, Any]]:
    trimmed = str(query or "").strip()
    if not trimmed:
        return {}

    match_query = build_match_query(trimmed)
    escaped_like = f"%{escape_like(trimmed.lower())}%"
    with get_connection(DB_PATH) as conn:
        if match_query:
            rows = conn.execute(
                """
                WITH matched AS (
                    SELECT
                        messages.conversation_id,
                        messages.id,
                        messages.message_datetime,
                        messages.message_content,
                        messages.sender_type,
                        messages.message_timestamp,
                        ROW_NUMBER() OVER (
                            PARTITION BY messages.conversation_id
                            ORDER BY messages.message_timestamp DESC, messages.id DESC
                        ) AS row_number
                    FROM message_search
                    JOIN messages ON messages.id = message_search.rowid
                    WHERE message_search MATCH ?
                      AND messages.message_content_lower LIKE ? ESCAPE '\\'
                )
                SELECT *
                FROM matched
                WHERE row_number = 1
                """,
                (match_query, escaped_like),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                WITH matched AS (
                    SELECT
                        conversation_id,
                        id,
                        message_datetime,
                        message_content,
                        sender_type,
                        message_timestamp,
                        ROW_NUMBER() OVER (
                            PARTITION BY conversation_id
                            ORDER BY message_timestamp DESC, id DESC
                        ) AS row_number
                    FROM messages
                    WHERE message_content_lower LIKE ? ESCAPE '\\'
                )
                SELECT *
                FROM matched
                WHERE row_number = 1
                """,
                (escaped_like,),
            ).fetchall()
    return {
        row["conversation_id"]: {
            "message_id": row["id"],
            "message_datetime": row["message_datetime"],
            "message_content": row["message_content"],
            "sender_type": row["sender_type"],
        }
        for row in rows
    }


def fetch_destination_match_ids(
    destination: str,
    match_mode: str = "hybrid",
) -> tuple[set[str] | None, list[dict[str, Any]]]:
    trimmed = str(destination or "").strip()
    if not trimmed:
        return None, []

    matches: list[dict[str, Any]] = []
    matches.extend(resolve_destination_values(trimmed, match_mode, ("city", "city_country")))
    matches.extend(resolve_country_values(trimmed, match_mode))
    if not matches:
        return set(), []

    unique_specs: dict[tuple[str, str], dict[str, Any]] = {}
    for match in matches:
        feature_type = "destination_city" if "__" in match["canonical_value"] else "destination_country"
        unique_specs[(feature_type, match["canonical_value"])] = match

    conversation_ids: set[str] = set()
    with get_connection(DB_PATH) as conn:
        for (feature_type, canonical_value), _ in unique_specs.items():
            rows = conn.execute(
                """
                SELECT DISTINCT conversation_id
                FROM conversation_rule_features
                WHERE feature_type = ? AND canonical_value = ?
                """,
                (feature_type, canonical_value),
            ).fetchall()
            conversation_ids.update(row["conversation_id"] for row in rows)
    return conversation_ids, list(unique_specs.values())


def fetch_base_rows(candidate_ids: set[str] | None = None) -> list[dict[str, Any]]:
    where_sql = ""
    params: list[Any] = []
    if candidate_ids is not None:
        if not candidate_ids:
            return []
        placeholders = ",".join("?" for _ in candidate_ids)
        where_sql = f"WHERE ci.conversation_id IN ({placeholders})"
        params.extend(sorted(candidate_ids))

    sql = f"""
        WITH
        {latest_profile_cte_sql()}
        ,
        cash_payment_customer AS (
            SELECT
                conversation_id,
                1 AS mentioned
            FROM conversation_rule_features
            WHERE feature_type = 'cash_payment_interest'
              AND sender_scope = 'customer'
            GROUP BY conversation_id
        )
        SELECT
            ci.conversation_id,
            ci.latest_message_timestamp,
            ci.latest_message_id,
            ci.latest_message_datetime,
            ci.latest_message_content,
            ci.he_number,
            ci.customer_number,
            ci.total_messages,
            ci.customer_message_count,
            ci.he_message_count,
            ci.explicit_destination_city,
            ci.explicit_destination_country,
            lp.summary,
            lp.travel_intent_primary,
            lp.travel_intent_secondary,
            lp.travel_intent_other_text,
            lp.destination_primary,
            lp.travel_cohort,
            lp.budget_conscious,
            lp.discount_readiness,
            lp.coupon_seeking,
            lp.overall_customer_sentiment,
            lp.dissatisfaction_reasons_json,
            lp.severity,
            lp.conversion_willingness,
            lp.primary_blocker,
            lp.next_best_action,
            lp.confidence_overall,
            lp.confidence_by_field_json,
            lp.evidence_by_field_json,
            lp.profile_status,
            lp.status AS profile_row_status,
            lp.model_name,
            lp.prompt_version,
            lp.schema_version,
            lp.enriched_at,
            cr.review_status,
            cr.corrected_profile_json,
            cr.reviewer_note,
            cr.reviewed_by,
            cr.reviewed_at,
            COALESCE(cpc.mentioned, 0) AS cash_payment_customer
        FROM conversation_index ci
        LEFT JOIN latest_profiles lp ON lp.conversation_id = ci.conversation_id
        LEFT JOIN conversation_reviews cr ON cr.conversation_id = ci.conversation_id
        LEFT JOIN cash_payment_customer cpc ON cpc.conversation_id = ci.conversation_id
        {where_sql}
        ORDER BY ci.latest_message_timestamp DESC
    """
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
    return [dict(row) for row in rows]


def row_to_profile(row: dict[str, Any]) -> dict[str, Any] | None:
    if not row.get("model_name") and not row.get("profile_row_status"):
        return None
    return {
        "summary": row.get("summary") or "",
        "travel_intent_primary": row.get("travel_intent_primary") or "unclear",
        "travel_intent_secondary": row.get("travel_intent_secondary"),
        "travel_intent_other_text": row.get("travel_intent_other_text"),
        "destination_primary": row.get("destination_primary") or "unclear",
        "travel_cohort": row.get("travel_cohort") or "unclear",
        "budget_conscious": row.get("budget_conscious") or "unclear",
        "discount_readiness": row.get("discount_readiness") or "unclear",
        "coupon_seeking": row.get("coupon_seeking") or "unclear",
        "overall_customer_sentiment": row.get("overall_customer_sentiment") or "unclear",
        "dissatisfaction_reasons": decode_json_list(row.get("dissatisfaction_reasons_json")),
        "severity": row.get("severity") or "unclear",
        "conversion_willingness": row.get("conversion_willingness") or "unclear",
        "primary_blocker": row.get("primary_blocker") or "unclear",
        "next_best_action": row.get("next_best_action") or "unclear",
        "confidence_overall": row.get("confidence_overall") or "unclear",
        "confidence_by_field": parse_json_object(row.get("confidence_by_field_json")),
        "evidence_by_field": parse_json_object(row.get("evidence_by_field_json")),
        "profile_status": row.get("profile_status") or "unclear",
        "model_name": row.get("model_name"),
        "prompt_version": row.get("prompt_version"),
        "schema_version": row.get("schema_version"),
        "enriched_at": row.get("enriched_at"),
    }


def hydrate_conversation_card(
    row: dict[str, Any],
    query_match_map: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    base_profile = row_to_profile(row)
    review_overrides = sanitize_review_corrections(
        parse_json_object(row.get("corrected_profile_json"))
    )
    merged_profile = merge_profile_overrides(base_profile, review_overrides)
    signal_quality = compute_signal_quality(
        int(row["total_messages"]),
        int(row["customer_message_count"]),
        int(row["he_message_count"]),
    )
    snippet = query_match_map.get(row["conversation_id"], {})
    destination_display = (
        (merged_profile or {}).get("destination_primary")
        or row.get("explicit_destination_city")
        or row.get("explicit_destination_country")
        or "unclear"
    )
    if destination_display == "unclear":
        destination_display = (
            row.get("explicit_destination_city")
            or row.get("explicit_destination_country")
            or "unclear"
        )

    summary = (
        (merged_profile or {}).get("summary")
        or str(snippet.get("message_content") or row.get("latest_message_content") or "")[:220]
    )
    return {
        "conversation_id": row["conversation_id"],
        "latest_message_timestamp": row["latest_message_timestamp"],
        "latest_message_datetime": row["latest_message_datetime"],
        "latest_message_id": row["latest_message_id"],
        "latest_message_content": row["latest_message_content"],
        "he_number": row["he_number"],
        "customer_number": row["customer_number"],
        "total_messages": int(row["total_messages"]),
        "customer_message_count": int(row["customer_message_count"]),
        "he_message_count": int(row["he_message_count"]),
        "signal_quality": signal_quality,
        "review_status": row.get("review_status") or "unreviewed",
        "reviewer_note": row.get("reviewer_note") or "",
        "reviewed_by": row.get("reviewed_by") or "",
        "reviewed_at": row.get("reviewed_at"),
        "profile": merged_profile,
        "raw_profile": base_profile,
        "explicit_destination_city": row.get("explicit_destination_city"),
        "explicit_destination_country": row.get("explicit_destination_country"),
        "display_destination": destination_display,
        "summary": summary,
        "cash_payment_interest": "yes" if int(row.get("cash_payment_customer") or 0) else "no",
        "query_match": snippet or None,
    }


def profile_matches_filters(card: dict[str, Any], args) -> bool:
    profile = card.get("profile") or {}
    if (
        arg_value(args, "enriched_only", default="") or ""
    ).strip().lower() == "true" and not card.get("profile"):
        return False
    if (arg_value(args, "travel_intent", default="") or "").strip():
        if profile.get("travel_intent_primary") != arg_value(args, "travel_intent"):
            return False
    if (arg_value(args, "budget_conscious", default="") or "").strip():
        if profile.get("budget_conscious") != arg_value(args, "budget_conscious"):
            return False
    if (arg_value(args, "travel_cohort", default="") or "").strip():
        if profile.get("travel_cohort") != arg_value(args, "travel_cohort"):
            return False
    if (arg_value(args, "discount_readiness", default="") or "").strip():
        if profile.get("discount_readiness") != arg_value(args, "discount_readiness"):
            return False
    if (arg_value(args, "coupon_seeking", default="") or "").strip():
        if profile.get("coupon_seeking") != arg_value(args, "coupon_seeking"):
            return False
    if (arg_value(args, "cash_payment_interest", default="") or "").strip():
        if card.get("cash_payment_interest") != arg_value(args, "cash_payment_interest"):
            return False
    if (arg_value(args, "sentiment", default="") or "").strip():
        if profile.get("overall_customer_sentiment") != arg_value(args, "sentiment"):
            return False
    if (arg_value(args, "dissatisfaction_reason", default="") or "").strip():
        if arg_value(args, "dissatisfaction_reason") not in (
            profile.get("dissatisfaction_reasons") or []
        ):
            return False
    if (arg_value(args, "severity", default="") or "").strip():
        if profile.get("severity") != arg_value(args, "severity"):
            return False
    if (arg_value(args, "conversion_willingness", default="") or "").strip():
        if profile.get("conversion_willingness") != arg_value(
            args,
            "conversion_willingness",
        ):
            return False
    if (arg_value(args, "primary_blocker", default="") or "").strip():
        if profile.get("primary_blocker") != arg_value(args, "primary_blocker"):
            return False
    if (arg_value(args, "profile_status", default="") or "").strip():
        if profile.get("profile_status") != arg_value(args, "profile_status"):
            return False
    if (arg_value(args, "review_status", default="") or "").strip():
        if card.get("review_status") != arg_value(args, "review_status"):
            return False
    if (arg_value(args, "signal_quality", default="") or "").strip():
        if card.get("signal_quality") != arg_value(args, "signal_quality"):
            return False
    if (arg_value(args, "confidence", default="") or "").strip():
        if confidence_rank(profile.get("confidence_overall")) < confidence_rank(
            arg_value(args, "confidence")
        ):
            return False
    if (
        arg_value(args, "enough_signal_only", default="") or ""
    ).strip().lower() == "true" and card.get("signal_quality") == "weak":
        return False
    return True


def collect_filtered_cards(args) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    query = (arg_value(args, "q", default="") or "").strip()
    destination = (arg_value(args, "destination", default="") or "").strip()
    match_mode = (
        (arg_value(args, "match_mode", default="hybrid") or "hybrid")
        .strip()
        .lower()
        or "hybrid"
    )

    query_match_map = fetch_query_match_map(query)
    destination_ids, resolved_destination = fetch_destination_match_ids(
        destination,
        match_mode=match_mode,
    )

    candidate_ids: set[str] | None = None
    if query:
        candidate_ids = set(query_match_map.keys())
    if destination_ids is not None:
        candidate_ids = destination_ids if candidate_ids is None else candidate_ids & destination_ids

    rows = fetch_base_rows(candidate_ids)
    cards = [hydrate_conversation_card(row, query_match_map) for row in rows]
    cards = [card for card in cards if profile_matches_filters(card, args)]
    return cards, {"resolved_destination": resolved_destination}


def search_conversations(args) -> dict[str, Any]:
    page, page_size, offset = normalize_page_args(args)
    cards, extras = collect_filtered_cards(args)
    total = len(cards)
    total_pages = math.ceil(total / page_size) if total else 0
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "results": cards[offset : offset + page_size],
        "resolved_destination": extras["resolved_destination"],
    }


def bucketize(counter: Counter, limit: int | None = None) -> list[dict[str, Any]]:
    return [
        {"value": key, "count": value}
        for key, value in counter.most_common(limit)
    ]


def sample_quality(count: int) -> str:
    if count >= 100:
        return "strong"
    if count >= 30:
        return "directional"
    if count >= 10:
        return "small"
    return "tiny"


def fetch_analysis_snapshot(args) -> dict[str, Any]:
    cards, _ = collect_filtered_cards(args)
    total = len(cards)
    profiled = sum(1 for card in cards if card.get("profile"))
    reviewed = sum(
        1 for card in cards if card.get("review_status") != "unreviewed"
    )
    negative = sum(
        1
        for card in cards
        if (card.get("profile") or {}).get("overall_customer_sentiment") == "negative"
    )
    dsat = sum(
        1
        for card in cards
        if any(
            reason != "none"
            for reason in ((card.get("profile") or {}).get("dissatisfaction_reasons") or [])
        )
    )
    budget_yes = sum(
        1
        for card in cards
        if (card.get("profile") or {}).get("budget_conscious") == "yes"
    )
    willingness_high = sum(
        1
        for card in cards
        if (card.get("profile") or {}).get("conversion_willingness") == "high"
    )

    intent_counter: Counter = Counter()
    destination_counter: Counter = Counter()
    budget_counter: Counter = Counter()
    cohort_counter: Counter = Counter()
    discount_counter: Counter = Counter()
    coupon_counter: Counter = Counter()
    sentiment_counter: Counter = Counter()
    dsat_counter: Counter = Counter()
    severity_counter: Counter = Counter()
    willingness_counter: Counter = Counter()
    blocker_counter: Counter = Counter()
    signal_counter: Counter = Counter()
    cash_counter: Counter = Counter()

    for card in cards:
        profile = card.get("profile") or {}
        intent_counter[profile.get("travel_intent_primary") or "unclear"] += 1
        destination_counter[card.get("display_destination") or "unclear"] += 1
        cohort_counter[profile.get("travel_cohort") or "unclear"] += 1
        budget_counter[profile.get("budget_conscious") or "unclear"] += 1
        discount_counter[profile.get("discount_readiness") or "unclear"] += 1
        coupon_counter[profile.get("coupon_seeking") or "unclear"] += 1
        sentiment_counter[profile.get("overall_customer_sentiment") or "unclear"] += 1
        for reason in profile.get("dissatisfaction_reasons") or ["none"]:
            dsat_counter[reason] += 1
        severity_counter[profile.get("severity") or "unclear"] += 1
        willingness_counter[profile.get("conversion_willingness") or "unclear"] += 1
        blocker_counter[profile.get("primary_blocker") or "unclear"] += 1
        signal_counter[card.get("signal_quality") or "weak"] += 1
        cash_counter[card.get("cash_payment_interest") or "no"] += 1

    return {
        "sample_size": total,
        "sample_quality": sample_quality(total),
        "kpis": {
            "conversations": total,
            "profiled": profiled,
            "reviewed": reviewed,
            "negative_percent": round((negative / total) * 100, 1) if total else 0.0,
            "dissatisfaction_percent": round((dsat / total) * 100, 1) if total else 0.0,
            "budget_conscious_percent": round((budget_yes / total) * 100, 1) if total else 0.0,
            "high_willingness_percent": round((willingness_high / total) * 100, 1)
            if total
            else 0.0,
        },
        "distributions": {
            "intent": bucketize(intent_counter, 10),
            "destination": bucketize(destination_counter, 10),
            "cohort": bucketize(cohort_counter),
            "budget": bucketize(budget_counter),
            "discount": bucketize(discount_counter),
            "coupon": bucketize(coupon_counter),
            "sentiment": bucketize(sentiment_counter),
            "dissatisfaction": bucketize(dsat_counter, 10),
            "severity": bucketize(severity_counter),
            "willingness": bucketize(willingness_counter),
            "blocker": bucketize(blocker_counter),
            "signal_quality": bucketize(signal_counter),
            "cash_payment": bucketize(cash_counter),
        },
    }


def fetch_review_queue(args) -> dict[str, Any]:
    page, page_size, offset = normalize_page_args(args)
    queue = (arg_value(args, "queue", default="unreviewed") or "unreviewed").strip()
    cards, _ = collect_filtered_cards(args)

    def matches_queue(card: dict[str, Any]) -> bool:
        profile = card.get("profile") or {}
        if queue == "unreviewed":
            return card.get("review_status") == "unreviewed"
        if queue == "low_confidence":
            return (profile.get("confidence_overall") or "unclear") in {"low", "unclear"}
        if queue == "other_dsat":
            return "other" in (profile.get("dissatisfaction_reasons") or [])
        if queue == "insufficient_signal":
            return profile.get("profile_status") == "insufficient_signal" or card.get("signal_quality") == "weak"
        if queue == "high_value_negative":
            return (
                profile.get("overall_customer_sentiment") == "negative"
                and profile.get("conversion_willingness") == "high"
            )
        return True

    filtered = [card for card in cards if matches_queue(card)]
    total = len(filtered)
    total_pages = math.ceil(total / page_size) if total else 0
    return {
        "queue": queue,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "results": filtered[offset : offset + page_size],
    }


def fetch_conversation_workspace(
    conversation_id: str,
    selected_id: int | None = None,
) -> dict[str, Any] | None:
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT
                id,
                conversation_id,
                message_datetime,
                he_number,
                customer_number,
                sender_number,
                sender_type,
                message_type,
                message_content,
                message_timestamp
            FROM messages
            WHERE conversation_id = ?
            ORDER BY message_timestamp ASC, id ASC
            """,
            (conversation_id,),
        ).fetchall()
        if not rows:
            return None

        aggregate = conn.execute(
            """
            SELECT customer_message_ids_json, he_message_ids_json, message_ids_json
            FROM conversation_aggregate
            WHERE conversation_id = ?
            """,
            (conversation_id,),
        ).fetchone()
        rule_rows = conn.execute(
            """
            SELECT
                feature_type,
                canonical_value,
                display_value,
                sender_scope,
                evidence_message_ids_json,
                matched_terms_json
            FROM conversation_rule_features
            WHERE conversation_id = ?
            ORDER BY feature_type, display_value, sender_scope
            """,
            (conversation_id,),
        ).fetchall()
        llm_row = conn.execute(
            f"""
            WITH {latest_profile_cte_sql()}
            SELECT *
            FROM latest_profiles
            WHERE conversation_id = ?
            """,
            (conversation_id,),
        ).fetchone()
        review_row = conn.execute(
            """
            SELECT review_status, corrected_profile_json, reviewer_note, reviewed_by, reviewed_at
            FROM conversation_reviews
            WHERE conversation_id = ?
            """,
            (conversation_id,),
        ).fetchone()

    total_messages = len(json.loads(aggregate["message_ids_json"])) if aggregate else len(rows)
    customer_message_count = len(json.loads(aggregate["customer_message_ids_json"])) if aggregate else 0
    he_message_count = len(json.loads(aggregate["he_message_ids_json"])) if aggregate else 0
    signal_quality = compute_signal_quality(total_messages, customer_message_count, he_message_count)

    facts = {
        "signal_quality": signal_quality,
        "total_messages": total_messages,
        "customer_message_count": customer_message_count,
        "he_message_count": he_message_count,
        "destination_city": [],
        "destination_country": [],
        "intent": [],
        "dissatisfaction": [],
        "cash_payment_interest": [],
    }
    evidence_ids: set[int] = set()
    for row in rule_rows:
        evidence = decode_json_list(row["evidence_message_ids_json"])
        facts[row["feature_type"]].append(
            {
                "canonical_value": row["canonical_value"],
                "display_value": row["display_value"],
                "sender_scope": row["sender_scope"],
                "matched_terms": decode_json_list(row["matched_terms_json"]),
                "evidence_message_ids": evidence,
            }
        )
        evidence_ids.update(int(message_id) for message_id in evidence)

    base_profile = None
    if llm_row:
        base_profile = {
            "summary": llm_row["summary"] or "",
            "travel_intent_primary": llm_row["travel_intent_primary"] or "unclear",
            "travel_intent_secondary": llm_row["travel_intent_secondary"],
            "travel_intent_other_text": llm_row["travel_intent_other_text"],
            "destination_primary": llm_row["destination_primary"] or "unclear",
            "travel_cohort": llm_row["travel_cohort"] or "unclear",
            "budget_conscious": llm_row["budget_conscious"] or "unclear",
            "discount_readiness": llm_row["discount_readiness"] or "unclear",
            "coupon_seeking": llm_row["coupon_seeking"] or "unclear",
            "overall_customer_sentiment": llm_row["overall_customer_sentiment"] or "unclear",
            "dissatisfaction_reasons": decode_json_list(llm_row["dissatisfaction_reasons_json"]),
            "severity": llm_row["severity"] or "unclear",
            "conversion_willingness": llm_row["conversion_willingness"] or "unclear",
            "primary_blocker": llm_row["primary_blocker"] or "unclear",
            "next_best_action": llm_row["next_best_action"] or "unclear",
            "confidence_overall": llm_row["confidence_overall"] or "unclear",
            "confidence_by_field": parse_json_object(llm_row["confidence_by_field_json"]),
            "evidence_by_field": parse_json_object(llm_row["evidence_by_field_json"]),
            "profile_status": llm_row["profile_status"] or "unclear",
            "model_name": llm_row["model_name"],
            "prompt_version": llm_row["prompt_version"],
            "schema_version": llm_row["schema_version"],
            "enriched_at": llm_row["enriched_at"],
        }
        for values in base_profile["evidence_by_field"].values():
            for message_id in values:
                try:
                    evidence_ids.add(int(message_id))
                except (TypeError, ValueError):
                    continue

    review_overrides = sanitize_review_corrections(
        parse_json_object(review_row["corrected_profile_json"]) if review_row else {}
    )
    merged_profile = merge_profile_overrides(base_profile, review_overrides)
    first_row = rows[0]
    return {
        "conversation_id": conversation_id,
        "selected_id": selected_id,
        "he_number": first_row["he_number"],
        "customer_number": first_row["customer_number"],
        "messages": [dict(row) for row in rows],
        "facts": facts,
        "profile": merged_profile,
        "raw_profile": base_profile,
        "review": {
            "review_status": review_row["review_status"] if review_row else "unreviewed",
            "reviewer_note": review_row["reviewer_note"] if review_row else "",
            "reviewed_by": review_row["reviewed_by"] if review_row else "",
            "reviewed_at": review_row["reviewed_at"] if review_row else None,
            "corrected_fields": review_overrides,
        },
        "evidence_message_ids": sorted(evidence_ids),
    }


def save_review(payload: dict[str, Any]) -> dict[str, Any]:
    conversation_id = str(payload.get("conversation_id") or "").strip()
    if not conversation_id:
        raise ValueError("conversation_id is required")

    review_status = str(payload.get("review_status") or "corrected").strip().lower()
    allowed_statuses = {value for value, _ in REVIEW_STATUS_OPTIONS}
    if review_status not in allowed_statuses:
        review_status = "corrected"

    corrected_fields = sanitize_review_corrections(payload.get("corrected_fields") or {})
    reviewer_note = str(payload.get("reviewer_note") or "").strip()
    reviewed_by = str(payload.get("reviewed_by") or "").strip()

    with get_connection(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO conversation_reviews (
                conversation_id,
                review_status,
                corrected_profile_json,
                reviewer_note,
                reviewed_by,
                reviewed_at
            ) VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(conversation_id)
            DO UPDATE SET
                review_status = excluded.review_status,
                corrected_profile_json = excluded.corrected_profile_json,
                reviewer_note = excluded.reviewer_note,
                reviewed_by = excluded.reviewed_by,
                reviewed_at = excluded.reviewed_at
            """,
            (
                conversation_id,
                review_status,
                json.dumps(corrected_fields),
                reviewer_note,
                reviewed_by,
            ),
        )
        conn.commit()

    workspace = fetch_conversation_workspace(conversation_id)
    if workspace is None:
        raise ValueError("Conversation not found after saving review")
    return workspace["review"]
