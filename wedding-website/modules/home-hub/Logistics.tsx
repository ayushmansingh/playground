'use client';

import { motion } from 'framer-motion';

const venues = [
    {
        name: 'The Grand Palace',
        type: 'Ceremony Venue',
        address: '123 Royal Gardens, Mumbai - 400001',
        mapUrl: '#',
        image: '/placeholder-venue-1.jpg',
        details: 'The ceremony will take place in the stunning courtyard garden.',
    },
    {
        name: 'Crystal Ballroom',
        type: 'Reception Venue',
        address: '456 Heritage Lane, Mumbai - 400002',
        mapUrl: '#',
        image: '/placeholder-venue-2.jpg',
        details: 'Followed by dinner, drinks, and dancing until midnight!',
    },
];

const travelInfo = [
    {
        icon: '✈️',
        title: 'By Air',
        description: 'Chhatrapati Shivaji International Airport (BOM) is 30 minutes from the venue.',
    },
    {
        icon: '🚂',
        title: 'By Train',
        description: 'Mumbai Central Railway Station is the closest, about 20 minutes away.',
    },
    {
        icon: '🚗',
        title: 'Parking',
        description: 'Complimentary valet parking available at both venues.',
    },
];

const hotels = [
    { name: 'The Taj Palace', distance: '5 min walk', priceRange: '$$$$' },
    { name: 'Hotel Sunrise', distance: '10 min drive', priceRange: '$$$' },
    { name: 'Garden View Inn', distance: '15 min drive', priceRange: '$$' },
];

export default function Logistics() {
    return (
        <div className="space-y-16">
            {/* Venues */}
            <div>
                <h3 className="font-display text-2xl text-[var(--color-ink)] text-center mb-8">
                    Venues
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                    {venues.map((venue, index) => (
                        <motion.div
                            key={venue.name}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="glass rounded-2xl overflow-hidden"
                        >
                            {/* Venue image placeholder */}
                            <div className="h-40 bg-gradient-to-br from-[var(--color-peacock-light)] to-[var(--color-peacock-blue)] flex items-center justify-center">
                                <span className="text-6xl">🏛️</span>
                            </div>

                            <div className="p-6">
                                <span className="inline-block px-3 py-1 bg-[var(--color-gold)]/20 text-[var(--color-gold-dark)] font-display text-xs uppercase tracking-wider rounded-full mb-3">
                                    {venue.type}
                                </span>
                                <h4 className="font-display text-xl text-[var(--color-ink)] mb-2">
                                    {venue.name}
                                </h4>
                                <p className="text-sm text-[var(--color-ink-soft)] mb-3">
                                    {venue.address}
                                </p>
                                <p className="text-sm text-[var(--color-ink-soft)] mb-4">
                                    {venue.details}
                                </p>
                                <a
                                    href={venue.mapUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-[var(--color-peacock-teal)] font-display text-sm hover:text-[var(--color-peacock-blue)] transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    View on Map
                                </a>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Travel info */}
            <div>
                <h3 className="font-display text-2xl text-[var(--color-ink)] text-center mb-8">
                    Getting There
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                    {travelInfo.map((info, index) => (
                        <motion.div
                            key={info.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="glass rounded-xl p-6 text-center"
                        >
                            <span className="text-3xl mb-3 block">{info.icon}</span>
                            <h4 className="font-display text-lg text-[var(--color-ink)] mb-2">
                                {info.title}
                            </h4>
                            <p className="text-sm text-[var(--color-ink-soft)]">
                                {info.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>

            {/* Hotels */}
            <div>
                <h3 className="font-display text-2xl text-[var(--color-ink)] text-center mb-8">
                    Nearby Hotels
                </h3>
                <div className="glass rounded-xl divide-y divide-[var(--color-parchment-dark)]">
                    {hotels.map((hotel, index) => (
                        <motion.div
                            key={hotel.name}
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="p-4 flex items-center justify-between"
                        >
                            <div>
                                <h4 className="font-display text-[var(--color-ink)]">{hotel.name}</h4>
                                <p className="text-sm text-[var(--color-ink-soft)]">{hotel.distance}</p>
                            </div>
                            <span className="text-[var(--color-gold)]">{hotel.priceRange}</span>
                        </motion.div>
                    ))}
                </div>
                <p className="text-center text-sm text-[var(--color-ink-soft)] mt-4">
                    Mention &quot;Aarav & Simran Wedding&quot; for special rates
                </p>
            </div>
        </div>
    );
}
