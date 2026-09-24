import React, { useEffect, useRef, useState } from "react";
import { buildQuery, fetchJson } from "../../lib/api.js";
import { KPI_LABELS, formatNumber, humanizeValue, sampleQualityLabel, useDisplayValue } from "../../lib/labels.js";

// [distribution key, card title, field used to label values (null = raw)]
const DISTRIBUTIONS = [
    ["intent", "Trip intent", "travel_intent"],
    ["destination", "Destination", null],
    ["cohort", "Travel cohort", "travel_cohort"],
    ["sentiment", "Customer sentiment", "sentiment"],
    ["dissatisfaction", "Dissatisfaction reasons", "dissatisfaction_reason"],
    ["willingness", "Booking readiness", "conversion_willingness"],
    ["blocker", "Main booking blocker", "primary_blocker"],
    ["budget", "Budget sensitivity", "budget_conscious"],
    ["discount", "Discount readiness", "discount_readiness"],
    ["coupon", "Coupon seeking", "coupon_seeking"],
    ["severity", "Issue severity", "severity"],
    ["signal_quality", "Conversation signal", "signal_quality"],
];

function formatKpi(key, value) {
    if (key.endsWith("_percent")) {
        return `${value.toFixed(1)}%`;
    }
    return formatNumber(value);
}

export default function AnalysisPanel({ query }) {
    const display = useDisplayValue();
    const [data, setData] = useState(null);
    const [message, setMessage] = useState("");
    const requestId = useRef(0);

    useEffect(() => {
        const id = ++requestId.current;
        setMessage("Loading analysis...");
        fetchJson(`/api/insights/analysis?${buildQuery(query)}`)
            .then((payload) => {
                if (id === requestId.current) {
                    setData(payload);
                    setMessage(`Sample size: ${formatNumber(payload.sample_size)} conversations | ${sampleQualityLabel(payload.sample_quality)}`);
                }
            })
            .catch((error) => {
                if (id === requestId.current) {
                    setMessage(error.message);
                }
            });
    }, [query]);

    return (
        <>
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
        </>
    );
}
