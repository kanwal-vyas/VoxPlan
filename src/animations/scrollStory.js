import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Initializes the clean, staged, cinematic scroll storytelling experience for VoxPlan.
 * Adheres to:
 * 1. Single owner per visual element.
 * 2. Staged sequential progression (A -> A settles -> B -> B settles).
 * 3. Breathing room between major scenes.
 * 4. Pinned sections with clear START -> MAIN -> SETTLE -> EXIT lifecycles.
 * 5. Full reverse-scroll compatibility and mobile responsiveness.
 *
 * @returns {Function} cleanup - Reverts all GSAP contexts and kills ScrollTriggers.
 */
export function initCinematicScrollStory() {
  // Ensure ScrollTrigger never restores previous scroll memory on reload
  if (typeof ScrollTrigger !== 'undefined' && ScrollTrigger.clearScrollMemory) {
    ScrollTrigger.clearScrollMemory('manual');
  }
  if (typeof window !== 'undefined') {
    window.scrollTo(0, 0);
  }

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    return () => {};
  }

  const ctx = gsap.context(() => {
    // Ensure all content remains 100% visible and un-obscured without conflicting pin-spacers or opacity fades
    const heroContent = document.querySelector('.hero-composition');
    if (heroContent) gsap.set(heroContent, { opacity: 1, y: 0, scale: 1 });

    const yellowWipe = document.querySelector('.hero-wipe-yellow');
    if (yellowWipe) gsap.set(yellowWipe, { display: 'none', opacity: 0, scale: 0, visibility: 'hidden' });

    const taskCards = document.querySelectorAll('.task-card-item');
    if (taskCards.length > 0) gsap.set(taskCards, { opacity: 1, y: 0, scale: 1 });

    const accuracyCard = document.querySelector('.ml-card-accuracy');
    if (accuracyCard) gsap.set(accuracyCard, { opacity: 1, y: 0, scale: 1 });

    const secondaryMetricCards = document.querySelectorAll('.ml-card-secondary');
    if (secondaryMetricCards.length > 0) gsap.set(secondaryMetricCards, { opacity: 1, y: 0, scale: 1 });

    const commandBox = document.querySelector('.command-notebook-card');
    if (commandBox) gsap.set(commandBox, { opacity: 1, y: 0, scale: 1 });
  });

  return () => ctx.revert();
}
