'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import FlowerBorder from './FlowerBorder';
import PeacockMotif from './PeacockMotif';
import FloatingBird from './FloatingBird';
import BackgroundMorph from './BackgroundMorph';

interface ParallaxJourneyProps {
    coupleNames?: string;
    eventDate?: string;
    tagline?: string;
}

export default function ParallaxJourney({
    coupleNames = "Aarav & Simran",
    eventDate = "February 14, 2026",
    tagline = "A Journey of Love",
}: ParallaxJourneyProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ['start start', 'end start'],
    });

    // Text animations based on scroll
    const titleOpacity = useTransform(scrollYProgress, [0, 0.3, 0.5], [1, 1, 0]);
    const titleY = useTransform(scrollYProgress, [0, 0.5], [0, -100]);
    const dateOpacity = useTransform(scrollYProgress, [0.1, 0.4, 0.6], [0, 1, 0]);
    const dateY = useTransform(scrollYProgress, [0.1, 0.6], [50, -50]);
    const taglineOpacity = useTransform(scrollYProgress, [0.3, 0.5, 0.7], [0, 1, 0]);

    // Scroll indicator
    const scrollIndicatorOpacity = useTransform(scrollYProgress, [0, 0.1], [1, 0]);

    return (
        <section
            ref={containerRef}
            id="hero"
            className="relative h-[400vh]"
        >
            {/* Sticky container */}
            <div className="sticky top-0 h-screen overflow-hidden">

                {/* Background morphing layer */}
                <BackgroundMorph progress={scrollYProgress} />

                {/* Peacock motifs on edges */}
                <PeacockMotif progress={scrollYProgress} position="left" />
                <PeacockMotif progress={scrollYProgress} position="right" />

                {/* Flower border decorations */}
                <FlowerBorder progress={scrollYProgress} />

                {/* Flying bird */}
                <FloatingBird progress={scrollYProgress} />

                {/* Foreground text content */}
                <div className="relative z-[var(--z-text)] h-full flex flex-col items-center justify-center px-6">

                    {/* Main title - Couple names */}
                    <motion.h1
                        style={{ opacity: titleOpacity, y: titleY }}
                        className="font-accent text-6xl md:text-8xl lg:text-9xl text-[var(--color-gold)] text-center leading-tight"
                    >
                        {coupleNames}
                    </motion.h1>

                    {/* Event date */}
                    <motion.p
                        style={{ opacity: dateOpacity, y: dateY }}
                        className="mt-8 font-display text-2xl md:text-3xl text-[var(--color-peacock-blue)] tracking-widest uppercase"
                    >
                        {eventDate}
                    </motion.p>

                    {/* Tagline */}
                    <motion.p
                        style={{ opacity: taglineOpacity }}
                        className="mt-4 font-body text-lg md:text-xl text-[var(--color-ink-soft)] italic"
                    >
                        {tagline}
                    </motion.p>

                </div>

                {/* Scroll indicator */}
                <motion.div
                    style={{ opacity: scrollIndicatorOpacity }}
                    className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
                >
                    <span className="font-body text-xs uppercase tracking-widest text-[var(--color-ink-soft)]">
                        Scroll to explore
                    </span>
                    <motion.div
                        animate={{ y: [0, 8, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-6 h-10 rounded-full border-2 border-[var(--color-gold)] flex items-start justify-center pt-2"
                    >
                        <motion.div
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            className="w-1.5 h-3 rounded-full bg-[var(--color-gold)]"
                        />
                    </motion.div>
                </motion.div>

            </div>
        </section>
    );
}
