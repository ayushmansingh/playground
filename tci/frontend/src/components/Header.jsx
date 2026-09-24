import React from "react";
import { formatNumber } from "../lib/labels.js";

const COUNTERS = [
    ["conversation_count", "Conversations"],
    ["message_count", "Messages"],
    ["profile_count", "AI profiles"],
    ["reviewed_count", "Reviewed"],
];

export default function Header({ meta, views, activeView, onViewChange }) {
    return (
        <header className="app-header">
            <div className="brand-lockup">
                <span className="brand-mark">MMT</span>
                <div>
                    <p className="brand-kicker">Travel Conversation Intelligence</p>
                    <strong>Holiday chat search and insights</strong>
                </div>
            </div>
            <nav className="view-nav" aria-label="Views">
                {views.map(([view, label]) => (
                    <button
                        key={view}
                        type="button"
                        className={`view-link${activeView === view ? " active" : ""}`}
                        aria-current={activeView === view ? "page" : undefined}
                        onClick={() => onViewChange(view)}
                    >
                        {label}
                    </button>
                ))}
            </nav>
            <dl className="counter-strip">
                {COUNTERS.map(([key, label]) => (
                    <div key={key} className="counter">
                        <dt>{label}</dt>
                        <dd>{meta ? formatNumber(meta[key]) : "..."}</dd>
                    </div>
                ))}
            </dl>
        </header>
    );
}
