import React, { useEffect, useRef, useState } from "react";
import { buildQuery, fetchJson } from "../lib/api.js";
import { formatNumber, useDisplayValue, useFilterOptions } from "../lib/labels.js";
import ConversationList from "../components/ConversationList.jsx";
import Workspace from "../components/Workspace.jsx";
import { OptionSelect, PanelHeader, Pagination } from "../components/ui.jsx";

// [filter key, field label, /api/filters option list, blank option label]
const SELECT_FILTERS = [
    ["travel_intent", "Customer trip intent", "travel_intents", "Any intent"],
    ["travel_cohort", "Travel cohort", "travel_cohorts", "Any cohort"],
    ["budget_conscious", "Budget sensitivity", "budget_options", "Any budget sensitivity"],
    ["discount_readiness", "Discount readiness", "discount_levels", "Any discount readiness"],
    ["coupon_seeking", "Coupon seeking", "coupon_options", "Any coupon behavior"],
    ["cash_payment_interest", "Cash payment mention", "cash_payment_options", "Any cash payment mention"],
    ["sentiment", "Customer sentiment", "sentiments", "Any sentiment"],
    ["dissatisfaction_reason", "Dissatisfaction reason", "dissatisfaction_reasons", "Any dissatisfaction reason"],
    ["severity", "Issue severity", "severities", "Any severity"],
    ["conversion_willingness", "Booking readiness", "willingness_levels", "Any readiness"],
    ["primary_blocker", "Main booking blocker", "blockers", "Any blocker"],
    ["confidence", "Profile confidence", "confidence_levels", "Any confidence"],
    ["signal_quality", "Conversation signal", "signal_qualities", "Any conversation signal"],
    ["review_status", "Manual review status", "review_statuses", "Any review state"],
];

const TOGGLE_FILTERS = [
    ["enough_signal_only", "Only show conversations with enough signal"],
    ["enriched_only", "Only show conversations with an AI profile"],
];

// Pill labels for the active-filter strip, in display order.
const FILTER_PILL_LABELS = {
    q: "Text",
    destination: "Destination",
    travel_intent: "Trip intent",
    travel_cohort: "Cohort",
    budget_conscious: "Budget sensitivity",
    discount_readiness: "Discount readiness",
    coupon_seeking: "Coupon seeking",
    cash_payment_interest: "Cash payment mention",
    sentiment: "Customer sentiment",
    dissatisfaction_reason: "Dissatisfaction",
    severity: "Issue severity",
    conversion_willingness: "Booking readiness",
    primary_blocker: "Main blocker",
    confidence: "Profile confidence",
    signal_quality: "Conversation signal",
    review_status: "Manual review",
    enough_signal_only: "Enough signal only",
    enriched_only: "AI profile only",
};

export const EMPTY_FILTERS = Object.fromEntries(Object.keys(FILTER_PILL_LABELS).map((key) => [key, ""]));

function toQueryFilters(draft) {
    return { ...draft, q: draft.q.trim(), destination: draft.destination.trim() };
}

function ActiveFilters({ filters }) {
    const display = useDisplayValue();
    const pills = Object.entries(FILTER_PILL_LABELS).filter(([key]) => filters[key]);
    if (!pills.length) {
        return null;
    }
    return (
        <div className="active-filters">
            {pills.map(([key, label]) => {
                const value = TOGGLE_FILTERS.some(([toggle]) => toggle === key)
                    ? "Yes"
                    : key === "q" || key === "destination" ? filters[key] : display(key, filters[key]);
                return <span key={key} className="active-filter-pill"><strong>{label}</strong> {value}</span>;
            })}
        </div>
    );
}

export default function ExploreTab({ appliedFilters, onApplyFilters, conversation, onSelectConversation, dataVersion, searchRef }) {
    const options = useFilterOptions();
    const [draft, setDraft] = useState(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [result, setResult] = useState(null);
    const [status, setStatus] = useState("");
    const requestId = useRef(0);

    // Reload whenever the applied segment, page, or underlying data changes.
    useEffect(() => {
        if (!options) {
            return;
        }
        const id = ++requestId.current;
        setStatus("Loading...");
        fetchJson(`/api/explore?${buildQuery({ ...appliedFilters, page })}`)
            .then((data) => {
                if (id !== requestId.current) {
                    return;
                }
                setResult(data);
                setStatus(data.total ? `Showing ${formatNumber(data.results.length)} rows` : "No matches");
            })
            .catch((error) => {
                if (id === requestId.current) {
                    setStatus(error.message);
                }
            });
    }, [options, appliedFilters, page, dataVersion]);

    const setField = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

    const apply = (filters) => {
        setPage(1);
        // Always a fresh object, so re-applying the same segment still reloads.
        onApplyFilters({ ...filters });
    };

    const hasActive = Object.values(appliedFilters).some(Boolean);

    return (
        <div className="three-column">
            <aside className="side-card filter-rail">
                <PanelHeader eyebrow="Segment" title="Explore Filters">
                    <button
                        type="button"
                        className="ghost-button"
                        onClick={() => { setDraft(EMPTY_FILTERS); apply(EMPTY_FILTERS); }}
                    >
                        Clear
                    </button>
                </PanelHeader>
                <form className="stack-form" onSubmit={(event) => { event.preventDefault(); apply(toQueryFilters(draft)); }}>
                    <label className="field">
                        <span>Search text</span>
                        <input ref={searchRef} type="search" placeholder="price too high, phu quoc, honeymoon..." value={draft.q} onChange={(event) => setField("q", event.target.value)} />
                    </label>
                    <label className="field">
                        <span>Destination</span>
                        <input list="destination-options" placeholder="City or country" value={draft.destination} onChange={(event) => setField("destination", event.target.value)} />
                        <datalist id="destination-options">
                            {(options?.destination_suggestions || []).map((value) => <option key={value} value={value} />)}
                        </datalist>
                    </label>
                    {SELECT_FILTERS.map(([key, label, optionKey, emptyLabel]) => (
                        <label key={key} className="field">
                            <span>{label}</span>
                            <OptionSelect options={options?.[optionKey]} emptyLabel={emptyLabel} value={draft[key]} onChange={(value) => setField(key, value)} />
                        </label>
                    ))}
                    {TOGGLE_FILTERS.map(([key, label]) => (
                        <label key={key} className="toggle-row">
                            <input type="checkbox" checked={draft[key] === "true"} onChange={(event) => setField(key, event.target.checked ? "true" : "")} />
                            <span>{label}</span>
                        </label>
                    ))}
                    <button type="submit" className="primary-button">Apply segment</button>
                </form>
            </aside>

            <section className="main-card">
                <PanelHeader
                    eyebrow="Explore"
                    title="Conversation Results"
                    subtitle={
                        <p className="subtle">
                            {result && hasActive
                                ? `${formatNumber(result.total)} conversations match the current segment.`
                                : "Apply a segment to load matching conversations."}
                        </p>
                    }
                >
                    <div className="status-text">{status}</div>
                </PanelHeader>
                <ActiveFilters filters={appliedFilters} />
                <ConversationList
                    rows={result?.results ?? null}
                    placeholder="No segment loaded yet."
                    emptyMessage="No conversations matched this segment."
                    selectedId={conversation.conversationId}
                    onSelect={onSelectConversation}
                />
                <Pagination page={page} totalPages={result?.total_pages || 0} onPage={setPage} />
            </section>

            <Workspace conversation={conversation} />
        </div>
    );
}
