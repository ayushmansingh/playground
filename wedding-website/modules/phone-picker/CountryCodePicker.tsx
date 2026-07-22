'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Country,
    flagEmoji,
    matchesCountry,
    sortedCountries,
    PRIORITY_ISO,
} from './countries';

interface CountryCodePickerProps {
    value: Country;
    onChange: (country: Country) => void;
    /** Renders the trigger without a right border radius so it can sit flush against an input. */
    attached?: boolean;
}

export default function CountryCodePicker({ value, onChange, attached = false }: CountryCodePickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlighted, setHighlighted] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const countries = useMemo(() => sortedCountries(), []);
    const filtered = useMemo(
        () => countries.filter((c) => matchesCountry(c, query)),
        [countries, query]
    );

    useEffect(() => {
        if (!isOpen) return;
        searchRef.current?.focus();

        const handleClickOutside = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    useEffect(() => {
        setHighlighted(0);
    }, [query]);

    useEffect(() => {
        listRef.current
            ?.querySelector('[data-highlighted="true"]')
            ?.scrollIntoView({ block: 'nearest' });
    }, [highlighted]);

    const open = () => {
        setQuery('');
        setHighlighted(0);
        setIsOpen(true);
    };

    const select = (country: Country) => {
        onChange(country);
        setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[highlighted]) select(filtered[highlighted]);
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => (isOpen ? setIsOpen(false) : open())}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={`Country code: ${value.name} +${value.dial}`}
                className={`flex items-center gap-2 border border-gold/40 bg-cream px-3 py-2.5 text-ink transition-colors hover:border-gold ${
                    attached ? 'rounded-l-lg border-r-0' : 'rounded-lg'
                }`}
            >
                <span className="text-xl leading-none">{flagEmoji(value.iso2)}</span>
                <span className="font-medium">+{value.dial}</span>
                <svg
                    className={`h-4 w-4 text-ink-soft transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.23 8.29a.75.75 0 010-1.08z"
                        clipRule="evenodd"
                    />
                </svg>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-gold/30 bg-cream shadow-xl"
                    >
                        <div className="border-b border-gold/20 p-2">
                            <input
                                ref={searchRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search country or code…"
                                aria-label="Search countries"
                                className="w-full rounded-lg bg-parchment px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none"
                            />
                        </div>
                        <ul ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1" data-lenis-prevent>
                            {filtered.length === 0 && (
                                <li className="px-4 py-6 text-center text-sm text-ink-soft">
                                    No countries match &ldquo;{query}&rdquo;
                                </li>
                            )}
                            {filtered.map((country, i) => {
                                const isSelected = country.iso2 === value.iso2;
                                const isLastPriority =
                                    !query && country.iso2 === PRIORITY_ISO[PRIORITY_ISO.length - 1];
                                return (
                                    <li
                                        key={country.iso2}
                                        role="option"
                                        aria-selected={isSelected}
                                        data-highlighted={i === highlighted}
                                        onMouseEnter={() => setHighlighted(i)}
                                        onClick={() => select(country)}
                                        className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${
                                            i === highlighted ? 'bg-gold/15' : ''
                                        } ${isLastPriority ? 'border-b border-gold/20' : ''}`}
                                    >
                                        <span className="text-lg leading-none">{flagEmoji(country.iso2)}</span>
                                        <span className="flex-1 truncate text-ink">{country.name}</span>
                                        <span className="text-ink-soft">+{country.dial}</span>
                                        {isSelected && (
                                            <svg className="h-4 w-4 text-gold-dark" viewBox="0 0 20 20" fill="currentColor">
                                                <path
                                                    fillRule="evenodd"
                                                    d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
