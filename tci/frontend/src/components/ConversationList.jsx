import React from "react";
import { formatNumber, humanizeValue, toneForValue, useDisplayValue } from "../lib/labels.js";
import { Pill } from "./ui.jsx";

function ConversationCard({ row, selected, onSelect }) {
    const display = useDisplayValue();
    const profile = row.profile || {};
    const match = row.query_match || {};
    const snippet = match.message_content || row.latest_message_content || "";
    const destinationTitle = row.display_destination && row.display_destination !== "unclear"
        ? row.display_destination
        : "Unclear destination";
    const primaryReason = (profile.dissatisfaction_reasons || ["none"])[0] || "none";
    const latestLabel = match.message_id
        ? `Matched ${humanizeValue(match.sender_type || "message")} message`
        : "Latest filtered message";
    const messageId = Number(match.message_id || row.latest_message_id);

    const fieldPill = (fieldKey, value) => (
        <Pill tone={toneForValue(fieldKey, value)}>{display(fieldKey, value || "unclear")}</Pill>
    );

    return (
        <article
            className={`conversation-card${selected ? " selected" : ""}`}
            onClick={() => onSelect(row.conversation_id, messageId)}
        >
            <div className="card-hero">
                <div className="card-hero-meta">
                    <span className="card-hero-chip">{destinationTitle}</span>{" "}
                    <span className="card-hero-chip ghost">{row.latest_message_datetime || ""}</span>
                </div>
                <div className="card-hero-bottom">
                    <div className="card-title-block">
                        <p className="card-anchor">{row.customer_number}</p>
                        <h3>{destinationTitle}</h3>
                        <p className="card-caption">{latestLabel}</p>
                    </div>
                    <div className="card-stats">
                        <div className="card-stat">
                            <span>Msgs</span>{" "}
                            <strong>{formatNumber(row.total_messages)}</strong>
                        </div>
                        <div className="card-stat">
                            <span>Confidence</span>{" "}
                            <strong>{display("confidence_overall", profile.confidence_overall || "unclear")}</strong>
                        </div>
                    </div>
                </div>
            </div>
            <div className="card-body">
                <div className="pill-row">
                    {fieldPill("travel_intent_primary", profile.travel_intent_primary)}
                    {fieldPill("travel_cohort", profile.travel_cohort)}
                    {fieldPill("overall_customer_sentiment", profile.overall_customer_sentiment)}
                    <Pill tone={toneForValue("dissatisfaction_reason", primaryReason)}>{display("dissatisfaction_reason", primaryReason)}</Pill>
                    {fieldPill("conversion_willingness", profile.conversion_willingness)}
                </div>
                <p className="card-summary">{row.summary || "No summary yet."}</p>
                <div className="card-fact-grid">
                    <div className="card-fact"><span>Budget sensitivity</span><strong>{display("budget_conscious", profile.budget_conscious || "unclear")}</strong></div>
                    <div className="card-fact"><span>Discount readiness</span><strong>{display("discount_readiness", profile.discount_readiness || "unclear")}</strong></div>
                    <div className="card-fact"><span>Coupon seeking</span><strong>{display("coupon_seeking", profile.coupon_seeking || "unclear")}</strong></div>
                    <div className="card-fact"><span>Main blocker</span><strong>{display("primary_blocker", profile.primary_blocker || "unclear")}</strong></div>
                </div>
                <div className="card-snippet">
                    <span className="label">{latestLabel}</span>
                    <p>{snippet.slice(0, 220) || "No text snippet available for this conversation yet."}</p>
                </div>
                <div className="card-footer">
                    <span>
                        <Pill tone={toneForValue("signal_quality", row.signal_quality)}>{display("signal_quality", row.signal_quality)}</Pill>{" "}
                        <Pill tone={toneForValue("review_status", row.review_status)}>{display("review_status", row.review_status)}</Pill>
                    </span>
                    <strong>{display("profile_status", profile.profile_status || "unclear")} | Open transcript</strong>
                </div>
            </div>
        </article>
    );
}

// rows === null means nothing has been loaded yet.
export default function ConversationList({ rows, placeholder, emptyMessage, selectedId, onSelect }) {
    if (!rows || !rows.length) {
        return <div className="conversation-list empty-state">{rows ? emptyMessage : placeholder}</div>;
    }
    return (
        <div className="conversation-list">
            {rows.map((row) => (
                <ConversationCard
                    key={row.conversation_id}
                    row={row}
                    selected={row.conversation_id === selectedId}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
}
