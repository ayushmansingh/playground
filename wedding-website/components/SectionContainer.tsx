'use client';

import { useRef, ReactNode } from 'react';
import { motion, useScroll, useTransform, MotionValue } from 'framer-motion';

interface SectionContainerProps {
    id: string;
    className?: string;
    children: ReactNode | ((progress: MotionValue<number>) => ReactNode);
    height?: string;
    sticky?: boolean;
}

export default function SectionContainer({
    id,
    className = '',
    children,
    height = '100vh',
    sticky = false,
}: SectionContainerProps) {
    const containerRef = useRef<HTMLElement>(null);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ['start start', 'end start'],
    });

    // Transform progress to 0-1 range within the section
    const progress = useTransform(scrollYProgress, [0, 1], [0, 1]);

    return (
        <section
            ref={containerRef}
            id={id}
            className={`relative ${className}`}
            style={{ minHeight: height }}
        >
            {sticky ? (
                <div className="sticky top-0 h-screen overflow-hidden">
                    {typeof children === 'function' ? children(progress) : children}
                </div>
            ) : (
                typeof children === 'function' ? children(progress) : children
            )}
        </section>
    );
}

// Parallax layer for decorative elements
interface ParallaxLayerProps {
    children: ReactNode;
    speed?: number;
    className?: string;
    zIndex?: number;
}

export function ParallaxLayer({
    children,
    speed = 0.5,
    className = '',
    zIndex = 0,
}: ParallaxLayerProps) {
    const { scrollY } = useScroll();
    const y = useTransform(scrollY, (value) => value * speed);

    return (
        <motion.div
            style={{ y, zIndex }}
            className={`absolute inset-0 pointer-events-none ${className}`}
        >
            {children}
        </motion.div>
    );
}

// Fade-in section wrapper
interface FadeInSectionProps {
    children: ReactNode;
    className?: string;
    delay?: number;
}

export function FadeInSection({
    children,
    className = '',
    delay = 0,
}: FadeInSectionProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{
                duration: 0.8,
                delay,
                ease: [0.25, 0.1, 0.25, 1],
            }}
            className={className}
        >
            {children}
        </motion.div>
    );
}
