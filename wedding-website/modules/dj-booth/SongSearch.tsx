'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FormattedTrack } from '@/lib/spotify';
import Image from 'next/image';

interface SongSearchProps {
    onAddSong: (track: FormattedTrack, guestName: string, message: string) => Promise<void>;
    isSubmitting: boolean;
}

export default function SongSearch({ onAddSong, isSubmitting }: SongSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<FormattedTrack[]>([]);
    const [selectedTrack, setSelectedTrack] = useState<FormattedTrack | null>(null);
    const [guestName, setGuestName] = useState('');
    const [message, setMessage] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);

    const searchTracks = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();
            setResults(data.tracks || []);
            setShowResults(true);
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setIsSearching(false);
        }
    }, []);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);

        // Debounce search
        const timeoutId = setTimeout(() => searchTracks(value), 300);
        return () => clearTimeout(timeoutId);
    };

    const handleSelectTrack = (track: FormattedTrack) => {
        setSelectedTrack(track);
        setShowResults(false);
        setQuery('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTrack || !guestName.trim()) return;

        await onAddSong(selectedTrack, guestName, message);

        // Reset form
        setSelectedTrack(null);
        setGuestName('');
        setMessage('');
    };

    return (
        <div className="glass rounded-2xl p-8 border-glow-gold">
            <form onSubmit={handleSubmit} className="space-y-6">

                {/* Search input */}
                <div className="relative">
                    <label className="block font-display text-sm uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
                        Search for a song
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={query}
                            onChange={handleSearch}
                            placeholder="Try 'First Dance' or 'Tujhe Dekha'..."
                            className="w-full px-5 py-4 bg-[var(--color-cream)] border-2 border-[var(--color-parchment-dark)] rounded-xl font-body text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-gold)] focus:outline-none transition-colors"
                            disabled={!!selectedTrack}
                        />
                        {isSearching && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    className="w-5 h-5 border-2 border-[var(--color-gold)] border-t-transparent rounded-full"
                                />
                            </div>
                        )}
                    </div>

                    {/* Search results dropdown */}
                    <AnimatePresence>
                        {showResults && results.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute z-50 w-full mt-2 bg-[var(--color-cream)] rounded-xl shadow-lifted overflow-hidden max-h-80 overflow-y-auto"
                            >
                                {results.map((track) => (
                                    <button
                                        key={track.id}
                                        type="button"
                                        onClick={() => handleSelectTrack(track)}
                                        className="w-full flex items-center gap-4 p-4 hover:bg-[var(--color-parchment)] transition-colors text-left"
                                    >
                                        {track.albumArt && (
                                            <Image
                                                src={track.albumArt}
                                                alt={track.album}
                                                width={48}
                                                height={48}
                                                className="rounded-lg"
                                            />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-display text-[var(--color-ink)] truncate">{track.name}</p>
                                            <p className="text-sm text-[var(--color-ink-soft)] truncate">{track.artist}</p>
                                        </div>
                                        <span className="text-xs text-[var(--color-ink-soft)]">{track.duration}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Selected track display */}
                <AnimatePresence>
                    {selectedTrack && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="flex items-center gap-4 p-4 bg-[var(--color-parchment-light)] rounded-xl"
                        >
                            {selectedTrack.albumArt && (
                                <Image
                                    src={selectedTrack.albumArt}
                                    alt={selectedTrack.album}
                                    width={64}
                                    height={64}
                                    className="rounded-lg shadow-soft"
                                />
                            )}
                            <div className="flex-1">
                                <p className="font-display text-lg text-[var(--color-ink)]">{selectedTrack.name}</p>
                                <p className="text-[var(--color-ink-soft)]">{selectedTrack.artist}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedTrack(null)}
                                className="p-2 hover:bg-[var(--color-parchment-dark)] rounded-full transition-colors"
                            >
                                <svg className="w-5 h-5 text-[var(--color-ink-soft)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Guest info */}
                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label className="block font-display text-sm uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
                            Your Name *
                        </label>
                        <input
                            type="text"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            placeholder="John Doe"
                            required
                            className="w-full px-5 py-4 bg-[var(--color-cream)] border-2 border-[var(--color-parchment-dark)] rounded-xl font-body text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-gold)] focus:outline-none transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block font-display text-sm uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
                            Message (optional)
                        </label>
                        <input
                            type="text"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Dance to this one!"
                            className="w-full px-5 py-4 bg-[var(--color-cream)] border-2 border-[var(--color-parchment-dark)] rounded-xl font-body text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-gold)] focus:outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* Submit button */}
                <motion.button
                    type="submit"
                    disabled={!selectedTrack || !guestName.trim() || isSubmitting}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-4 bg-gradient-to-r from-[var(--color-gold-dark)] via-[var(--color-gold)] to-[var(--color-gold-dark)] text-[var(--color-cream)] font-display text-lg uppercase tracking-widest rounded-xl shadow-lifted disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {isSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                className="w-5 h-5 border-2 border-[var(--color-cream)] border-t-transparent rounded-full"
                            />
                            Adding...
                        </span>
                    ) : (
                        'Add to Playlist'
                    )}
                </motion.button>
            </form>
        </div>
    );
}
