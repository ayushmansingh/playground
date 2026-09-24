import React, { useEffect, useRef, useState } from "react";
import { buildQuery, fetchJson, postJson } from "../lib/api.js";
import { formatNumber, humanizeValue, useFilterOptions } from "../lib/labels.js";
import ConversationList from "../components/ConversationList.jsx";
import { OptionSelect, PanelHeader, Pagination } from "../components/ui.jsx";

// [profile field, field label, /api/filters option list]
const PROFILE_SELECTS = [
    ["travel_intent_primary", "Customer trip intent", "travel_intents"],
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

function formFromConversation(data) {
    const profile = data?.profile || {};
    const form = {
        review_status: data?.review?.review_status || "corrected",
        summary: profile.summary || "",
        destination_primary: profile.destination_primary || "",
        reviewer_note: data?.review?.reviewer_note || "",
    };
    for (const [field] of PROFILE_SELECTS) {
        form[field] = field === "dissatisfaction_reason"
            ? (profile.dissatisfaction_reasons || [])[0] || ""
            : profile[field] || "";
    }
    return form;
}

function ReviewEditor({ conversation, onSaved }) {
    const options = useFilterOptions();
    const [reviewedBy, setReviewedBy] = useState("");
    const [form, setForm] = useState(() => formFromConversation(null));
    const [saving, setSaving] = useState(false);
    const data = conversation.data;

    // Re-seed the form from each freshly loaded conversation.
    useEffect(() => {
        if (data) {
            setForm(formFromConversation(data));
        }
    }, [data]);

    const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

    const submit = async (event) => {
        event.preventDefault();
        if (!conversation.conversationId) {
            return;
        }
        const { dissatisfaction_reason: reason, review_status, reviewer_note, ...fields } = form;
        const payload = {
            conversation_id: conversation.conversationId,
            review_status: review_status || "corrected",
            reviewed_by: reviewedBy.trim(),
            reviewer_note: reviewer_note.trim(),
            corrected_fields: {
                ...fields,
                summary: fields.summary.trim(),
                destination_primary: fields.destination_primary.trim(),
                dissatisfaction_reasons: reason ? [reason] : [],
            },
        };
        setSaving(true);
        try {
            const response = await postJson("/api/review/save", payload);
            if (!response.ok) {
                alert(response.payload.detail || "Could not save the review.");
                return;
            }
            onSaved();
        } catch (error) {
            alert(error.message);
        } finally {
            setSaving(false);
        }
    };

    const selectField = (key, label, optionKey) => (
        <label key={key} className="field">
            <span>{label}</span>
            <OptionSelect options={options?.[optionKey]} emptyLabel={label} value={form[key]} onChange={(value) => setField(key, value)} />
        </label>
    );

    return (
        <aside className="side-card review-editor">
            <PanelHeader eyebrow="Review Editor" title="Human Override" />
            <form className="stack-form" onSubmit={submit}>
                <label className="field">
                    <span>Reviewer name</span>
                    <input type="text" placeholder="Optional" value={reviewedBy} onChange={(event) => setReviewedBy(event.target.value)} />
                </label>
                {selectField("review_status", "Manual review status", "review_statuses")}
                <label className="field">
                    <span>Summary</span>
                    <textarea rows="3" value={form.summary} onChange={(event) => setField("summary", event.target.value)} />
                </label>
                {selectField(...PROFILE_SELECTS[0])}
                <label className="field">
                    <span>Primary destination</span>
                    <input type="text" placeholder="Use short canonical text" value={form.destination_primary} onChange={(event) => setField("destination_primary", event.target.value)} />
                </label>
                {PROFILE_SELECTS.slice(1).map((spec) => selectField(...spec))}
                <label className="field">
                    <span>Reviewer note</span>
                    <textarea rows="3" value={form.reviewer_note} onChange={(event) => setField("reviewer_note", event.target.value)} />
                </label>
                <button type="submit" className="primary-button" disabled={!data || saving}>Save review</button>
            </form>
        </aside>
    );
}

export default function ReviewTab({ active, appliedFilters, conversation, onSelectConversation, onReviewSaved, dataVersion }) {
    const options = useFilterOptions();
    const [queue, setQueue] = useState("unreviewed");
    const [page, setPage] = useState(1);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const requestId = useRef(0);

    // Opening the tab starts the queue again from page 1.
    useEffect(() => {
        if (active) {
            setPage(1);
            setReloadKey((key) => key + 1);
        }
    }, [active]);

    useEffect(() => {
        if (!active) {
            return;
        }
        const id = ++requestId.current;
        fetchJson(`/api/review?${buildQuery({ ...appliedFilters, queue: queue || "unreviewed", page })}`)
            .then((data) => {
                if (id === requestId.current) {
                    setResult(data);
                    setError("");
                }
            })
            .catch((err) => {
                if (id === requestId.current) {
                    setError(err.message);
                }
            });
        // queue is read at load time only; "Load queue" applies a queue change.
    }, [reloadKey, page, dataVersion]);

    const queueLabel = (options?.review_queues || []).find((item) => item.value === result?.queue)?.label
        || humanizeValue(result?.queue);

    return (
        <div className="two-column">
            <section className="main-card">
                <PanelHeader
                    eyebrow="Review"
                    title="Quality Queue"
                    subtitle={<p className="subtle">Work through uncertain, uncategorized, or business-critical conversations without leaving the app.</p>}
                />
                <div className="review-controls">
                    <label className="field">
                        <span>Queue</span>
                        <OptionSelect options={options?.review_queues} emptyLabel="Choose a queue" value={queue} onChange={setQueue} />
                    </label>
                    <button type="button" className="ghost-button" onClick={() => { setPage(1); setReloadKey((key) => key + 1); }}>Load queue</button>
                </div>
                <div className="subtle">
                    {error || (result ? `${formatNumber(result.total)} conversations in the ${queueLabel} queue.` : "")}
                </div>
                <ConversationList
                    rows={result?.results ?? null}
                    placeholder="Load a review queue to begin."
                    emptyMessage="No conversations in this review queue."
                    selectedId={conversation.conversationId}
                    onSelect={onSelectConversation}
                />
                <Pagination page={page} totalPages={result?.total_pages || 0} onPage={setPage} />
            </section>

            <ReviewEditor conversation={conversation} onSaved={onReviewSaved} />
        </div>
    );
}
