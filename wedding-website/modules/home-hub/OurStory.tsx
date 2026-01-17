'use client';

import { motion } from 'framer-motion';

const timeline = [
    {
        year: '2020',
        title: 'First Meeting',
        description: 'We met at a coffee shop in Mumbai. Little did we know that spilled latte would lead to forever.',
        icon: '☕',
    },
    {
        year: '2021',
        title: 'First Trip Together',
        description: 'Our adventure to the mountains of Manali, where we discovered our shared love for sunrises.',
        icon: '🏔️',
    },
    {
        year: '2023',
        title: 'Moving In',
        description: 'We took the big step and made a home together, complete with way too many plants.',
        icon: '🏠',
    },
    {
        year: '2025',
        title: 'The Proposal',
        description: 'A surprise proposal in Paris, under the stars with all our closest friends watching.',
        icon: '💍',
    },
    {
        year: '2026',
        title: 'Forever Begins',
        description: 'And now, we\'re ready to say "I do" and start the next chapter of our story.',
        icon: '💕',
    },
];

export default function OurStory() {
    return (
        <div className="max-w-3xl mx-auto">
            {/* Intro */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center mb-16"
            >
                <p className="font-display text-lg text-[var(--color-ink-soft)] leading-relaxed">
                    Every love story is beautiful, but ours is our favorite. Here&apos;s how two strangers became
                    best friends, then partners, and soon — husband and wife.
                </p>
            </motion.div>

            {/* Timeline */}
            <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-[var(--color-gold)] via-[var(--color-peacock-teal)] to-[var(--color-gold)]" />

                {timeline.map((event, index) => (
                    <motion.div
                        key={event.year}
                        initial={{ opacity: 0, x: index % 2 === 0 ? -30 : 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: index * 0.1 }}
                        className={`relative flex items-center gap-8 mb-12 ${index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                            }`}
                    >
                        {/* Timeline node */}
                        <div className="absolute left-8 md:left-1/2 -translate-x-1/2 w-16 h-16 bg-[var(--color-cream)] border-4 border-[var(--color-gold)] rounded-full flex items-center justify-center text-2xl z-10">
                            {event.icon}
                        </div>

                        {/* Content card */}
                        <div className={`ml-24 md:ml-0 md:w-[calc(50%-4rem)] glass rounded-xl p-6 ${index % 2 === 0 ? 'md:mr-auto md:text-right' : 'md:ml-auto md:text-left'
                            }`}>
                            <span className="inline-block px-3 py-1 bg-[var(--color-gold)]/20 text-[var(--color-gold-dark)] font-display text-sm rounded-full mb-2">
                                {event.year}
                            </span>
                            <h3 className="font-display text-xl text-[var(--color-ink)] mb-2">
                                {event.title}
                            </h3>
                            <p className="text-[var(--color-ink-soft)] text-sm leading-relaxed">
                                {event.description}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
