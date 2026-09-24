"""Insights over AI-enriched conversations: filter options, filtering, analysis.

Only conversations with a completed AI profile take part. Reviewer
corrections are applied before filtering, so a corrected field filters and
counts by its corrected value.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Any

from conversation_profile_contract import (
    CONFIDENCE_OPTIONS,
    DSAT_REASON_OPTIONS,
    REVIEW_STATUS_OPTIONS,
    SENTIMENT_OPTIONS,
    SEVERITY_OPTIONS,
    TRAVEL_COHORT_OPTIONS,
    TRAVEL_INTENT_OPTIONS,
)
from conversation_service import LATEST_PROFILE_CTE, profile_from_row, reviewed_profile, signal_quality
from database import DB_PATH, get_connection
from search_service import page_args


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
    "review_statuses": label_options(REVIEW_STATUS_OPTIONS),
    "signal_qualities": label_options([("strong", "Strong"), ("moderate", "Moderate"), ("weak", "Weak")]),
}

# Preset views over the profiled conversations, mostly for reviewers.
QUICK_VIEWS = {
    "unreviewed": ("Unreviewed", lambda card, profile: card["review_status"] == "unreviewed"),
    "low_confidence": ("Low confidence", lambda card, profile: profile["confidence_overall"] in {"low", "unclear"}),
    "other_dsat": ("Other dissatisfaction", lambda card, profile: "other" in profile["dissatisfaction_reasons"]),
    "insufficient_signal": (
        "Insufficient signal",
        lambda card, profile: profile["profile_status"] == "insufficient_signal" or card["signal_quality"] == "weak",
    ),
    "high_value_negative": (
        "Negative but ready to book",
        lambda card, profile: profile["overall_customer_sentiment"] == "negative"
        and profile["conversion_willingness"] == "high",
    ),
}

# Filter parameter -> profile field it must equal.
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


def fetch_meta() -> dict[str, int]:
    with get_connection(DB_PATH) as conn:
        return {
            "message_count": conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0],
            "conversation_count": conn.execute("SELECT COUNT(*) FROM conversation_index").fetchone()[0],
            "profile_count": conn.execute(
                "SELECT COUNT(DISTINCT conversation_id) FROM conversation_profiles WHERE status = 'complete'"
            ).fetchone()[0],
            "reviewed_count": conn.execute(
                "SELECT COUNT(*) FROM conversation_reviews WHERE review_status != 'unreviewed'"
            ).fetchone()[0],
        }


def fetch_filter_options() -> dict[str, Any]:
    with get_connection(DB_PATH) as conn:
        destinations = [
            row[0]
            for row in conn.execute(
                f"""
                WITH {LATEST_PROFILE_CTE}
                SELECT destination_primary FROM latest_profiles
                WHERE COALESCE(destination_primary, '') NOT IN ('', 'unclear')
                GROUP BY destination_primary
                ORDER BY COUNT(*) DESC, destination_primary
                """
            )
        ]
    return {
        **FIELD_OPTIONS,
        "destination_suggestions": destinations,
        "quick_views": [{"value": key, "label": label} for key, (label, _) in QUICK_VIEWS.items()],
    }


def fetch_profiled_cards() -> list[dict[str, Any]]:
    """Every conversation with a completed profile, newest first."""
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(
            f"""
            WITH {LATEST_PROFILE_CTE}
            SELECT
                lp.*,
                ci.latest_message_id, ci.latest_message_datetime, ci.latest_message_timestamp,
                ci.he_number, ci.customer_number, ci.total_messages,
                ci.customer_message_count, ci.he_message_count,
                cr.review_status, cr.corrected_profile_json
            FROM latest_profiles lp
            JOIN conversation_index ci ON ci.conversation_id = lp.conversation_id
            LEFT JOIN conversation_reviews cr ON cr.conversation_id = lp.conversation_id
            ORDER BY ci.latest_message_timestamp DESC
            """
        ).fetchall()

    cards = []
    for row in map(dict, rows):
        profile = reviewed_profile(profile_from_row(row), row["corrected_profile_json"])
        cards.append({
            "conversation_id": row["conversation_id"],
            "he_number": row["he_number"],
            "customer_number": row["customer_number"],
            "latest_message_id": row["latest_message_id"],
            "latest_message_datetime": row["latest_message_datetime"],
            "total_messages": row["total_messages"],
            "signal_quality": signal_quality(
                row["total_messages"], row["customer_message_count"], row["he_message_count"]
            ),
            "review_status": row["review_status"] or "unreviewed",
            "profile": profile,
        })
    return cards


def card_matches(card: dict[str, Any], args) -> bool:
    profile = card["profile"]

    def arg(key: str) -> str:
        return (args.get(key) or "").strip()

    destination = arg("destination").lower()
    if destination and destination not in (profile["destination_primary"] or "").lower():
        return False
    for key, field in EXACT_PROFILE_FILTERS.items():
        if arg(key) and profile[field] != arg(key):
            return False
    if arg("dissatisfaction_reason") and arg("dissatisfaction_reason") not in profile["dissatisfaction_reasons"]:
        return False
    if arg("confidence") and CONFIDENCE_RANK.get(profile["confidence_overall"], 0) < CONFIDENCE_RANK.get(arg("confidence"), 0):
        return False
    if arg("review_status") and card["review_status"] != arg("review_status"):
        return False
    if arg("signal_quality") and card["signal_quality"] != arg("signal_quality"):
        return False
    view = QUICK_VIEWS.get(arg("view"))
    if view and not view[1](card, profile):
        return False
    return True


def filtered_cards(args) -> list[dict[str, Any]]:
    return [card for card in fetch_profiled_cards() if card_matches(card, args)]


def list_insights(args) -> dict[str, Any]:
    page, page_size, offset = page_args(args)
    cards = filtered_cards(args)
    total = len(cards)
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": math.ceil(total / page_size) if total else 0,
        "results": cards[offset : offset + page_size],
    }


def sample_quality(count: int) -> str:
    if count >= 100:
        return "strong"
    if count >= 30:
        return "directional"
    if count >= 10:
        return "small"
    return "tiny"


# Distribution key -> profile field it counts (top 10 kept for the long ones).
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
    cards = filtered_cards(args)
    total = len(cards)
    counters: dict[str, Counter] = {key: Counter() for key in [*DISTRIBUTIONS, "dissatisfaction", "signal_quality"]}
    for card in cards:
        profile = card["profile"]
        for key, field in DISTRIBUTIONS.items():
            counters[key][profile[field] or "unclear"] += 1
        for reason in profile["dissatisfaction_reasons"] or ["none"]:
            counters["dissatisfaction"][reason] += 1
        counters["signal_quality"][card["signal_quality"]] += 1

    def percent(predicate) -> float:
        return round(sum(1 for card in cards if predicate(card)) / total * 100, 1) if total else 0.0

    return {
        "sample_size": total,
        "sample_quality": sample_quality(total),
        "kpis": {
            "conversations": total,
            "reviewed": sum(1 for card in cards if card["review_status"] != "unreviewed"),
            "negative_percent": percent(lambda card: card["profile"]["overall_customer_sentiment"] == "negative"),
            "dissatisfaction_percent": percent(
                lambda card: any(reason != "none" for reason in card["profile"]["dissatisfaction_reasons"])
            ),
            "budget_conscious_percent": percent(lambda card: card["profile"]["budget_conscious"] == "yes"),
            "high_willingness_percent": percent(lambda card: card["profile"]["conversion_willingness"] == "high"),
        },
        "distributions": {
            key: [{"value": value, "count": count} for value, count in counter.most_common(TOP_N.get(key))]
            for key, counter in counters.items()
        },
    }
