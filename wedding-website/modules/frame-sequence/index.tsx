'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

interface FrameSequenceProps {
    frameCount?: number;
    folderPath?: string;
    framePrefix?: string;
    title?: string;
    subtitle?: string;
}

export default function FrameSequence({
    frameCount = 240,
    folderPath = '/sequence-1',
    framePrefix = 'ezgif-frame-',
    title = 'Celebrating Togetherness',
    subtitle = 'Ayushman & Dhwani',
}: FrameSequenceProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [images, setImages] = useState<HTMLImageElement[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ['start start', 'end start'],
    });

    // Preload all images
    useEffect(() => {
        const loadImages = async () => {
            const imagePromises: Promise<HTMLImageElement>[] = [];

            for (let i = 1; i <= frameCount; i++) {
                const frameNum = i.toString().padStart(3, '0');
                const src = `${folderPath}/${framePrefix}${frameNum}.jpg`;

                const promise = new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = src;
                });

                imagePromises.push(promise);
            }

            try {
                const loadedImages = await Promise.all(imagePromises);
                setImages(loadedImages);
                setIsLoaded(true);
            } catch (error) {
                console.error('Failed to load some images:', error);
                // Still set loaded to true to show what we have
                setIsLoaded(true);
            }
        };

        loadImages();
    }, [frameCount, folderPath, framePrefix]);

    // Render current frame based on scroll progress
    useEffect(() => {
        if (!isLoaded || images.length === 0) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const unsubscribe = scrollYProgress.on('change', (progress) => {
            const frameIndex = Math.min(
                Math.floor(progress * images.length),
                images.length - 1
            );

            const img = images[frameIndex];
            if (img) {
                // Set canvas size to match image aspect ratio
                canvas.width = img.width;
                canvas.height = img.height;

                // Clear and draw
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            }
        });

        // Draw first frame initially
        if (images[0]) {
            canvas.width = images[0].width;
            canvas.height = images[0].height;
            ctx.drawImage(images[0], 0, 0);
        }

        return () => unsubscribe();
    }, [isLoaded, images, scrollYProgress]);

    // Text animations
    const titleOpacity = useTransform(scrollYProgress, [0, 0.1, 0.5, 0.7], [0, 1, 1, 0]);
    const titleY = useTransform(scrollYProgress, [0, 0.1, 0.7], [60, 0, -40]);
    const subtitleOpacity = useTransform(scrollYProgress, [0.1, 0.2, 0.5, 0.7], [0, 1, 1, 0]);
    const subtitleY = useTransform(scrollYProgress, [0.1, 0.2, 0.7], [40, 0, -30]);
    const subtitleScale = useTransform(scrollYProgress, [0.2, 0.4], [1, 1.05]);

    return (
        <section
            ref={containerRef}
            className="relative h-[300vh]"
        >
            {/* Sticky container */}
            <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center bg-[#FAF6F1]">

                {/* Loading state */}
                {!isLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-parchment)]">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            className="w-12 h-12 border-3 border-[var(--color-gold)] border-t-transparent rounded-full"
                        />
                    </div>
                )}

                {/* Canvas for frame sequence */}
                <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-full object-contain"
                    style={{
                        opacity: isLoaded ? 1 : 0,
                        transition: 'opacity 0.5s ease',
                    }}
                />

                {/* Vintage text overlay - constrained to fit within frame */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Inner container sized to fit within the floral frame */}
                    <div
                        className="flex flex-col items-center justify-center text-center px-8"
                        style={{
                            maxWidth: '50%',
                            maxHeight: '40%',
                        }}
                    >
                        {/* Main title */}
                        <motion.h1
                            style={{ opacity: titleOpacity, y: titleY }}
                            className="text-center"
                        >
                            <span
                                className="block font-display text-sm md:text-base lg:text-lg tracking-[0.15em] uppercase text-[var(--color-deep-maroon)]"
                                style={{
                                    fontWeight: 400,
                                    letterSpacing: '0.2em',
                                    textShadow: '0 2px 8px rgba(255,255,255,0.9)',
                                }}
                            >
                                {title}
                            </span>
                        </motion.h1>

                        {/* Couple names - vintage script style */}
                        <motion.h2
                            style={{
                                opacity: subtitleOpacity,
                                y: subtitleY,
                                scale: subtitleScale,
                            }}
                            className="mt-2 md:mt-3 text-center"
                        >
                            <span
                                className="font-accent text-2xl md:text-4xl lg:text-5xl text-[var(--color-gold)]"
                                style={{
                                    textShadow: '0 3px 15px rgba(255,255,255,0.95), 0 1px 3px rgba(0,0,0,0.1)',
                                    lineHeight: 1.2,
                                }}
                            >
                                {subtitle}
                            </span>
                        </motion.h2>

                        {/* Decorative line */}
                        <motion.div
                            style={{ opacity: subtitleOpacity }}
                            className="mt-3 md:mt-4 flex items-center gap-2"
                        >
                            <div className="w-8 md:w-12 h-px bg-gradient-to-r from-transparent to-[var(--color-gold)]" />
                            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-gold)]" />
                            <div className="w-8 md:w-12 h-px bg-gradient-to-l from-transparent to-[var(--color-gold)]" />
                        </motion.div>
                    </div>
                </div>

                {/* Scroll hint at bottom */}
                <motion.div
                    style={{ opacity: useTransform(scrollYProgress, [0, 0.1], [1, 0]) }}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center"
                >
                    <span className="text-xs uppercase tracking-widest text-[var(--color-ink-soft)] mb-2">
                        Scroll to begin
                    </span>
                    <motion.div
                        animate={{ y: [0, 8, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    >
                        <svg
                            className="w-5 h-5 text-[var(--color-gold)]"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        </svg>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
}
