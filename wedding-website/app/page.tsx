import ParallaxJourney from '@/modules/parallax-journey';
import DJBooth from '@/modules/dj-booth';
import PhotoVault from '@/modules/photo-vault';
import HomeHub from '@/modules/home-hub';

export default function Home() {
  return (
    <>
      {/* Hero: Parallax scrollytelling journey */}
      <ParallaxJourney
        coupleNames="Ayushman & Dhwani"
        eventDate="February 14, 2026"
        tagline="A Journey of Love"
      />

      {/* DJ Booth: Song recommender */}
      <DJBooth />

      {/* Photo Vault: Auth-gated gallery */}
      <PhotoVault />

      {/* Home Hub: Info center with tabs */}
      <HomeHub />

      {/* Footer */}
      <footer className="py-12 px-6 bg-[var(--color-parchment-dark)] text-center">
        <p className="font-accent text-3xl text-[var(--color-gold)] mb-4">
          Ayushman & Dhwani
        </p>
        <p className="font-display text-sm uppercase tracking-widest text-[var(--color-ink-soft)]">
          February 14, 2026
        </p>
        <div className="mt-8 flex justify-center gap-6">
          <a href="#hero" className="text-[var(--color-ink-soft)] hover:text-[var(--color-gold)] transition-colors">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </a>
        </div>
        <p className="mt-8 text-xs text-[var(--color-ink-soft)]">
          Made with 💕 for our special day
        </p>
      </footer>
    </>
  );
}
