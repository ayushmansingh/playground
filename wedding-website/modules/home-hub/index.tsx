'use client';

import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';

// Lazy load tab content components (bundle-dynamic-imports rule)
const OurStory = dynamic(() => import('./OurStory'), {
    loading: () => <TabSkeleton />,
});
const Logistics = dynamic(() => import('./Logistics'), {
    loading: () => <TabSkeleton />,
});
const Schedule = dynamic(() => import('./Schedule'), {
    loading: () => <TabSkeleton />,
});

// Hoist static data outside component (rendering-hoist-jsx rule)
const tabs = [
    { id: 'story', label: 'Our Story', icon: '💕' },
    { id: 'logistics', label: 'Logistics', icon: '📍' },
    { id: 'schedule', label: 'Schedule', icon: '📅' },
] as const;

// Memoized loading skeleton
const TabSkeleton = memo(function TabSkeleton() {
    return (
        <div className="flex items-center justify-center min-h-[300px]">
            <div className="w-8 h-8 border-2 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin" />
        </div>
    );
});

// Memoized tab button (rerender-memo rule)
const TabButton = memo(function TabButton({
    tab,
    isActive,
    onClick,
}: {
    tab: typeof tabs[number];
    isActive: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`
                relative px-6 py-3 rounded-full font-display text-sm uppercase tracking-wider transition-all
                ${isActive
                    ? 'text-[var(--color-cream)]'
                    : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'
                }
            `}
        >
            {isActive && (
                <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-gradient-to-r from-[var(--color-gold-dark)] to-[var(--color-gold)] rounded-full"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
            )}
            <span className="relative flex items-center gap-2">
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
            </span>
        </button>
    );
});

// Memoized tab content (rerender-memo rule)
const TabContent = memo(function TabContent({ activeTab }: { activeTab: string }) {
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
            >
                {activeTab === 'story' && <OurStory />}
                {activeTab === 'logistics' && <Logistics />}
                {activeTab === 'schedule' && <Schedule />}
            </motion.div>
        </AnimatePresence>
    );
});

export default function HomeHub() {
    const [activeTab, setActiveTab] = useState('story');

    return (
        <section
            id="details"
            className="relative min-h-screen py-24 px-6 bg-[var(--color-parchment)]"
        >
            {/* Decorative top border */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--color-gold)] to-transparent" />

            <div className="max-w-5xl mx-auto relative">
                {/* Section header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-16"
                >
                    <h2 className="font-accent text-5xl md:text-6xl text-[var(--color-gold)] mb-4">
                        Home Hub
                    </h2>
                    <p className="font-display text-xl text-[var(--color-ink-soft)] max-w-xl mx-auto">
                        Everything you need to know about our special day
                    </p>
                </motion.div>

                {/* Tabs */}
                <div className="flex justify-center mb-12">
                    <div className="glass rounded-full p-1.5 flex gap-1">
                        {tabs.map((tab) => (
                            <TabButton
                                key={tab.id}
                                tab={tab}
                                isActive={activeTab === tab.id}
                                onClick={() => setActiveTab(tab.id)}
                            />
                        ))}
                    </div>
                </div>

                {/* Tab content */}
                <div className="min-h-[500px]">
                    <TabContent activeTab={activeTab} />
                </div>
            </div>
        </section>
    );
}
