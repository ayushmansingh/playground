'use client';

import { useState, useEffect } from 'react';
import styles from './envelope.module.css';

interface EnvelopeIntroProps {
    onComplete?: () => void;
}

export default function EnvelopeIntro({ onComplete }: EnvelopeIntroProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isHidden, setIsHidden] = useState(false);

    // Handle the interaction
    const handleOpen = () => {
        if (isOpen) return; // Prevent double trigger
        setIsOpen(true);

        // Sequence timing logic
        // 1. Seal fades fast (handled by CSS transition-delay: 0s)
        // 2. Flap opens (0.8s)
        // 3. content slides up (1.2s total, starts 0.4s in) -> finishes around 1.6s
        // 4. Fade out entire overlay after content is revealed for a moment

        // Let the user admire the card for a second before fading out
        setTimeout(() => {
            setIsHidden(true);
        }, 2800); // 2.8s total time for animation sequence + reading pause
    };

    // When fade out finishes, trigger cleanup
    useEffect(() => {
        if (isHidden) {
            const timer = setTimeout(() => {
                if (onComplete) onComplete();
            }, 1000); // Match CSS --transition-speed-fade (1s)
            return () => clearTimeout(timer);
        }
    }, [isHidden, onComplete]);

    return (
        <div
            id="intro-overlay"
            className={`${styles.overlay} ${isHidden ? styles.hidden : ''}`}
        >
            <div className={`${styles.envelopeContainer} ${isOpen ? styles['is-open'] : ''}`}>

                {/* Validating assets existence with alt text fallback */}

                {/* 1. Base/Interior - The 'Inside Content' Card */}
                {/* It starts tucked behind the pocket */}
                <div className={styles.content}>
                    <img
                        src="/envelope/inside-content.jpg"
                        alt="Wedding Invitation"
                        className={styles.contentImg}
                    />
                </div>

                {/* 2. Middle - The Pocket (Bottom half) covers the card */}
                <div className={styles.pocket}>
                    <img
                        src="/envelope/envelope-back-pocket.png"
                        alt="Envelope Pocket"
                        className={styles.pocketImg}
                    />
                </div>

                {/* 3. Top - The Flap (3D Rotatable) */}
                <div className={styles.flapWrapper}>
                    {/* Front of flap (Closed state) */}
                    <div className={`${styles.flapFace} ${styles.flapClosed}`}>
                        <img
                            src="/envelope/envelope-flap-closed.png"
                            alt="Envelope Flap"
                            className={styles.flapImg}
                        />
                    </div>

                    {/* Back of flap (Inside state - revealed when rotated) */}
                    <div className={`${styles.flapFace} ${styles.flapOpen}`}>
                        <img
                            src="/envelope/envelope-flap-open.png"
                            alt="Envelope Flap Interior"
                            className={styles.flapImg}
                        />
                    </div>
                </div>

                {/* 4. Very Top - Wax Seal Button */}
                <button
                    className={styles.sealBtn}
                    onClick={handleOpen}
                    aria-label="Open Invitation"
                >
                    <img
                        src="/envelope/wax-seal.png"
                        alt="Wax Seal A&D"
                        className={styles.sealImg}
                    />
                </button>

            </div>
        </div>
    );
}
