import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildQuery, fetchJson } from "../lib/api.js";
import { formatNumber, useFilterOptions } from "../lib/labels.js";
import useConversation from "../lib/useConversation.js";
import { Pagination } from "../components/ui.jsx";
import FilterRail, { EMPTY_FILTERS } from "./insights/FilterRail.jsx";
import InsightList from "./insights/InsightList.jsx";
import AnalysisPanel from "./insights/AnalysisPanel.jsx";
import ConversationDetail from "./insights/ConversationDetail.jsx";

export default function InsightsView() {
    const options = useFilterOptions();
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [view, setView] = useState("");
    const [mode, setMode] = useState("list");
    const [page, setPage] = useState(1);
    const [result, setResult] = useState(null);
    const [status, setStatus] = useState("");
    const requestId = useRef(0);
    const { conversation, open } = useConversation();

    const query = useMemo(() => ({ ...filters, view }), [filters, view]);

    // Any change to the segment starts again from page 1. (Stable identity:
    // the filter rail's debounced destination input depends on it.)
    const changeFilters = useCallback((next) => {
        setFilters(next);
        setPage(1);
    }, []);
    const changeView = (next) => {
        setView(next);
        setPage(1);
    };

    useEffect(() => {
        if (mode !== "list") {
            return;
        }
        const id = ++requestId.current;
        setStatus("Loading...");
        fetchJson(`/api/insights?${buildQuery({ ...query, page })}`)
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
    }, [query, page, mode]);

    const quickViews = [{ value: "", label: "All" }, ...(options?.quick_views || [])];

    return (
        <div className={`insights-layout${mode === "analysis" ? " analysis-mode" : ""}`}>
            <FilterRail filters={filters} onChange={changeFilters} />

            <section className="main-card">
                <div className="insights-toolbar">
                    <div className="chip-row" role="group" aria-label="Quick views">
                        {quickViews.map((item) => (
                            <button
                                key={item.value || "all"}
                                type="button"
                                className={`chip${view === item.value ? " active" : ""}`}
                                aria-pressed={view === item.value}
                                onClick={() => changeView(item.value)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className="segmented" role="group" aria-label="Display">
                        {[["list", "List"], ["analysis", "Analysis"]].map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                className={mode === value ? "active" : ""}
                                aria-pressed={mode === value}
                                onClick={() => setMode(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {mode === "analysis"
                    ? <AnalysisPanel query={query} />
                    : (
                        <>
                            <div className="results-summary">
                                <span className="subtle">{result ? `${formatNumber(result.total)} AI-profiled conversations` : ""}</span>
                                <span className="status-text">{status}</span>
                            </div>
                            <InsightList cards={result?.results ?? null} selectedId={conversation.conversationId} onSelect={open} />
                            <Pagination page={page} totalPages={result?.total_pages || 0} onPage={setPage} />
                        </>
                    )}
            </section>

            {mode === "list" && <ConversationDetail conversation={conversation} />}
        </div>
    );
}
