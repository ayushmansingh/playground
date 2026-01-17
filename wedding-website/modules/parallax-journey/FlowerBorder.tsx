'use client';

import { motion, useTransform, MotionValue } from 'framer-motion';

interface FlowerBorderProps {
    progress: MotionValue<number>;
}

export default function FlowerBorder({ progress }: FlowerBorderProps) {
    const opacity = useTransform(progress, [0, 0.2, 0.8, 1], [0.6, 1, 1, 0.6]);
    const scale = useTransform(progress, [0, 0.5, 1], [1, 1.02, 1]);

    return (
        <motion.div
            style={{ opacity, scale }}
            className="absolute inset-0 z-[var(--z-flowers)] pointer-events-none overflow-hidden"
        >
            {/* Top border */}
            <div className="absolute top-0 left-0 right-0 h-32 flex justify-between items-start">
                <FlowerCluster position="top-left" />
                <FlowerCluster position="top-center" size="small" />
                <FlowerCluster position="top-right" />
            </div>

            {/* Bottom border */}
            <div className="absolute bottom-0 left-0 right-0 h-32 flex justify-between items-end">
                <FlowerCluster position="bottom-left" />
                <FlowerCluster position="bottom-center" size="small" />
                <FlowerCluster position="bottom-right" />
            </div>

            {/* Side vines */}
            <div className="absolute top-32 bottom-32 left-0 w-24">
                <VineDecoration side="left" />
            </div>
            <div className="absolute top-32 bottom-32 right-0 w-24">
                <VineDecoration side="right" />
            </div>
        </motion.div>
    );
}

interface FlowerClusterProps {
    position: string;
    size?: 'small' | 'medium' | 'large';
}

function FlowerCluster({ position, size = 'large' }: FlowerClusterProps) {
    const sizeMultiplier = size === 'small' ? 0.6 : size === 'medium' ? 0.8 : 1;
    const isTop = position.includes('top');

    return (
        <div
            className={`relative ${isTop ? '-mt-4' : '-mb-4'}`}
            style={{
                transform: `scale(${sizeMultiplier})`,
                transformOrigin: isTop ? 'top center' : 'bottom center',
            }}
        >
            {/* Acrylic-style flower cluster placeholder */}
            <svg
                viewBox="0 0 200 150"
                className="w-48 h-auto"
                style={{ transform: isTop ? 'rotate(0deg)' : 'rotate(180deg)' }}
            >
                {/* Main flowers */}
                <g className="animate-float" style={{ animationDelay: '0s' }}>
                    <Flower cx={60} cy={80} size={35} color="var(--color-blush)" />
                </g>
                <g className="animate-float" style={{ animationDelay: '0.5s' }}>
                    <Flower cx={100} cy={60} size={40} color="var(--color-gold-light)" />
                </g>
                <g className="animate-float" style={{ animationDelay: '1s' }}>
                    <Flower cx={140} cy={85} size={30} color="var(--color-blush-dark)" />
                </g>

                {/* Small accent flowers */}
                <Flower cx={40} cy={100} size={15} color="var(--color-peacock-light)" />
                <Flower cx={160} cy={110} size={18} color="var(--color-gold)" />

                {/* Leaves */}
                <Leaf cx={30} cy={90} angle={-30} />
                <Leaf cx={170} cy={95} angle={30} />
                <Leaf cx={80} cy={110} angle={-15} />
                <Leaf cx={120} cy={105} angle={15} />
            </svg>
        </div>
    );
}

interface FlowerProps {
    cx: number;
    cy: number;
    size: number;
    color: string;
}

function Flower({ cx, cy, size, color }: FlowerProps) {
    const petalCount = 6;

    return (
        <g>
            {/* Petals */}
            {[...Array(petalCount)].map((_, i) => {
                const angle = (i * 360) / petalCount;
                const rad = (angle * Math.PI) / 180;
                const petalX = cx + Math.cos(rad) * size * 0.5;
                const petalY = cy + Math.sin(rad) * size * 0.5;

                return (
                    <ellipse
                        key={i}
                        cx={petalX}
                        cy={petalY}
                        rx={size * 0.5}
                        ry={size * 0.3}
                        fill={color}
                        opacity={0.8}
                        transform={`rotate(${angle} ${petalX} ${petalY})`}
                        style={{ filter: 'blur(0.5px)' }}
                    />
                );
            })}

            {/* Center */}
            <circle cx={cx} cy={cy} r={size * 0.25} fill="var(--color-gold)" opacity={0.9} />
            <circle cx={cx} cy={cy} r={size * 0.15} fill="var(--color-gold-dark)" />
        </g>
    );
}

interface LeafProps {
    cx: number;
    cy: number;
    angle: number;
}

function Leaf({ cx, cy, angle }: LeafProps) {
    return (
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
            <ellipse
                cx={cx}
                cy={cy}
                rx={25}
                ry={10}
                fill="var(--color-peacock-teal)"
                opacity={0.6}
            />
            {/* Leaf vein */}
            <line
                x1={cx - 20}
                y1={cy}
                x2={cx + 20}
                y2={cy}
                stroke="var(--color-peacock-blue)"
                strokeWidth={1}
                opacity={0.4}
            />
        </g>
    );
}

interface VineDecorationProps {
    side: 'left' | 'right';
}

function VineDecoration({ side }: VineDecorationProps) {
    const isLeft = side === 'left';

    return (
        <svg
            viewBox="0 0 50 300"
            className="w-full h-full"
            style={{ transform: isLeft ? 'scaleX(1)' : 'scaleX(-1)' }}
        >
            {/* Curving vine */}
            <path
                d="M10,0 Q30,50 10,100 Q-10,150 10,200 Q30,250 10,300"
                stroke="var(--color-peacock-teal)"
                strokeWidth={3}
                fill="none"
                opacity={0.5}
            />

            {/* Small leaves along vine */}
            {[50, 100, 150, 200, 250].map((y, i) => (
                <ellipse
                    key={i}
                    cx={i % 2 === 0 ? 20 : 5}
                    cy={y}
                    rx={12}
                    ry={6}
                    fill="var(--color-peacock-teal)"
                    opacity={0.4}
                    transform={`rotate(${i % 2 === 0 ? 30 : -30} ${i % 2 === 0 ? 20 : 5} ${y})`}
                />
            ))}

            {/* Small flower buds */}
            <circle cx={25} cy={75} r={5} fill="var(--color-blush)" opacity={0.6} />
            <circle cx={8} cy={175} r={4} fill="var(--color-gold-light)" opacity={0.5} />
        </svg>
    );
}
