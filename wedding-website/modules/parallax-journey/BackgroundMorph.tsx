'use client';

import { motion, useTransform, MotionValue } from 'framer-motion';

interface BackgroundMorphProps {
    progress: MotionValue<number>;
}

// City landmark stencils - these will be replaced with actual assets
const cities = [
    { name: 'Mumbai', color: 'var(--color-peacock-blue)' },
    { name: 'Paris', color: 'var(--color-deep-maroon)' },
    { name: 'Tokyo', color: 'var(--color-peacock-teal)' },
];

export default function BackgroundMorph({ progress }: BackgroundMorphProps) {
    // Each city fades in and out at different scroll points
    const city1Opacity = useTransform(progress, [0, 0.2, 0.3, 0.4], [1, 1, 0.3, 0]);
    const city2Opacity = useTransform(progress, [0.25, 0.4, 0.55, 0.7], [0, 1, 1, 0]);
    const city3Opacity = useTransform(progress, [0.55, 0.7, 0.85, 1], [0, 1, 1, 0.5]);

    const opacities = [city1Opacity, city2Opacity, city3Opacity];

    // Subtle parallax movement for each layer
    const y1 = useTransform(progress, [0, 1], [0, -50]);
    const y2 = useTransform(progress, [0, 1], [50, -30]);
    const y3 = useTransform(progress, [0, 1], [100, -10]);

    const yTransforms = [y1, y2, y3];

    return (
        <div className="absolute inset-0 z-[var(--z-background)]">
            {/* Parchment base texture */}
            <div
                className="absolute inset-0"
                style={{
                    background: `
            linear-gradient(180deg, 
              var(--color-parchment-light) 0%, 
              var(--color-parchment) 50%, 
              var(--color-parchment-dark) 100%
            )
          `,
                }}
            />

            {/* Subtle texture overlay */}
            <div
                className="absolute inset-0 opacity-30"
                style={{
                    backgroundImage: `
            url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")
          `,
                }}
            />

            {/* City stencil layers */}
            {cities.map((city, index) => (
                <motion.div
                    key={city.name}
                    style={{ opacity: opacities[index], y: yTransforms[index] }}
                    className="absolute inset-0 flex items-end justify-center overflow-hidden"
                >
                    {/* Placeholder city skyline - will be replaced with actual stencil assets */}
                    <svg
                        viewBox="0 0 1200 400"
                        className="w-full h-auto max-h-[60vh]"
                        style={{ color: city.color }}
                        preserveAspectRatio="xMidYMax slice"
                    >
                        {/* Stylized city skyline placeholder */}
                        <g fill="currentColor" opacity="0.15">
                            {/* Building silhouettes */}
                            <rect x="50" y="200" width="80" height="200" />
                            <rect x="140" y="150" width="60" height="250" />
                            <rect x="210" y="180" width="100" height="220" />
                            <polygon points="260,100 310,180 210,180" />

                            <rect x="320" y="100" width="70" height="300" />
                            <rect x="400" y="160" width="90" height="240" />

                            {/* Landmark feature - varies by city */}
                            {index === 0 && (
                                // Gateway of India style
                                <g>
                                    <rect x="550" y="150" width="120" height="250" />
                                    <path d="M550,150 Q610,80 670,150" fill="currentColor" />
                                </g>
                            )}
                            {index === 1 && (
                                // Eiffel Tower style
                                <polygon points="600,50 650,400 550,400" />
                            )}
                            {index === 2 && (
                                // Tokyo Tower style
                                <g>
                                    <polygon points="600,80 640,400 560,400" />
                                    <rect x="575" y="120" width="50" height="20" />
                                </g>
                            )}

                            <rect x="720" y="180" width="80" height="220" />
                            <rect x="810" y="140" width="60" height="260" />
                            <rect x="880" y="200" width="100" height="200" />
                            <rect x="990" y="160" width="70" height="240" />
                            <rect x="1070" y="190" width="80" height="210" />
                        </g>
                    </svg>

                    {/* City name label */}
                    <motion.span
                        className="absolute bottom-8 right-8 font-display text-sm uppercase tracking-[0.3em] opacity-40"
                        style={{ color: city.color }}
                    >
                        {city.name}
                    </motion.span>
                </motion.div>
            ))}

            {/* Vignette effect */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `
            radial-gradient(ellipse at center, 
              transparent 40%, 
              rgba(245, 230, 200, 0.5) 80%, 
              rgba(232, 212, 168, 0.8) 100%
            )
          `,
                }}
            />
        </div>
    );
}
