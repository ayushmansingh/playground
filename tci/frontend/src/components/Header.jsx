import React from "react";
import { formatNumber } from "../lib/labels.js";

function MetaCard({ label, value }) {
    return (
        <div className="meta-card">
            <span className="meta-label">{label}</span>
            <strong>{value === undefined ? "..." : formatNumber(value)}</strong>
        </div>
    );
}

export default function Header({ meta, onOpenWorkspace }) {
    return (
        <>
            <header className="brand-bar">
                <div className="brand-lockup">
                    <span className="brand-mark">MMT</span>
                    <div>
                        <p className="brand-kicker">Travel Conversation Intelligence</p>
                        <strong>Holiday demand, blockers, and review workspace</strong>
                    </div>
                </div>
                <div className="brand-actions">
                    <span className="brand-chip">Live enrichment aware</span>
                    <span className="brand-chip">Explore + Analyze + Review + Import</span>
                </div>
            </header>

            <section className="hero-banner">
                <div className="hero-banner-copy">
                    <p className="eyebrow">Destination Insight Layer</p>
                    <h1>Search travel chats like packages, then open every conversation with grounded AI context.</h1>
                    <p className="hero-subtle">Built for the same flow your travel teams already use: destination-first discovery, quick comparison, and a clean path into the full transcript.</p>
                </div>
                <div className="hero-search-strip">
                    <div className="hero-search-cell"><span className="hero-search-label">Signals</span><strong>Intent, cohort, budget, sentiment</strong></div>
                    <div className="hero-search-cell"><span className="hero-search-label">Commerce</span><strong>Discount, coupon, cash interest</strong></div>
                    <div className="hero-search-cell"><span className="hero-search-label">Actions</span><strong>Explore segments and inspect chats</strong></div>
                    <button type="button" className="hero-search-button" onClick={onOpenWorkspace}>LIVE WORKSPACE</button>
                </div>
                <div className="meta-strip">
                    <MetaCard label="Filtered messages" value={meta?.row_count} />
                    <MetaCard label="Conversations" value={meta?.conversation_count} />
                    <MetaCard label="Profiles ready" value={meta?.profile_count} />
                    <MetaCard label="Reviewed" value={meta?.reviewed_count} />
                </div>
            </section>
        </>
    );
}
