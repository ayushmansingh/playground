'use client';

import { motion, useTransform, MotionValue } from 'framer-motion';

interface FloatingBirdProps {
    progress: MotionValue<number>;
}

export default function FloatingBird({ progress }: FloatingBirdProps) {
    // Bird flies diagonally across screen synced to scroll
    const x = useTransform(progress, [0, 1], ['-20%', '120%']);
    const y = useTransform(progress, [0, 1], ['80%', '10%']);
    const rotate = useTransform(progress, [0, 0.3, 0.7, 1], [-10, 5, -5, 10]);
    const scale = useTransform(progress, [0, 0.5, 1], [0.8, 1.2, 0.9]);
    const opacity = useTransform(progress, [0, 0.1, 0.9, 1], [0, 1, 1, 0]);

    return (
        <motion.div
            style={{ x, y, rotate, scale, opacity }}
            className="absolute z-[var(--z-bird)] pointer-events-none w-16 md:w-24 lg:w-32"
        >
            {/* Placeholder bird - will be replaced with Veo 3 video asset */}
            <svg
                viewBox="0 0 100 60"
                className="w-full h-auto"
                style={{ color: 'var(--color-gold)' }}
            >
                {/* Bird body */}
                <ellipse cx="50" cy="35" rx="20" ry="12" fill="currentColor" opacity="0.8" />

                {/* Bird head */}
                <circle cx="70" cy="30" r="8" fill="currentColor" opacity="0.9" />

                {/* Beak */}
                <polygon points="78,30 90,28 78,32" fill="var(--color-deep-maroon)" opacity="0.8" />

                {/* Eye */}
                <circle cx="72" cy="28" r="2" fill="var(--color-ink)" />

                {/* Wings with flapping animation */}
                <motion.g
                    animate={{
                        rotate: [0, -20, 0, 20, 0],
                    }}
                    transition={{
                        duration: 0.4,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                    style={{ transformOrigin: '50px 35px' }}
                >
                    {/* Left wing */}
                    <path
                        d="M50,35 Q30,10 10,25 Q25,30 50,35"
                        fill="currentColor"
                        opacity="0.7"
                    />
                </motion.g>

                <motion.g
                    animate={{
                        rotate: [0, 20, 0, -20, 0],
                    }}
                    transition={{
                        duration: 0.4,
                        repeat: Infinity,
                        ease: 'easeInOut',
                    }}
                    style={{ transformOrigin: '50px 35px' }}
                >
                    {/* Right wing (behind body) */}
                    <path
                        d="M50,35 Q30,55 15,50 Q30,45 50,35"
                        fill="currentColor"
                        opacity="0.5"
                    />
                </motion.g>

                {/* Tail */}
                <polygon points="30,35 10,30 10,40" fill="currentColor" opacity="0.7" />

                {/* Decorative trail */}
                <motion.path
                    d="M30,35 Q0,40 -30,35"
                    stroke="var(--color-gold-light)"
                    strokeWidth="2"
                    fill="none"
                    opacity="0.4"
                    animate={{ pathLength: [0, 1, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                />
            </svg>

            {/* Sparkle trail effect */}
            {[...Array(3)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute"
                    style={{
                        left: -20 - i * 15,
                        top: 20 + i * 5,
                    }}
                    animate={{
                        opacity: [0.8, 0, 0.8],
                        scale: [1, 0.5, 1],
                    }}
                    transition={{
                        duration: 1.5,
                        delay: i * 0.3,
                        repeat: Infinity,
                    }}
                >
                    <svg width="8" height="8" viewBox="0 0 8 8">
                        <circle cx="4" cy="4" r="2" fill="var(--color-gold-light)" />
                    </svg>
                </motion.div>
            ))}
        </motion.div>
    );
}
