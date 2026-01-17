'use client';

import { useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';

const navItems = [
    { name: 'Home', href: '#hero' },
    { name: 'Our Story', href: '#story' },
    { name: 'DJ Booth', href: '#dj-booth' },
    { name: 'Gallery', href: '#gallery' },
    { name: 'Details', href: '#details' },
];

export default function Navigation() {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const { scrollY } = useScroll();

    const navBackground = useTransform(
        scrollY,
        [0, 100],
        ['rgba(245, 230, 200, 0)', 'rgba(245, 230, 200, 0.95)']
    );

    const navShadow = useTransform(
        scrollY,
        [0, 100],
        ['0 0 0 rgba(0,0,0,0)', '0 4px 30px rgba(0,0,0,0.1)']
    );

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <motion.nav
            style={{
                backgroundColor: navBackground,
                boxShadow: navShadow,
            }}
            className="fixed top-0 left-0 right-0 z-[var(--z-ui)] px-6 py-4 transition-colors duration-300"
        >
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                {/* Logo / Names */}
                <Link
                    href="#hero"
                    className="font-accent text-3xl text-[var(--color-gold)] hover:text-[var(--color-gold-dark)] transition-colors"
                >
                    A & D
                </Link>

                {/* Desktop Navigation */}
                <ul className="hidden md:flex items-center gap-8">
                    {navItems.map((item) => (
                        <li key={item.name}>
                            <Link
                                href={item.href}
                                className={`
                  font-display text-sm tracking-wide uppercase
                  transition-all duration-300
                  ${isScrolled
                                        ? 'text-[var(--color-ink)] hover:text-[var(--color-gold)]'
                                        : 'text-[var(--color-ink-soft)] hover:text-[var(--color-gold)]'
                                    }
                `}
                            >
                                {item.name}
                            </Link>
                        </li>
                    ))}
                </ul>

                {/* Mobile Menu Button */}
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="md:hidden flex flex-col gap-1.5 p-2"
                    aria-label="Toggle menu"
                >
                    <motion.span
                        animate={{ rotate: isMobileMenuOpen ? 45 : 0, y: isMobileMenuOpen ? 8 : 0 }}
                        className="w-6 h-0.5 bg-[var(--color-ink)] origin-center"
                    />
                    <motion.span
                        animate={{ opacity: isMobileMenuOpen ? 0 : 1 }}
                        className="w-6 h-0.5 bg-[var(--color-ink)]"
                    />
                    <motion.span
                        animate={{ rotate: isMobileMenuOpen ? -45 : 0, y: isMobileMenuOpen ? -8 : 0 }}
                        className="w-6 h-0.5 bg-[var(--color-ink)] origin-center"
                    />
                </button>
            </div>

            {/* Mobile Menu */}
            <motion.div
                initial={false}
                animate={{
                    height: isMobileMenuOpen ? 'auto' : 0,
                    opacity: isMobileMenuOpen ? 1 : 0,
                }}
                className="md:hidden overflow-hidden"
            >
                <ul className="py-4 space-y-4">
                    {navItems.map((item) => (
                        <li key={item.name}>
                            <Link
                                href={item.href}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block font-display text-center text-lg text-[var(--color-ink)] hover:text-[var(--color-gold)] transition-colors"
                            >
                                {item.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            </motion.div>
        </motion.nav>
    );
}
