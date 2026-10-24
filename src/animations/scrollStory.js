/**
 * VoxPlan — Presentation-Only Animated Colour Fields & Atmosphere System
 *
 * Responsibilities:
 * 1. Expressive animated colour fields and oversized abstract forms:
 *    - Butter yellow & marigold sun arcs (#FFF8E7 / #E5A83B)
 *    - Dusty lavender & soft plum waves (#F5EEF8 / #3D2645)
 *    - Muted sage meadow arcs (#EBF5EE / #2D6A4F)
 *    - Warm peach & terracotta ambient wells (#FDF0ED / #C85A32)
 * 2. Visible, calm continuous motion:
 *    - Ambient drifting via GPU-accelerated CSS animations
 *    - Alive and atmospheric even without scrolling
 *    - Subtle scroll-linked palette interpolation and spatial depth
 * 3. Architecture & Safety Invariants:
 *    - PRESENTATION-ONLY: Never pins sections, never mutates layout containers,
 *      never modifies document height, never reduces content card opacity.
 *    - Accessible: pointer-events: none, aria-hidden: true, reduced-motion compliant.
 *    - Coordinates seamlessly with Today / Tasks / Insights navigation.
 *    - Preserves mobile command dock (~54-58px) and modal stacking contexts.
 */

// Brand color palette stops for smooth scroll interpolation
export const EDITORIAL_PALETTES = {
  // Today: Full warm editorial journey (Warm Parchment -> Butter Yellow -> Dusty Lavender -> Warm Peach)
  today: [
    { pos: 0.00, color: '#FBF9F4' }, // Warm parchment / ivory
    { pos: 0.32, color: '#FFF8E7' }, // Butter yellow / marigold
    { pos: 0.68, color: '#F5EEF8' }, // Dusty lavender / soft plum
    { pos: 1.00, color: '#FDF0ED' }, // Warm peach / terracotta
  ],
  // Tasks: Focused, clean, high-readability canvas (Warm Parchment -> Subtle Plum Tint -> Warm Peach)
  tasks: [
    { pos: 0.00, color: '#FBF9F4' }, // Warm parchment
    { pos: 0.50, color: '#F7F3F8' }, // Subtle lavender/plum tint
    { pos: 1.00, color: '#FDF0ED' }, // Subtle warm peach tint
  ],
  // Insights: Prediction & Understanding theme (Dusty Lavender -> Muted Sage -> Warm Peach)
  insights: [
    { pos: 0.00, color: '#F5EEF8' }, // Dusty lavender
    { pos: 0.50, color: '#EBF5EE' }, // Muted sage
    { pos: 1.00, color: '#FDF0ED' }, // Warm peach / terracotta
  ],
};

/**
 * Parses a hex color string into [r, g, b] triplet.
 */
export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

/**
 * Linearly interpolates between two hex colors.
 */
export function lerpColor(hexA, hexB, t) {
  const clampedT = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const r = Math.round(r1 + (r2 - r1) * clampedT);
  const g = Math.round(g1 + (g2 - g1) * clampedT);
  const b = Math.round(b1 + (b2 - b1) * clampedT);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Interpolates color along a multi-stop color palette based on progress [0..1].
 */
export function getMultiStopColor(stops, progress) {
  if (!stops || stops.length === 0) return '#FBF9F4';
  const p = Math.max(0, Math.min(1, progress));
  for (let i = 0; i < stops.length - 1; i++) {
    const s1 = stops[i];
    const s2 = stops[i + 1];
    if (p >= s1.pos && p <= s2.pos) {
      const segmentSpan = s2.pos - s1.pos;
      const localT = segmentSpan > 0 ? (p - s1.pos) / segmentSpan : 0;
      return lerpColor(s1.color, s2.color, localT);
    }
  }
  return stops[stops.length - 1].color;
}

/**
 * Initializes the presentation-only animated colour fields experience for VoxPlan.
 *
 * @param {Object} options
 * @param {string} [options.currentView='today'] - Active navigation view ('today', 'tasks', 'insights')
 * @returns {Function} cleanup - Function to detach listeners and cancel animation frames.
 */
export function initCinematicScrollStory({ currentView = 'today' } = {}) {
  // Safe environment check
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const appEl = document.querySelector('.voxplan-app');
  const canvasEl = document.getElementById('voxplan-editorial-canvas');
  const fieldsLayer = document.querySelector('.colour-fields-layer');
  const palette = EDITORIAL_PALETTES[currentView] || EDITORIAL_PALETTES.today;

  if (canvasEl) {
    canvasEl.setAttribute('data-current-view', currentView);
  }

  // If user prefers reduced motion: present calm static atmosphere without sweeps or parallax
  if (prefersReducedMotion) {
    if (appEl) {
      appEl.style.setProperty('--voxplan-canvas-bg', '#FBF9F4');
      appEl.style.backgroundColor = '#FBF9F4';
    }
    if (fieldsLayer) {
      fieldsLayer.style.transform = 'none';
    }
    return () => {};
  }

  let rafId = null;
  let isTicking = false;

  // Compute and apply visual state based on scroll
  const updateVisualState = () => {
    isTicking = false;

    const scrollY = window.scrollY || window.pageYOffset || 0;
    const docHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
    const viewHeight = window.innerHeight || 1;
    const maxScroll = Math.max(0, docHeight - viewHeight);

    // Compute scroll progress [0..1]
    const progress = maxScroll > 0 ? Math.max(0, Math.min(1, scrollY / maxScroll)) : 0;

    // 1. Smooth Background Colour Interpolation
    const currentColor = getMultiStopColor(palette, progress);
    if (appEl) {
      appEl.style.setProperty('--voxplan-canvas-bg', currentColor);
      appEl.style.backgroundColor = currentColor;
    }

    // 2. Subtle, restrained spatial depth on the colour fields layer (no layout disruption)
    if (fieldsLayer) {
      const parallaxY = -(scrollY * 0.04);
      fieldsLayer.style.transform = `translate3d(0, ${parallaxY.toFixed(1)}px, 0)`;
    }
  };

  const onScroll = () => {
    if (!isTicking) {
      isTicking = true;
      rafId = window.requestAnimationFrame(updateVisualState);
    }
  };

  const onResize = () => {
    if (!isTicking) {
      isTicking = true;
      rafId = window.requestAnimationFrame(updateVisualState);
    }
  };

  // Immediate initial render for the active view
  updateVisualState();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });

  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}
