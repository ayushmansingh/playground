'use client';

import { motion, useTransform, MotionValue } from 'framer-motion';

interface PeacockMotifProps {
    progress: MotionValue<number>;
    position: 'left' | 'right';
}

export default function PeacockMotif({ progress, position }: PeacockMotifProps) {
    // Peacock subtle animation based on scroll
    const rotate = useTransform(
        progress,
        [0, 0.5, 1],
        position === 'left' ? [-5, 0, 5] : [5, 0, -5]
    );

    const scale = useTransform(progress, [0, 0.5, 1], [1, 1.05, 1]);
    const opacity = useTransform(progress, [0, 0.1, 0.8, 1], [0.4, 0.8, 0.8, 0.4]);

    const isLeft = position === 'left';

    return (
        <motion.div
            style={{
                rotate,
                scale,
                opacity,
                x: isLeft ? '-20%' : '20%',
            }}
            className={`
        absolute top-1/2 -translate-y-1/2 z-[var(--z-peacocks)]
        ${isLeft ? 'left-0' : 'right-0'}
        w-[300px] md:w-[400px] lg:w-[500px]
        pointer-events-none
      `}
        >
            {/* Placeholder peacock illustration - will be replaced with Whisk asset */}
            <svg
                viewBox="0 0 300 400"
                className={`w-full h-auto ${isLeft ? '' : 'scale-x-[-1]'}`}
                style={{ color: 'var(--color-peacock-blue)' }}
            >
                {/* Peacock body */}
                <ellipse cx="150" cy="320" rx="30" ry="50" fill="currentColor" opacity="0.6" />

                {/* Peacock neck and head */}
                <path
                    d="M150,270 Q145,240 150,210 Q155,180 150,160"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    opacity="0.6"
                />
                <circle cx="150" cy="150" r="18" fill="currentColor" opacity="0.7" />

                {/* Crown feathers */}
                <g opacity="0.5">
                    <line x1="150" y1="150" x2="140" y2="125" stroke="currentColor" strokeWidth="2" />
                    <line x1="150" y1="150" x2="150" y2="120" stroke="currentColor" strokeWidth="2" />
                    <line x1="150" y1="150" x2="160" y2="125" stroke="currentColor" strokeWidth="2" />
                    <circle cx="140" cy="120" r="4" fill="var(--color-gold)" />
                    <circle cx="150" cy="115" r="4" fill="var(--color-gold)" />
                    <circle cx="160" cy="120" r="4" fill="var(--color-gold)" />
                </g>

                {/* Tail feathers - fan pattern */}
                <g className="animate-flutter" style={{ transformOrigin: '150px 320px' }}>
                    {[...Array(9)].map((_, i) => {
                        const angle = -60 + i * 15;
                        const length = 180 + Math.sin(i * 0.5) * 30;
                        const endX = 150 + Math.sin((angle * Math.PI) / 180) * length;
                        const endY = 320 - Math.cos((angle * Math.PI) / 180) * length;

                        return (
                            <g key={i}>
                                {/* Feather shaft */}
                                <line
                                    x1="150"
                                    y1="320"
                                    x2={endX}
                                    y2={endY}
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    opacity="0.4"
                                />
                                {/* Eye pattern */}
                                <circle
                                    cx={endX}
                                    cy={endY}
                                    r="15"
                                    fill="var(--color-peacock-teal)"
                                    opacity="0.5"
                                />
                                <circle
                                    cx={endX}
                                    cy={endY}
                                    r="10"
                                    fill="var(--color-gold)"
                                    opacity="0.6"
                                />
                                <circle
                                    cx={endX}
                                    cy={endY}
                                    r="5"
                                    fill="var(--color-peacock-blue)"
                                    opacity="0.8"
                                />
                            </g>
                        );
                    })}
                </g>
            </svg>
        </motion.div>
    );
}
