import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, postJson } from "../lib/api.js";
import { formatNumber, importStatusLabel } from "../lib/labels.js";
import { PanelHeader } from "../components/ui.jsx";

const ACTIVE_STATUSES = ["queued", "running", "cancel_requested", "merging", "indexing"];
const POLL_INTERVAL_MS = 3000;

function ColumnSelect({ headers, value, onChange, disabled }) {
    return (
        <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
            <option value="">Select column</option>
            {(headers || []).map((header) => <option key={header} value={header}>{header}</option>)}
        </select>
    );
}

function ImportJob({ job, onCancel, onResume }) {
    const progress = Number(job.progress_percent || 0);
    const errorText = job.last_error || job.sample_error;
    return (
        <article className="import-job">
            <div className="job-heading">
                <div><strong>{job.original_filename}</strong><span>{importStatusLabel(job.status)}</span></div>
                <b>{`${progress.toFixed(1)}%`}</b>
            </div>
            <div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
            <div className="job-stats">
                <span><b>{formatNumber(job.completed_pairs)}</b> / {formatNumber(job.total_pairs)} pairs</span>
                <span><b>{formatNumber(job.fetched_messages)}</b> fetched</span>
                <span><b>{formatNumber(job.inserted_messages)}</b> added</span>
                <span><b>{formatNumber(job.failed_pairs)}</b> failed</span>
            </div>
            {errorText && <div className="job-error">{errorText}</div>}
            <div className="job-footer">
                <small>{`Created ${job.created_at}`}</small>
                {job.can_cancel
                    ? <button type="button" className="ghost-button" onClick={() => onCancel(job.job_id)}>Cancel</button>
                    : job.can_resume && <button type="button" className="ghost-button" onClick={() => onResume(job.job_id)}>Resume failed rows</button>}
            </div>
        </article>
    );
}

export default function ImportTab({ active, onImportsFinished }) {
    const fileRef = useRef(null);
    const authKeyRef = useRef(null);
    const [upload, setUpload] = useState(null);
    const [sheetName, setSheetName] = useState("");
    const [wabaColumn, setWabaColumn] = useState("");
    const [customerColumn, setCustomerColumn] = useState("");
    const [authKey, setAuthKey] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [workers, setWorkers] = useState("3");
    const [delay, setDelay] = useState("100");
    const [inspecting, setInspecting] = useState(false);
    const [starting, setStarting] = useState(false);
    const [message, setMessage] = useState("");
    const [jobs, setJobs] = useState([]);

    const sheet = (upload?.sheets || []).find((item) => item.name === sheetName);
    const hasActiveJob = jobs.some((job) => ACTIVE_STATUSES.includes(job.status));

    const loadJobs = useCallback(async () => {
        try {
            const data = await fetchJson("/api/imports");
            setJobs(data.jobs || []);
        } catch (error) {
            setMessage(error.message);
        }
    }, []);

    useEffect(() => {
        if (active) {
            loadJobs();
        }
    }, [active, loadJobs]);

    // Poll while any job is running, even from other tabs; refresh the
    // header counters once the last one settles.
    const wasActive = useRef(false);
    useEffect(() => {
        if (hasActiveJob) {
            wasActive.current = true;
            const timer = window.setInterval(loadJobs, POLL_INTERVAL_MS);
            return () => window.clearInterval(timer);
        }
        if (wasActive.current) {
            wasActive.current = false;
            onImportsFinished();
        }
        return undefined;
    }, [hasActiveJob, loadJobs, onImportsFinished]);

    const chooseSheet = (name, uploadData = upload) => {
        const next = (uploadData?.sheets || []).find((item) => item.name === name);
        setSheetName(name);
        setWabaColumn(next?.suggested_waba_column || "");
        setCustomerColumn(next?.suggested_customer_column || "");
    };

    const inspectWorkbook = async () => {
        const file = fileRef.current?.files?.[0];
        if (!file) {
            setMessage("Choose an .xlsx workbook first.");
            return;
        }
        setInspecting(true);
        setMessage("Uploading workbook securely...");
        const formData = new FormData();
        formData.append("file", file);
        try {
            const response = await fetch("/api/imports/upload", { method: "POST", body: formData });
            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload.detail || "Workbook upload failed");
            }
            setUpload(payload.upload);
            chooseSheet(payload.upload.sheets?.[0]?.name || "", payload.upload);
            setMessage("Workbook is ready. Check the mapping and start the import.");
        } catch (error) {
            setMessage(error.message);
        } finally {
            setInspecting(false);
        }
    };

    const requireAuthKey = (prompt) => {
        if (authKey.trim()) {
            return true;
        }
        setMessage(prompt);
        authKeyRef.current?.focus();
        return false;
    };

    const startImport = async (event) => {
        event.preventDefault();
        if (!upload) {
            setMessage("Upload and inspect a workbook first.");
            return;
        }
        if (!requireAuthKey("Enter the DoubleTick authorization key for this run.")) {
            return;
        }
        setStarting(true);
        try {
            const { ok, payload } = await postJson("/api/imports/start", {
                upload_id: upload.upload_id,
                sheet_name: sheetName,
                waba_column: wabaColumn,
                customer_column: customerColumn,
                auth_key: authKey,
                start_date: startDate || null,
                end_date: endDate || null,
                workers: Number(workers || 3),
                request_delay_ms: Number(delay || 100),
            });
            setAuthKey("");
            if (!ok) {
                throw new Error(payload.detail || "Could not start import");
            }
            setMessage(`Import started for ${formatNumber(payload.job.total_pairs)} unique phone pairs.`);
            await loadJobs();
        } catch (error) {
            setMessage(error.message);
        } finally {
            setStarting(false);
        }
    };

    const cancelJob = async (jobId) => {
        const { ok, payload } = await postJson(`/api/imports/${encodeURIComponent(jobId)}/cancel`, {});
        setMessage(ok ? "Cancellation requested. In-flight requests will finish safely." : (payload.detail || "Could not cancel job"));
        loadJobs();
    };

    const resumeJob = async (jobId) => {
        if (!requireAuthKey("Enter the authorization key above, then click Resume again.")) {
            return;
        }
        const { ok, payload } = await postJson(`/api/imports/${encodeURIComponent(jobId)}/resume`, {
            auth_key: authKey.trim(),
            retry_failed: true,
        });
        setAuthKey("");
        setMessage(ok ? "Import resumed." : (payload.detail || "Could not resume job"));
        loadJobs();
    };

    return (
        <div className="import-layout">
            <section className="main-card import-card">
                <PanelHeader
                    eyebrow="DoubleTick"
                    title="Add Conversations"
                    subtitle={<p className="subtle">Upload customer/WABA pairs, fetch their chat history, deduplicate it, and add it to Explore and Analyze.</p>}
                />
                <form className="stack-form" onSubmit={startImport}>
                    <div className="import-step">
                        <div className="step-number">1</div>
                        <div className="step-body">
                            <h3>Inspect workbook</h3>
                            <p className="subtle">Use an .xlsx file with one customer number and one HE/WABA number per row.</p>
                            <label className="field">
                                <span>Excel workbook</span>
                                <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
                            </label>
                            <button type="button" className="ghost-button" disabled={inspecting} onClick={inspectWorkbook}>
                                {inspecting ? "Inspecting..." : "Upload and inspect"}
                            </button>
                            {upload && sheet && (
                                <div className="notice-box">
                                    <strong>{upload.filename}</strong>
                                    <span>{`${formatNumber(sheet.row_count)} rows in ${sheet.name}. Confirm the two phone columns below.`}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={`import-step${upload ? "" : " muted-step"}`}>
                        <div className="step-number">2</div>
                        <div className="step-body">
                            <h3>Configure fetch</h3>
                            <div className="form-grid">
                                <label className="field">
                                    <span>Sheet</span>
                                    <select value={sheetName} onChange={(event) => chooseSheet(event.target.value)} disabled={!upload}>
                                        {upload
                                            ? upload.sheets.map((item) => (
                                                <option key={item.name} value={item.name}>{`${item.name} (${formatNumber(item.row_count)} rows)`}</option>
                                            ))
                                            : <option value="">Upload a workbook first</option>}
                                    </select>
                                </label>
                                <label className="field">
                                    <span>HE / WABA column</span>
                                    <ColumnSelect headers={sheet?.headers} value={wabaColumn} onChange={setWabaColumn} disabled={!sheet} />
                                </label>
                                <label className="field">
                                    <span>Customer column</span>
                                    <ColumnSelect headers={sheet?.headers} value={customerColumn} onChange={setCustomerColumn} disabled={!sheet} />
                                </label>
                                <label className="field">
                                    <span>Authorization key</span>
                                    <input ref={authKeyRef} type="password" autoComplete="off" placeholder="Not stored by the app" value={authKey} onChange={(event) => setAuthKey(event.target.value)} />
                                </label>
                                <label className="field">
                                    <span>Start date (optional)</span>
                                    <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                                </label>
                                <label className="field">
                                    <span>End date (optional)</span>
                                    <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                                </label>
                                <label className="field">
                                    <span>Concurrent requests</span>
                                    <input type="number" min="1" max="5" value={workers} onChange={(event) => setWorkers(event.target.value)} />
                                </label>
                                <label className="field">
                                    <span>Delay between starts (ms)</span>
                                    <input type="number" min="0" max="5000" value={delay} onChange={(event) => setDelay(event.target.value)} />
                                </label>
                            </div>
                            <div className="security-note">
                                <strong>Credential safety</strong>
                                <span>The key is held only in server memory while this run is active. It is never written to the job database or workbook.</span>
                            </div>
                            <button type="submit" className="primary-button" disabled={!sheet || starting}>
                                {starting ? "Starting..." : "Start chat import"}
                            </button>
                        </div>
                    </div>
                </form>
            </section>

            <aside className="side-card import-jobs-card">
                <PanelHeader
                    eyebrow="Activity"
                    title="Import Jobs"
                    subtitle={<p className="subtle">Progress is saved in persistent app storage.</p>}
                >
                    <button type="button" className="ghost-button" onClick={loadJobs}>Refresh</button>
                </PanelHeader>
                <div className="status-text">{message}</div>
                {jobs.length
                    ? <div className="import-job-list">{jobs.map((job) => <ImportJob key={job.job_id} job={job} onCancel={cancelJob} onResume={resumeJob} />)}</div>
                    : <div className="import-job-list empty-state">No import jobs yet.</div>}
            </aside>
        </div>
    );
}
