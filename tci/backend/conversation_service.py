"""One conversation (one lead): its transcript and AI profile."""

from __future__ import annotations

import json
from typing import Any

from database import DB_PATH, format_timestamp, get_connection


def parse_json(value: str | None, expected: type) -> Any:
    try:
        data = json.loads(value) if value else expected()
    except json.JSONDecodeError:
        return expected()
    return data if isinstance(data, expected) else expected()


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


def fetch_conversation(conversation_id: str) -> dict[str, Any] | None:
    with get_connection(DB_PATH) as conn:
        summary = conn.execute(
            "SELECT * FROM conversations WHERE conversation_id = ? AND total_messages > 0", (conversation_id,)
        ).fetchone()
        if summary is None:
            return None
        messages = [
            {
                "id": row["id"],
                "message_timestamp": row["sent_at"],
                "message_datetime": format_timestamp(row["sent_at"]),
                "sender_type": row["sender_type"],
                "message_type": row["message_type"],
                "message_content": row["content"],
            }
            for row in conn.execute(
                """
                SELECT id, sent_at, sender_type, message_type, content FROM messages
                WHERE conversation_key = ? ORDER BY sent_at, id
                """,
                (summary["id"],),
            )
        ]
        profile_row = conn.execute(
            "SELECT * FROM conversation_profiles WHERE conversation_id = ? AND status = 'complete'",
            (conversation_id,),
        ).fetchone()

    profile = profile_from_row(dict(profile_row)) if profile_row else None
    evidence_ids = {
        int(message_id)
        for ids in (profile or {}).get("evidence_by_field", {}).values()
        if isinstance(ids, list)
        for message_id in ids
        if str(message_id).isdigit()
    }
    return {
        "conversation_id": conversation_id,
        "he_id": summary["he_id"],
        "lead_state": summary["lead_state"],
        "total_messages": summary["total_messages"],
        "signal_quality": summary["signal_quality"],
        "messages": messages,
        "profile": profile,
        "evidence_message_ids": sorted(evidence_ids),
    }
