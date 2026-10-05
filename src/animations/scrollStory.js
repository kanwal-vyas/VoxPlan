import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Initializes the cinematic scroll storytelling experience across VoxPlan.
 * @param {Object} refs - DOM refs to sections and key animated elements.
 * @returns {Function} cleanup - Function to kill all created GSAP tweens and ScrollTriggers.
 */
export function initCinematicScrollStory(refs = {}) {
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    return () => {};
  }

  const isMobile = window.innerWidth < 768;

  const ctx = gsap.context(() => {
    // ------------------------------------------------------------------------
    // 0. Global Atmosphere Morphing (Background Color Interpolation)
    // ------------------------------------------------------------------------
    const appEl = document.querySelector('.voxplan-app');
    if (appEl) {
      // Cream -> Butter Yellow (Sprint Pulse)
      ScrollTrigger.create({
        trigger: '#pulse',
        start: 'top 80%',
        end: 'top 20%',
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
        start: 'top 75%',
        end: 'top 15%',
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
        start: 'top 75%',
        end: 'top 15%',
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
        start: 'top 75%',
        end: 'top 15%',
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

    // ------------------------------------------------------------------------
    // 1. Hero -> Sprint Pulse Transformation
    // ------------------------------------------------------------------------
    const heroSection = document.querySelector('.hero-section');
    const heroHeadline = document.querySelector('.hero-headline');
    const heroStatement = document.querySelector('.hero-statement');
    const heroCards = document.querySelectorAll('.hero-card-item');
    const heroBlobs = document.querySelectorAll('.hero-bg-blob');
    const yellowWipe = document.querySelector('.hero-wipe-yellow');

    if (heroSection) {
      const heroTl = gsap.timeline({
        scrollTrigger: {
          trigger: heroSection,
          start: 'top top',
          end: isMobile ? 'bottom top' : '+=130%',
          scrub: 1,
          pin: !isMobile,
          anticipatePin: 1,
        },
      });

      // Headline expands and glides upward-left
      if (heroHeadline) {
        heroTl.to(
          heroHeadline,
          {
            scale: isMobile ? 1.05 : 1.18,
            y: isMobile ? -40 : -90,
            x: isMobile ? -10 : -45,
            opacity: 0.25,
            ease: 'power1.inOut',
          },
          0
        );
      }

      if (heroStatement) {
        heroTl.to(
          heroStatement,
          {
            y: isMobile ? -30 : -70,
            opacity: 0.1,
            ease: 'power1.inOut',
          },
          0
        );
      }

      // Hero task cards separate along distinct trajectories
      if (heroCards.length >= 3) {
        heroTl.to(
          heroCards[0],
          {
            x: isMobile ? -30 : -140,
            y: isMobile ? 40 : 120,
            rotation: -10,
            opacity: 0.2,
            scale: 0.9,
            ease: 'power1.inOut',
          },
          0
        );
        heroTl.to(
          heroCards[1],
          {
            x: isMobile ? 30 : 130,
            y: isMobile ? -30 : -80,
            rotation: 8,
            opacity: 0.2,
            scale: 0.9,
            ease: 'power1.inOut',
          },
          0
        );
        heroTl.to(
          heroCards[2],
          {
            x: isMobile ? -15 : -70,
            y: isMobile ? 60 : 160,
            rotation: 6,
            opacity: 0.15,
            scale: 0.85,
            ease: 'power1.inOut',
          },
          0
        );
      }

      // Background pastel shapes drift with heavy parallax
      if (heroBlobs.length > 0) {
        heroTl.to(
          heroBlobs,
          {
            y: (i) => (i + 1) * (isMobile ? 60 : 180),
            x: (i) => (i % 2 === 0 ? 80 : -80),
            scale: 1.4,
            opacity: 0.6,
            ease: 'power1.inOut',
          },
          0
        );
      }

      // Large yellow wipe shape sweeps and expands across the viewport
      if (yellowWipe) {
        heroTl.fromTo(
          yellowWipe,
          {
            scale: 0,
            opacity: 0,
            transformOrigin: 'bottom right',
          },
          {
            scale: isMobile ? 2.5 : 4,
            opacity: 0.95,
            ease: 'power2.inOut',
          },
          0.35
        );
      }
    }

    // ------------------------------------------------------------------------
    // 2. Sprint Pulse: Horizontal Pathway Scrub & Node Progression
    // ------------------------------------------------------------------------
    const pulseSection = document.querySelector('#pulse');
    const pulsePathway = document.querySelector('.pulse-pathway-track');
    const pulseLine = document.querySelector('.pulse-path-line');
    const pulseNodes = document.querySelectorAll('.pulse-node-item');

    if (pulseSection && pulsePathway) {
      const pulseTl = gsap.timeline({
        scrollTrigger: {
          trigger: pulseSection,
          start: 'top 70%',
          end: 'bottom 20%',
          scrub: 1,
        },
      });

      // Horizontal pathway travel
      if (!isMobile) {
        pulseTl.fromTo(
          pulsePathway,
          { x: 60 },
          { x: -40, ease: 'none' },
          0
        );
      }

      // Timeline path draws
      if (pulseLine) {
        pulseTl.fromTo(
          pulseLine,
          { scaleX: 0, transformOrigin: 'left' },
          { scaleX: 1, ease: 'power1.inOut' },
          0.1
        );
      }

      // Nodes stagger and pop into focus
      if (pulseNodes.length > 0) {
        pulseNodes.forEach((node, idx) => {
          pulseTl.fromTo(
            node,
            { scale: 0.8, opacity: 0.3, y: 15 },
            { scale: 1, opacity: 1, y: 0, ease: 'back.out(1.4)' },
            0.15 + idx * 0.2
          );
        });
      }
    }

    // ------------------------------------------------------------------------
    // 3. Risk Landscape: Card Hierarchy & Dominant Card Focus
    // ------------------------------------------------------------------------
    const landscapeSection = document.querySelector('#landscape');
    const taskCards = document.querySelectorAll('.task-card-item');

    if (landscapeSection && taskCards.length > 0) {
      const landscapeTl = gsap.timeline({
        scrollTrigger: {
          trigger: landscapeSection,
          start: 'top 65%',
          end: 'center center',
          scrub: 1,
        },
      });

      // Animate cards into position with high-risk prominence
      taskCards.forEach((card, idx) => {
        const isHighRisk = card.getAttribute('data-risk') === 'HIGH';

        if (isHighRisk && !isMobile) {
          landscapeTl.fromTo(
            card,
            { scale: 0.9, y: 50, opacity: 0.5 },
            {
              scale: 1.05,
              y: 0,
              opacity: 1,
              zIndex: 10,
              boxShadow: '0 20px 40px rgba(255, 143, 130, 0.25)',
              ease: 'power2.out',
            },
            0.1
          );
        } else {
          landscapeTl.fromTo(
            card,
            { scale: 0.88, y: 60 + idx * 20, opacity: 0.4 },
            {
              scale: 1,
              y: 0,
              opacity: 1,
              ease: 'power2.out',
            },
            0.15 + idx * 0.1
          );
        }
      });
    }

    // ------------------------------------------------------------------------
    // 4. ML Intelligence: Central Accuracy Expansion & Metric Assembly
    // ------------------------------------------------------------------------
    const intelligenceSection = document.querySelector('#intelligence');
    const accuracyCard = document.querySelector('.ml-card-accuracy');
    const otherMetricCards = document.querySelectorAll('.ml-card-secondary');
    const featureBars = document.querySelectorAll('.feature-bar-fill');
    const matrixCells = document.querySelectorAll('.cm-cell-item');

    if (intelligenceSection) {
      const mlTl = gsap.timeline({
        scrollTrigger: {
          trigger: intelligenceSection,
          start: 'top 65%',
          end: 'center 40%',
          scrub: 1,
        },
      });

      // Central Accuracy Card expands dramatically from center
      if (accuracyCard) {
        mlTl.fromTo(
          accuracyCard,
          { scale: 0.75, opacity: 0.2, y: 40 },
          { scale: 1.04, opacity: 1, y: 0, ease: 'power2.out' },
          0
        );
      }

      // Secondary metric cards assemble around accuracy
      if (otherMetricCards.length > 0) {
        otherMetricCards.forEach((card, idx) => {
          mlTl.fromTo(
            card,
            { scale: 0.8, opacity: 0.3, y: 50 + idx * 15, x: (idx % 2 === 0 ? -20 : 20) },
            { scale: 1, opacity: 1, y: 0, x: 0, ease: 'power2.out' },
            0.15 + idx * 0.1
          );
        });
      }

      // Feature importance bars scrub outward in sync with scroll
      if (featureBars.length > 0) {
        featureBars.forEach((bar, idx) => {
          const targetWidth = bar.getAttribute('data-target-width') || '60%';
          mlTl.fromTo(
            bar,
            { width: '0%' },
            { width: targetWidth, ease: 'power1.inOut' },
            0.3 + idx * 0.08
          );
        });
      }

      // Confusion matrix cells assemble from unified block into 4 quadrants
      if (matrixCells.length > 0) {
        matrixCells.forEach((cell, idx) => {
          mlTl.fromTo(
            cell,
            { scale: 0.75, opacity: 0.2 },
            { scale: 1, opacity: 1, ease: 'back.out(1.2)' },
            0.4 + idx * 0.08
          );
        });
      }
    }

    // ------------------------------------------------------------------------
    // 5. Command Center: Pinned Hero Payoff Sequence
    // ------------------------------------------------------------------------
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

      // Title words reveal and VOXPLAN expands
      if (commandTitleWords.length > 0) {
        commandTitleWords.forEach((word, idx) => {
          const isVoxplan = word.classList.contains('command-word-voxplan');
          cmdTl.fromTo(
            word,
            { y: 30, opacity: 0.1, scale: isVoxplan ? 0.7 : 0.9 },
            { y: 0, opacity: 1, scale: isVoxplan ? 1.15 : 1, ease: 'power2.out' },
            0.1 * idx
          );
        });
      }

      // Assistant card slides up and expands
      if (commandBox) {
        cmdTl.fromTo(
          commandBox,
          { y: 60, scale: 0.92, opacity: 0.3 },
          { y: 0, scale: 1, opacity: 1, ease: 'power2.out' },
          0.25
        );
      }
    }

    // ------------------------------------------------------------------------
    // 6. Giant Editorial Typography Ribbons (Scene Dividers)
    // ------------------------------------------------------------------------
    const ribbonWords = document.querySelectorAll('.editorial-ribbon-word');
    if (ribbonWords.length > 0 && !isMobile) {
      ribbonWords.forEach((ribbon) => {
        gsap.fromTo(
          ribbon,
          { x: 120, scale: 0.8, opacity: 0.1 },
          {
            x: -120,
            scale: 1.25,
            opacity: 0.22,
            ease: 'none',
            scrollTrigger: {
              trigger: ribbon,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 1,
            },
          }
        );
      });
    }
  });

  return () => ctx.revert();
}
