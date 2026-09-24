import React, { useEffect, useState } from "react";
import { useFilterOptions } from "../../lib/labels.js";
import { OptionSelect, PanelHeader } from "../../components/ui.jsx";

// [filter key, label, option list, blank option label]
const MAIN_FILTERS = [
    ["travel_intent", "Trip intent", "travel_intents", "Any intent"],
    ["travel_cohort", "Travel cohort", "travel_cohorts", "Any cohort"],
    ["sentiment", "Customer sentiment", "sentiments", "Any sentiment"],
    ["dissatisfaction_reason", "Dissatisfaction reason", "dissatisfaction_reasons", "Any reason"],
    ["conversion_willingness", "Booking readiness", "willingness_levels", "Any readiness"],
    ["primary_blocker", "Main booking blocker", "blockers", "Any blocker"],
];

const MORE_FILTERS = [
    ["budget_conscious", "Budget sensitivity", "budget_options", "Any"],
    ["discount_readiness", "Discount readiness", "discount_levels", "Any"],
    ["coupon_seeking", "Coupon seeking", "coupon_options", "Any"],
    ["severity", "Issue severity", "severities", "Any"],
    ["next_best_action", "Recommended next step", "next_actions", "Any"],
    ["confidence", "Profile confidence (at least)", "confidence_levels", "Any"],
    ["signal_quality", "Conversation signal", "signal_qualities", "Any"],
    ["review_status", "Review status", "review_statuses", "Any"],
    ["profile_status", "Profile quality", "profile_statuses", "Any"],
];

export const EMPTY_FILTERS = Object.fromEntries(
    ["destination", ...[...MAIN_FILTERS, ...MORE_FILTERS].map(([key]) => key)].map((key) => [key, ""]),
);

const DESTINATION_DELAY_MS = 300;

// Selects apply immediately; the destination text applies after a short pause.
export default function FilterRail({ filters, onChange }) {
    const options = useFilterOptions();
    const [destination, setDestination] = useState(filters.destination);

    // Follow outside changes (Clear) without trimming what is being typed.
    useEffect(() => {
        setDestination((current) => (current.trim() === filters.destination ? current : filters.destination));
    }, [filters.destination]);
    useEffect(() => {
        if (destination.trim() === filters.destination) {
            return undefined;
        }
        const timer = window.setTimeout(() => onChange({ ...filters, destination: destination.trim() }), DESTINATION_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [destination, filters, onChange]);

    const select = ([key, label, optionKey, emptyLabel]) => (
        <label key={key} className="field">
            <span>{label}</span>
            <OptionSelect
                options={options?.[optionKey]}
                emptyLabel={emptyLabel}
                value={filters[key]}
                onChange={(value) => onChange({ ...filters, [key]: value })}
            />
        </label>
    );

    const moreActive = MORE_FILTERS.filter(([key]) => filters[key]).length;

    return (
        <aside className="side-card filter-rail">
            <PanelHeader eyebrow="Segment" title="Filters">
                <button type="button" className="ghost-button" onClick={() => onChange(EMPTY_FILTERS)}>Clear</button>
            </PanelHeader>
            <div className="stack-form">
                <label className="field">
                    <span>Destination</span>
                    <input
                        list="destination-options"
                        placeholder="City or country"
                        value={destination}
                        onChange={(event) => setDestination(event.target.value)}
                    />
                    <datalist id="destination-options">
                        {(options?.destination_suggestions || []).map((value) => <option key={value} value={value} />)}
                    </datalist>
                </label>
                {MAIN_FILTERS.map(select)}
                <details className="more-filters">
                    <summary>{moreActive ? `More filters (${moreActive} on)` : "More filters"}</summary>
                    <div className="stack-form">{MORE_FILTERS.map(select)}</div>
                </details>
            </div>
        </aside>
    );
}
