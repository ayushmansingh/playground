import React, { useEffect } from "react";
import "./app.css";

const markup = String.raw`
<div class="app-shell">
  <header class="brand-bar">
    <div class="brand-lockup">
      <span class="brand-mark">MMT</span>
      <div>
        <p class="brand-kicker">Travel Conversation Intelligence</p>
        <strong>Holiday demand, blockers, and review workspace</strong>
      </div>
    </div>
    <div class="brand-actions">
      <span class="brand-chip">Live enrichment aware</span>
      <span class="brand-chip">Explore + Analyze + Review + Import</span>
    </div>
  </header>

  <section class="hero-banner">
    <div class="hero-banner-copy">
      <p class="eyebrow">Destination Insight Layer</p>
      <h1>Search travel chats like packages, then open every conversation with grounded AI context.</h1>
      <p class="hero-subtle">Built for the same flow your travel teams already use: destination-first discovery, quick comparison, and a clean path into the full transcript.</p>
    </div>
    <div class="hero-search-strip">
      <div class="hero-search-cell"><span class="hero-search-label">Signals</span><strong>Intent, cohort, budget, sentiment</strong></div>
      <div class="hero-search-cell"><span class="hero-search-label">Commerce</span><strong>Discount, coupon, cash interest</strong></div>
      <div class="hero-search-cell"><span class="hero-search-label">Actions</span><strong>Explore segments and inspect chats</strong></div>
      <button id="hero-live-workspace" type="button" class="hero-search-button">LIVE WORKSPACE</button>
    </div>
    <div class="meta-strip">
      <div class="meta-card"><span class="meta-label">Filtered messages</span><strong id="message-count">...</strong></div>
      <div class="meta-card"><span class="meta-label">Conversations</span><strong id="conversation-count">...</strong></div>
      <div class="meta-card"><span class="meta-label">Profiles ready</span><strong id="profile-count">...</strong></div>
      <div class="meta-card"><span class="meta-label">Reviewed</span><strong id="reviewed-count">...</strong></div>
    </div>
  </section>

  <nav class="tab-nav" aria-label="Primary">
    <button class="tab-link active" data-tab="explore">Explore</button>
    <button class="tab-link" data-tab="analyze">Analyze</button>
    <button class="tab-link" data-tab="review">Review</button>
    <button class="tab-link" data-tab="import">Import chats</button>
  </nav>

  <main class="tab-shell">
    <section id="tab-explore" class="tab-panel active">
      <div class="three-column">
        <aside class="side-card filter-rail">
          <div class="panel-header"><div><p class="eyebrow">Segment</p><h2>Explore Filters</h2></div><button id="clear-filters" type="button" class="ghost-button">Clear</button></div>
          <form id="explore-form" class="stack-form">
            <label class="field"><span>Search text</span><input id="search-input" type="search" placeholder="price too high, phu quoc, honeymoon..." /></label>
            <label class="field"><span>Destination</span><input id="destination-input" list="destination-options" placeholder="City or country" /><datalist id="destination-options"></datalist></label>
            <label class="field"><span>Customer trip intent</span><select id="intent-filter"><option value="">Any intent</option></select></label>
            <label class="field"><span>Travel cohort</span><select id="cohort-filter"><option value="">Any cohort</option></select></label>
            <label class="field"><span>Budget sensitivity</span><select id="budget-filter"><option value="">Any budget sensitivity</option></select></label>
            <label class="field"><span>Discount readiness</span><select id="discount-filter"><option value="">Any discount readiness</option></select></label>
            <label class="field"><span>Coupon seeking</span><select id="coupon-filter"><option value="">Any coupon behavior</option></select></label>
            <label class="field"><span>Cash payment mention</span><select id="cash-filter"><option value="">Any cash payment mention</option></select></label>
            <label class="field"><span>Customer sentiment</span><select id="sentiment-filter"><option value="">Any sentiment</option></select></label>
            <label class="field"><span>Dissatisfaction reason</span><select id="dissatisfaction-filter"><option value="">Any dissatisfaction reason</option></select></label>
            <label class="field"><span>Issue severity</span><select id="severity-filter"><option value="">Any severity</option></select></label>
            <label class="field"><span>Booking readiness</span><select id="willingness-filter"><option value="">Any readiness</option></select></label>
            <label class="field"><span>Main booking blocker</span><select id="blocker-filter"><option value="">Any blocker</option></select></label>
            <label class="field"><span>Profile confidence</span><select id="confidence-filter"><option value="">Any confidence</option></select></label>
            <label class="field"><span>Conversation signal</span><select id="signal-filter"><option value="">Any conversation signal</option></select></label>
            <label class="field"><span>Manual review status</span><select id="review-status-filter"><option value="">Any review state</option></select></label>
            <label class="toggle-row"><input id="enough-signal-only" type="checkbox" /><span>Only show conversations with enough signal</span></label>
            <label class="toggle-row"><input id="enriched-only" type="checkbox" /><span>Only show conversations with an AI profile</span></label>
            <button type="submit" class="primary-button">Apply segment</button>
          </form>
        </aside>

        <section class="main-card">
          <div class="panel-header"><div><p class="eyebrow">Explore</p><h2>Conversation Results</h2><p id="explore-summary" class="subtle">Apply a segment to load matching conversations.</p></div><div id="explore-status" class="status-text"></div></div>
          <div id="active-filters" class="active-filters hidden"></div>
          <div id="explore-results" class="conversation-list empty-state">No segment loaded yet.</div>
          <div id="explore-pagination" class="pagination hidden"><button id="explore-prev" type="button" class="ghost-button">Previous</button><span id="explore-page-summary"></span><button id="explore-next" type="button" class="ghost-button">Next</button></div>
        </section>

        <aside class="side-card workspace-panel">
          <div class="panel-header"><div><p class="eyebrow">Workspace</p><h2 id="workspace-title">Select a conversation</h2><p id="workspace-subtitle" class="subtle">Transcript, explicit signals, AI profile, and manual review all stay together here.</p></div></div>
          <div id="workspace-body" class="workspace-body empty-state">Pick a conversation from Explore or Review.</div>
        </aside>
      </div>
    </section>

    <section id="tab-analyze" class="tab-panel">
      <section class="main-card analyze-card">
        <div class="panel-header"><div><p class="eyebrow">Analyze</p><h2>Current Segment Intelligence</h2><p class="subtle">This view uses the same current filters as Explore, so every chart answers "for this segment, what is happening?"</p></div><button id="refresh-analysis" type="button" class="ghost-button">Refresh</button></div>
        <div id="analysis-kpis" class="kpi-grid"></div><div id="analysis-sample" class="sample-banner subtle"></div><div id="analysis-grids" class="analysis-grid"></div>
      </section>
    </section>

    <section id="tab-review" class="tab-panel">
      <div class="two-column">
        <section class="main-card">
          <div class="panel-header"><div><p class="eyebrow">Review</p><h2>Quality Queue</h2><p class="subtle">Work through uncertain, uncategorized, or business-critical conversations without leaving the app.</p></div></div>
          <div class="review-controls"><label class="field"><span>Queue</span><select id="review-queue"></select></label><button id="refresh-review" type="button" class="ghost-button">Load queue</button></div>
          <div id="review-summary" class="subtle"></div><div id="review-results" class="conversation-list empty-state">Load a review queue to begin.</div>
          <div id="review-pagination" class="pagination hidden"><button id="review-prev" type="button" class="ghost-button">Previous</button><span id="review-page-summary"></span><button id="review-next" type="button" class="ghost-button">Next</button></div>
        </section>

        <aside class="side-card review-editor">
          <div class="panel-header"><div><p class="eyebrow">Review Editor</p><h2>Human Override</h2></div></div>
          <form id="review-form" class="stack-form">
            <label class="field"><span>Reviewer name</span><input id="reviewed-by" type="text" placeholder="Optional" /></label>
            <label class="field"><span>Manual review status</span><select id="review-form-status"></select></label>
            <label class="field"><span>Summary</span><textarea id="review-summary-input" rows="3"></textarea></label>
            <label class="field"><span>Customer trip intent</span><select id="review-intent"></select></label>
            <label class="field"><span>Primary destination</span><input id="review-destination" type="text" placeholder="Use short canonical text" /></label>
            <label class="field"><span>Travel cohort</span><select id="review-cohort"></select></label>
            <label class="field"><span>Budget sensitivity</span><select id="review-budget"></select></label>
            <label class="field"><span>Discount readiness</span><select id="review-discount"></select></label>
            <label class="field"><span>Coupon seeking</span><select id="review-coupon"></select></label>
            <label class="field"><span>Customer sentiment</span><select id="review-sentiment"></select></label>
            <label class="field"><span>Dissatisfaction reason</span><select id="review-dsat"></select></label>
            <label class="field"><span>Issue severity</span><select id="review-severity"></select></label>
            <label class="field"><span>Booking readiness</span><select id="review-willingness"></select></label>
            <label class="field"><span>Main booking blocker</span><select id="review-blocker"></select></label>
            <label class="field"><span>Recommended next step</span><select id="review-next-action"></select></label>
            <label class="field"><span>Profile quality</span><select id="review-profile-status"></select></label>
            <label class="field"><span>Reviewer note</span><textarea id="review-note" rows="3"></textarea></label>
            <button id="save-review" type="submit" class="primary-button" disabled>Save review</button>
          </form>
        </aside>
      </div>
    </section>

    <section id="tab-import" class="tab-panel">
      <div class="import-layout">
        <section class="main-card import-card">
          <div class="panel-header">
            <div>
              <p class="eyebrow">DoubleTick</p>
              <h2>Add Conversations</h2>
              <p class="subtle">Upload customer/WABA pairs, fetch their chat history, deduplicate it, and add it to Explore and Analyze.</p>
            </div>
          </div>
          <form id="import-form" class="stack-form">
            <div class="import-step">
              <div class="step-number">1</div>
              <div class="step-body">
                <h3>Inspect workbook</h3>
                <p class="subtle">Use an .xlsx file with one customer number and one HE/WABA number per row.</p>
                <label class="field"><span>Excel workbook</span><input id="import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" /></label>
                <button id="inspect-upload" type="button" class="ghost-button">Upload and inspect</button>
                <div id="upload-summary" class="notice-box hidden"></div>
              </div>
            </div>

            <div id="import-settings" class="import-step muted-step">
              <div class="step-number">2</div>
              <div class="step-body">
                <h3>Configure fetch</h3>
                <div class="form-grid">
                  <label class="field"><span>Sheet</span><select id="import-sheet" disabled><option value="">Upload a workbook first</option></select></label>
                  <label class="field"><span>HE / WABA column</span><select id="import-waba-column" disabled><option value="">Select column</option></select></label>
                  <label class="field"><span>Customer column</span><select id="import-customer-column" disabled><option value="">Select column</option></select></label>
                  <label class="field"><span>Authorization key</span><input id="import-auth-key" type="password" autocomplete="off" placeholder="Not stored by the app" /></label>
                  <label class="field"><span>Start date (optional)</span><input id="import-start-date" type="date" /></label>
                  <label class="field"><span>End date (optional)</span><input id="import-end-date" type="date" /></label>
                  <label class="field"><span>Concurrent requests</span><input id="import-workers" type="number" min="1" max="5" value="3" /></label>
                  <label class="field"><span>Delay between starts (ms)</span><input id="import-delay" type="number" min="0" max="5000" value="100" /></label>
                </div>
                <div class="security-note"><strong>Credential safety</strong><span>The key is held only in server memory while this run is active. It is never written to the job database or workbook.</span></div>
                <button id="start-import" type="submit" class="primary-button" disabled>Start chat import</button>
              </div>
            </div>
          </form>
        </section>

        <aside class="side-card import-jobs-card">
          <div class="panel-header"><div><p class="eyebrow">Activity</p><h2>Import Jobs</h2><p class="subtle">Progress is saved in persistent app storage.</p></div><button id="refresh-imports" type="button" class="ghost-button">Refresh</button></div>
          <div id="import-message" class="status-text"></div>
          <div id="import-jobs" class="import-job-list empty-state">No import jobs yet.</div>
        </aside>
      </div>
    </section>
  </main>
</div>`;

export default function App() {
  useEffect(() => {
    const controller = document.createElement("script");
    controller.src = "/app.js";
    controller.async = true;
    document.body.appendChild(controller);

    return () => {
      controller.remove();
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}
