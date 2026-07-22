'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Country,
    flagEmoji,
    matchesCountry,
    COUNTRIES,
    PRIORITY_ISO,
} from './countries';

interface BottomSheetPickerProps {
    value: Country;
    onChange: (country: Country) => void;
}

/**
 * Mobile-style picker: the trigger opens a bottom sheet with a search bar,
 * a "Suggested" section, and the full list grouped alphabetically.
 */
export default function BottomSheetPicker({ value, onChange }: BottomSheetPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');

    const filtered = useMemo(
        () => COUNTRIES.filter((c) => matchesCountry(c, query)),
        [query]
    );

    const suggested = useMemo(
        () =>
            PRIORITY_ISO
                .map((iso) => filtered.find((c) => c.iso2 === iso))
                .filter((c): c is Country => Boolean(c)),
        [filtered]
    );

    const grouped = useMemo(() => {
        const groups = new Map<string, Country[]>();
        for (const country of filtered) {
            const letter = country.name[0].toUpperCase();
            const group = groups.get(letter) ?? [];
            group.push(country);
            groups.set(letter, group);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [filtered]);

    const select = (country: Country) => {
        onChange(country);
        setIsOpen(false);
        setQuery('');
    };

    const row = (country: Country) => (
        <li key={country.iso2}>
            <button
                type="button"
                onClick={() => select(country)}
                className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-gold/10 ${
                    country.iso2 === value.iso2 ? 'bg-gold/15' : ''
                }`}
            >
                <span className="text-xl leading-none">{flagEmoji(country.iso2)}</span>
                <span className="flex-1 text-ink">{country.name}</span>
                <span className="text-ink-soft">+{country.dial}</span>
            </button>
        </li>
    );

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="flex w-full items-center justify-between rounded-lg border border-gold/40 bg-cream px-4 py-3 text-ink transition-colors hover:border-gold"
            >
                <span className="flex items-center gap-3">
                    <span className="text-xl leading-none">{flagEmoji(value.iso2)}</span>
                    <span>{value.name}</span>
                </span>
                <span className="font-medium text-ink-soft">+{value.dial}</span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 z-40 bg-ink/40"
                        />
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
                            role="dialog"
                            aria-modal="true"
                            aria-label="Select country"
                            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[75vh] max-w-lg flex-col rounded-t-2xl bg-cream shadow-2xl"
                        >
                            <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-ink-soft/30" />
                            <div className="flex items-center justify-between px-5 pb-2 pt-4">
                                <h3 className="font-display text-lg text-ink">Select country</h3>
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    aria-label="Close"
                                    className="rounded-full p-1 text-ink-soft hover:bg-gold/10"
                                >
                                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                    </svg>
                                </button>
                            </div>
                            <div className="px-5 pb-3">
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search country or code…"
                                    aria-label="Search countries"
                                    className="w-full rounded-lg bg-parchment px-4 py-2.5 text-ink placeholder:text-ink-soft/60 focus:outline-none"
                                />
                            </div>
                            <div className="flex-1 overflow-y-auto pb-6" data-lenis-prevent>
                                {filtered.length === 0 && (
                                    <p className="px-5 py-8 text-center text-ink-soft">
                                        No countries match &ldquo;{query}&rdquo;
                                    </p>
                                )}
                                {suggested.length > 0 && (
                                    <section>
                                        <h4 className="px-5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-gold-dark">
                                            Suggested
                                        </h4>
                                        <ul>{suggested.map(row)}</ul>
                                    </section>
                                )}
                                {grouped.map(([letter, countries]) => (
                                    <section key={letter}>
                                        <h4 className="px-5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-gold-dark">
                                            {letter}
                                        </h4>
                                        <ul>{countries.map(row)}</ul>
                                    </section>
                                ))}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
