from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DESTINATION_WORKBOOK_NAME = "5564816_2026_04_06.xlsx"
DEFAULT_DESTINATION_XLSX_CANDIDATES = [
    BASE_DIR / DESTINATION_WORKBOOK_NAME,
    BASE_DIR.parent / DESTINATION_WORKBOOK_NAME,
]
DEFAULT_DESTINATION_XLSX = next(
    (candidate for candidate in DEFAULT_DESTINATION_XLSX_CANDIDATES if candidate.exists()),
    DEFAULT_DESTINATION_XLSX_CANDIDATES[0],
)

PHASE1_INTENT_DEFINITIONS = {
    "leisure_trip": {
        "label": "Leisure trip",
        "aliases": [
            "holiday",
            "vacation",
            "vacay",
            "holiday trip",
            "family trip",
            "family holiday",
            "honeymoon",
            "tour package",
            "travel package",
            "holiday package",
            "vacation package",
            "trip plan",
            "trip plans",
            "travel plan",
            "plan a trip",
            "planning a trip",
            "planning holiday",
            "leisure trip",
            "destination for holiday",
        ],
    }
}

DSAT_REASON_DEFINITIONS = {
    "price_high": {
        "label": "Price high",
        "aliases": [
            "expensive",
            "too expensive",
            "costly",
            "price high",
            "price is high",
            "high price",
            "very expensive",
            "too costly",
            "quote is high",
            "fare is high",
        ],
    },
    "budget_mismatch": {
        "label": "Budget mismatch",
        "aliases": [
            "out of budget",
            "out of my budget",
            "above budget",
            "budget issue",
            "budget mismatch",
            "not in budget",
            "budget is low",
            "my budget is",
            "our budget is",
            "budget around",
            "budget is",
            "this budget",
            "in this budget",
            "within this budget",
            "budget friendly",
            "limited budget",
            "max budget",
            "can go upto",
            "go upto",
            "would go upto",
            "up to 250000 max",
        ],
    },
    "discount_expectation_unmet": {
        "label": "Discount expectation unmet",
        "aliases": [
            "discount",
            "best price",
            "better deal",
            "give offer",
            "special rate",
            "any discount",
            "lower the price",
            "price reduction",
        ],
    },
    "hotel_unavailable": {
        "label": "Hotel unavailable",
        "aliases": [
            "hotel unavailable",
            "hotel not available",
            "no hotel available",
            "hardly any hotels available",
            "property unavailable",
            "sold out hotel",
            "rooms not available",
        ],
    },
    "flight_unavailable": {
        "label": "Flight unavailable",
        "aliases": [
            "flight unavailable",
            "flight not available",
            "no flights available",
            "flights not available",
            "airfare unavailable",
        ],
    },
    "dates_unavailable": {
        "label": "Dates unavailable",
        "aliases": [
            "dates unavailable",
            "date unavailable",
            "for these dates not available",
            "not available on these dates",
            "for this date",
            "on this date not available",
        ],
    },
    "inventory_delay": {
        "label": "Inventory delay",
        "aliases": [
            "checking availability",
            "inventory not updated",
            "inventory delay",
            "availability delay",
            "let me check inventory",
        ],
    },
    "slow_response": {
        "label": "Slow response",
        "aliases": [
            "slow response",
            "late response",
            "delayed response",
            "reply is late",
            "responding late",
            "response taking time",
            "not responding",
        ],
    },
    "no_callback": {
        "label": "No callback",
        "aliases": [
            "no callback",
            "didnt get back",
            "did not get back",
            "no one called",
            "didnt receive any call",
            "did not receive any call",
            "no call back",
            "call back not received",
        ],
    },
    "followup_gap": {
        "label": "Follow-up gap",
        "aliases": [
            "no follow up",
            "follow up pending",
            "nobody followed up",
            "followup gap",
            "no update",
            "still waiting",
        ],
    },
    "agent_handoff_issue": {
        "label": "Agent handoff issue",
        "aliases": [
            "different agent",
            "transferred again",
            "handoff issue",
            "new person calling",
            "assigned someone else",
        ],
    },
    "destination_mismatch": {
        "label": "Destination mismatch",
        "aliases": [
            "not interested in this destination",
            "other destination",
            "different destination",
            "dont want this destination",
            "destination mismatch",
        ],
    },
    "package_mismatch": {
        "label": "Package mismatch",
        "aliases": [
            "package mismatch",
            "package not suitable",
            "need different package",
            "package not good",
        ],
    },
    "itinerary_mismatch": {
        "label": "Itinerary mismatch",
        "aliases": [
            "itinerary mismatch",
            "itinerary not suitable",
            "need different itinerary",
            "plan is not good",
            "schedule mismatch",
        ],
    },
    "hotel_quality_concern": {
        "label": "Hotel quality concern",
        "aliases": [
            "hotel quality",
            "property is not good",
            "reviews are bad",
            "dont want this hotel",
            "hotel concern",
        ],
    },
    "visa_document_issue": {
        "label": "Visa or document issue",
        "aliases": [
            "visa issue",
            "visa process",
            "document issue",
            "passport issue",
            "documents required",
            "visa documents",
        ],
    },
    "payment_issue": {
        "label": "Payment issue",
        "aliases": [
            "payment issue",
            "payment failed",
            "payment problem",
            "pay later",
            "payment link",
            "payment not going through",
        ],
    },
    "booking_issue": {
        "label": "Booking issue",
        "aliases": [
            "booking issue",
            "booking problem",
            "booking not confirmed",
            "booking pending",
            "reservation issue",
            "booking id",
        ],
    },
    "refund_cancellation": {
        "label": "Refund or cancellation",
        "aliases": [
            "refund",
            "cancel booking",
            "cancellation",
            "cancel trip",
            "refund status",
            "money back",
        ],
    },
    "quote_confusion": {
        "label": "Quote confusion",
        "aliases": [
            "quote confusion",
            "pricing confusion",
            "what is included",
            "what all is included",
            "unclear quote",
            "quotation confusion",
        ],
    },
    "incorrect_information": {
        "label": "Incorrect information",
        "aliases": [
            "wrong information",
            "incorrect information",
            "misinformation",
            "not correct",
            "this is wrong",
            "you said earlier",
        ],
    },
    "lack_of_transparency": {
        "label": "Lack of transparency",
        "aliases": [
            "hidden charges",
            "not transparent",
            "unclear charges",
            "extra cost",
            "surprise cost",
            "transparency issue",
        ],
    },
    "competitor_preference": {
        "label": "Competitor preference",
        "aliases": [
            "other company",
            "another platform",
            "competitor",
            "got better deal elsewhere",
            "book somewhere else",
        ],
    },
    "not_interested_anymore": {
        "label": "Not interested anymore",
        "aliases": [
            "not interested",
            "leave it",
            "skip it",
            "not looking now",
            "not interested anymore",
            "will plan later",
        ],
    },
    "other_explicit": {
        "label": "Other explicit dissatisfaction",
        "aliases": [
            "not happy",
            "bad experience",
            "disappointed",
            "poor service",
            "frustrating",
            "issue",
        ],
    },
}

CASH_PAYMENT_DEFINITIONS = {
    "cash_payment_interest": {
        "label": "Cash payment mentioned",
        "aliases": [
            "pay in cash",
            "payment in cash",
            "cash payment",
            "pay by cash",
            "can i pay cash",
            "can we pay cash",
            "cash mode of payment",
            "cash payment option",
            "cash deposit",
            "pay cash at office",
            "cash at office",
            "cash collection",
            "cash only payment",
        ],
    }
}

AMBIGUOUS_SINGLE_WORD_DESTINATION_ALIASES = {
    "airport",
    "bar",
    "beach",
    "cruise",
    "flight",
    "mall",
    "nice",
    "page",
    "park",
    "sale",
    "table",
    "view",
}

ALIAS_DISCOVERY_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "have",
    "would",
    "there",
    "please",
    "sir",
    "mam",
    "maam",
    "hello",
    "thanks",
    "thank",
    "want",
    "need",
    "trip",
    "package",
    "tour",
    "hotel",
    "flight",
    "visa",
    "booking",
    "dates",
    "date",
    "night",
    "nights",
    "days",
    "family",
    "couple",
}


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFKD", str(text or ""))
    value = value.encode("ascii", "ignore").decode("ascii")
    value = value.lower()
    value = re.sub(r"http\S+", " ", value)
    value = re.sub(r"[^a-z0-9\s]+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def slugify(text: str) -> str:
    normalized = normalize_text(text)
    return normalized.replace(" ", "-")


def phrase_token_length(text: str) -> int:
    normalized = normalize_text(text)
    return len(normalized.split()) if normalized else 0


for definitions in (PHASE1_INTENT_DEFINITIONS, DSAT_REASON_DEFINITIONS, CASH_PAYMENT_DEFINITIONS):
    for details in definitions.values():
        for alias in details["aliases"]:
            normalized_alias = normalize_text(alias)
            if phrase_token_length(normalized_alias) == 1:
                AMBIGUOUS_SINGLE_WORD_DESTINATION_ALIASES.add(normalized_alias)


def should_include_city_alias(city_key: str, country_key: str) -> bool:
    normalized_city = normalize_text(city_key)
    normalized_country = normalize_text(country_key)
    if not normalized_city:
        return False
    if normalized_city == normalized_country:
        return False
    if " " not in normalized_city and normalized_city in AMBIGUOUS_SINGLE_WORD_DESTINATION_ALIASES:
        return False
    return True


def build_ngrams(text: str, max_tokens: int = 4) -> dict[int, set[str]]:
    normalized = normalize_text(text)
    tokens = normalized.split()
    ngrams: dict[int, set[str]] = {size: set() for size in range(1, max_tokens + 1)}
    for size in range(1, max_tokens + 1):
        if len(tokens) < size:
            continue
        for index in range(len(tokens) - size + 1):
            ngrams[size].add(" ".join(tokens[index : index + size]))
    return ngrams


def generate_alias_discovery_ngrams(text: str, max_tokens: int = 3, token_limit: int = 36) -> set[str]:
    normalized = normalize_text(text)
    tokens = normalized.split()[:token_limit]
    if not tokens:
        return set()

    found: set[str] = set()
    for size in range(1, max_tokens + 1):
        if len(tokens) < size:
            continue
        for index in range(len(tokens) - size + 1):
            gram_tokens = tokens[index : index + size]
            if all(token in ALIAS_DISCOVERY_STOPWORDS for token in gram_tokens):
                continue
            candidate = " ".join(gram_tokens)
            if len(candidate) < 4:
                continue
            found.add(candidate)
    return found


def sequence_score(left: str, right: str) -> int:
    return int(round(SequenceMatcher(None, normalize_text(left), normalize_text(right)).ratio() * 100))


def resolve_filter_candidates(
    raw_value: str,
    candidates: list[dict],
    mode: str = "hybrid",
    threshold: int = 86,
) -> list[dict]:
    normalized = normalize_text(raw_value)
    if not normalized:
        return []

    mode = (mode or "hybrid").lower()
    exact_matches: dict[str, dict] = {}
    fuzzy_matches: dict[str, dict] = {}

    for candidate in candidates:
        normalized_candidate = candidate["normalized"]
        canonical_value = candidate["canonical_value"]
        display_value = candidate["display_value"]

        if (
            normalized == normalized_candidate
            or normalized in normalized_candidate
            or normalized_candidate in normalized
        ):
            current = exact_matches.get(canonical_value)
            if current is None or current["score"] < 100:
                exact_matches[canonical_value] = {
                    "canonical_value": canonical_value,
                    "display_value": display_value,
                    "score": 100,
                    "matched_text": candidate["raw_value"],
                }

        if mode in {"fuzzy", "hybrid"}:
            score = sequence_score(normalized, normalized_candidate)
            if score >= threshold:
                current = fuzzy_matches.get(canonical_value)
                if current is None or current["score"] < score:
                    fuzzy_matches[canonical_value] = {
                        "canonical_value": canonical_value,
                        "display_value": display_value,
                        "score": score,
                        "matched_text": candidate["raw_value"],
                    }

    if mode == "text":
        return sorted(exact_matches.values(), key=lambda item: item["display_value"])
    if mode == "fuzzy":
        return sorted(fuzzy_matches.values(), key=lambda item: (-item["score"], item["display_value"]))
    if exact_matches:
        return sorted(exact_matches.values(), key=lambda item: item["display_value"])
    return sorted(fuzzy_matches.values(), key=lambda item: (-item["score"], item["display_value"]))


def load_destination_seed(workbook_path: Path | None = None) -> list[dict]:
    # Pandas is needed only for an offline source-data rebuild, never while the
    # deployed app reads its packaged SQLite seed.
    import pandas as pd

    path = Path(workbook_path or DEFAULT_DESTINATION_XLSX)
    frame = pd.read_excel(path, sheet_name="result")
    frame = frame[["City", "Country"]].dropna()
    frame["City"] = frame["City"].astype(str).str.strip()
    frame["Country"] = frame["Country"].astype(str).str.strip()
    frame = frame[(frame["City"] != "") & (frame["Country"] != "")]
    frame = frame.drop_duplicates(subset=["City", "Country"]).sort_values(["Country", "City"]).reset_index(drop=True)

    rows: list[dict] = []
    seen_keys: set[tuple[str, str]] = set()
    for record in frame.to_dict("records"):
        city = record["City"]
        country = record["Country"]
        city_key = slugify(city)
        country_key = slugify(country)
        dedupe_key = (city_key, country_key)
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)
        rows.append(
            {
                "city": city,
                "country": country,
                "city_key": city_key,
                "country_key": country_key,
                "canonical_label": f"{city}, {country}",
            }
        )
    return rows


