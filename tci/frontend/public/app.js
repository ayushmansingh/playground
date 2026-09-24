const state = {
    activeTab: "explore",
    filters: {},
    filterOptions: null,
    selectedConversationId: null,
    selectedMessageId: null,
    selectedConversation: null,
    explorePage: 1,
    exploreTotalPages: 0,
    reviewPage: 1,
    reviewTotalPages: 0,
    importUpload: null,
    importPollTimer: null,
};

const refs = {
    tabs: document.querySelectorAll(".tab-link"),
    panels: document.querySelectorAll(".tab-panel"),
    heroWorkspaceButton: document.getElementById("hero-live-workspace"),
    messageCount: document.getElementById("message-count"),
    conversationCount: document.getElementById("conversation-count"),
    profileCount: document.getElementById("profile-count"),
    reviewedCount: document.getElementById("reviewed-count"),
    clearFilters: document.getElementById("clear-filters"),
    exploreForm: document.getElementById("explore-form"),
    searchInput: document.getElementById("search-input"),
    destinationInput: document.getElementById("destination-input"),
    destinationOptions: document.getElementById("destination-options"),
    intentFilter: document.getElementById("intent-filter"),
    cohortFilter: document.getElementById("cohort-filter"),
    budgetFilter: document.getElementById("budget-filter"),
    discountFilter: document.getElementById("discount-filter"),
    couponFilter: document.getElementById("coupon-filter"),
    cashFilter: document.getElementById("cash-filter"),
    sentimentFilter: document.getElementById("sentiment-filter"),
    dissatisfactionFilter: document.getElementById("dissatisfaction-filter"),
    severityFilter: document.getElementById("severity-filter"),
    willingnessFilter: document.getElementById("willingness-filter"),
    blockerFilter: document.getElementById("blocker-filter"),
    confidenceFilter: document.getElementById("confidence-filter"),
    signalFilter: document.getElementById("signal-filter"),
    reviewStatusFilter: document.getElementById("review-status-filter"),
    enoughSignalOnly: document.getElementById("enough-signal-only"),
    enrichedOnly: document.getElementById("enriched-only"),
    activeFilters: document.getElementById("active-filters"),
    exploreSummary: document.getElementById("explore-summary"),
    exploreStatus: document.getElementById("explore-status"),
    exploreResults: document.getElementById("explore-results"),
    explorePagination: document.getElementById("explore-pagination"),
    explorePrev: document.getElementById("explore-prev"),
    exploreNext: document.getElementById("explore-next"),
    explorePageSummary: document.getElementById("explore-page-summary"),
    workspaceTitle: document.getElementById("workspace-title"),
    workspaceSubtitle: document.getElementById("workspace-subtitle"),
    workspaceBody: document.getElementById("workspace-body"),
    refreshAnalysis: document.getElementById("refresh-analysis"),
    analysisKpis: document.getElementById("analysis-kpis"),
    analysisSample: document.getElementById("analysis-sample"),
    analysisGrids: document.getElementById("analysis-grids"),
    reviewQueue: document.getElementById("review-queue"),
    refreshReview: document.getElementById("refresh-review"),
    reviewSummary: document.getElementById("review-summary"),
    reviewResults: document.getElementById("review-results"),
    reviewPagination: document.getElementById("review-pagination"),
    reviewPrev: document.getElementById("review-prev"),
    reviewNext: document.getElementById("review-next"),
    reviewPageSummary: document.getElementById("review-page-summary"),
    reviewForm: document.getElementById("review-form"),
    reviewedBy: document.getElementById("reviewed-by"),
    reviewFormStatus: document.getElementById("review-form-status"),
    reviewSummaryInput: document.getElementById("review-summary-input"),
    reviewIntent: document.getElementById("review-intent"),
    reviewDestination: document.getElementById("review-destination"),
    reviewCohort: document.getElementById("review-cohort"),
    reviewBudget: document.getElementById("review-budget"),
    reviewDiscount: document.getElementById("review-discount"),
    reviewCoupon: document.getElementById("review-coupon"),
    reviewSentiment: document.getElementById("review-sentiment"),
    reviewDsat: document.getElementById("review-dsat"),
    reviewSeverity: document.getElementById("review-severity"),
    reviewWillingness: document.getElementById("review-willingness"),
    reviewBlocker: document.getElementById("review-blocker"),
    reviewNextAction: document.getElementById("review-next-action"),
    reviewProfileStatus: document.getElementById("review-profile-status"),
    reviewNote: document.getElementById("review-note"),
    saveReview: document.getElementById("save-review"),
    importForm: document.getElementById("import-form"),
    importFile: document.getElementById("import-file"),
    inspectUpload: document.getElementById("inspect-upload"),
    uploadSummary: document.getElementById("upload-summary"),
    importSettings: document.getElementById("import-settings"),
    importSheet: document.getElementById("import-sheet"),
    importWabaColumn: document.getElementById("import-waba-column"),
    importCustomerColumn: document.getElementById("import-customer-column"),
    importAuthKey: document.getElementById("import-auth-key"),
    importStartDate: document.getElementById("import-start-date"),
    importEndDate: document.getElementById("import-end-date"),
    importWorkers: document.getElementById("import-workers"),
    importDelay: document.getElementById("import-delay"),
    startImport: document.getElementById("start-import"),
    refreshImports: document.getElementById("refresh-imports"),
    importMessage: document.getElementById("import-message"),
    importJobs: document.getElementById("import-jobs"),
};

const KPI_LABELS = {
    conversations: "Conversations",
    profiled: "AI profiles ready",
    reviewed: "Manually reviewed",
    negative_percent: "Negative sentiment %",
    dissatisfaction_percent: "Conversations with dissatisfaction %",
    coupon_seeking_percent: "Coupon-seeking conversations %",
    budget_conscious_percent: "Budget-sensitive conversations %",
    high_willingness_percent: "High booking readiness %",
};

const FILTER_LABELS = {
    q: "Text",
    destination: "Destination",
    travel_intent: "Trip intent",
    travel_cohort: "Cohort",
    budget_conscious: "Budget sensitivity",
    discount_readiness: "Discount readiness",
    coupon_seeking: "Coupon seeking",
    cash_payment_interest: "Cash payment mention",
    sentiment: "Customer sentiment",
    dissatisfaction_reason: "Dissatisfaction",
    severity: "Issue severity",
    conversion_willingness: "Booking readiness",
    primary_blocker: "Main blocker",
    confidence: "Profile confidence",
    signal_quality: "Conversation signal",
    review_status: "Manual review",
    enough_signal_only: "Enough signal only",
    enriched_only: "AI profile only",
};

const FACT_TYPE_LABELS = {
    destination_city: "City",
    destination_country: "Country",
    intent: "Intent",
    dissatisfaction: "Dissatisfaction",
    cash_payment_interest: "Cash payment",
};

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatNumber(value) {
    return new Intl.NumberFormat().format(value || 0);
}

function titleCase(value) {
    return String(value ?? "")
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function humanizeValue(value) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
        return "";
    }
    return titleCase(normalized.replaceAll("_", " ").replaceAll("-", " "));
}

function optionLabel(optionKey, value) {
    if (value === null || value === undefined || value === "") {
        return "";
    }
    const options = state.filterOptions?.[optionKey] || [];
    const match = options.find((option) => option.value === value);
    return match?.label || humanizeValue(value);
}

function displayValue(fieldKey, value) {
    const key = String(fieldKey || "");
    switch (key) {
        case "travel_intent":
        case "travel_intent_primary":
        case "travel_intent_secondary":
            return optionLabel("travel_intents", value);
        case "budget_conscious":
            return optionLabel("budget_options", value);
        case "travel_cohort":
            return optionLabel("travel_cohorts", value);
        case "discount_readiness":
            return optionLabel("discount_levels", value);
        case "coupon_seeking":
            return optionLabel("coupon_options", value);
        case "cash_payment_interest":
            return optionLabel("cash_payment_options", value);
        case "sentiment":
        case "overall_customer_sentiment":
            return optionLabel("sentiments", value);
        case "dissatisfaction_reason":
        case "dissatisfaction_reasons":
            return optionLabel("dissatisfaction_reasons", value);
        case "severity":
            return optionLabel("severities", value);
        case "conversion_willingness":
            return optionLabel("willingness_levels", value);
        case "primary_blocker":
            return optionLabel("blockers", value);
        case "next_best_action":
            return optionLabel("next_actions", value);
        case "confidence":
        case "confidence_overall":
            return optionLabel("confidence_levels", value);
        case "profile_status":
            return optionLabel("profile_statuses", value);
        case "review_status":
            return optionLabel("review_statuses", value);
        case "signal_quality":
            return optionLabel("signal_qualities", value);
        default:
            return humanizeValue(value);
    }
}

function senderScopeLabel(value) {
    return {
        customer: "Customer",
        he: "HE",
        all: "Any sender",
    }[String(value || "").toLowerCase()] || humanizeValue(value);
}

function sampleQualityLabel(value) {
    return {
        strong: "Strong enough for confident analysis",
        directional: "Directional only",
        small: "Small sample, use with care",
        tiny: "Very small sample, inspect conversations directly",
    }[String(value || "").toLowerCase()] || humanizeValue(value);
}

function extractUrls(value) {
    return String(value ?? "").match(/https?:\/\/[^\s]+/gi) || [];
}

function isImageUrl(url) {
    return /\/images\/|\.png(?:\?|$)|\.jpe?g(?:\?|$)|\.gif(?:\?|$)|\.webp(?:\?|$)|\.bmp(?:\?|$)|\.svg(?:\?|$)/i.test(url);
}

function fetchJson(url) {
    return fetch(url).then((response) => {
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
        }
        return response.json();
    });
}

function postJson(url, body) {
    return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    }).then((response) => response.json().then((payload) => ({ ok: response.ok, payload })));
}

function populateSelect(element, options, emptyLabel) {
    element.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>`;
    for (const option of options || []) {
        element.insertAdjacentHTML(
            "beforeend",
            `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
        );
    }
}

function populateDatalist(element, values) {
    element.innerHTML = (values || [])
        .map((value) => `<option value="${escapeHtml(value)}"></option>`)
        .join("");
}

function badge(label, tone = "neutral") {
    return `<span class="pill tone-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function toneForValue(fieldKey, value) {
    const normalized = String(value || "").toLowerCase();
    switch (fieldKey) {
        case "signal_quality":
            return normalized === "strong" ? "good" : normalized === "moderate" ? "accent" : normalized === "weak" ? "warm" : "neutral";
        case "review_status":
            return normalized === "corrected" ? "accent" : normalized === "approved" ? "good" : "neutral";
        case "overall_customer_sentiment":
        case "sentiment":
            return normalized === "negative" ? "warm" : normalized === "positive" ? "good" : normalized === "mixed" ? "accent" : "neutral";
        case "dissatisfaction_reason":
            return normalized && normalized !== "none" ? "warm" : "good";
        case "conversion_willingness":
            return normalized === "high" ? "good" : normalized === "medium" ? "accent" : "neutral";
        case "budget_conscious":
            return normalized === "yes" ? "warm" : normalized === "no" ? "good" : "neutral";
        case "discount_readiness":
            return normalized === "high" ? "warm" : normalized === "medium" ? "accent" : normalized === "low" ? "good" : "neutral";
        case "coupon_seeking":
        case "cash_payment_interest":
            return normalized === "yes" ? "accent" : normalized === "no" ? "good" : "neutral";
        case "profile_status":
            return normalized === "complete" ? "good" : normalized === "insufficient_signal" ? "warm" : "neutral";
        case "confidence_overall":
        case "confidence":
            return normalized === "high" ? "good" : normalized === "medium" ? "accent" : normalized === "low" ? "warm" : "neutral";
        default:
            return "neutral";
    }
}

function collectFilters() {
    return {
        q: refs.searchInput.value.trim(),
        destination: refs.destinationInput.value.trim(),
        travel_intent: refs.intentFilter.value,
        travel_cohort: refs.cohortFilter.value,
        budget_conscious: refs.budgetFilter.value,
        discount_readiness: refs.discountFilter.value,
        coupon_seeking: refs.couponFilter.value,
        cash_payment_interest: refs.cashFilter.value,
        sentiment: refs.sentimentFilter.value,
        dissatisfaction_reason: refs.dissatisfactionFilter.value,
        severity: refs.severityFilter.value,
        conversion_willingness: refs.willingnessFilter.value,
        primary_blocker: refs.blockerFilter.value,
        confidence: refs.confidenceFilter.value,
        signal_quality: refs.signalFilter.value,
        review_status: refs.reviewStatusFilter.value,
        enough_signal_only: refs.enoughSignalOnly.checked ? "true" : "",
        enriched_only: refs.enrichedOnly.checked ? "true" : "",
    };
}

function hasActiveFilters(filters) {
    return Object.values(filters).some((value) => Boolean(value));
}

function filterPills(filters) {
    const labels = [];
    for (const [key, label] of Object.entries(FILTER_LABELS)) {
        if (filters[key]) {
            let display = filters[key];
            if (["travel_intent", "travel_cohort", "budget_conscious", "discount_readiness", "coupon_seeking", "cash_payment_interest", "sentiment", "dissatisfaction_reason", "severity", "conversion_willingness", "primary_blocker", "confidence", "signal_quality", "review_status"].includes(key)) {
                display = displayValue(key, filters[key]);
            } else if (["enough_signal_only", "enriched_only"].includes(key)) {
                display = "Yes";
            }
            labels.push(`<span class="active-filter-pill"><strong>${escapeHtml(label)}</strong> ${escapeHtml(display)}</span>`);
        }
    }
    refs.activeFilters.innerHTML = labels.join("");
    refs.activeFilters.classList.toggle("hidden", !labels.length);
}

function buildQuery(params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value) {
            searchParams.set(key, value);
        }
    }
    return searchParams.toString();
}

function renderMessageBody(message) {
    const content = String(message.message_content ?? "");
    const urls = extractUrls(content);
    const imageUrls = urls.filter(isImageUrl);
    let textOnly = content;
    for (const imageUrl of imageUrls) {
        textOnly = textOnly.replace(imageUrl, "");
    }
    const parts = [];
    if (textOnly.trim()) {
        parts.push(`<div class="message-text">${escapeHtml(textOnly.trim())}</div>`);
    }
    for (const imageUrl of imageUrls) {
        const safeUrl = escapeHtml(imageUrl);
        parts.push(`
            <div class="image-block">
                <a class="image-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
                    <img src="${safeUrl}" alt="Chat image" loading="lazy">
                </a>
                <a class="media-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open image</a>
            </div>
        `);
    }
    return parts.join("") || `<div class="message-text">${escapeHtml(content)}</div>`;
}

function legacyRenderConversationList(target, rows, emptyMessage) {
    if (!rows.length) {
        target.className = "conversation-list empty-state";
        target.innerHTML = escapeHtml(emptyMessage);
        return;
    }
    target.className = "conversation-list";
    target.innerHTML = rows.map((row) => {
        const profile = row.profile || {};
        const isSelected = row.conversation_id === state.selectedConversationId;
        const snippet = row.query_match?.message_content || row.latest_message_content || "";
        const destinationTitle = row.display_destination && row.display_destination !== "unclear"
            ? row.display_destination
            : "Unclear destination";
        return `
            <article class="conversation-card ${isSelected ? "selected" : ""}" data-conversation-id="${escapeHtml(row.conversation_id)}" data-message-id="${escapeHtml(row.query_match?.message_id || row.latest_message_id)}">
                <div class="card-top">
                    <div>
                        <h3>${escapeHtml(destinationTitle)}</h3>
                        <p class="subtle">${escapeHtml(row.customer_number)} • ${escapeHtml(row.latest_message_datetime)}</p>
                    </div>
                    <div class="pill-row">
                        ${badge(displayValue("signal_quality", row.signal_quality), row.signal_quality === "weak" ? "warm" : "good")}
                        ${badge(displayValue("review_status", row.review_status), row.review_status === "corrected" ? "accent" : "neutral")}
                    </div>
                </div>
                <div class="pill-row">
                    ${badge(displayValue("travel_intent_primary", profile.travel_intent_primary || "unclear"))}
                    ${badge(displayValue("travel_cohort", profile.travel_cohort || "unclear"))}
                    ${badge(displayValue("overall_customer_sentiment", profile.overall_customer_sentiment || "unclear"))}
                    ${badge(displayValue("dissatisfaction_reason", (profile.dissatisfaction_reasons || ["none"])[0] || "none"))}
                    ${badge(displayValue("conversion_willingness", profile.conversion_willingness || "unclear"))}
                </div>
                <p class="card-summary">${escapeHtml(row.summary || "No summary yet.")}</p>
                <p class="card-snippet">${escapeHtml(snippet).slice(0, 220)}</p>
            </article>
        `;
    }).join("");

    for (const card of target.querySelectorAll(".conversation-card")) {
        card.addEventListener("click", () => {
            state.selectedConversationId = card.dataset.conversationId;
            state.selectedMessageId = Number(card.dataset.messageId);
            loadConversation(card.dataset.conversationId, Number(card.dataset.messageId));
        });
    }
}

function renderPagination(container, summaryNode, prevButton, nextButton, page, totalPages) {
    container.classList.toggle("hidden", totalPages <= 1);
    summaryNode.textContent = totalPages ? `Page ${page} of ${totalPages}` : "";
    prevButton.disabled = page <= 1;
    nextButton.disabled = page >= totalPages;
}

function tabToRoute(tab) {
    return tab === "analyze" ? "analyze" : tab === "review" ? "review" : "explore";
}

function switchTab(tab) {
    state.activeTab = tab;
    refs.tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    refs.panels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tab}`));
    if (tab === "analyze") {
        loadAnalysis();
    } else if (tab === "review") {
        loadReviewQueue(1);
    } else if (tab === "import") {
        loadImportJobs();
    }
}

async function loadMetadata() {
    const data = await fetchJson("/api/meta");
    refs.messageCount.textContent = formatNumber(data.row_count);
    refs.conversationCount.textContent = formatNumber(data.conversation_count);
    refs.profileCount.textContent = formatNumber(data.profile_count);
    refs.reviewedCount.textContent = formatNumber(data.reviewed_count);
}

async function loadFilters() {
    const data = await fetchJson("/api/filters");
    state.filterOptions = data;
    populateDatalist(refs.destinationOptions, data.destination_suggestions || []);
    populateSelect(refs.intentFilter, data.travel_intents, "Any intent");
    populateSelect(refs.cohortFilter, data.travel_cohorts, "Any cohort");
    populateSelect(refs.budgetFilter, data.budget_options, "Any budget sensitivity");
    populateSelect(refs.discountFilter, data.discount_levels, "Any discount readiness");
    populateSelect(refs.couponFilter, data.coupon_options, "Any coupon behavior");
    populateSelect(refs.cashFilter, data.cash_payment_options, "Any cash payment mention");
    populateSelect(refs.sentimentFilter, data.sentiments, "Any sentiment");
    populateSelect(refs.dissatisfactionFilter, data.dissatisfaction_reasons, "Any dissatisfaction reason");
    populateSelect(refs.severityFilter, data.severities, "Any severity");
    populateSelect(refs.willingnessFilter, data.willingness_levels, "Any readiness");
    populateSelect(refs.blockerFilter, data.blockers, "Any blocker");
    populateSelect(refs.confidenceFilter, data.confidence_levels, "Any confidence");
    populateSelect(refs.signalFilter, data.signal_qualities, "Any conversation signal");
    populateSelect(refs.reviewStatusFilter, data.review_statuses, "Any review state");
    populateSelect(refs.reviewQueue, data.review_queues, "Choose a queue");
    populateSelect(refs.reviewFormStatus, data.review_statuses, "Manual review status");
    populateSelect(refs.reviewIntent, data.travel_intents, "Customer trip intent");
    populateSelect(refs.reviewCohort, data.travel_cohorts, "Travel cohort");
    populateSelect(refs.reviewBudget, data.budget_options, "Budget sensitivity");
    populateSelect(refs.reviewDiscount, data.discount_levels, "Discount readiness");
    populateSelect(refs.reviewCoupon, data.coupon_options, "Coupon seeking");
    populateSelect(refs.reviewSentiment, data.sentiments, "Customer sentiment");
    populateSelect(refs.reviewDsat, data.dissatisfaction_reasons, "Dissatisfaction reason");
    populateSelect(refs.reviewSeverity, data.severities, "Issue severity");
    populateSelect(refs.reviewWillingness, data.willingness_levels, "Booking readiness");
    populateSelect(refs.reviewBlocker, data.blockers, "Main booking blocker");
    populateSelect(refs.reviewNextAction, data.next_actions, "Recommended next step");
    populateSelect(refs.reviewProfileStatus, data.profile_statuses, "Profile quality");
}

async function loadExplore(page = 1) {
    state.filters = collectFilters();
    state.explorePage = page;
    filterPills(state.filters);
    refs.exploreStatus.textContent = "Loading...";
    const query = buildQuery({ ...state.filters, page });
    const data = await fetchJson(`/api/explore?${query}`);
    state.exploreTotalPages = data.total_pages || 0;
    refs.exploreSummary.textContent = hasActiveFilters(state.filters)
        ? `${formatNumber(data.total)} conversations match the current segment.`
        : "Apply a segment to load matching conversations.";
    refs.exploreStatus.textContent = data.total ? `Showing ${formatNumber(data.results.length)} rows` : "No matches";
    renderConversationList(refs.exploreResults, data.results || [], "No conversations matched this segment.");
    renderPagination(refs.explorePagination, refs.explorePageSummary, refs.explorePrev, refs.exploreNext, state.explorePage, state.exploreTotalPages);
}

function legacyProfileRows(profile) {
    if (!profile) {
        return `<p class="subtle">No AI profile yet for this conversation.</p>`;
    }
    const reasons = profile.dissatisfaction_reasons || [];
    return `
        <div class="profile-grid">
            <div><span class="label">Customer trip intent</span><strong>${escapeHtml(displayValue("travel_intent_primary", profile.travel_intent_primary || "unclear"))}</strong></div>
            <div><span class="label">Primary destination</span><strong>${escapeHtml(profile.destination_primary || "unclear")}</strong></div>
            <div><span class="label">Travel cohort</span><strong>${escapeHtml(displayValue("travel_cohort", profile.travel_cohort || "unclear"))}</strong></div>
            <div><span class="label">Budget sensitivity</span><strong>${escapeHtml(displayValue("budget_conscious", profile.budget_conscious || "unclear"))}</strong></div>
            <div><span class="label">Discount readiness</span><strong>${escapeHtml(displayValue("discount_readiness", profile.discount_readiness || "unclear"))}</strong></div>
            <div><span class="label">Coupon seeking</span><strong>${escapeHtml(displayValue("coupon_seeking", profile.coupon_seeking || "unclear"))}</strong></div>
            <div><span class="label">Customer sentiment</span><strong>${escapeHtml(displayValue("overall_customer_sentiment", profile.overall_customer_sentiment || "unclear"))}</strong></div>
            <div><span class="label">Issue severity</span><strong>${escapeHtml(displayValue("severity", profile.severity || "unclear"))}</strong></div>
            <div><span class="label">Booking readiness</span><strong>${escapeHtml(displayValue("conversion_willingness", profile.conversion_willingness || "unclear"))}</strong></div>
            <div><span class="label">Main booking blocker</span><strong>${escapeHtml(displayValue("primary_blocker", profile.primary_blocker || "unclear"))}</strong></div>
            <div><span class="label">Recommended next step</span><strong>${escapeHtml(displayValue("next_best_action", profile.next_best_action || "unclear"))}</strong></div>
            <div><span class="label">Profile quality</span><strong>${escapeHtml(displayValue("profile_status", profile.profile_status || "unclear"))}</strong></div>
            <div><span class="label">Profile confidence</span><strong>${escapeHtml(displayValue("confidence_overall", profile.confidence_overall || "unclear"))}</strong></div>
        </div>
        <p class="profile-summary">${escapeHtml(profile.summary || "No summary yet.")}</p>
        <div class="profile-chip-group">
            <span class="label">Dissatisfaction reasons</span>
            <div class="pill-row">${(reasons.length ? reasons : ["none"]).map((reason) => badge(displayValue("dissatisfaction_reason", reason))).join("")}</div>
        </div>
    `;
}

function legacyRenderWorkspace(data) {
    state.selectedConversation = data;
    refs.workspaceTitle.textContent = `${data.he_number} <-> ${data.customer_number}`;
    refs.workspaceSubtitle.textContent = `${formatNumber(data.facts.total_messages)} filtered messages • ${data.facts.signal_quality} signal`;
    const evidenceIds = new Set((data.evidence_message_ids || []).map((value) => Number(value)));
    refs.workspaceSubtitle.textContent = `${formatNumber(data.facts.total_messages)} filtered messages | ${displayValue("signal_quality", data.facts.signal_quality)} conversation signal`;
    const factPills = ["destination_city", "destination_country", "intent", "dissatisfaction", "cash_payment_interest"]
        .map((key) => (data.facts[key] || []).map((item) => badge(`${FACT_TYPE_LABELS[key]}: ${item.display_value} | ${senderScopeLabel(item.sender_scope)}`)).join(""))
        .join("");
    refs.workspaceBody.innerHTML = `
        <section class="workspace-section">
            <h3>AI Profile</h3>
            ${profileRows(data.profile)}
        </section>
        <section class="workspace-section">
            <h3>Explicit Signals Found</h3>
            <div class="pill-row">${factPills || `<span class="subtle">No explicit signals detected.</span>`}</div>
        </section>
        <section class="workspace-section">
            <h3>Manual Review</h3>
            <div class="pill-row">
                ${badge(displayValue("review_status", data.review.review_status || "unreviewed"))}
                ${data.review.reviewed_by ? badge(`By ${data.review.reviewed_by}`) : ""}
            </div>
            <p class="subtle">${escapeHtml(data.review.reviewer_note || "No reviewer note yet.")}</p>
        </section>
        <section class="workspace-section">
            <h3>Transcript</h3>
            <div class="transcript-list">
                ${data.messages.map((message) => `
                    <article class="bubble ${String(message.sender_type).toLowerCase() === "he" ? "he" : "customer"} ${Number(message.id) === state.selectedMessageId ? "selected" : ""} ${evidenceIds.has(Number(message.id)) ? "evidence" : ""}">
                        <div class="bubble-meta">
                            <span>${escapeHtml(message.sender_type)}</span>
                            <span>${escapeHtml(message.message_type)} • ${escapeHtml(message.message_datetime)}</span>
                        </div>
                        ${renderMessageBody(message)}
                    </article>
                `).join("")}
            </div>
        </section>
    `;
    hydrateReviewForm(data);
}

async function loadConversation(conversationId, selectedId) {
    refs.workspaceBody.className = "workspace-body loading-state";
    refs.workspaceBody.textContent = "Loading conversation...";
    const data = await fetchJson(`/api/conversation?conversation_id=${encodeURIComponent(conversationId)}&selected_id=${selectedId || ""}`);
    refs.workspaceBody.className = "workspace-body";
    renderWorkspace(data);
}

function renderDistributionCard(title, items) {
    return `
        <section class="distribution-card">
            <h3>${escapeHtml(title)}</h3>
            ${!items.length ? `<p class="subtle">No data in this segment.</p>` : items.map((item) => `
                <div class="distribution-row">
                    <span>${escapeHtml(item.value)}</span>
                    <strong>${formatNumber(item.count)}</strong>
                </div>
            `).join("")}
        </section>
    `;
}

async function legacyLoadAnalysis() {
    refs.analysisSample.textContent = "Loading analysis...";
    refs.analysisKpis.innerHTML = "";
    refs.analysisGrids.innerHTML = "";
    const query = buildQuery(state.filters || collectFilters());
    const data = await fetchJson(`/api/analyze?${query}`);
    refs.analysisSample.textContent = `Sample size: ${formatNumber(data.sample_size)} conversations • ${data.sample_quality} confidence for aggregate reading`;
    refs.analysisSample.textContent = `Sample size: ${formatNumber(data.sample_size)} conversations | ${sampleQualityLabel(data.sample_quality)}`;
    refs.analysisKpis.innerHTML = Object.entries(data.kpis || {}).map(([key, value]) => {
        const formattedValue = typeof value === "number"
            ? (key.endsWith("_percent") ? `${value.toFixed(1)}%` : (String(value).includes(".") ? value.toFixed(1) : formatNumber(value)))
            : value;
        return `
            <article class="kpi-card">
                <span class="label">${escapeHtml(KPI_LABELS[key] || humanizeValue(key))}</span>
                <strong>${escapeHtml(formattedValue)}</strong>
            </article>
        `;
    }).join("");
    refs.analysisGrids.innerHTML = [
        renderDistributionCard("Customer trip intent", (data.distributions?.intent || []).map((item) => ({ ...item, value: displayValue("travel_intent", item.value) }))),
        renderDistributionCard("Destination", data.distributions?.destination || []),
        renderDistributionCard("Travel cohort", (data.distributions?.cohort || []).map((item) => ({ ...item, value: displayValue("travel_cohort", item.value) }))),
        renderDistributionCard("Budget sensitivity", (data.distributions?.budget || []).map((item) => ({ ...item, value: displayValue("budget_conscious", item.value) }))),
        renderDistributionCard("Discount readiness", (data.distributions?.discount || []).map((item) => ({ ...item, value: displayValue("discount_readiness", item.value) }))),
        renderDistributionCard("Coupon seeking", (data.distributions?.coupon || []).map((item) => ({ ...item, value: displayValue("coupon_seeking", item.value) }))),
        renderDistributionCard("Cash payment mention", (data.distributions?.cash_payment || []).map((item) => ({ ...item, value: displayValue("cash_payment_interest", item.value) }))),
        renderDistributionCard("Customer sentiment", (data.distributions?.sentiment || []).map((item) => ({ ...item, value: displayValue("sentiment", item.value) }))),
        renderDistributionCard("Dissatisfaction reasons", (data.distributions?.dissatisfaction || []).map((item) => ({ ...item, value: displayValue("dissatisfaction_reason", item.value) }))),
        renderDistributionCard("Issue severity", (data.distributions?.severity || []).map((item) => ({ ...item, value: displayValue("severity", item.value) }))),
        renderDistributionCard("Booking readiness", (data.distributions?.willingness || []).map((item) => ({ ...item, value: displayValue("conversion_willingness", item.value) }))),
        renderDistributionCard("Main booking blocker", (data.distributions?.blocker || []).map((item) => ({ ...item, value: displayValue("primary_blocker", item.value) }))),
        renderDistributionCard("Conversation signal", (data.distributions?.signal_quality || []).map((item) => ({ ...item, value: displayValue("signal_quality", item.value) }))),
    ].join("");
}

function hydrateReviewForm(data) {
    const profile = data.profile || {};
    refs.saveReview.disabled = false;
    refs.reviewFormStatus.value = data.review.review_status || "corrected";
    refs.reviewSummaryInput.value = profile.summary || "";
    refs.reviewIntent.value = profile.travel_intent_primary || "";
    refs.reviewDestination.value = profile.destination_primary || "";
    refs.reviewCohort.value = profile.travel_cohort || "";
    refs.reviewBudget.value = profile.budget_conscious || "";
    refs.reviewDiscount.value = profile.discount_readiness || "";
    refs.reviewCoupon.value = profile.coupon_seeking || "";
    refs.reviewSentiment.value = profile.overall_customer_sentiment || "";
    refs.reviewDsat.value = (profile.dissatisfaction_reasons || [])[0] || "";
    refs.reviewSeverity.value = profile.severity || "";
    refs.reviewWillingness.value = profile.conversion_willingness || "";
    refs.reviewBlocker.value = profile.primary_blocker || "";
    refs.reviewNextAction.value = profile.next_best_action || "";
    refs.reviewProfileStatus.value = profile.profile_status || "";
    refs.reviewNote.value = data.review.reviewer_note || "";
}

async function legacyLoadReviewQueue(page = 1) {
    state.reviewPage = page;
    const filters = state.filters || collectFilters();
    const queue = refs.reviewQueue.value || "unreviewed";
    const query = buildQuery({ ...filters, queue, page });
    const data = await fetchJson(`/api/review?${query}`);
    state.reviewTotalPages = data.total_pages || 0;
    const queueLabel = (state.filterOptions?.review_queues || []).find((item) => item.value === queue)?.label || humanizeValue(queue);
    refs.reviewSummary.textContent = `${formatNumber(data.total)} conversations in the ${queueLabel} queue.`;
    renderConversationList(refs.reviewResults, data.results || [], "No conversations in this review queue.");
    renderPagination(refs.reviewPagination, refs.reviewPageSummary, refs.reviewPrev, refs.reviewNext, state.reviewPage, state.reviewTotalPages);
}

async function submitReview(event) {
    event.preventDefault();
    if (!state.selectedConversationId) {
        return;
    }
    const payload = {
        conversation_id: state.selectedConversationId,
        review_status: refs.reviewFormStatus.value || "corrected",
        reviewed_by: refs.reviewedBy.value.trim(),
        reviewer_note: refs.reviewNote.value.trim(),
        corrected_fields: {
            summary: refs.reviewSummaryInput.value.trim(),
            travel_intent_primary: refs.reviewIntent.value,
            destination_primary: refs.reviewDestination.value.trim(),
            travel_cohort: refs.reviewCohort.value,
            budget_conscious: refs.reviewBudget.value,
            discount_readiness: refs.reviewDiscount.value,
            coupon_seeking: refs.reviewCoupon.value,
            overall_customer_sentiment: refs.reviewSentiment.value,
            dissatisfaction_reasons: refs.reviewDsat.value ? [refs.reviewDsat.value] : [],
            severity: refs.reviewSeverity.value,
            conversion_willingness: refs.reviewWillingness.value,
            primary_blocker: refs.reviewBlocker.value,
            next_best_action: refs.reviewNextAction.value,
            profile_status: refs.reviewProfileStatus.value,
        },
    };
    refs.saveReview.disabled = true;
    const response = await postJson("/api/review/save", payload);
    refs.saveReview.disabled = false;
    if (!response.ok) {
        alert(response.payload.error || "Could not save the review.");
        return;
    }
    await loadConversation(state.selectedConversationId, state.selectedMessageId);
    await loadMetadata();
    if (state.activeTab === "review") {
        await loadReviewQueue(state.reviewPage);
    } else {
        await loadExplore(state.explorePage);
    }
}

function clearFilters() {
    refs.searchInput.value = "";
    refs.destinationInput.value = "";
    refs.intentFilter.value = "";
    refs.cohortFilter.value = "";
    refs.budgetFilter.value = "";
    refs.discountFilter.value = "";
    refs.couponFilter.value = "";
    refs.cashFilter.value = "";
    refs.sentimentFilter.value = "";
    refs.dissatisfactionFilter.value = "";
    refs.severityFilter.value = "";
    refs.willingnessFilter.value = "";
    refs.blockerFilter.value = "";
    refs.confidenceFilter.value = "";
    refs.signalFilter.value = "";
    refs.reviewStatusFilter.value = "";
    refs.enoughSignalOnly.checked = false;
    refs.enrichedOnly.checked = false;
    refs.activeFilters.classList.add("hidden");
}

function renderConversationList(target, rows, emptyMessage) {
    if (!rows.length) {
        target.className = "conversation-list empty-state";
        target.innerHTML = escapeHtml(emptyMessage);
        return;
    }

    target.className = "conversation-list";
    target.innerHTML = rows.map((row) => {
        const profile = row.profile || {};
        const isSelected = row.conversation_id === state.selectedConversationId;
        const snippet = row.query_match?.message_content || row.latest_message_content || "";
        const destinationTitle = row.display_destination && row.display_destination !== "unclear"
            ? row.display_destination
            : "Unclear destination";
        const reasons = profile.dissatisfaction_reasons || ["none"];
        const matchMessage = row.query_match || {};
        const latestLabel = matchMessage.message_id
            ? `Matched ${humanizeValue(matchMessage.sender_type || "message")} message`
            : "Latest filtered message";
        const confidenceLabel = displayValue("confidence_overall", profile.confidence_overall || "unclear");
        return `
            <article class="conversation-card ${isSelected ? "selected" : ""}" data-conversation-id="${escapeHtml(row.conversation_id)}" data-message-id="${escapeHtml(row.query_match?.message_id || row.latest_message_id)}">
                <div class="card-hero">
                    <div class="card-hero-meta">
                        <span class="card-hero-chip">${escapeHtml(destinationTitle)}</span>
                        <span class="card-hero-chip ghost">${escapeHtml(row.latest_message_datetime || "")}</span>
                    </div>
                    <div class="card-hero-bottom">
                        <div class="card-title-block">
                            <p class="card-anchor">${escapeHtml(row.customer_number)}</p>
                            <h3>${escapeHtml(destinationTitle)}</h3>
                            <p class="card-caption">${escapeHtml(latestLabel)}</p>
                        </div>
                        <div class="card-stats">
                            <div class="card-stat">
                                <span>Msgs</span>
                                <strong>${escapeHtml(formatNumber(row.total_messages))}</strong>
                            </div>
                            <div class="card-stat">
                                <span>Confidence</span>
                                <strong>${escapeHtml(confidenceLabel)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="pill-row">
                        ${badge(displayValue("travel_intent_primary", profile.travel_intent_primary || "unclear"), toneForValue("travel_intent_primary", profile.travel_intent_primary))}
                        ${badge(displayValue("travel_cohort", profile.travel_cohort || "unclear"), toneForValue("travel_cohort", profile.travel_cohort))}
                        ${badge(displayValue("overall_customer_sentiment", profile.overall_customer_sentiment || "unclear"), toneForValue("overall_customer_sentiment", profile.overall_customer_sentiment))}
                        ${badge(displayValue("dissatisfaction_reason", reasons[0] || "none"), toneForValue("dissatisfaction_reason", reasons[0] || "none"))}
                        ${badge(displayValue("conversion_willingness", profile.conversion_willingness || "unclear"), toneForValue("conversion_willingness", profile.conversion_willingness))}
                    </div>
                    <p class="card-summary">${escapeHtml(row.summary || "No summary yet.")}</p>
                    <div class="card-fact-grid">
                        <div class="card-fact"><span>Budget sensitivity</span><strong>${escapeHtml(displayValue("budget_conscious", profile.budget_conscious || "unclear"))}</strong></div>
                        <div class="card-fact"><span>Discount readiness</span><strong>${escapeHtml(displayValue("discount_readiness", profile.discount_readiness || "unclear"))}</strong></div>
                        <div class="card-fact"><span>Coupon seeking</span><strong>${escapeHtml(displayValue("coupon_seeking", profile.coupon_seeking || "unclear"))}</strong></div>
                        <div class="card-fact"><span>Main blocker</span><strong>${escapeHtml(displayValue("primary_blocker", profile.primary_blocker || "unclear"))}</strong></div>
                    </div>
                    <div class="card-snippet">
                        <span class="label">${escapeHtml(latestLabel)}</span>
                        <p>${escapeHtml(snippet).slice(0, 220) || "No text snippet available for this conversation yet."}</p>
                    </div>
                    <div class="card-footer">
                        <span>${badge(displayValue("signal_quality", row.signal_quality), toneForValue("signal_quality", row.signal_quality))} ${badge(displayValue("review_status", row.review_status), toneForValue("review_status", row.review_status))}</span>
                        <strong>${escapeHtml(displayValue("profile_status", profile.profile_status || "unclear"))} | Open transcript</strong>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    for (const card of target.querySelectorAll(".conversation-card")) {
        card.addEventListener("click", () => {
            state.selectedConversationId = card.dataset.conversationId;
            state.selectedMessageId = Number(card.dataset.messageId);
            loadConversation(card.dataset.conversationId, Number(card.dataset.messageId));
        });
    }
}

function profileRows(profile) {
    if (!profile) {
        return `<p class="subtle">No AI profile yet for this conversation.</p>`;
    }
    const reasons = profile.dissatisfaction_reasons || [];
    return `
        <div class="profile-grid">
            <div><span class="label">Customer trip intent</span><strong>${escapeHtml(displayValue("travel_intent_primary", profile.travel_intent_primary || "unclear"))}</strong></div>
            <div><span class="label">Primary destination</span><strong>${escapeHtml(profile.destination_primary || "unclear")}</strong></div>
            <div><span class="label">Travel cohort</span><strong>${escapeHtml(displayValue("travel_cohort", profile.travel_cohort || "unclear"))}</strong></div>
            <div><span class="label">Budget sensitivity</span><strong>${escapeHtml(displayValue("budget_conscious", profile.budget_conscious || "unclear"))}</strong></div>
            <div><span class="label">Discount readiness</span><strong>${escapeHtml(displayValue("discount_readiness", profile.discount_readiness || "unclear"))}</strong></div>
            <div><span class="label">Coupon seeking</span><strong>${escapeHtml(displayValue("coupon_seeking", profile.coupon_seeking || "unclear"))}</strong></div>
            <div><span class="label">Customer sentiment</span><strong>${escapeHtml(displayValue("overall_customer_sentiment", profile.overall_customer_sentiment || "unclear"))}</strong></div>
            <div><span class="label">Issue severity</span><strong>${escapeHtml(displayValue("severity", profile.severity || "unclear"))}</strong></div>
            <div><span class="label">Booking readiness</span><strong>${escapeHtml(displayValue("conversion_willingness", profile.conversion_willingness || "unclear"))}</strong></div>
            <div><span class="label">Main booking blocker</span><strong>${escapeHtml(displayValue("primary_blocker", profile.primary_blocker || "unclear"))}</strong></div>
            <div><span class="label">Recommended next step</span><strong>${escapeHtml(displayValue("next_best_action", profile.next_best_action || "unclear"))}</strong></div>
            <div><span class="label">Profile quality</span><strong>${escapeHtml(displayValue("profile_status", profile.profile_status || "unclear"))}</strong></div>
            <div><span class="label">Profile confidence</span><strong>${escapeHtml(displayValue("confidence_overall", profile.confidence_overall || "unclear"))}</strong></div>
        </div>
        <p class="profile-summary">${escapeHtml(profile.summary || "No summary yet.")}</p>
        <div class="profile-chip-group">
            <span class="label">Dissatisfaction reasons</span>
            <div class="pill-row">${(reasons.length ? reasons : ["none"]).map((reason) => badge(displayValue("dissatisfaction_reason", reason))).join("")}</div>
        </div>
    `;
}

function renderWorkspace(data) {
    state.selectedConversation = data;
    refs.workspaceTitle.textContent = `${data.he_number} <-> ${data.customer_number}`;
    refs.workspaceSubtitle.textContent = `${formatNumber(data.facts.total_messages)} filtered messages | ${displayValue("signal_quality", data.facts.signal_quality)} conversation signal`;

    const evidenceIds = new Set((data.evidence_message_ids || []).map((value) => Number(value)));
    const factPills = ["destination_city", "destination_country", "intent", "dissatisfaction", "cash_payment_interest"]
        .map((key) => (data.facts[key] || []).map((item) => badge(`${FACT_TYPE_LABELS[key]}: ${item.display_value} | ${senderScopeLabel(item.sender_scope)}`)).join(""))
        .join("");
    const profile = data.profile || {};

    refs.workspaceBody.innerHTML = `
        <section class="workspace-overview">
            <article class="workspace-kpi">
                <span>Destination</span>
                <strong>${escapeHtml(profile.destination_primary || "Unclear")}</strong>
            </article>
            <article class="workspace-kpi">
                <span>Intent</span>
                <strong>${escapeHtml(displayValue("travel_intent_primary", profile.travel_intent_primary || "unclear"))}</strong>
            </article>
            <article class="workspace-kpi">
                <span>Cohort</span>
                <strong>${escapeHtml(displayValue("travel_cohort", profile.travel_cohort || "unclear"))}</strong>
            </article>
            <article class="workspace-kpi">
                <span>Readiness</span>
                <strong>${escapeHtml(displayValue("conversion_willingness", profile.conversion_willingness || "unclear"))}</strong>
            </article>
        </section>
        <section class="workspace-section">
            <h3>AI Profile</h3>
            ${profileRows(data.profile)}
        </section>
        <section class="workspace-section">
            <h3>Explicit Signals Found</h3>
            <div class="pill-row">${factPills || `<span class="subtle">No explicit signals detected.</span>`}</div>
        </section>
        <section class="workspace-section">
            <h3>Manual Review</h3>
            <div class="pill-row">
                ${badge(displayValue("review_status", data.review.review_status || "unreviewed"))}
                ${data.review.reviewed_by ? badge(`By ${data.review.reviewed_by}`) : ""}
            </div>
            <p class="subtle">${escapeHtml(data.review.reviewer_note || "No reviewer note yet.")}</p>
        </section>
        <section class="workspace-section">
            <h3>Transcript</h3>
            <div class="transcript-list">
                ${data.messages.map((message) => `
                    <article class="bubble ${String(message.sender_type).toLowerCase() === "he" ? "he" : "customer"} ${Number(message.id) === state.selectedMessageId ? "selected" : ""} ${evidenceIds.has(Number(message.id)) ? "evidence" : ""}">
                        <div class="bubble-meta">
                            <span>${escapeHtml(message.sender_type)}</span>
                            <span>${escapeHtml(message.message_type)} | ${escapeHtml(message.message_datetime)}</span>
                        </div>
                        ${renderMessageBody(message)}
                    </article>
                `).join("")}
            </div>
        </section>
    `;

    hydrateReviewForm(data);
}

async function loadAnalysis() {
    refs.analysisSample.textContent = "Loading analysis...";
    refs.analysisKpis.innerHTML = "";
    refs.analysisGrids.innerHTML = "";
    const query = buildQuery(state.filters || collectFilters());
    const data = await fetchJson(`/api/analyze?${query}`);
    refs.analysisSample.textContent = `Sample size: ${formatNumber(data.sample_size)} conversations | ${sampleQualityLabel(data.sample_quality)}`;
    refs.analysisKpis.innerHTML = Object.entries(data.kpis || {}).map(([key, value]) => {
        const formattedValue = typeof value === "number"
            ? (key.endsWith("_percent") ? `${value.toFixed(1)}%` : (String(value).includes(".") ? value.toFixed(1) : formatNumber(value)))
            : value;
        return `
            <article class="kpi-card">
                <span class="label">${escapeHtml(KPI_LABELS[key] || humanizeValue(key))}</span>
                <strong>${escapeHtml(formattedValue)}</strong>
            </article>
        `;
    }).join("");

    refs.analysisGrids.innerHTML = [
        renderDistributionCard("Customer trip intent", (data.distributions?.intent || []).map((item) => ({ ...item, value: displayValue("travel_intent", item.value) }))),
        renderDistributionCard("Destination", data.distributions?.destination || []),
        renderDistributionCard("Travel cohort", (data.distributions?.cohort || []).map((item) => ({ ...item, value: displayValue("travel_cohort", item.value) }))),
        renderDistributionCard("Budget sensitivity", (data.distributions?.budget || []).map((item) => ({ ...item, value: displayValue("budget_conscious", item.value) }))),
        renderDistributionCard("Discount readiness", (data.distributions?.discount || []).map((item) => ({ ...item, value: displayValue("discount_readiness", item.value) }))),
        renderDistributionCard("Coupon seeking", (data.distributions?.coupon || []).map((item) => ({ ...item, value: displayValue("coupon_seeking", item.value) }))),
        renderDistributionCard("Cash payment mention", (data.distributions?.cash_payment || []).map((item) => ({ ...item, value: displayValue("cash_payment_interest", item.value) }))),
        renderDistributionCard("Customer sentiment", (data.distributions?.sentiment || []).map((item) => ({ ...item, value: displayValue("sentiment", item.value) }))),
        renderDistributionCard("Dissatisfaction reasons", (data.distributions?.dissatisfaction || []).map((item) => ({ ...item, value: displayValue("dissatisfaction_reason", item.value) }))),
        renderDistributionCard("Issue severity", (data.distributions?.severity || []).map((item) => ({ ...item, value: displayValue("severity", item.value) }))),
        renderDistributionCard("Booking readiness", (data.distributions?.willingness || []).map((item) => ({ ...item, value: displayValue("conversion_willingness", item.value) }))),
        renderDistributionCard("Main booking blocker", (data.distributions?.blocker || []).map((item) => ({ ...item, value: displayValue("primary_blocker", item.value) }))),
        renderDistributionCard("Conversation signal", (data.distributions?.signal_quality || []).map((item) => ({ ...item, value: displayValue("signal_quality", item.value) }))),
    ].join("");
}

async function loadReviewQueue(page = 1) {
    state.reviewPage = page;
    const filters = state.filters || collectFilters();
    const queue = refs.reviewQueue.value || "unreviewed";
    const query = buildQuery({ ...filters, queue, page });
    const data = await fetchJson(`/api/review?${query}`);
    state.reviewTotalPages = data.total_pages || 0;
    const queueLabel = (state.filterOptions?.review_queues || []).find((item) => item.value === queue)?.label || humanizeValue(queue);
    refs.reviewSummary.textContent = `${formatNumber(data.total)} conversations in the ${queueLabel} queue.`;
    renderConversationList(refs.reviewResults, data.results || [], "No conversations in this review queue.");
    renderPagination(refs.reviewPagination, refs.reviewPageSummary, refs.reviewPrev, refs.reviewNext, state.reviewPage, state.reviewTotalPages);
}

function importStatusLabel(status) {
    return {
        queued: "Queued",
        running: "Fetching chats",
        cancel_requested: "Stopping safely",
        cancelled: "Cancelled",
        interrupted: "Interrupted",
        merging: "Deduplicating messages",
        indexing: "Refreshing analysis indexes",
        completed: "Completed",
        completed_with_errors: "Completed with errors",
        failed: "Failed",
    }[status] || humanizeValue(status);
}

function activeImportStatus(status) {
    return ["queued", "running", "cancel_requested", "merging", "indexing"].includes(status);
}

function selectedImportSheet() {
    return (state.importUpload?.sheets || []).find((sheet) => sheet.name === refs.importSheet.value);
}

function fillColumnSelect(select, headers, selectedValue) {
    select.innerHTML = `<option value="">Select column</option>`;
    for (const header of headers || []) {
        select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`);
    }
    select.value = selectedValue || "";
    select.disabled = false;
}

function syncImportSheet() {
    const sheet = selectedImportSheet();
    if (!sheet) {
        return;
    }
    fillColumnSelect(refs.importWabaColumn, sheet.headers, sheet.suggested_waba_column);
    fillColumnSelect(refs.importCustomerColumn, sheet.headers, sheet.suggested_customer_column);
    refs.uploadSummary.innerHTML = `<strong>${escapeHtml(state.importUpload.filename)}</strong><span>${formatNumber(sheet.row_count)} rows in ${escapeHtml(sheet.name)}. Confirm the two phone columns below.</span>`;
    refs.startImport.disabled = false;
}

async function inspectImportWorkbook() {
    const file = refs.importFile.files?.[0];
    if (!file) {
        refs.importMessage.textContent = "Choose an .xlsx workbook first.";
        return;
    }
    refs.inspectUpload.disabled = true;
    refs.inspectUpload.textContent = "Inspecting...";
    refs.importMessage.textContent = "Uploading workbook securely...";
    const formData = new FormData();
    formData.append("file", file);
    try {
        const response = await fetch("/api/imports/upload", { method: "POST", body: formData });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.detail || "Workbook upload failed");
        }
        state.importUpload = payload.upload;
        refs.importSheet.innerHTML = "";
        for (const sheet of state.importUpload.sheets || []) {
            refs.importSheet.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(sheet.name)}">${escapeHtml(sheet.name)} (${formatNumber(sheet.row_count)} rows)</option>`);
        }
        refs.importSheet.disabled = false;
        refs.importSettings.classList.remove("muted-step");
        refs.uploadSummary.classList.remove("hidden");
        syncImportSheet();
        refs.importMessage.textContent = "Workbook is ready. Check the mapping and start the import.";
    } catch (error) {
        refs.importMessage.textContent = error.message;
    } finally {
        refs.inspectUpload.disabled = false;
        refs.inspectUpload.textContent = "Upload and inspect";
    }
}

async function startChatImport(event) {
    event.preventDefault();
    if (!state.importUpload) {
        refs.importMessage.textContent = "Upload and inspect a workbook first.";
        return;
    }
    if (!refs.importAuthKey.value.trim()) {
        refs.importMessage.textContent = "Enter the DoubleTick authorization key for this run.";
        refs.importAuthKey.focus();
        return;
    }
    refs.startImport.disabled = true;
    refs.startImport.textContent = "Starting...";
    const body = {
        upload_id: state.importUpload.upload_id,
        sheet_name: refs.importSheet.value,
        waba_column: refs.importWabaColumn.value,
        customer_column: refs.importCustomerColumn.value,
        auth_key: refs.importAuthKey.value,
        start_date: refs.importStartDate.value || null,
        end_date: refs.importEndDate.value || null,
        workers: Number(refs.importWorkers.value || 3),
        request_delay_ms: Number(refs.importDelay.value || 100),
    };
    try {
        const { ok, payload } = await postJson("/api/imports/start", body);
        refs.importAuthKey.value = "";
        if (!ok) {
            throw new Error(payload.detail || "Could not start import");
        }
        refs.importMessage.textContent = `Import started for ${formatNumber(payload.job.total_pairs)} unique phone pairs.`;
        await loadImportJobs();
    } catch (error) {
        refs.importMessage.textContent = error.message;
    } finally {
        refs.startImport.disabled = false;
        refs.startImport.textContent = "Start chat import";
    }
}

function renderImportJobs(jobs) {
    if (!jobs.length) {
        refs.importJobs.className = "import-job-list empty-state";
        refs.importJobs.textContent = "No import jobs yet.";
        return;
    }
    refs.importJobs.className = "import-job-list";
    refs.importJobs.innerHTML = jobs.map((job) => {
        const errorText = job.last_error || job.sample_error;
        const error = errorText ? `<div class="job-error">${escapeHtml(errorText)}</div>` : "";
        const action = job.can_cancel
            ? `<button type="button" class="ghost-button job-cancel" data-job-id="${escapeHtml(job.job_id)}">Cancel</button>`
            : job.can_resume
                ? `<button type="button" class="ghost-button job-resume" data-job-id="${escapeHtml(job.job_id)}">Resume failed rows</button>`
                : "";
        return `
            <article class="import-job">
                <div class="job-heading"><div><strong>${escapeHtml(job.original_filename)}</strong><span>${importStatusLabel(job.status)}</span></div><b>${Number(job.progress_percent || 0).toFixed(1)}%</b></div>
                <div class="progress-track"><span style="width:${Math.max(0, Math.min(100, job.progress_percent || 0))}%"></span></div>
                <div class="job-stats">
                    <span><b>${formatNumber(job.completed_pairs)}</b> / ${formatNumber(job.total_pairs)} pairs</span>
                    <span><b>${formatNumber(job.fetched_messages)}</b> fetched</span>
                    <span><b>${formatNumber(job.inserted_messages)}</b> added</span>
                    <span><b>${formatNumber(job.failed_pairs)}</b> failed</span>
                </div>
                ${error}
                <div class="job-footer"><small>Created ${escapeHtml(job.created_at)}</small>${action}</div>
            </article>`;
    }).join("");
    refs.importJobs.querySelectorAll(".job-cancel").forEach((button) => {
        button.addEventListener("click", () => cancelImportJob(button.dataset.jobId));
    });
    refs.importJobs.querySelectorAll(".job-resume").forEach((button) => {
        button.addEventListener("click", () => resumeImportJob(button.dataset.jobId));
    });
}

async function loadImportJobs() {
    try {
        const data = await fetchJson("/api/imports");
        const jobs = data.jobs || [];
        renderImportJobs(jobs);
        const hasActive = jobs.some((job) => activeImportStatus(job.status));
        if (hasActive && !state.importPollTimer) {
            state.importPollTimer = window.setInterval(loadImportJobs, 3000);
        } else if (!hasActive && state.importPollTimer) {
            window.clearInterval(state.importPollTimer);
            state.importPollTimer = null;
            loadMetadata().catch(console.error);
        }
    } catch (error) {
        refs.importMessage.textContent = error.message;
    }
}

async function cancelImportJob(jobId) {
    const { ok, payload } = await postJson(`/api/imports/${encodeURIComponent(jobId)}/cancel`, {});
    refs.importMessage.textContent = ok ? "Cancellation requested. In-flight requests will finish safely." : (payload.detail || "Could not cancel job");
    loadImportJobs();
}

async function resumeImportJob(jobId) {
    const authKey = refs.importAuthKey.value.trim();
    if (!authKey) {
        refs.importMessage.textContent = "Enter the authorization key above, then click Resume again.";
        refs.importAuthKey.focus();
        return;
    }
    const { ok, payload } = await postJson(`/api/imports/${encodeURIComponent(jobId)}/resume`, {
        auth_key: authKey,
        retry_failed: true,
    });
    refs.importAuthKey.value = "";
    refs.importMessage.textContent = ok ? "Import resumed." : (payload.detail || "Could not resume job");
    loadImportJobs();
}

refs.tabs.forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
if (refs.heroWorkspaceButton) {
    refs.heroWorkspaceButton.addEventListener("click", () => {
        switchTab("explore");
        refs.searchInput.focus();
    });
}
refs.exploreForm.addEventListener("submit", (event) => { event.preventDefault(); loadExplore(1); });
refs.clearFilters.addEventListener("click", () => { clearFilters(); loadExplore(1); });
refs.explorePrev.addEventListener("click", () => { if (state.explorePage > 1) { loadExplore(state.explorePage - 1); } });
refs.exploreNext.addEventListener("click", () => { if (state.explorePage < state.exploreTotalPages) { loadExplore(state.explorePage + 1); } });
refs.refreshAnalysis.addEventListener("click", loadAnalysis);
refs.refreshReview.addEventListener("click", () => loadReviewQueue(1));
refs.reviewPrev.addEventListener("click", () => { if (state.reviewPage > 1) { loadReviewQueue(state.reviewPage - 1); } });
refs.reviewNext.addEventListener("click", () => { if (state.reviewPage < state.reviewTotalPages) { loadReviewQueue(state.reviewPage + 1); } });
refs.reviewForm.addEventListener("submit", submitReview);
refs.inspectUpload.addEventListener("click", inspectImportWorkbook);
refs.importSheet.addEventListener("change", syncImportSheet);
refs.importForm.addEventListener("submit", startChatImport);
refs.refreshImports.addEventListener("click", loadImportJobs);

Promise.all([loadMetadata(), loadFilters()]).then(() => {
    refs.reviewQueue.value = "unreviewed";
    loadExplore(1);
}).catch((error) => {
    console.error(error);
});
