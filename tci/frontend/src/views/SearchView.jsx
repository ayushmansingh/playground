import React, { useEffect, useRef, useState } from "react";
import { buildQuery, fetchJson } from "../lib/api.js";
import { formatNumber } from "../lib/labels.js";
import useConversation from "../lib/useConversation.js";
import Transcript, { Highlight } from "../components/Transcript.jsx";
import { PanelHeader, Pagination, Pill } from "../components/ui.jsx";

const EMPTY_SEARCH = { q: "", sender: "", date_from: "", date_to: "", he_number: "", customer_number: "" };

function ResultItem({ result, term, selected, onSelect }) {
    const { snippet } = result;
    return (
        <article className={`result-item${selected ? " selected" : ""}`} onClick={() => onSelect(result.conversation_id, snippet.message_id)}>
            <div className="result-head">
                <strong>{result.customer_number}</strong>
                <span className="subtle">{`Agent ${result.he_number}`}</span>
                <span className="result-date">{snippet.message_datetime}</span>
            </div>
            <p className="result-snippet">
                {snippet.sender_type && <span className="result-sender">{snippet.sender_type}: </span>}
                <Highlight text={String(snippet.message_content).slice(0, 280)} term={term} />
            </p>
            <div className="pill-row">
                {result.hit_count > 0 && <Pill tone="accent">{`${result.hit_count} matching ${result.hit_count === 1 ? "message" : "messages"}`}</Pill>}
                <Pill>{`${formatNumber(result.total_messages)} messages`}</Pill>
                {result.has_profile && <Pill tone="good">AI profile</Pill>}
            </div>
        </article>
    );
}

export default function SearchView() {
    const [draft, setDraft] = useState(EMPTY_SEARCH);
    const [applied, setApplied] = useState(EMPTY_SEARCH);
    const [page, setPage] = useState(1);
    const [result, setResult] = useState(null);
    const [status, setStatus] = useState("");
    const requestId = useRef(0);
    const { conversation, open } = useConversation();

    useEffect(() => {
        const id = ++requestId.current;
        setStatus("Searching...");
        fetchJson(`/api/search?${buildQuery({ ...applied, page })}`)
            .then((data) => {
                if (id === requestId.current) {
                    setResult(data);
                    setStatus("");
                }
            })
            .catch((error) => {
                if (id === requestId.current) {
                    setStatus(error.message);
                }
            });
    }, [applied, page]);

    const setField = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
    const submit = (event) => {
        event.preventDefault();
        setPage(1);
        setApplied(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])));
    };
    const clear = () => {
        setDraft(EMPTY_SEARCH);
        setPage(1);
        setApplied(EMPTY_SEARCH);
    };

    const data = conversation.data;
    const summary = result
        ? applied.q
            ? `${formatNumber(result.total)} conversations mention "${applied.q}".`
            : `${formatNumber(result.total)} conversations, newest first.`
        : "";

    return (
        <div className="split-layout">
            <section className="main-card">
                <form className="search-form" onSubmit={submit}>
                    <div className="search-bar">
                        <input
                            type="search"
                            placeholder="Search message text, e.g. price too high"
                            aria-label="Search message text"
                            value={draft.q}
                            onChange={setField("q")}
                        />
                        <button type="submit" className="primary-button">Search</button>
                    </div>
                    <div className="search-filters">
                        <label className="field">
                            <span>Said by</span>
                            <select value={draft.sender} onChange={setField("sender")}>
                                <option value="">Anyone</option>
                                <option value="customer">Customer</option>
                                <option value="he">Agent</option>
                            </select>
                        </label>
                        <label className="field">
                            <span>From</span>
                            <input type="date" value={draft.date_from} onChange={setField("date_from")} />
                        </label>
                        <label className="field">
                            <span>To</span>
                            <input type="date" value={draft.date_to} onChange={setField("date_to")} />
                        </label>
                        <label className="field">
                            <span>Customer number</span>
                            <input inputMode="numeric" placeholder="Any" value={draft.customer_number} onChange={setField("customer_number")} />
                        </label>
                        <label className="field">
                            <span>Agent number</span>
                            <input inputMode="numeric" placeholder="Any" value={draft.he_number} onChange={setField("he_number")} />
                        </label>
                        <button type="button" className="ghost-button" onClick={clear}>Clear</button>
                    </div>
                </form>

                <div className="results-summary">
                    <span className="subtle">{summary}</span>
                    <span className="status-text">{status}</span>
                </div>
                {result && !result.results.length
                    ? <div className="empty-state">No conversations match this search.</div>
                    : (
                        <div className="result-list">
                            {(result?.results || []).map((item) => (
                                <ResultItem
                                    key={item.conversation_id}
                                    result={item}
                                    term={applied.q}
                                    selected={item.conversation_id === conversation.conversationId}
                                    onSelect={open}
                                />
                            ))}
                        </div>
                    )}
                <Pagination page={page} totalPages={result?.total_pages || 0} onPage={setPage} />
            </section>

            <aside className="side-card detail-panel">
                <PanelHeader
                    eyebrow="Conversation"
                    title={data ? data.customer_number : "Select a conversation"}
                    subtitle={
                        <p className="subtle">
                            {data
                                ? `Agent ${data.he_number} | ${formatNumber(data.total_messages)} messages`
                                : "Pick a result to read the full chat."}
                        </p>
                    }
                />
                {conversation.status === "error" && <div className="empty-state">{conversation.error}</div>}
                {conversation.status === "loading" && <div className="loading-state">Loading conversation...</div>}
                {conversation.status === "ready" && data && (
                    <Transcript messages={data.messages} focusId={conversation.messageId} term={applied.q} />
                )}
            </aside>
        </div>
    );
}
