import { createContext, useContext } from "react";

export const KPI_LABELS = {
    conversations: "Conversations",
    profiled: "AI profiles ready",
    reviewed: "Manually reviewed",
    negative_percent: "Negative sentiment %",
    dissatisfaction_percent: "Conversations with dissatisfaction %",
    coupon_seeking_percent: "Coupon-seeking conversations %",
    budget_conscious_percent: "Budget-sensitive conversations %",
    high_willingness_percent: "High booking readiness %",
};

export const FACT_TYPE_LABELS = {
    destination_city: "City",
    destination_country: "Country",
    intent: "Intent",
    dissatisfaction: "Dissatisfaction",
    cash_payment_interest: "Cash payment",
};

// Which /api/filters option list labels each profile or filter field.
const FIELD_OPTION_KEYS = {
    travel_intent: "travel_intents",
    travel_intent_primary: "travel_intents",
    travel_intent_secondary: "travel_intents",
    budget_conscious: "budget_options",
    travel_cohort: "travel_cohorts",
    discount_readiness: "discount_levels",
    coupon_seeking: "coupon_options",
    cash_payment_interest: "cash_payment_options",
    sentiment: "sentiments",
    overall_customer_sentiment: "sentiments",
    dissatisfaction_reason: "dissatisfaction_reasons",
    dissatisfaction_reasons: "dissatisfaction_reasons",
    severity: "severities",
    conversion_willingness: "willingness_levels",
    primary_blocker: "blockers",
    next_best_action: "next_actions",
    confidence: "confidence_levels",
    confidence_overall: "confidence_levels",
    profile_status: "profile_statuses",
    review_status: "review_statuses",
    signal_quality: "signal_qualities",
};

export function formatNumber(value) {
    return new Intl.NumberFormat().format(value || 0);
}

export function humanizeValue(value) {
    return String(value ?? "")
        .trim()
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export function senderScopeLabel(value) {
    return {
        customer: "Customer",
        he: "HE",
        all: "Any sender",
    }[String(value || "").toLowerCase()] || humanizeValue(value);
}

export function sampleQualityLabel(value) {
    return {
        strong: "Strong enough for confident analysis",
        directional: "Directional only",
        small: "Small sample, use with care",
        tiny: "Very small sample, inspect conversations directly",
    }[String(value || "").toLowerCase()] || humanizeValue(value);
}

export function importStatusLabel(status) {
    return {
        queued: "Queued",
        running: "Fetching chats",
        cancel_requested: "Stopping safely",
        cancelled: "Cancelled",
        interrupted: "Interrupted",
        merging: "Deduplicating messages",
        indexing: "Refreshing analysis indexes",
        completed: "Completed",
        completed_with_errors: "Completed with errors",
        failed: "Failed",
    }[status] || humanizeValue(status);
}

export function toneForValue(fieldKey, value) {
    const normalized = String(value || "").toLowerCase();
    switch (fieldKey) {
        case "signal_quality":
            return normalized === "strong" ? "good" : normalized === "moderate" ? "accent" : normalized === "weak" ? "warm" : "neutral";
        case "review_status":
            return normalized === "corrected" ? "accent" : normalized === "approved" ? "good" : "neutral";
        case "overall_customer_sentiment":
        case "sentiment":
            return normalized === "negative" ? "warm" : normalized === "positive" ? "good" : normalized === "mixed" ? "accent" : "neutral";
        case "dissatisfaction_reason":
            return normalized && normalized !== "none" ? "warm" : "good";
        case "conversion_willingness":
            return normalized === "high" ? "good" : normalized === "medium" ? "accent" : "neutral";
        case "budget_conscious":
            return normalized === "yes" ? "warm" : normalized === "no" ? "good" : "neutral";
        case "discount_readiness":
            return normalized === "high" ? "warm" : normalized === "medium" ? "accent" : normalized === "low" ? "good" : "neutral";
        case "coupon_seeking":
        case "cash_payment_interest":
            return normalized === "yes" ? "accent" : normalized === "no" ? "good" : "neutral";
        case "profile_status":
            return normalized === "complete" ? "good" : normalized === "insufficient_signal" ? "warm" : "neutral";
        case "confidence_overall":
        case "confidence":
            return normalized === "high" ? "good" : normalized === "medium" ? "accent" : normalized === "low" ? "warm" : "neutral";
        default:
            return "neutral";
    }
}

// The option lists from /api/filters, shared app-wide once loaded.
export const FilterOptionsContext = createContext(null);

export function useFilterOptions() {
    return useContext(FilterOptionsContext);
}

// Returns display(fieldKey, value): the server's label for an enum value,
// falling back to a humanized version of the raw value.
export function useDisplayValue() {
    const options = useFilterOptions();
    return (fieldKey, value) => {
        if (value === null || value === undefined || value === "") {
            return "";
        }
        const optionKey = FIELD_OPTION_KEYS[fieldKey];
        if (!optionKey) {
            return humanizeValue(value);
        }
        const match = (options?.[optionKey] || []).find((option) => option.value === value);
        return match?.label || humanizeValue(value);
    };
}
