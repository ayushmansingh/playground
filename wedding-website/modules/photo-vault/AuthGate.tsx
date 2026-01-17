'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/providers/AuthProvider';

export default function AuthGate() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;

        setIsLoading(true);
        try {
            await signIn(email);
            setIsSent(true);
        } catch (error) {
            console.error('Sign in failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (isSent) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass rounded-2xl p-12 max-w-md mx-auto text-center"
            >
                <div className="w-16 h-16 mx-auto mb-6 bg-[var(--color-peacock-teal)] rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-[var(--color-cream)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                </div>
                <h3 className="font-display text-2xl text-[var(--color-ink)] mb-3">
                    Check Your Email
                </h3>
                <p className="text-[var(--color-ink-soft)]">
                    We&apos;ve sent a magic link to <strong>{email}</strong>. Click the link to access our private photo collection.
                </p>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl p-8 md:p-12 max-w-lg mx-auto border-glow-gold"
        >
            <div className="text-center mb-8">
                <div className="w-20 h-20 mx-auto mb-6 relative">
                    {/* Lock icon with decorative elements */}
                    <svg viewBox="0 0 80 80" className="w-full h-full">
                        <circle cx="40" cy="40" r="35" fill="none" stroke="var(--color-gold)" strokeWidth="2" opacity="0.3" />
                        <circle cx="40" cy="40" r="28" fill="var(--color-parchment-light)" />
                        <g fill="var(--color-gold)">
                            <rect x="28" y="36" width="24" height="20" rx="3" />
                            <path d="M33 36V28a7 7 0 0114 0v8h-4v-8a3 3 0 00-6 0v8h-4z" />
                            <circle cx="40" cy="46" r="3" fill="var(--color-parchment)" />
                            <rect x="39" y="48" width="2" height="5" fill="var(--color-parchment)" />
                        </g>
                    </svg>
                </div>
                <h3 className="font-display text-2xl text-[var(--color-ink)] mb-2">
                    Private Gallery
                </h3>
                <p className="text-[var(--color-ink-soft)]">
                    Enter your email to receive a magic link and unlock our photo memories.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="email" className="block font-display text-sm uppercase tracking-wider text-[var(--color-ink-soft)] mb-2">
                        Email Address
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="guest@example.com"
                        required
                        className="w-full px-5 py-4 bg-[var(--color-cream)] border-2 border-[var(--color-parchment-dark)] rounded-xl font-body text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-gold)] focus:outline-none transition-colors"
                    />
                </div>

                <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-4 bg-gradient-to-r from-[var(--color-peacock-blue)] via-[var(--color-peacock-teal)] to-[var(--color-peacock-blue)] text-[var(--color-cream)] font-display text-lg uppercase tracking-widest rounded-xl shadow-lifted disabled:opacity-50 transition-all"
                >
                    {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                className="w-5 h-5 border-2 border-[var(--color-cream)] border-t-transparent rounded-full"
                            />
                            Sending...
                        </span>
                    ) : (
                        'Send Magic Link'
                    )}
                </motion.button>
            </form>

            <p className="text-center text-xs text-[var(--color-ink-soft)] mt-6">
                Only invited guests can access this gallery.
            </p>
        </motion.div>
    );
}
