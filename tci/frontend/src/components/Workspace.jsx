import React from "react";
import { FACT_TYPE_LABELS, formatNumber, senderScopeLabel, useDisplayValue } from "../lib/labels.js";
import { PanelHeader, Pill } from "./ui.jsx";

const IMAGE_URL_PATTERN = /\/images\/|\.png(?:\?|$)|\.jpe?g(?:\?|$)|\.gif(?:\?|$)|\.webp(?:\?|$)|\.bmp(?:\?|$)|\.svg(?:\?|$)/i;

function MessageBody({ content }) {
    const text = String(content ?? "");
    const imageUrls = (text.match(/https?:\/\/[^\s]+/gi) || []).filter((url) => IMAGE_URL_PATTERN.test(url));
    const textOnly = imageUrls.reduce((remaining, url) => remaining.replace(url, ""), text).trim();

    if (!textOnly && !imageUrls.length) {
        return <div className="message-text">{text}</div>;
    }
    return (
        <>
            {textOnly && <div className="message-text">{textOnly}</div>}
            {imageUrls.map((url, index) => (
                <div className="image-block" key={`${index}-${url}`}>
                    <a className="image-link" href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="Chat image" loading="lazy" />
                    </a>
                    <a className="media-link" href={url} target="_blank" rel="noopener noreferrer">Open image</a>
                </div>
            ))}
        </>
    );
}

const PROFILE_FIELDS = [
    ["Customer trip intent", "travel_intent_primary"],
    ["Primary destination", "destination_primary"],
    ["Travel cohort", "travel_cohort"],
    ["Budget sensitivity", "budget_conscious"],
    ["Discount readiness", "discount_readiness"],
    ["Coupon seeking", "coupon_seeking"],
    ["Customer sentiment", "overall_customer_sentiment"],
    ["Issue severity", "severity"],
    ["Booking readiness", "conversion_willingness"],
    ["Main booking blocker", "primary_blocker"],
    ["Recommended next step", "next_best_action"],
    ["Profile quality", "profile_status"],
    ["Profile confidence", "confidence_overall"],
];

function ProfileDetails({ profile }) {
    const display = useDisplayValue();
    if (!profile) {
        return <p className="subtle">No AI profile yet for this conversation.</p>;
    }
    const reasons = profile.dissatisfaction_reasons?.length ? profile.dissatisfaction_reasons : ["none"];
    return (
        <>
            <div className="profile-grid">
                {PROFILE_FIELDS.map(([label, field]) => (
                    <div key={field}>
                        <span className="label">{label}</span>
                        <strong>{field === "destination_primary"
                            ? profile.destination_primary || "unclear"
                            : display(field, profile[field] || "unclear")}</strong>
                    </div>
                ))}
            </div>
            <p className="profile-summary">{profile.summary || "No summary yet."}</p>
            <div className="profile-chip-group">
                <span className="label">Dissatisfaction reasons</span>
                <div className="pill-row">
                    {reasons.map((reason) => <Pill key={reason}>{display("dissatisfaction_reason", reason)}</Pill>)}
                </div>
            </div>
        </>
    );
}

function WorkspaceBody({ data, selectedMessageId }) {
    const display = useDisplayValue();
    const profile = data.profile || {};
    const evidenceIds = new Set((data.evidence_message_ids || []).map(Number));
    const facts = Object.keys(FACT_TYPE_LABELS).flatMap((key) =>
        (data.facts[key] || []).map((item) => `${FACT_TYPE_LABELS[key]}: ${item.display_value} | ${senderScopeLabel(item.sender_scope)}`),
    );

    return (
        <div className="workspace-body">
            <section className="workspace-overview">
                <article className="workspace-kpi"><span>Destination</span><strong>{profile.destination_primary || "Unclear"}</strong></article>
                <article className="workspace-kpi"><span>Intent</span><strong>{display("travel_intent_primary", profile.travel_intent_primary || "unclear")}</strong></article>
                <article className="workspace-kpi"><span>Cohort</span><strong>{display("travel_cohort", profile.travel_cohort || "unclear")}</strong></article>
                <article className="workspace-kpi"><span>Readiness</span><strong>{display("conversion_willingness", profile.conversion_willingness || "unclear")}</strong></article>
            </section>
            <section className="workspace-section">
                <h3>AI Profile</h3>
                <ProfileDetails profile={data.profile} />
            </section>
            <section className="workspace-section">
                <h3>Explicit Signals Found</h3>
                <div className="pill-row">
                    {facts.length
                        ? facts.map((fact, index) => <Pill key={index}>{fact}</Pill>)
                        : <span className="subtle">No explicit signals detected.</span>}
                </div>
            </section>
            <section className="workspace-section">
                <h3>Manual Review</h3>
                <div className="pill-row">
                    <Pill>{display("review_status", data.review.review_status || "unreviewed")}</Pill>
                    {data.review.reviewed_by && <Pill>{`By ${data.review.reviewed_by}`}</Pill>}
                </div>
                <p className="subtle">{data.review.reviewer_note || "No reviewer note yet."}</p>
            </section>
            <section className="workspace-section">
                <h3>Transcript</h3>
                <div className="transcript-list">
                    {data.messages.map((message) => {
                        const classes = [
                            "bubble",
                            String(message.sender_type).toLowerCase() === "he" ? "he" : "customer",
                            Number(message.id) === selectedMessageId && "selected",
                            evidenceIds.has(Number(message.id)) && "evidence",
                        ].filter(Boolean).join(" ");
                        return (
                            <article key={message.id} className={classes}>
                                <div className="bubble-meta">
                                    <span>{message.sender_type}</span>
                                    <span>{`${message.message_type} | ${message.message_datetime}`}</span>
                                </div>
                                <MessageBody content={message.message_content} />
                            </article>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

// conversation: { status: "idle" | "loading" | "ready" | "error", data, messageId, error }
export default function Workspace({ conversation }) {
    const display = useDisplayValue();
    const { status, data } = conversation;
    const ready = status === "ready" && data;
    // Like the original, keep the previous conversation's header while the next one loads.

    let body;
    if (ready) {
        body = <WorkspaceBody data={data} selectedMessageId={conversation.messageId} />;
    } else if (status === "loading") {
        body = <div className="workspace-body loading-state">Loading conversation...</div>;
    } else if (status === "error") {
        body = <div className="workspace-body empty-state">{conversation.error}</div>;
    } else {
        body = <div className="workspace-body empty-state">Pick a conversation from Explore or Review.</div>;
    }

    return (
        <aside className="side-card workspace-panel">
            <PanelHeader
                eyebrow="Workspace"
                title={data ? `${data.he_number} <-> ${data.customer_number}` : "Select a conversation"}
                subtitle={
                    <p className="subtle">
                        {data
                            ? `${formatNumber(data.facts.total_messages)} filtered messages | ${display("signal_quality", data.facts.signal_quality)} conversation signal`
                            : "Transcript, explicit signals, AI profile, and manual review all stay together here."}
                    </p>
                }
            />
            {body}
        </aside>
    );
}
