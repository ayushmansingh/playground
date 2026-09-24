"""One conversation: its transcript, AI profile, and human review."""

from __future__ import annotations

import json
from typing import Any

from conversation_profile_contract import (
    REVIEW_STATUS_OPTIONS,
    merge_profile_overrides,
    sanitize_review_corrections,
)
from database import DB_PATH, get_connection

# The newest completed profile per conversation.
LATEST_PROFILE_CTE = """
    latest_profiles AS (
        SELECT * FROM (
            SELECT
                cp.*,
                ROW_NUMBER() OVER (
                    PARTITION BY cp.conversation_id
                    ORDER BY COALESCE(cp.enriched_at, '') DESC, cp.model_name DESC, cp.prompt_version DESC
                ) AS position
            FROM conversation_profiles cp
            WHERE cp.status = 'complete'
        )
        WHERE position = 1
    )
"""


def parse_json(value: str | None, expected: type) -> Any:
    try:
        data = json.loads(value) if value else expected()
    except json.JSONDecodeError:
        return expected()
    return data if isinstance(data, expected) else expected()


def signal_quality(total_messages: int, customer_messages: int, he_messages: int) -> str:
    if customer_messages >= 3 and he_messages >= 1 and total_messages >= 6:
        return "strong"
    if customer_messages >= 2 and total_messages >= 4:
        return "moderate"
    return "weak"


def profile_from_row(row: dict[str, Any]) -> dict[str, Any]:
    """The profile fields of a conversation_profiles row, with unclear defaults."""
    def value(key: str) -> str:
        return row.get(key) or "unclear"

    return {
        "summary": row.get("summary") or "",
        "travel_intent_primary": value("travel_intent_primary"),
        "travel_intent_secondary": row.get("travel_intent_secondary"),
        "travel_intent_other_text": row.get("travel_intent_other_text"),
        "destination_primary": value("destination_primary"),
        "travel_cohort": value("travel_cohort"),
        "budget_conscious": value("budget_conscious"),
        "discount_readiness": value("discount_readiness"),
        "coupon_seeking": value("coupon_seeking"),
        "overall_customer_sentiment": value("overall_customer_sentiment"),
        "dissatisfaction_reasons": parse_json(row.get("dissatisfaction_reasons_json"), list),
        "severity": value("severity"),
        "conversion_willingness": value("conversion_willingness"),
        "primary_blocker": value("primary_blocker"),
        "next_best_action": value("next_best_action"),
        "confidence_overall": value("confidence_overall"),
        "confidence_by_field": parse_json(row.get("confidence_by_field_json"), dict),
        "evidence_by_field": parse_json(row.get("evidence_by_field_json"), dict),
        "profile_status": value("profile_status"),
        "model_name": row.get("model_name"),
        "prompt_version": row.get("prompt_version"),
        "schema_version": row.get("schema_version"),
        "enriched_at": row.get("enriched_at"),
    }


def reviewed_profile(profile: dict[str, Any] | None, corrected_profile_json: str | None) -> dict[str, Any] | None:
    """The AI profile with the reviewer's corrections applied on top."""
    overrides = sanitize_review_corrections(parse_json(corrected_profile_json, dict))
    return merge_profile_overrides(profile, overrides)


def fetch_conversation(conversation_id: str) -> dict[str, Any] | None:
    with get_connection(DB_PATH) as conn:
        messages = [
            dict(row)
            for row in conn.execute(
                """
                SELECT id, message_datetime, sender_type, message_type, message_content, message_timestamp
                FROM messages
                WHERE conversation_id = ?
                ORDER BY message_timestamp ASC, id ASC
                """,
                (conversation_id,),
            )
        ]
        if not messages:
            return None
        summary = dict(conn.execute(
            "SELECT * FROM conversation_index WHERE conversation_id = ?", (conversation_id,)
        ).fetchone())
        profile_row = conn.execute(
            f"WITH {LATEST_PROFILE_CTE} SELECT * FROM latest_profiles WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchone()
        review_row = conn.execute(
            """
            SELECT review_status, corrected_profile_json, reviewer_note, reviewed_by, reviewed_at
            FROM conversation_reviews WHERE conversation_id = ?
            """,
            (conversation_id,),
        ).fetchone()

    review = dict(review_row) if review_row else {}
    raw_profile = profile_from_row(dict(profile_row)) if profile_row else None
    evidence_ids = {
        int(message_id)
        for ids in (raw_profile or {}).get("evidence_by_field", {}).values()
        if isinstance(ids, list)
        for message_id in ids
        if str(message_id).isdigit()
    }
    return {
        "conversation_id": conversation_id,
        "he_number": summary["he_number"],
        "customer_number": summary["customer_number"],
        "total_messages": summary["total_messages"],
        "signal_quality": signal_quality(
            summary["total_messages"], summary["customer_message_count"], summary["he_message_count"]
        ),
        "messages": messages,
        "profile": reviewed_profile(raw_profile, review.get("corrected_profile_json")),
        "raw_profile": raw_profile,
        "review": {
            "review_status": review.get("review_status") or "unreviewed",
            "reviewer_note": review.get("reviewer_note") or "",
            "reviewed_by": review.get("reviewed_by") or "",
            "reviewed_at": review.get("reviewed_at"),
        },
        "evidence_message_ids": sorted(evidence_ids),
    }


def save_review(payload: dict[str, Any]) -> dict[str, Any]:
    conversation_id = str(payload.get("conversation_id") or "").strip()
    if not conversation_id:
        raise ValueError("conversation_id is required")

    review_status = str(payload.get("review_status") or "corrected").strip().lower()
    if review_status not in {value for value, _ in REVIEW_STATUS_OPTIONS}:
        review_status = "corrected"

    with get_connection(DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO conversation_reviews (
                conversation_id, review_status, corrected_profile_json,
                reviewer_note, reviewed_by, reviewed_at
            ) VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(conversation_id) DO UPDATE SET
                review_status = excluded.review_status,
                corrected_profile_json = excluded.corrected_profile_json,
                reviewer_note = excluded.reviewer_note,
                reviewed_by = excluded.reviewed_by,
                reviewed_at = excluded.reviewed_at
            """,
            (
                conversation_id,
                review_status,
                json.dumps(sanitize_review_corrections(payload.get("corrected_fields") or {})),
                str(payload.get("reviewer_note") or "").strip(),
                str(payload.get("reviewed_by") or "").strip(),
            ),
        )
        conn.commit()

    conversation = fetch_conversation(conversation_id)
    if conversation is None:
        raise ValueError("Conversation not found after saving review")
    return conversation["review"]
