'use client';

import { motion } from 'framer-motion';

const scheduleItems = [
    {
        time: '3:00 PM',
        event: 'Guest Arrival',
        description: 'Welcome drinks and appetizers in the garden',
        icon: '🥂',
    },
    {
        time: '4:00 PM',
        event: 'Ceremony',
        description: 'Exchange of vows under the mandap',
        icon: '💒',
        highlight: true,
    },
    {
        time: '5:30 PM',
        event: 'Cocktail Hour',
        description: 'Mix and mingle while we take photos',
        icon: '🍸',
    },
    {
        time: '7:00 PM',
        event: 'Reception Begins',
        description: 'Grand entrance and first dance',
        icon: '💃',
        highlight: true,
    },
    {
        time: '7:30 PM',
        event: 'Dinner',
        description: 'Multi-course feast prepared by Chef Rahul',
        icon: '🍽️',
    },
    {
        time: '9:00 PM',
        event: 'Toasts & Speeches',
        description: 'Words of wisdom from loved ones',
        icon: '🎤',
    },
    {
        time: '9:30 PM',
        event: 'Cake Cutting',
        description: 'Followed by dessert bar',
        icon: '🎂',
    },
    {
        time: '10:00 PM',
        event: 'Dance Floor Opens',
        description: 'DJ Booth songs come alive!',
        icon: '🎵',
        highlight: true,
    },
    {
        time: '12:00 AM',
        event: 'Sparkler Send-Off',
        description: 'Light the way for our new journey',
        icon: '✨',
    },
];

export default function Schedule() {
    return (
        <div className="max-w-2xl mx-auto">
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-lg text-[var(--color-ink-soft)] mb-12"
            >
                February 14, 2026 — A day full of love, laughter, and celebration
            </motion.p>

            {/* Schedule list */}
            <div className="space-y-4">
                {scheduleItems.map((item, index) => (
                    <motion.div
                        key={item.event}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.05 }}
                        className={`
              flex items-start gap-4 p-4 rounded-xl transition-all
              ${item.highlight
                                ? 'glass border-l-4 border-[var(--color-gold)]'
                                : 'hover:bg-[var(--color-parchment-light)]'
                            }
            `}
                    >
                        {/* Time */}
                        <div className="w-20 flex-shrink-0 text-right">
                            <span className={`font-display text-sm ${item.highlight ? 'text-[var(--color-gold)]' : 'text-[var(--color-ink-soft)]'
                                }`}>
                                {item.time}
                            </span>
                        </div>

                        {/* Icon */}
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${item.highlight
                                ? 'bg-[var(--color-gold)]'
                                : 'bg-[var(--color-parchment-dark)]'
                            }`}>
                            <span className="text-xl">{item.icon}</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 pt-1">
                            <h4 className={`font-display ${item.highlight ? 'text-lg text-[var(--color-ink)]' : 'text-[var(--color-ink)]'
                                }`}>
                                {item.event}
                            </h4>
                            <p className="text-sm text-[var(--color-ink-soft)]">
                                {item.description}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Dress code */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mt-12 glass rounded-xl p-6 text-center"
            >
                <h4 className="font-display text-lg text-[var(--color-ink)] mb-2">
                    Dress Code
                </h4>
                <p className="font-accent text-3xl text-[var(--color-gold)] mb-2">
                    Festive Formal
                </p>
                <p className="text-sm text-[var(--color-ink-soft)]">
                    Think elegant with a touch of celebration! Traditional Indian attire is welcome and encouraged.
                </p>
            </motion.div>
        </div>
    );
}
