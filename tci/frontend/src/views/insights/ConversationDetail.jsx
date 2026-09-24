import React from "react";
import { formatNumber, useDisplayValue } from "../../lib/labels.js";
import Transcript from "../../components/Transcript.jsx";
import { PanelHeader } from "../../components/ui.jsx";

// [profile field, label, option list]; option list null = shown as is.
const PROFILE_FIELDS = [
    ["travel_intent_primary", "Trip intent", "travel_intents"],
    ["destination_primary", "Primary destination", null],
    ["travel_cohort", "Travel cohort", "travel_cohorts"],
    ["budget_conscious", "Budget sensitivity", "budget_options"],
    ["discount_readiness", "Discount readiness", "discount_levels"],
    ["coupon_seeking", "Coupon seeking", "coupon_options"],
    ["overall_customer_sentiment", "Customer sentiment", "sentiments"],
    ["dissatisfaction_reason", "Dissatisfaction reason", "dissatisfaction_reasons"],
    ["severity", "Issue severity", "severities"],
    ["conversion_willingness", "Booking readiness", "willingness_levels"],
    ["primary_blocker", "Main booking blocker", "blockers"],
    ["next_best_action", "Recommended next step", "next_actions"],
    ["profile_status", "Profile quality", "profile_statuses"],
];

function fieldValue(profile, field) {
    return field === "dissatisfaction_reason"
        ? profile.dissatisfaction_reasons.find((value) => value !== "none") || "none"
        : profile[field];
}

function ProfileView({ profile }) {
    const display = useDisplayValue();
    return (
        <>
            <p className="profile-summary">{profile.summary || "No summary yet."}</p>
            <div className="profile-grid">
                {PROFILE_FIELDS.map(([field, label, optionKey]) => (
                    <div key={field}>
                        <span className="label">{label}</span>
                        <strong>{optionKey ? display(field, fieldValue(profile, field)) : profile[field]}</strong>
                    </div>
                ))}
                <div>
                    <span className="label">Confidence</span>
                    <strong>{display("confidence_overall", profile.confidence_overall)}</strong>
                </div>
            </div>
        </>
    );
}

export default function ConversationDetail({ conversation }) {
    const display = useDisplayValue();
    const { data, status } = conversation;

    let body = null;
    if (status === "loading" && !data) {
        body = <div className="loading-state">Loading conversation...</div>;
    } else if (status === "error") {
        body = <div className="empty-state">{conversation.error}</div>;
    } else if (!data) {
        body = <div className="empty-state">Pick a conversation to see its AI profile and chat.</div>;
    } else {
        body = (
            <div className="detail-body">
                <section className="detail-section">
                    <div className="section-head">
                        <h3>AI profile</h3>
                    </div>
                    {data.profile
                        ? <ProfileView profile={data.profile} />
                        : <p className="subtle">No AI profile for this conversation.</p>}
                </section>
                <section className="detail-section">
                    <div className="section-head">
                        <h3>Chat</h3>
                        {data.evidence_message_ids.length > 0 && <span className="legend-evidence">Cited by the AI</span>}
                    </div>
                    <Transcript messages={data.messages} focusId={conversation.messageId} evidenceIds={data.evidence_message_ids} />
                </section>
            </div>
        );
    }

    return (
        <aside className="side-card detail-panel">
            <PanelHeader
                eyebrow="Conversation"
                title={data ? `Lead ${data.conversation_id}` : "Select a conversation"}
                subtitle={data && (
                    <p className="subtle">{`Agent ${data.he_id || "unknown"} | ${formatNumber(data.total_messages)} messages | ${display("signal_quality", data.signal_quality)} signal`}</p>
                )}
            />
            {body}
        </aside>
    );
}
