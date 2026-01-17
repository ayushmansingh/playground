'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageData {
    id: string;
    src: string;
    caption?: string;
    width: number;
    height: number;
}

interface MasonryGalleryProps {
    images: ImageData[];
}

export default function MasonryGallery({ images }: MasonryGalleryProps) {
    const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);

    // Calculate column assignments for masonry layout
    const getColumnClass = (index: number) => {
        const patterns = ['col-span-1', 'col-span-1', 'col-span-2', 'col-span-1', 'col-span-1', 'col-span-1'];
        return patterns[index % patterns.length];
    };

    const getRowSpan = (image: ImageData) => {
        const ratio = image.height / image.width;
        if (ratio > 1.3) return 'row-span-2';
        return 'row-span-1';
    };

    return (
        <>
            {/* Grid gallery */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[200px]">
                {images.map((image, index) => (
                    <motion.div
                        key={image.id}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-50px' }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className={`${getColumnClass(index)} ${getRowSpan(image)} relative rounded-xl overflow-hidden cursor-pointer group`}
                        onClick={() => setSelectedImage(image)}
                    >
                        {/* Placeholder gradient (will be replaced with actual images) */}
                        <div
                            className="absolute inset-0 bg-gradient-to-br from-[var(--color-blush)] via-[var(--color-parchment)] to-[var(--color-peacock-light)]"
                            style={{
                                backgroundImage: `url(${image.src})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                            }}
                        />

                        {/* Fallback pattern for demo */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-16 h-16 opacity-20" viewBox="0 0 24 24" fill="var(--color-ink)">
                                <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="1.5" stroke="currentColor" fill="none" />
                            </svg>
                        </div>

                        {/* Hover overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-ink)]/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                                {image.caption && (
                                    <p className="font-display text-[var(--color-cream)] text-sm">
                                        {image.caption}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Zoom icon */}
                        <div className="absolute top-4 right-4 w-8 h-8 bg-[var(--color-cream)]/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <svg className="w-4 h-4 text-[var(--color-ink)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Lightbox */}
            <AnimatePresence>
                {selectedImage && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[var(--z-modal)] bg-[var(--color-ink)]/90 flex items-center justify-center p-6"
                        onClick={() => setSelectedImage(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative max-w-4xl max-h-[80vh] w-full"
                        >
                            {/* Close button */}
                            <button
                                onClick={() => setSelectedImage(null)}
                                className="absolute -top-12 right-0 text-[var(--color-cream)] hover:text-[var(--color-gold)] transition-colors"
                            >
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            {/* Image placeholder */}
                            <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--color-blush)] via-[var(--color-parchment)] to-[var(--color-peacock-light)] aspect-video flex items-center justify-center">
                                <svg className="w-24 h-24 opacity-30" viewBox="0 0 24 24" fill="var(--color-ink)">
                                    <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="1.5" stroke="currentColor" fill="none" />
                                </svg>
                            </div>

                            {/* Caption */}
                            {selectedImage.caption && (
                                <p className="mt-4 text-center font-display text-lg text-[var(--color-cream)]">
                                    {selectedImage.caption}
                                </p>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
