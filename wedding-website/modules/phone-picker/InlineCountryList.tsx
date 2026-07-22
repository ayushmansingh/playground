'use client';

import { useMemo, useState } from 'react';
import {
    Country,
    flagEmoji,
    matchesCountry,
    sortedCountries,
} from './countries';

interface InlineCountryListProps {
    value: Country;
    onChange: (country: Country) => void;
}

/**
 * Always-visible filterable list — no popover. Useful inside a settings
 * panel or a dedicated step of a signup wizard.
 */
export default function InlineCountryList({ value, onChange }: InlineCountryListProps) {
    const [query, setQuery] = useState('');
    const countries = useMemo(() => sortedCountries(), []);
    const filtered = useMemo(
        () => countries.filter((c) => matchesCountry(c, query)),
        [countries, query]
    );

    return (
        <div className="overflow-hidden rounded-xl border border-gold/30 bg-cream">
            <div className="border-b border-gold/20 p-3">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by name or dial code…"
                    aria-label="Filter countries"
                    className="w-full rounded-lg bg-parchment px-4 py-2.5 text-ink placeholder:text-ink-soft/60 focus:outline-none"
                />
            </div>
            <ul role="radiogroup" aria-label="Country" className="max-h-80 overflow-y-auto py-1" data-lenis-prevent>
                {filtered.length === 0 && (
                    <li className="px-5 py-8 text-center text-sm text-ink-soft">
                        No countries match &ldquo;{query}&rdquo;
                    </li>
                )}
                {filtered.map((country) => {
                    const isSelected = country.iso2 === value.iso2;
                    return (
                        <li key={country.iso2}>
                            <button
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() => onChange(country)}
                                className={`flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition-colors hover:bg-gold/10 ${
                                    isSelected ? 'bg-gold/15' : ''
                                }`}
                            >
                                <span
                                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                                        isSelected ? 'border-gold-dark' : 'border-ink-soft/40'
                                    }`}
                                >
                                    {isSelected && <span className="h-2 w-2 rounded-full bg-gold-dark" />}
                                </span>
                                <span className="text-lg leading-none">{flagEmoji(country.iso2)}</span>
                                <span className="flex-1 truncate text-ink">{country.name}</span>
                                <span className="text-ink-soft">+{country.dial}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
