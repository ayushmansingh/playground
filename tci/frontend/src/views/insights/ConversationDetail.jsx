import React, { useEffect, useState } from "react";
import { postJson } from "../../lib/api.js";
import { formatNumber, toneForValue, useDisplayValue, useFilterOptions } from "../../lib/labels.js";
import Transcript from "../../components/Transcript.jsx";
import { OptionSelect, PanelHeader, Pill } from "../../components/ui.jsx";

// [profile field, label, option list]; option list null = free text.
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

function formFromConversation(data) {
    const profile = data.profile || {};
    const form = {
        review_status: data.review.review_status === "unreviewed" ? "approved" : data.review.review_status,
        summary: profile.summary || "",
        reviewer_note: data.review.reviewer_note || "",
    };
    for (const [field] of PROFILE_FIELDS) {
        form[field] = data.profile ? fieldValue(profile, field) || "" : "";
    }
    return form;
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

function ReviewForm({ data, onCancel, onSaved }) {
    const options = useFilterOptions();
    const [form, setForm] = useState(() => formFromConversation(data));
    const [reviewedBy, setReviewedBy] = useState(data.review.reviewed_by || "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const submit = async (event) => {
        event.preventDefault();
        const { dissatisfaction_reason: reason, review_status, reviewer_note, ...fields } = form;
        setSaving(true);
        setError("");
        try {
            const { ok, payload } = await postJson("/api/review/save", {
                conversation_id: data.conversation_id,
                review_status,
                reviewed_by: reviewedBy.trim(),
                reviewer_note: reviewer_note.trim(),
                corrected_fields: {
                    ...fields,
                    summary: fields.summary.trim(),
                    destination_primary: fields.destination_primary.trim(),
                    dissatisfaction_reasons: reason ? [reason] : [],
                },
            });
            if (!ok) {
                throw new Error(payload.detail || "Could not save the review.");
            }
            onSaved();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="stack-form review-form" onSubmit={submit}>
            <div className="form-grid">
                <label className="field">
                    <span>Review status</span>
                    <OptionSelect options={options?.review_statuses} value={form.review_status} onChange={(value) => setField("review_status", value)} />
                </label>
                <label className="field">
                    <span>Reviewer</span>
                    <input type="text" placeholder="Your name" value={reviewedBy} onChange={(event) => setReviewedBy(event.target.value)} />
                </label>
            </div>
            <label className="field">
                <span>Summary</span>
                <textarea rows="3" value={form.summary} onChange={(event) => setField("summary", event.target.value)} />
            </label>
            <div className="form-grid">
                {PROFILE_FIELDS.map(([field, label, optionKey]) => (
                    <label key={field} className="field">
                        <span>{label}</span>
                        {optionKey
                            ? <OptionSelect options={options?.[optionKey]} value={form[field]} onChange={(value) => setField(field, value)} />
                            : <input type="text" value={form[field]} onChange={(event) => setField(field, event.target.value)} />}
                    </label>
                ))}
            </div>
            <label className="field">
                <span>Reviewer note</span>
                <textarea rows="2" value={form.reviewer_note} onChange={(event) => setField("reviewer_note", event.target.value)} />
            </label>
            {error && <div className="form-error">{error}</div>}
            <div className="form-actions">
                <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save review"}</button>
                <button type="button" className="ghost-button" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}

export default function ConversationDetail({ conversation, onReviewSaved }) {
    const display = useDisplayValue();
    const [editing, setEditing] = useState(false);
    const { data, status } = conversation;

    // A different conversation always opens in read mode.
    useEffect(() => setEditing(false), [conversation.conversationId]);

    let body = null;
    if (status === "loading" && !data) {
        body = <div className="loading-state">Loading conversation...</div>;
    } else if (status === "error") {
        body = <div className="empty-state">{conversation.error}</div>;
    } else if (!data) {
        body = <div className="empty-state">Pick a conversation to see its AI profile and chat.</div>;
    } else {
        const review = data.review;
        body = (
            <div className="detail-body">
                <section className="detail-section">
                    <div className="section-head">
                        <h3>AI profile</h3>
                        {!editing && <button type="button" className="ghost-button" onClick={() => setEditing(true)}>Review</button>}
                    </div>
                    <div className="pill-row">
                        <Pill tone={toneForValue("review_status", review.review_status)}>{display("review_status", review.review_status)}</Pill>
                        {review.reviewed_by && <Pill>{`By ${review.reviewed_by}`}</Pill>}
                    </div>
                    {review.reviewer_note && !editing && <p className="subtle">{review.reviewer_note}</p>}
                    {editing
                        ? <ReviewForm data={data} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onReviewSaved(); }} />
                        : data.profile
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
                title={data ? data.customer_number : "Select a conversation"}
                subtitle={data && (
                    <p className="subtle">{`Agent ${data.he_number} | ${formatNumber(data.total_messages)} messages | ${display("signal_quality", data.signal_quality)} signal`}</p>
                )}
            />
            {body}
        </aside>
    );
}
