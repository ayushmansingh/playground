import React, { useEffect, useState } from "react";
import "./app.css";
import { fetchJson } from "./lib/api.js";
import { FilterOptionsContext } from "./lib/labels.js";
import Header from "./components/Header.jsx";
import SearchView from "./views/SearchView.jsx";
import InsightsView from "./views/InsightsView.jsx";

const VIEWS = [
    ["search", "Search chats"],
    ["insights", "AI insights"],
];

export default function App() {
    const [activeView, setActiveView] = useState("search");
    const [meta, setMeta] = useState(null);
    const [options, setOptions] = useState(null);

    useEffect(() => {
        fetchJson("/api/meta").then(setMeta).catch(console.error);
        fetchJson("/api/insights/options").then(setOptions).catch(console.error);
    }, []);

    return (
        <FilterOptionsContext.Provider value={options}>
            <div className="app-shell">
                <Header meta={meta} views={VIEWS} activeView={activeView} onViewChange={setActiveView} />
                {/* Both views stay mounted so each keeps its search, filters, and selection. */}
                <main>
                    <section className={`view-panel${activeView === "search" ? " active" : ""}`}>
                        <SearchView />
                    </section>
                    <section className={`view-panel${activeView === "insights" ? " active" : ""}`}>
                        <InsightsView />
                    </section>
                </main>
            </div>
        </FilterOptionsContext.Provider>
    );
}
