import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import "./app.css";
import { fetchJson } from "./lib/api.js";
import { FilterOptionsContext } from "./lib/labels.js";
import Header from "./components/Header.jsx";
import ExploreTab, { EMPTY_FILTERS } from "./tabs/ExploreTab.jsx";
import AnalyzeTab from "./tabs/AnalyzeTab.jsx";
import ReviewTab from "./tabs/ReviewTab.jsx";
import ImportTab from "./tabs/ImportTab.jsx";

const TABS = [
    ["explore", "Explore"],
    ["analyze", "Analyze"],
    ["review", "Review"],
    ["import", "Import chats"],
];

const NO_CONVERSATION = { conversationId: null, messageId: null, status: "idle", data: null, error: "" };

export default function App() {
    const [activeTab, setActiveTab] = useState("explore");
    const [meta, setMeta] = useState(null);
    const [filterOptions, setFilterOptions] = useState(null);
    // The segment last applied in Explore; Analyze and Review read it too.
    const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
    const [conversation, setConversation] = useState(NO_CONVERSATION);
    // Bumped after a review save so every list re-fetches its current page.
    const [dataVersion, setDataVersion] = useState(0);
    const searchRef = useRef(null);
    const conversationRequest = useRef(0);

    const loadMeta = useCallback(() => {
        fetchJson("/api/meta").then(setMeta).catch(console.error);
    }, []);

    useEffect(() => {
        loadMeta();
        fetchJson("/api/filters").then(setFilterOptions).catch(console.error);
    }, [loadMeta]);

    const loadConversation = useCallback(async (conversationId, messageId) => {
        const id = ++conversationRequest.current;
        setConversation((current) => ({ ...current, conversationId, messageId, status: "loading" }));
        const query = `conversation_id=${encodeURIComponent(conversationId)}&selected_id=${messageId || ""}`;
        try {
            const data = await fetchJson(`/api/conversation?${query}`);
            if (id === conversationRequest.current) {
                setConversation({ conversationId, messageId, status: "ready", data, error: "" });
            }
        } catch (error) {
            if (id === conversationRequest.current) {
                setConversation({ conversationId, messageId, status: "error", data: null, error: error.message });
            }
        }
    }, []);

    const handleReviewSaved = useCallback(() => {
        loadConversation(conversation.conversationId, conversation.messageId);
        loadMeta();
        setDataVersion((version) => version + 1);
    }, [conversation.conversationId, conversation.messageId, loadConversation, loadMeta]);

    const openWorkspace = () => {
        // Commit the tab switch first; a hidden input cannot take focus.
        flushSync(() => setActiveTab("explore"));
        searchRef.current?.focus();
    };

    const panelClass = (tab) => `tab-panel${activeTab === tab ? " active" : ""}`;

    return (
        <FilterOptionsContext.Provider value={filterOptions}>
            <div className="app-shell">
                <Header meta={meta} onOpenWorkspace={openWorkspace} />

                <nav className="tab-nav" aria-label="Primary">
                    {TABS.map(([tab, label]) => (
                        <button
                            key={tab}
                            type="button"
                            className={`tab-link${activeTab === tab ? " active" : ""}`}
                            aria-current={activeTab === tab ? "page" : undefined}
                            onClick={() => setActiveTab(tab)}
                        >
                            {label}
                        </button>
                    ))}
                </nav>

                {/* Every panel stays mounted so form input survives tab switches. */}
                <main className="tab-shell">
                    <section className={panelClass("explore")}>
                        <ExploreTab
                            appliedFilters={appliedFilters}
                            onApplyFilters={setAppliedFilters}
                            conversation={conversation}
                            onSelectConversation={loadConversation}
                            dataVersion={dataVersion}
                            searchRef={searchRef}
                        />
                    </section>
                    <section className={panelClass("analyze")}>
                        <AnalyzeTab active={activeTab === "analyze"} appliedFilters={appliedFilters} dataVersion={dataVersion} />
                    </section>
                    <section className={panelClass("review")}>
                        <ReviewTab
                            active={activeTab === "review"}
                            appliedFilters={appliedFilters}
                            conversation={conversation}
                            onSelectConversation={loadConversation}
                            onReviewSaved={handleReviewSaved}
                            dataVersion={dataVersion}
                        />
                    </section>
                    <section className={panelClass("import")}>
                        <ImportTab active={activeTab === "import"} onImportsFinished={loadMeta} />
                    </section>
                </main>
            </div>
        </FilterOptionsContext.Provider>
    );
}
