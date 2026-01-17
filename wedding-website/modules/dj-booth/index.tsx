'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import SongSearch from './SongSearch';
import SongCard from './SongCard';
import { FormattedTrack } from '@/lib/spotify';

export interface Recommendation {
    id: string;
    track: FormattedTrack;
    guestName: string;
    message?: string;
}

// Check if Spotify is configured
const isSpotifyConfigured = () => {
    // On client side, we can't check env vars directly, so we just try the API
    return true; // Will be handled by API response
};

export default function DJBooth() {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [demoMode, setDemoMode] = useState(false);

    const handleAddSong = async (track: FormattedTrack, guestName: string, message: string) => {
        setIsSubmitting(true);

        try {
            const response = await fetch('/api/songs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    spotify_track_id: track.id,
                    track_name: track.name,
                    artist_name: track.artist,
                    album_art_url: track.albumArt,
                    guest_name: guestName,
                    guest_message: message || null,
                }),
            });

            const data = await response.json();

            if (data.demoMode) {
                setDemoMode(true);
            }

            // Always add to local state for demo
            const newRec: Recommendation = {
                id: Date.now().toString(),
                track,
                guestName,
                message,
            };
            setRecommendations((prev) => [newRec, ...prev]);
        } catch (error) {
            console.error('Failed to add song:', error);
            // Still add locally for demo purposes
            const newRec: Recommendation = {
                id: Date.now().toString(),
                track,
                guestName,
                message,
            };
            setRecommendations((prev) => [newRec, ...prev]);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section
            id="dj-booth"
            className="relative min-h-screen py-24 px-6 bg-gradient-to-b from-[var(--color-parchment)] to-[var(--color-parchment-dark)]"
        >
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-32 -right-32 w-96 h-96 bg-[var(--color-gold)] opacity-5 rounded-full blur-3xl" />
                <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[var(--color-peacock-blue)] opacity-5 rounded-full blur-3xl" />
            </div>

            <div className="max-w-4xl mx-auto relative">
                {/* Section header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-16"
                >
                    <h2 className="font-accent text-5xl md:text-6xl text-[var(--color-gold)] mb-4">
                        DJ Booth
                    </h2>
                    <p className="font-display text-xl text-[var(--color-ink-soft)] max-w-xl mx-auto">
                        Help us create the perfect playlist! Search for your favorite songs and add them to our wedding celebration.
                    </p>
                    {demoMode && (
                        <p className="mt-2 text-sm text-[var(--color-peacock-teal)]">
                            (Demo mode — Spotify/Database not configured)
                        </p>
                    )}
                </motion.div>

                {/* Song search form */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                >
                    <SongSearch onAddSong={handleAddSong} isSubmitting={isSubmitting} />
                </motion.div>

                {/* Recommendations list */}
                {recommendations.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-16"
                    >
                        <h3 className="font-display text-lg uppercase tracking-widest text-[var(--color-ink-soft)] mb-6 text-center">
                            Recently Added
                        </h3>
                        <div className="space-y-4">
                            {recommendations.map((rec, index) => (
                                <motion.div
                                    key={rec.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    <SongCard
                                        track={rec.track}
                                        guestName={rec.guestName}
                                        message={rec.message}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Vinyl decoration */}
                <motion.div
                    className="absolute -right-20 top-1/2 -translate-y-1/2 w-64 h-64 opacity-10 hidden lg:block"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                >
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                        <circle cx="100" cy="100" r="95" fill="var(--color-ink)" />
                        <circle cx="100" cy="100" r="80" fill="none" stroke="var(--color-ink-soft)" strokeWidth="0.5" />
                        <circle cx="100" cy="100" r="60" fill="none" stroke="var(--color-ink-soft)" strokeWidth="0.5" />
                        <circle cx="100" cy="100" r="40" fill="none" stroke="var(--color-ink-soft)" strokeWidth="0.5" />
                        <circle cx="100" cy="100" r="20" fill="var(--color-gold)" />
                        <circle cx="100" cy="100" r="5" fill="var(--color-ink)" />
                    </svg>
                </motion.div>
            </div>
        </section>
    );
}
