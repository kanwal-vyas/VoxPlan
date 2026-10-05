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

  const isMobile = window.innerWidth < 768;

  const ctx = gsap.context(() => {
    // ========================================================================
    // 0. Global Atmosphere Morphing (Background Color Progression)
    // ========================================================================
    const appEl = document.querySelector('.voxplan-app');
    if (appEl) {
      // Cream -> Butter Yellow (Sprint Pulse)
      ScrollTrigger.create({
        trigger: '#pulse',
        start: 'top 85%',
        end: 'top 30%',
        scrub: 1,
        onUpdate: (self) => {
          gsap.to(appEl, {
            backgroundColor: gsap.utils.interpolate('#FFF8EF', '#FFF9DB', self.progress),
            duration: 0.1,
            overwrite: 'auto',
          });
        },
      });

      // Butter Yellow -> Lavender (Risk Landscape)
      ScrollTrigger.create({
        trigger: '#landscape',
        start: 'top 85%',
        end: 'top 30%',
        scrub: 1,
        onUpdate: (self) => {
          gsap.to(appEl, {
            backgroundColor: gsap.utils.interpolate('#FFF9DB', '#F3EEFF', self.progress),
            duration: 0.1,
            overwrite: 'auto',
          });
        },
      });

      // Lavender -> Mint (ML Intelligence)
      ScrollTrigger.create({
        trigger: '#intelligence',
        start: 'top 85%',
        end: 'top 30%',
        scrub: 1,
        onUpdate: (self) => {
          gsap.to(appEl, {
            backgroundColor: gsap.utils.interpolate('#F3EEFF', '#EBF8F1', self.progress),
            duration: 0.1,
            overwrite: 'auto',
          });
        },
      });

      // Mint -> Peach (Command Center)
      ScrollTrigger.create({
        trigger: '#command',
        start: 'top 85%',
        end: 'top 30%',
        scrub: 1,
        onUpdate: (self) => {
          gsap.to(appEl, {
            backgroundColor: gsap.utils.interpolate('#EBF8F1', '#FFEFEA', self.progress),
            duration: 0.1,
            overwrite: 'auto',
          });
        },
      });
    }

    // ========================================================================
    // 1. HERO SCENE: Staged Expansion & Yellow Curtain Wipe
    // ========================================================================
    const heroSection = document.querySelector('.hero-section');
    const heroHeadline = document.querySelector('.hero-headline');
    const heroStatement = document.querySelector('.hero-statement');
    const heroCards = document.querySelectorAll('.hero-card-item');
    const yellowWipe = document.querySelector('.hero-wipe-yellow');
    const heroBlobs = document.querySelectorAll('.hero-bg-blob');

    if (heroSection) {
      // Explicitly guarantee the resting state of all hero elements at scrollY = 0
      if (heroHeadline) gsap.set(heroHeadline, { scale: 1, y: 0, opacity: 1 });
      if (heroStatement) gsap.set(heroStatement, { y: 0, opacity: 1 });
      if (heroCards.length > 0) gsap.set(heroCards, { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });
      if (yellowWipe) gsap.set(yellowWipe, { scale: 0, opacity: 0, autoAlpha: 0, visibility: 'hidden' });
      if (heroBlobs.length > 0) gsap.set(heroBlobs, { opacity: 1 });
      const heroContent = document.querySelector('.hero-composition');
      if (heroContent) gsap.set(heroContent, { opacity: 1 });

      if (!isMobile) {
        const heroTl = gsap.timeline({
          scrollTrigger: {
            trigger: heroSection,
            start: 'top top',
            end: '+=110%',
            scrub: 1,
            pin: true,
            anticipatePin: 1,
          },
        });

        // Phase 1 (0 -> 30%): Hero typography & cards gently separate
        if (heroHeadline) {
          heroTl.to(
            heroHeadline,
            { scale: 1.08, y: -45, ease: 'power1.inOut' },
            0
          );
        }

        if (heroStatement) {
          heroTl.to(
            heroStatement,
            { y: -30, opacity: 0.7, ease: 'power1.inOut' },
            0
          );
        }

        if (heroCards.length >= 3) {
          heroTl.to(
            heroCards[0],
            { x: -35, y: 25, rotation: -3, ease: 'power1.inOut' },
            0
          );
          heroTl.to(
            heroCards[1],
            { x: 35, y: -20, rotation: 3, ease: 'power1.inOut' },
            0
          );
          heroTl.to(
            heroCards[2],
            { x: -15, y: 35, rotation: 2, ease: 'power1.inOut' },
            0
          );
        }

        // Phase 2 (30 -> 75%): Yellow curtain wipe expands from bottom-right
        if (yellowWipe) {
          heroTl.set(yellowWipe, { visibility: 'visible', autoAlpha: 1 }, 0.28);
          heroTl.fromTo(
            yellowWipe,
            {
              scale: 0,
              opacity: 0,
              transformOrigin: 'bottom right',
            },
            {
              scale: 4,
              opacity: 1,
              ease: 'power2.inOut',
            },
            0.3
          );
        }

        // Phase 3 (35 -> 65%): Hero elements fade out cleanly behind the yellow curtain
        if (heroContent) {
          heroTl.to(
            heroContent,
            { opacity: 0, ease: 'power1.in' },
            0.35
          );
        }

        if (heroBlobs.length > 0) {
          heroTl.to(
            heroBlobs,
            { opacity: 0, ease: 'power1.in' },
            0.35
          );
        }
      }
    }

    // ========================================================================
    // 2. SPRINT PULSE: Horizontal Pathway & Staged Milestone Progression
    // ========================================================================
    const pulseSection = document.querySelector('#pulse');
    const pulsePathway = document.querySelector('.pulse-pathway-track');
    const pulseLine = document.querySelectorAll('.pulse-path-line');
    const pulseNodes = document.querySelectorAll('.pulse-node-item');

    if (pulseSection) {
      const pulseTl = gsap.timeline({
        scrollTrigger: {
          trigger: pulseSection,
          start: 'top 75%',
          end: 'bottom 25%',
          scrub: 1,
        },
      });

      // Pathway connective lines draw smoothly
      if (pulseLine.length > 0) {
        pulseTl.fromTo(
          pulseLine,
          { scaleX: 0, transformOrigin: 'left' },
          { scaleX: 1, stagger: 0.15, ease: 'power1.inOut' },
          0.1
        );
      }

      // Nodes pop sequentially with clear staging
      if (pulseNodes.length > 0) {
        pulseNodes.forEach((node, idx) => {
          pulseTl.fromTo(
            node,
            { scale: 0.85, opacity: 0.3, y: 12 },
            { scale: 1, opacity: 1, y: 0, ease: 'power2.out' },
            0.15 + idx * 0.18
          );
        });
      }

      // Subtle horizontal glide
      if (pulsePathway && !isMobile) {
        pulseTl.fromTo(
          pulsePathway,
          { x: 25 },
          { x: -25, ease: 'none' },
          0.1
        );
      }
    }

    // ========================================================================
    // 3. RISK LANDSCAPE: Clean Card Stagger & High-Risk Visual Hierarchy
    // ========================================================================
    const landscapeSection = document.querySelector('#landscape');
    const taskCards = document.querySelectorAll('.task-card-item');

    if (landscapeSection && taskCards.length > 0) {
      const landscapeTl = gsap.timeline({
        scrollTrigger: {
          trigger: landscapeSection,
          start: 'top 70%',
          end: 'center 45%',
          scrub: 1,
        },
      });

      taskCards.forEach((card, idx) => {
        const isHighRisk = card.getAttribute('data-risk') === 'HIGH';

        if (isHighRisk && !isMobile) {
          landscapeTl.fromTo(
            card,
            { scale: 0.94, y: 35, opacity: 0.4 },
            {
              scale: 1.04,
              y: 0,
              opacity: 1,
              zIndex: 5,
              boxShadow: '0 16px 36px rgba(255, 143, 130, 0.2)',
              ease: 'power2.out',
            },
            0.1
          );
        } else {
          landscapeTl.fromTo(
            card,
            { scale: 0.92, y: 40 + idx * 10, opacity: 0.35 },
            {
              scale: 1,
              y: 0,
              opacity: 1,
              ease: 'power2.out',
            },
            0.15 + idx * 0.08
          );
        }
      });
    }

    // ========================================================================
    // 4. ML SECTION: 3 Clear Chapters (Metrics -> Features -> Confusion Matrix)
    // ========================================================================
    const intelligenceSection = document.querySelector('#intelligence');
    const accuracyCard = document.querySelector('.ml-card-accuracy');
    const secondaryMetricCards = document.querySelectorAll('.ml-card-secondary');
    const featureBars = document.querySelectorAll('.feature-bar-fill');
    const matrixCells = document.querySelectorAll('.cm-cell-item');

    if (intelligenceSection) {
      const mlTl = gsap.timeline({
        scrollTrigger: {
          trigger: intelligenceSection,
          start: 'top 70%',
          end: 'bottom 40%',
          scrub: 1,
        },
      });

      // Chapter 1: Model Accuracy & Key Metrics (0 -> 35%)
      if (accuracyCard) {
        mlTl.fromTo(
          accuracyCard,
          { scale: 0.88, opacity: 0.3, y: 30 },
          { scale: 1.02, opacity: 1, y: 0, ease: 'power2.out' },
          0
        );
      }

      if (secondaryMetricCards.length > 0) {
        secondaryMetricCards.forEach((card, idx) => {
          mlTl.fromTo(
            card,
            { scale: 0.9, opacity: 0.3, y: 30 },
            { scale: 1, opacity: 1, y: 0, ease: 'power2.out' },
            0.08 + idx * 0.07
          );
        });
      }

      // Chapter 2: Feature Importance Bar Scrub (35 -> 70%)
      if (featureBars.length > 0) {
        featureBars.forEach((bar, idx) => {
          const targetWidth = bar.getAttribute('data-target-width') || '60%';
          mlTl.fromTo(
            bar,
            { width: '0%' },
            { width: targetWidth, ease: 'power1.inOut' },
            0.35 + idx * 0.06
          );
        });
      }

      // Chapter 3: Confusion Matrix Cell Assembly (65 -> 95%)
      if (matrixCells.length > 0) {
        matrixCells.forEach((cell, idx) => {
          mlTl.fromTo(
            cell,
            { scale: 0.85, opacity: 0.25 },
            { scale: 1, opacity: 1, ease: 'power2.out' },
            0.65 + idx * 0.06
          );
        });
      }
    }

    // ========================================================================
    // 5. COMMAND CENTER: Staged Payoff Reveal
    // ========================================================================
    const commandSection = document.querySelector('#command');
    const commandTitleWords = document.querySelectorAll('.command-title-word');
    const commandBox = document.querySelector('.command-notebook-card');

    if (commandSection) {
      const cmdTl = gsap.timeline({
        scrollTrigger: {
          trigger: commandSection,
          start: 'top 75%',
          end: 'center 45%',
          scrub: 1,
        },
      });

      // Title words reveal cleanly
      if (commandTitleWords.length > 0) {
        commandTitleWords.forEach((word, idx) => {
          const isVoxplan = word.classList.contains('command-word-voxplan');
          cmdTl.fromTo(
            word,
            { y: 20, opacity: 0.2, scale: isVoxplan ? 0.85 : 0.95 },
            { y: 0, opacity: 1, scale: isVoxplan ? 1.08 : 1, ease: 'power2.out' },
            0.08 * idx
          );
        });
      }

      // Assistant command box slides up smoothly
      if (commandBox) {
        cmdTl.fromTo(
          commandBox,
          { y: 40, scale: 0.96, opacity: 0.4 },
          { y: 0, scale: 1, opacity: 1, ease: 'power2.out' },
          0.25
        );
      }
    }

    // ========================================================================
    // 6. Editorial Typography Ribbons (Scene Dividers)
    // ========================================================================
    const ribbonWords = document.querySelectorAll('.editorial-ribbon-word');
    if (ribbonWords.length > 0 && !isMobile) {
      ribbonWords.forEach((ribbon) => {
        gsap.fromTo(
          ribbon,
          { x: 60, opacity: 0.04 },
          {
            x: -60,
            opacity: 0.12,
            ease: 'none',
            scrollTrigger: {
              trigger: ribbon,
              start: 'top 90%',
              end: 'bottom 10%',
              scrub: 1,
            },
          }
        );
      });
    }
  });

  return () => ctx.revert();
}
