/**
 * VoxPlan — Presentation-Only Cinematic Editorial Motion System
 *
 * Responsibilities:
 * 1. Smooth background colour transitions across the warm editorial palette:
 *    - Warm parchment / ivory (#FBF9F4 / #FFF8EF)
 *    - Butter yellow / marigold (#FFF8E7 / #FFF9DB)
 *    - Dusty lavender / soft plum (#F5EEF8 / #F3EEFF)
 *    - Muted sage (#EBF5EE / #EBF8F1)
 *    - Warm peach / terracotta (#FDF0ED / #FFEFEA)
 * 2. Oversized editorial typography motion:
 *    - Sequence: PLAN, PREDICT, UNDERSTAND, ACT
 *    - Directional sweeps, gentle entry and exit, controlled contrast
 *    - Intentional viewport edge cropping for magazine layout composition
 * 3. Architecture & Safety Invariants:
 *    - PRESENTATION-ONLY: Never pins sections, never mutates layout containers,
 *      never modifies document height, never reduces content card opacity.
 *    - Accessible: pointer-events: none, aria-hidden: true, reduced-motion compliant.
 *    - Coordinates with Today / Tasks / Insights tabbed navigation.
 *    - Preserves mobile command dock and modal stacking contexts.
 */

// Brand color palette stops for smooth scroll interpolation
export const EDITORIAL_PALETTES = {
  // Today: Full editorial journey (Warm Parchment -> Butter Yellow -> Dusty Lavender -> Warm Peach)
  today: [
    { pos: 0.00, color: '#FBF9F4' }, // Warm parchment / ivory
    { pos: 0.32, color: '#FFF8E7' }, // Butter yellow / marigold
    { pos: 0.68, color: '#F5EEF8' }, // Dusty lavender / soft plum
    { pos: 1.00, color: '#FDF0ED' }, // Warm peach / terracotta
  ],
  // Tasks: Focused, quiet, high-readability canvas (Warm Parchment -> Subtle Plum Tint -> Warm Peach)
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

// Word configurations per view
export const EDITORIAL_WORDS_CONFIG = {
  today: [
    {
      id: 'editorial-word-plan',
      text: 'PLAN',
      range: [0.00, 0.35],
      peak: 0.15,
      startX: 70,
      endX: -55,
      startY: -10,
      endY: 15,
      maxOpacity: 0.11,
      color: '#3D2645', // Deep plum
    },
    {
      id: 'editorial-word-predict',
      text: 'PREDICT',
      range: [0.22, 0.60],
      peak: 0.38,
      startX: -65,
      endX: 50,
      startY: -12,
      endY: 18,
      maxOpacity: 0.10,
      color: '#C85A32', // Terracotta / amber
    },
    {
      id: 'editorial-word-understand',
      text: 'UNDERSTAND',
      range: [0.48, 0.82],
      peak: 0.65,
      startX: 75,
      endX: -45,
      startY: -10,
      endY: 15,
      maxOpacity: 0.09,
      color: '#2D6A4F', // Muted sage
    },
    {
      id: 'editorial-word-act',
      text: 'ACT',
      range: [0.70, 1.00],
      peak: 0.88,
      startX: -50,
      endX: 55,
      startY: -8,
      endY: 12,
      maxOpacity: 0.11,
      color: '#C85A32', // Terracotta
    },
  ],
  tasks: [
    {
      id: 'editorial-word-plan',
      text: 'PLAN',
      range: [0.00, 0.45],
      peak: 0.20,
      startX: 35,
      endX: -30,
      startY: -5,
      endY: 10,
      maxOpacity: 0.05, // Restrained for maximum task reading clarity
      color: '#3D2645',
    },
    {
      id: 'editorial-word-act',
      text: 'ACT',
      range: [0.55, 1.00],
      peak: 0.80,
      startX: -30,
      endX: 35,
      startY: -5,
      endY: 10,
      maxOpacity: 0.05,
      color: '#C85A32',
    },
  ],
  insights: [
    {
      id: 'editorial-word-predict',
      text: 'PREDICT',
      range: [0.00, 0.50],
      peak: 0.22,
      startX: -60,
      endX: 45,
      startY: -10,
      endY: 15,
      maxOpacity: 0.10,
      color: '#3D2645', // Deep plum
    },
    {
      id: 'editorial-word-understand',
      text: 'UNDERSTAND',
      range: [0.35, 0.85],
      peak: 0.60,
      startX: 65,
      endX: -40,
      startY: -10,
      endY: 15,
      maxOpacity: 0.09,
      color: '#2D6A4F', // Muted sage
    },
    {
      id: 'editorial-word-act',
      text: 'ACT',
      range: [0.75, 1.00],
      peak: 0.90,
      startX: -40,
      endX: 45,
      startY: -6,
      endY: 10,
      maxOpacity: 0.08,
      color: '#C85A32', // Terracotta
    },
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
 * Initializes the presentation-only cinematic scroll storytelling experience for VoxPlan.
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
  const palette = EDITORIAL_PALETTES[currentView] || EDITORIAL_PALETTES.today;
  const wordConfigs = EDITORIAL_WORDS_CONFIG[currentView] || EDITORIAL_WORDS_CONFIG.today;
  const activeWordIds = new Set(wordConfigs.map((w) => w.id));

  // Collect word elements
  const allWordElements = {
    'editorial-word-plan': document.getElementById('editorial-word-plan'),
    'editorial-word-predict': document.getElementById('editorial-word-predict'),
    'editorial-word-understand': document.getElementById('editorial-word-understand'),
    'editorial-word-act': document.getElementById('editorial-word-act'),
  };

  // If user prefers reduced motion: present calm static atmosphere without sweeps or color shifts
  if (prefersReducedMotion) {
    if (appEl) {
      appEl.style.setProperty('--voxplan-canvas-bg', '#FBF9F4');
      appEl.style.backgroundColor = '#FBF9F4';
    }
    Object.entries(allWordElements).forEach(([id, el]) => {
      if (!el) return;
      if (activeWordIds.has(id)) {
        el.style.transform = 'none';
        el.style.opacity = '0.04';
        el.style.visibility = 'visible';
      } else {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
      }
    });
    return () => {};
  }

  let rafId = null;
  let isTicking = false;

  // Compute and apply visual state based on scroll
  const updateVisualState = () => {
    isTicking = false;

    const isMobile = window.innerWidth <= 768;
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

    // 2. Oversized Editorial Typography Movement & Opacity
    // Handle short pages where user cannot scroll far (e.g. large display)
    const isShortScroll = maxScroll < 60;

    // First hide words that are not part of the active view
    Object.entries(allWordElements).forEach(([id, el]) => {
      if (!el) return;
      if (!activeWordIds.has(id)) {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        el.style.transform = 'translate3d(0, 0, 0)';
      }
    });

    // Animate active words
    wordConfigs.forEach((config) => {
      const el = allWordElements[config.id];
      if (!el) return;

      // When page has negligible scroll, display first word softly at rest
      if (isShortScroll) {
        if (config === wordConfigs[0]) {
          const restingOpacity = (isMobile ? config.maxOpacity * 0.6 : config.maxOpacity * 0.75).toFixed(3);
          el.style.visibility = 'visible';
          el.style.opacity = restingOpacity;
          el.style.transform = 'translate3d(0, 0, 0)';
          if (config.color) el.style.color = config.color;
        } else {
          el.style.opacity = '0';
          el.style.visibility = 'hidden';
        }
        return;
      }

      const [start, end] = config.range;
      if (progress < start || progress > end) {
        el.style.opacity = '0';
        el.style.visibility = 'hidden';
        return;
      }

      // Normalized progress within word's active window [0..1]
      const span = end - start;
      const t = span > 0 ? (progress - start) / span : 0;

      // Bell curve opacity: gentle entry -> peak -> gentle exit (sin curve)
      const curve = Math.sin(t * Math.PI);
      const effectiveMaxOpacity = isMobile ? config.maxOpacity * 0.55 : config.maxOpacity;
      const opacity = (curve * effectiveMaxOpacity).toFixed(3);

      // Directional movement: lerp startX -> endX, startY -> endY
      const moveScale = isMobile ? 0.35 : 1.0;
      const x = (config.startX + (config.endX - config.startX) * t) * moveScale;
      const y = (config.startY + (config.endY - config.startY) * t) * moveScale;
      const scale = isMobile ? 1.0 : (0.97 + 0.06 * curve).toFixed(3);

      el.style.visibility = 'visible';
      el.style.opacity = opacity;
      el.style.transform = isMobile
        ? `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        : `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale})`;
      if (config.color) {
        el.style.color = config.color;
      }
    });
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
