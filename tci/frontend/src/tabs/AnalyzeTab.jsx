import React, { useCallback, useEffect, useRef, useState } from "react";
import { buildQuery, fetchJson } from "../lib/api.js";
import { KPI_LABELS, formatNumber, humanizeValue, sampleQualityLabel, useDisplayValue } from "../lib/labels.js";
import { PanelHeader } from "../components/ui.jsx";

// [distribution key, card title, field used to label values (null = raw)]
const DISTRIBUTIONS = [
    ["intent", "Customer trip intent", "travel_intent"],
    ["destination", "Destination", null],
    ["cohort", "Travel cohort", "travel_cohort"],
    ["budget", "Budget sensitivity", "budget_conscious"],
    ["discount", "Discount readiness", "discount_readiness"],
    ["coupon", "Coupon seeking", "coupon_seeking"],
    ["cash_payment", "Cash payment mention", "cash_payment_interest"],
    ["sentiment", "Customer sentiment", "sentiment"],
    ["dissatisfaction", "Dissatisfaction reasons", "dissatisfaction_reason"],
    ["severity", "Issue severity", "severity"],
    ["willingness", "Booking readiness", "conversion_willingness"],
    ["blocker", "Main booking blocker", "primary_blocker"],
    ["signal_quality", "Conversation signal", "signal_quality"],
];

function formatKpi(key, value) {
    if (typeof value !== "number") {
        return value;
    }
    if (key.endsWith("_percent")) {
        return `${value.toFixed(1)}%`;
    }
    return Number.isInteger(value) ? formatNumber(value) : value.toFixed(1);
}

export default function AnalyzeTab({ active, appliedFilters, dataVersion }) {
    const display = useDisplayValue();
    const [data, setData] = useState(null);
    const [message, setMessage] = useState("");
    const requestId = useRef(0);

    const load = useCallback(() => {
        const id = ++requestId.current;
        setData(null);
        setMessage("Loading analysis...");
        fetchJson(`/api/analyze?${buildQuery(appliedFilters)}`)
            .then((payload) => {
                if (id !== requestId.current) {
                    return;
                }
                setData(payload);
                setMessage(`Sample size: ${formatNumber(payload.sample_size)} conversations | ${sampleQualityLabel(payload.sample_quality)}`);
            })
            .catch((error) => {
                if (id === requestId.current) {
                    setMessage(error.message);
                }
            });
    }, [appliedFilters]);

    // Recompute each time the tab is opened, as the segment may have changed.
    useEffect(() => {
        if (active) {
            load();
        }
    }, [active, load, dataVersion]);

    return (
        <section className="main-card analyze-card">
            <PanelHeader
                eyebrow="Analyze"
                title="Current Segment Intelligence"
                subtitle={<p className="subtle">This view uses the same current filters as Explore, so every chart answers "for this segment, what is happening?"</p>}
            >
                <button type="button" className="ghost-button" onClick={load}>Refresh</button>
            </PanelHeader>
            <div className="kpi-grid">
                {Object.entries(data?.kpis || {}).map(([key, value]) => (
                    <article key={key} className="kpi-card">
                        <span className="label">{KPI_LABELS[key] || humanizeValue(key)}</span>
                        <strong>{formatKpi(key, value)}</strong>
                    </article>
                ))}
            </div>
            <div className="sample-banner subtle">{message}</div>
            <div className="analysis-grid">
                {data && DISTRIBUTIONS.map(([key, title, field]) => {
                    const items = data.distributions?.[key] || [];
                    return (
                        <section key={key} className="distribution-card">
                            <h3>{title}</h3>
                            {!items.length && <p className="subtle">No data in this segment.</p>}
                            {items.map((item) => (
                                <div key={item.value} className="distribution-row">
                                    <span>{field ? display(field, item.value) : item.value}</span>
                                    <strong>{formatNumber(item.count)}</strong>
                                </div>
                            ))}
                        </section>
                    );
                })}
            </div>
        </section>
    );
}
