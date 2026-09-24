import React from "react";
import { toneForValue, useDisplayValue } from "../../lib/labels.js";
import { Pill } from "../../components/ui.jsx";

function InsightCard({ card, selected, onSelect }) {
    const display = useDisplayValue();
    const profile = card.profile;
    const destination = profile.destination_primary !== "unclear" ? profile.destination_primary : "Unclear destination";
    const reason = profile.dissatisfaction_reasons.find((value) => value !== "none");

    const fieldPill = (field) => (
        <Pill tone={toneForValue(field, profile[field])}>{display(field, profile[field])}</Pill>
    );

    return (
        <article className={`conversation-card${selected ? " selected" : ""}`} onClick={() => onSelect(card.conversation_id, card.latest_message_id)}>
            <div className="card-head">
                <h3>{destination}</h3>
                <span className="result-date">{card.latest_message_datetime}</span>
            </div>
            <p className="card-anchor">{card.customer_number}</p>
            <div className="pill-row">
                {fieldPill("travel_intent_primary")}
                {fieldPill("travel_cohort")}
                {fieldPill("overall_customer_sentiment")}
                {fieldPill("conversion_willingness")}
                {reason && <Pill tone="warm">{display("dissatisfaction_reason", reason)}</Pill>}
            </div>
            <p className="card-summary clamp">{profile.summary || "No summary yet."}</p>
            <div className="card-footer">
                <span className="pill-row">
                    <Pill tone={toneForValue("review_status", card.review_status)}>{display("review_status", card.review_status)}</Pill>
                    <Pill tone={toneForValue("signal_quality", card.signal_quality)}>{`${display("signal_quality", card.signal_quality)} signal`}</Pill>
                </span>
                <span className="subtle">{`${card.total_messages} messages`}</span>
            </div>
        </article>
    );
}

export default function InsightList({ cards, selectedId, onSelect }) {
    if (!cards) {
        return <div className="empty-state">Loading conversations...</div>;
    }
    if (!cards.length) {
        return <div className="empty-state">No AI-profiled conversations match these filters.</div>;
    }
    return (
        <div className="conversation-list">
            {cards.map((card) => (
                <InsightCard key={card.conversation_id} card={card} selected={card.conversation_id === selectedId} onSelect={onSelect} />
            ))}
        </div>
    );
}
