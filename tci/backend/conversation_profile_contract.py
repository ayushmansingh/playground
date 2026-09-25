from __future__ import annotations

import json
from typing import Any

PROFILE_SCHEMA_VERSION = "travel-profile-v3"
# Change this whenever profile_prompt_spec() or the user prompt changes.
PROFILE_PROMPT_VERSION = "travel-profile-focused-intent-commercial-v1"

TRAVEL_INTENT_OPTIONS = [
    ("honeymoon", "Honeymoon"),
    ("pilgrimage", "Pilgrimage"),
    ("adventure", "Adventure"),
    ("night_life", "Night life"),
    ("family_vacation", "Family vacation"),
    ("unclear", "Unclear"),
]

BUDGET_CONSCIOUS_OPTIONS = [
    ("yes", "Yes"),
    ("no", "No"),
    ("unclear", "Unclear"),
]

TRAVEL_COHORT_OPTIONS = [
    ("couple", "Couple (2 pax)"),
    ("family_with_kids", "Family (with kids)"),
    ("solo", "Solo (1 pax)"),
    ("unclear", "Unclear"),
]

DISCOUNT_READINESS_OPTIONS = [
    ("none", "None"),
    ("low", "Low"),
    ("medium", "Medium"),
    ("high", "High"),
    ("unclear", "Unclear"),
]

COUPON_SEEKING_OPTIONS = [
    ("yes", "Yes"),
    ("no", "No"),
    ("unclear", "Unclear"),
]

SENTIMENT_OPTIONS = [
    ("positive", "Positive"),
    ("neutral", "Neutral"),
    ("negative", "Negative"),
    ("mixed", "Mixed"),
    ("unclear", "Unclear"),
]

DSAT_REASON_OPTIONS = [
    ("none", "None"),
    ("price_high", "Price high"),
    ("budget_mismatch", "Budget mismatch"),
    ("availability_issue", "Availability issue"),
    ("slow_response", "Slow response"),
    ("no_callback_followup", "No callback or follow-up"),
    ("quote_confusion", "Quote confusion"),
    ("package_itinerary_mismatch", "Package or itinerary mismatch"),
    ("visa_document_issue", "Visa or document issue"),
    ("payment_issue", "Payment issue"),
    ("booking_issue", "Booking issue"),
    ("refund_cancellation", "Refund or cancellation"),
    ("incorrect_information", "Incorrect information"),
    ("lack_of_transparency", "Lack of transparency"),
    ("not_interested_anymore", "Not interested anymore"),
    ("other", "Other"),
]

SEVERITY_OPTIONS = [
    ("none", "None"),
    ("low", "Low"),
    ("medium", "Medium"),
    ("high", "High"),
    ("unclear", "Unclear"),
]

WILLINGNESS_OPTIONS = [
    ("low", "Low"),
    ("medium", "Medium"),
    ("high", "High"),
    ("unclear", "Unclear"),
]

PRIMARY_BLOCKER_OPTIONS = [
    ("price", "Price"),
    ("availability", "Availability"),
    ("slow_followup", "Slow follow-up"),
    ("quote_uncertainty", "Quote uncertainty"),
    ("visa_documents", "Visa or documents"),
    ("payment_booking", "Payment or booking"),
    ("package_fit", "Package fit"),
    ("low_intent", "Low intent"),
    ("unclear", "Unclear"),
]

NEXT_ACTION_OPTIONS = [
    ("callback", "Callback"),
    ("revised_quote", "Revised quote"),
    ("alternate_destination", "Alternate destination"),
    ("alternate_dates", "Alternate dates"),
    ("clarify_quote", "Clarify quote"),
    ("visa_guidance", "Visa guidance"),
    ("payment_support", "Payment support"),
    ("booking_support", "Booking support"),
    ("close_loop", "Close loop"),
    ("monitor", "Monitor"),
    ("unclear", "Unclear"),
]

CONFIDENCE_OPTIONS = [
    ("low", "Low"),
    ("medium", "Medium"),
    ("high", "High"),
    ("unclear", "Unclear"),
]

PROFILE_STATUS_OPTIONS = [
    ("complete", "Complete"),
    ("unclear", "Unclear"),
    ("insufficient_signal", "Insufficient signal"),
]

CONFIDENCE_FIELD_KEYS = [
    "intent",
    "cohort",
    "budget",
    "discount",
    "coupon",
    "sentiment",
    "dissatisfaction",
    "willingness",
    "blocker",
]

EVIDENCE_FIELD_KEYS = [
    "summary",
    "intent",
    "cohort",
    "budget",
    "discount",
    "coupon",
    "sentiment",
    "dissatisfaction",
    "willingness",
    "blocker",
]

PROFILE_FIELD_KEYS = [
    "summary",
    "travel_intent_primary",
    "travel_intent_secondary",
    "travel_intent_other_text",
    "destination_primary",
    "travel_cohort",
    "budget_conscious",
    "discount_readiness",
    "coupon_seeking",
    "overall_customer_sentiment",
    "dissatisfaction_reasons",
    "severity",
    "conversion_willingness",
    "primary_blocker",
    "next_best_action",
    "confidence_overall",
    "confidence_by_field",
    "evidence_by_field",
    "profile_status",
]


def enum_values(options: list[tuple[str, str]]) -> list[str]:
    return [value for value, _ in options]


def profile_json_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "summary": {"type": "string"},
            "travel_intent_primary": {"type": "string", "enum": enum_values(TRAVEL_INTENT_OPTIONS)},
            "travel_intent_secondary": {
                "anyOf": [
                    {"type": "string", "enum": enum_values(TRAVEL_INTENT_OPTIONS)},
                    {"type": "null"},
                ]
            },
            "travel_intent_other_text": {
                "anyOf": [
                    {"type": "string"},
                    {"type": "null"},
                ]
            },
            "destination_primary": {"type": "string"},
            "travel_cohort": {"type": "string", "enum": enum_values(TRAVEL_COHORT_OPTIONS)},
            "budget_conscious": {"type": "string", "enum": enum_values(BUDGET_CONSCIOUS_OPTIONS)},
            "discount_readiness": {"type": "string", "enum": enum_values(DISCOUNT_READINESS_OPTIONS)},
            "coupon_seeking": {"type": "string", "enum": enum_values(COUPON_SEEKING_OPTIONS)},
            "overall_customer_sentiment": {"type": "string", "enum": enum_values(SENTIMENT_OPTIONS)},
            "dissatisfaction_reasons": {
                "type": "array",
                "items": {"type": "string", "enum": enum_values(DSAT_REASON_OPTIONS)},
                "maxItems": 3,
            },
            "severity": {"type": "string", "enum": enum_values(SEVERITY_OPTIONS)},
            "conversion_willingness": {"type": "string", "enum": enum_values(WILLINGNESS_OPTIONS)},
            "primary_blocker": {"type": "string", "enum": enum_values(PRIMARY_BLOCKER_OPTIONS)},
            "next_best_action": {"type": "string", "enum": enum_values(NEXT_ACTION_OPTIONS)},
            "confidence_overall": {"type": "string", "enum": enum_values(CONFIDENCE_OPTIONS)},
            "confidence_by_field": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    key: {"type": "string", "enum": enum_values(CONFIDENCE_OPTIONS)}
                    for key in CONFIDENCE_FIELD_KEYS
                },
                "required": CONFIDENCE_FIELD_KEYS,
            },
            "evidence_by_field": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    key: {
                        "type": "array",
                        "items": {"type": "integer"},
                        "maxItems": 5,
                    }
                    for key in EVIDENCE_FIELD_KEYS
                },
                "required": EVIDENCE_FIELD_KEYS,
            },
            "profile_status": {"type": "string", "enum": enum_values(PROFILE_STATUS_OPTIONS)},
        },
        "required": PROFILE_FIELD_KEYS,
    }


def profile_prompt_spec() -> str:
    schema_json = json.dumps(profile_json_schema(), indent=2)
    return f"""
You are labeling travel-sales conversations for a holidays planning company.
Return valid JSON only. Do not add markdown, code fences, or extra commentary.

Core rules:
1. Interpret the conversation from the customer's point of view, not the HE's suggestions.
2. Prefer grounded outputs over clever guesses.
3. If the chat is too thin, set `profile_status` to `insufficient_signal` and use `unclear` for uncertain fields.
4. Use `dissatisfaction_reasons = ["none"]` and `severity = "none"` when there is no clear dissatisfaction.
5. Pick at most one primary blocker and at most one next best action.
6. Keep `summary` short: 1-2 sentences, under 240 characters.
7. Use the provided explicit destination mentions when available. If none are reliable, return `destination_primary = "unclear"`.
8. Only cite message ids that are actually present in the transcript. Keep at most 5 ids per field.
9. `travel_intent_secondary` should be null unless a real secondary intent exists.
10. `travel_intent_other_text` should always be null.

Travel intent guidance:
- Use only these customer intent buckets: `honeymoon`, `pilgrimage`, `adventure`, `night_life`, `family_vacation`, `unclear`.
- Do not invent a generic leisure bucket. If the conversation is about travel but none of the focused buckets below are clearly supported, use `unclear`.
- Use `honeymoon` when honeymoon, newly married travel, romantic couple travel, anniversary-style romantic travel, or similar signals are explicit or strongly grounded.
- Use `family_vacation` when family travel is central: spouse/kids/children/parents/family trip/family holiday.
- Use `pilgrimage` when temple, darshan, yatra, shrine, religious circuit, or faith-led travel is central.
- Use `adventure` when trekking, rafting, scuba, safari, skiing, hiking, adventure sports, or activity-led travel is central.
- Use `night_life` when nightlife, clubs, pub crawl, party scenes, late-night entertainment, or similar nightlife intent is central.
- Use `unclear` for general holiday planning, operational support, complaints, visa/document handling, booking execution, luxury-only preference, friends/group travel without one of the above themes, or when the evidence is too weak to classify responsibly.
- `travel_intent_secondary` must be null when unsure. Do not use `unclear` as a secondary value.

Travel cohort guidance:
- Use `couple` when the customer clearly indicates 2 pax, husband-wife, spouse travel, romantic couple travel, or equivalent 2-adult couple phrasing.
- Use `family_with_kids` when children, kids, child, infant, or school-holiday family travel is clearly present.
- Use `solo` when the customer clearly indicates 1 pax, solo travel, or traveling alone.
- Use `unclear` when cohort is not explicit enough to classify responsibly.

Commercial behavior guidance:
- `discount_readiness` measures how actively the customer is negotiating for a lower deal.
- Use `high` when the customer repeatedly pushes for discounts, best/final price, extra offers, or significant reductions.
- Use `medium` when the customer clearly asks for a better deal or discount at least once with real intent.
- Use `low` when the customer shows some commercial openness to a better rate but is not actively negotiating.
- Use `none` when the customer is not seeking a discount despite enough commercial discussion to tell.
- Use `unclear` when there is not enough evidence.
- Use `coupon_seeking = yes` only when coupons, promo codes, voucher codes, cashback applicability, or offer codes are explicitly requested.
- Use `coupon_seeking = no` only when the commercial discussion is clear enough and there is no coupon/promo seeking.
- Use `coupon_seeking = unclear` when there is not enough evidence.

Return JSON matching this schema exactly:
{schema_json}
""".strip()


def build_profile_user_prompt(
    conversation_id: str,
    signal_quality: str,
    customer_message_count: int,
    he_message_count: int,
    total_message_count: int,
    candidate_destination_cities: list[str],
    candidate_destination_countries: list[str],
    explicit_intent: list[str],
    explicit_dsat: list[str],
    rendered_messages: list[str],
) -> str:
    return f"""
Conversation id: {conversation_id}
Signal quality: {signal_quality}
Customer message count: {customer_message_count}
HE message count: {he_message_count}
Total filtered messages: {total_message_count}
Explicit destination cities: {candidate_destination_cities}
Explicit destination countries: {candidate_destination_countries}
Explicit intent tags: {explicit_intent}
Explicit dissatisfaction tags: {explicit_dsat}

Messages:
{chr(10).join(rendered_messages)}
""".strip()


def normalize_enum(value: Any, options: list[tuple[str, str]], fallback: str) -> str:
    allowed = set(enum_values(options))
    normalized = str(value or "").strip().lower().replace(" ", "_")
    return normalized if normalized in allowed else fallback


def normalize_short_text(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return " ".join(text.split())[:240] if text else fallback


def normalize_reason_list(value: Any) -> list[str]:
    raw = value if isinstance(value, list) else []
    normalized: list[str] = []
    allowed = set(enum_values(DSAT_REASON_OPTIONS))
    for item in raw:
        candidate = str(item or "").strip().lower().replace(" ", "_")
        if candidate in allowed and candidate not in normalized:
            normalized.append(candidate)
        if len(normalized) >= 3:
            break
    if not normalized:
        return ["none"]
    if "none" in normalized and len(normalized) > 1:
        normalized = [item for item in normalized if item != "none"]
    return normalized[:3]


def normalize_evidence_map(value: Any, allowed_ids: set[int]) -> dict[str, list[int]]:
    raw = value if isinstance(value, dict) else {}
    normalized: dict[str, list[int]] = {}
    for key in EVIDENCE_FIELD_KEYS:
        items = raw.get(key, [])
        if not isinstance(items, list):
            normalized[key] = []
            continue
        clean_ids: list[int] = []
        for item in items:
            try:
                message_id = int(item)
            except (TypeError, ValueError):
                continue
            if message_id in allowed_ids and message_id not in clean_ids:
                clean_ids.append(message_id)
            if len(clean_ids) >= 5:
                break
        normalized[key] = clean_ids
    return normalized


def normalize_confidence_map(value: Any) -> dict[str, str]:
    raw = value if isinstance(value, dict) else {}
    return {
        key: normalize_enum(raw.get(key), CONFIDENCE_OPTIONS, "unclear")
        for key in CONFIDENCE_FIELD_KEYS
    }


def empty_profile_result(profile_status: str = "insufficient_signal") -> dict[str, Any]:
    return {
        "summary": "",
        "travel_intent_primary": "unclear",
        "travel_intent_secondary": None,
        "travel_intent_other_text": None,
        "destination_primary": "unclear",
        "travel_cohort": "unclear",
        "budget_conscious": "unclear",
        "discount_readiness": "unclear",
        "coupon_seeking": "unclear",
        "overall_customer_sentiment": "unclear",
        "dissatisfaction_reasons": ["none"],
        "severity": "none" if profile_status != "complete" else "unclear",
        "conversion_willingness": "unclear",
        "primary_blocker": "unclear",
        "next_best_action": "unclear",
        "confidence_overall": "unclear",
        "confidence_by_field": {key: "unclear" for key in CONFIDENCE_FIELD_KEYS},
        "evidence_by_field": {key: [] for key in EVIDENCE_FIELD_KEYS},
        "profile_status": profile_status,
    }


def sanitize_profile_result(raw: Any, allowed_message_ids: set[int]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return empty_profile_result()

    profile_status = normalize_enum(raw.get("profile_status"), PROFILE_STATUS_OPTIONS, "unclear")
    result = empty_profile_result(profile_status=profile_status)

    result["summary"] = normalize_short_text(raw.get("summary"))
    result["travel_intent_primary"] = normalize_enum(
        raw.get("travel_intent_primary"),
        TRAVEL_INTENT_OPTIONS,
        "unclear",
    )

    secondary = raw.get("travel_intent_secondary")
    if secondary is None:
        result["travel_intent_secondary"] = None
    else:
        normalized_secondary = normalize_enum(secondary, TRAVEL_INTENT_OPTIONS, "unclear")
        result["travel_intent_secondary"] = (
            None
            if normalized_secondary in {"unclear", result["travel_intent_primary"]}
            else normalized_secondary
        )

    other_text = normalize_short_text(raw.get("travel_intent_other_text"))
    if result["travel_intent_primary"] == "other" or result["travel_intent_secondary"] == "other":
        result["travel_intent_other_text"] = other_text or None
    else:
        result["travel_intent_other_text"] = None

    destination_primary = normalize_short_text(raw.get("destination_primary"), fallback="unclear")
    result["destination_primary"] = destination_primary or "unclear"
    result["travel_cohort"] = normalize_enum(raw.get("travel_cohort"), TRAVEL_COHORT_OPTIONS, "unclear")
    result["budget_conscious"] = normalize_enum(raw.get("budget_conscious"), BUDGET_CONSCIOUS_OPTIONS, "unclear")
    result["discount_readiness"] = normalize_enum(
        raw.get("discount_readiness"),
        DISCOUNT_READINESS_OPTIONS,
        "unclear",
    )
    result["coupon_seeking"] = normalize_enum(raw.get("coupon_seeking"), COUPON_SEEKING_OPTIONS, "unclear")
    result["overall_customer_sentiment"] = normalize_enum(
        raw.get("overall_customer_sentiment"),
        SENTIMENT_OPTIONS,
        "unclear",
    )
    result["dissatisfaction_reasons"] = normalize_reason_list(raw.get("dissatisfaction_reasons"))
    result["severity"] = normalize_enum(raw.get("severity"), SEVERITY_OPTIONS, "unclear")
    result["conversion_willingness"] = normalize_enum(
        raw.get("conversion_willingness"),
        WILLINGNESS_OPTIONS,
        "unclear",
    )
    result["primary_blocker"] = normalize_enum(raw.get("primary_blocker"), PRIMARY_BLOCKER_OPTIONS, "unclear")
    result["next_best_action"] = normalize_enum(raw.get("next_best_action"), NEXT_ACTION_OPTIONS, "unclear")
    result["confidence_overall"] = normalize_enum(
        raw.get("confidence_overall"),
        CONFIDENCE_OPTIONS,
        "unclear",
    )
    result["confidence_by_field"] = normalize_confidence_map(raw.get("confidence_by_field"))
    result["evidence_by_field"] = normalize_evidence_map(raw.get("evidence_by_field"), allowed_message_ids)

    if result["profile_status"] == "insufficient_signal":
        result["travel_intent_primary"] = "unclear"
        result["travel_intent_secondary"] = None
        result["travel_intent_other_text"] = None
        result["travel_cohort"] = "unclear"
        result["budget_conscious"] = "unclear"
        result["discount_readiness"] = "unclear"
        result["coupon_seeking"] = "unclear"
        result["overall_customer_sentiment"] = "unclear"
        result["dissatisfaction_reasons"] = ["none"]
        result["severity"] = "none"
        result["conversion_willingness"] = "unclear"
        result["primary_blocker"] = "unclear"
        result["next_best_action"] = "unclear"

    return result
