import React from "react";

export function Pill({ tone = "neutral", children }) {
    return <span className={`pill tone-${tone}`}>{children}</span>;
}

export function PanelHeader({ eyebrow, title, subtitle, children }) {
    return (
        <div className="panel-header">
            <div>
                <p className="eyebrow">{eyebrow}</p>
                <h2>{title}</h2>
                {subtitle}
            </div>
            {children}
        </div>
    );
}

// A <select> with a leading blank option, fed by an /api/filters option list.
export function OptionSelect({ options, emptyLabel, value, onChange, ...rest }) {
    return (
        <select value={value} onChange={(event) => onChange(event.target.value)} {...rest}>
            {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
            {(options || []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
            ))}
        </select>
    );
}

export function Pagination({ page, totalPages, onPage }) {
    if (totalPages <= 1) {
        return null;
    }
    return (
        <div className="pagination">
            <button type="button" className="ghost-button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
            <span>{`Page ${page} of ${totalPages}`}</span>
            <button type="button" className="ghost-button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
        </div>
    );
}
