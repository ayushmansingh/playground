'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';
import AuthGate from './AuthGate';
import MasonryGallery from './MasonryGallery';

// Placeholder images for demo
const demoImages = [
    { id: '1', src: '/placeholder-1.jpg', caption: 'Our first date', width: 400, height: 600 },
    { id: '2', src: '/placeholder-2.jpg', caption: 'The proposal', width: 600, height: 400 },
    { id: '3', src: '/placeholder-3.jpg', caption: 'Engagement party', width: 400, height: 500 },
    { id: '4', src: '/placeholder-4.jpg', caption: 'Together', width: 500, height: 400 },
    { id: '5', src: '/placeholder-5.jpg', caption: 'Adventure time', width: 400, height: 600 },
    { id: '6', src: '/placeholder-6.jpg', caption: 'With family', width: 600, height: 400 },
];

export default function PhotoVault() {
    const { user, loading, isConfigured } = useAuth();
    const [activeAlbum, setActiveAlbum] = useState<string>('all');

    const albums = [
        { id: 'all', name: 'All Photos' },
        { id: 'engagement', name: 'Engagement' },
        { id: 'pre-wedding', name: 'Pre-Wedding' },
        { id: 'ceremony', name: 'Ceremony' },
    ];

    // Show gallery directly in demo mode (no auth configured)
    const showGallery = !isConfigured || user;

    return (
        <section
            id="gallery"
            className="relative min-h-screen py-24 px-6 bg-gradient-to-b from-[var(--color-parchment-dark)] to-[var(--color-parchment)]"
        >
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <svg className="absolute top-0 left-0 w-full h-32 opacity-10" viewBox="0 0 1200 100" preserveAspectRatio="none">
                    <path d="M0,0 Q300,100 600,50 T1200,0 L1200,100 L0,100 Z" fill="var(--color-peacock-blue)" />
                </svg>
            </div>

            <div className="max-w-6xl mx-auto relative">
                {/* Section header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-16"
                >
                    <h2 className="font-accent text-5xl md:text-6xl text-[var(--color-gold)] mb-4">
                        Photo Vault
                    </h2>
                    <p className="font-display text-xl text-[var(--color-ink-soft)] max-w-xl mx-auto">
                        {isConfigured
                            ? 'A private collection of our cherished memories. Sign in to view our journey together.'
                            : 'A collection of our cherished memories — our journey together.'}
                    </p>
                    {!isConfigured && (
                        <p className="mt-2 text-sm text-[var(--color-peacock-teal)]">
                            (Demo mode — Auth not configured)
                        </p>
                    )}
                </motion.div>

                {/* Auth gate or gallery */}
                {loading ? (
                    <div className="flex justify-center py-20">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            className="w-10 h-10 border-3 border-[var(--color-gold)] border-t-transparent rounded-full"
                        />
                    </div>
                ) : !showGallery ? (
                    <AuthGate />
                ) : (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        {/* Album tabs */}
                        <div className="flex flex-wrap justify-center gap-2 mb-12">
                            {albums.map((album) => (
                                <button
                                    key={album.id}
                                    onClick={() => setActiveAlbum(album.id)}
                                    className={`
                    px-6 py-2 rounded-full font-display text-sm uppercase tracking-wider transition-all
                    ${activeAlbum === album.id
                                            ? 'bg-[var(--color-gold)] text-[var(--color-cream)]'
                                            : 'bg-[var(--color-cream)] text-[var(--color-ink-soft)] hover:bg-[var(--color-parchment-light)]'
                                        }
                  `}
                                >
                                    {album.name}
                                </button>
                            ))}
                        </div>

                        {/* Gallery */}
                        <MasonryGallery images={demoImages} />
                    </motion.div>
                )}
            </div>
        </section>
    );
}
