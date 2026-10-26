import React, { useState, useEffect, useRef } from 'react';

/**
 * VoxPlan Product Landing Page (/)
 *
 * Visually distinctive, responsive landing page presenting VoxPlan's local-first
 * predictive task and schedule intelligence platform.
 */

// Section palette stops for smooth scroll interpolation across Overview
const SECTION_PALETTES = [
  { id: 'hero', color: '#FFF8EF', pos: 0.0 },
  { id: 'features', color: '#FFF9DB', pos: 0.25 },
  { id: 'how-it-works', color: '#F3EEFF', pos: 0.50 },
  { id: 'architecture', color: '#EBF8F1', pos: 0.75 },
  { id: 'cta', color: '#FFEFEA', pos: 1.0 },
];

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function lerpColor(hexA, hexB, t) {
  const clampedT = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const r = Math.round(r1 + (r2 - r1) * clampedT);
  const g = Math.round(g1 + (g2 - g1) * clampedT);
  const b = Math.round(b1 + (b2 - b1) * clampedT);
  return `rgb(${r}, ${g}, ${b})`;
}

function interpolatePaletteColor(progress) {
  const p = Math.max(0, Math.min(1, progress));
  for (let i = 0; i < SECTION_PALETTES.length - 1; i++) {
    const s1 = SECTION_PALETTES[i];
    const s2 = SECTION_PALETTES[i + 1];
    if (p >= s1.pos && p <= s2.pos) {
      const span = s2.pos - s1.pos;
      const localT = span > 0 ? (p - s1.pos) / span : 0;
      return lerpColor(s1.color, s2.color, localT);
    }
  }
  return SECTION_PALETTES[SECTION_PALETTES.length - 1].color;
}

export default function LandingPage({ onNavigate }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState('schedule'); // 'schedule' | 'risk' | 'voice'
  const [previewTimerRunning, setPreviewTimerRunning] = useState(false);
  const [previewTimerSeconds, setPreviewTimerSeconds] = useState(2540); // 42m 20s
  const pageRef = useRef(null);
  const ribbonRefs = useRef({});

  // Passive scroll listener: slow background color transition & moving ribbon words
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = null;
    let isTicking = false;

    const updateScrollStory = () => {
      isTicking = false;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      setScrolled(scrollY > 20);

      if (prefersReducedMotion) {
        if (pageRef.current) {
          pageRef.current.style.setProperty('--overview-bg', '#FFF8EF');
          pageRef.current.style.backgroundColor = '#FFF8EF';
        }
        Object.entries(ribbonRefs.current).forEach(([, el]) => {
          if (!el) return;
          el.style.transform = 'none';
          el.style.opacity = '0.32';
        });
        return;
      }

      const docHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
      const winHeight = window.innerHeight || 1;
      const maxScroll = Math.max(1, docHeight - winHeight);
      const progress = Math.max(0, Math.min(1, scrollY / maxScroll));

      // 1. Slow, continuous background color transition across established pastel palette
      const currentColor = interpolatePaletteColor(progress);
      if (pageRef.current) {
        pageRef.current.style.setProperty('--overview-bg', currentColor);
        pageRef.current.style.backgroundColor = currentColor;
      }

      // 2. Horizontal movement on oversized editorial ribbon words (PLAN, PREDICT, UNDERSTAND, ACT)
      const isMobile = window.innerWidth <= 768;
      const moveDistance = isMobile ? 36 : 70;
      const baseOpacity = isMobile ? 0.26 : 0.28;
      const peakBoost = isMobile ? 0.22 : 0.28;

      Object.entries(ribbonRefs.current).forEach(([, el]) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // Ribbon progress from viewport entry (bottom) to exit (top)
        const ribbonProgress = 1 - (rect.top / (winHeight + rect.height));
        const clamped = Math.max(0, Math.min(1, ribbonProgress));

        // Horizontal glide from +moveDistance to -moveDistance
        const currentX = moveDistance - (clamped * (moveDistance * 2));
        // Opacity: starts at baseOpacity (so always discoverable), peaks at (baseOpacity + peakBoost) in viewport center
        const opacity = baseOpacity + (Math.sin(clamped * Math.PI) * peakBoost);

        el.style.transform = `translate3d(${currentX.toFixed(1)}px, 0, 0)`;
        el.style.opacity = opacity.toFixed(3);
      });
    };

    const onScroll = () => {
      if (!isTicking) {
        isTicking = true;
        rafId = window.requestAnimationFrame(updateScrollStory);
      }
    };

    const onResize = () => {
      if (!isTicking) {
        isTicking = true;
        rafId = window.requestAnimationFrame(updateScrollStory);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    updateScrollStory();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Demo interactive stopwatch tick for the preview card
  useEffect(() => {
    let interval = null;
    if (previewTimerRunning) {
      interval = setInterval(() => {
        setPreviewTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [previewTimerRunning]);

  const formatTimer = (sec) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleOpenApp = () => {
    if (onNavigate) {
      onNavigate('/app');
    } else {
      window.location.pathname = '/app';
    }
  };

  return (
    <div ref={pageRef} className="overview-page" style={styles.page}>
      {/* 1. Header / Navigation */}
      <header
        style={{
          ...styles.header,
          ...(scrolled ? styles.headerScrolled : {}),
        }}
      >
        <div style={styles.headerContainer}>
          {/* Brand */}
          <button
            type="button"
            style={styles.brand}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="VoxPlan home, scroll to top"
          >
            <div style={styles.brandBadge}>
              <span>✦</span>
            </div>
            <span style={styles.brandName}>VOXPLAN</span>
            <span style={styles.taglineNote}>smart notebook</span>
          </button>

          {/* Desktop Nav Links */}
          <nav style={styles.desktopNav} aria-label="Landing Navigation">
            <button type="button" onClick={() => scrollToSection('features')} style={styles.navLink}>
              Features
            </button>
            <button type="button" onClick={() => scrollToSection('how-it-works')} style={styles.navLink}>
              How It Works
            </button>
            <button type="button" onClick={() => scrollToSection('architecture')} style={styles.navLink}>
              Architecture
            </button>
            <button type="button" onClick={() => scrollToSection('safety')} style={styles.navLink}>
              Safety & ML
            </button>
          </nav>

          {/* Header Actions */}
          <div style={styles.headerActions}>
            <button
              type="button"
              id="landing-open-app-nav-btn"
              onClick={handleOpenApp}
              style={styles.openAppBtn}
            >
              <span>Open App</span>
              <span style={styles.btnArrow}>→</span>
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={styles.mobileMenuToggle}
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="landing-mobile-menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div id="landing-mobile-menu" style={styles.mobileMenu}>
            <button type="button" onClick={() => scrollToSection('features')} style={styles.mobileNavLink}>
              Features
            </button>
            <button type="button" onClick={() => scrollToSection('how-it-works')} style={styles.mobileNavLink}>
              How It Works
            </button>
            <button type="button" onClick={() => scrollToSection('architecture')} style={styles.mobileNavLink}>
              Architecture
            </button>
            <button type="button" onClick={() => scrollToSection('safety')} style={styles.mobileNavLink}>
              Safety & ML
            </button>
            <button
              type="button"
              onClick={handleOpenApp}
              style={{ ...styles.openAppBtn, width: '100%', justifyContent: 'center', marginTop: '8px' }}
            >
              Launch App →
            </button>
          </div>
        )}
      </header>

      {/* Main Landmark for Accessibility (WCAG 2.2 1.3.1 Info and Relationships & 2.4.1 Bypass Blocks) */}
      <main id="main-content" tabIndex={-1} style={{ outline: 'none' }}>
        {/* 2. Hero Section */}
        <section style={styles.heroSection}>
        <div style={styles.heroContainer}>
          {/* Eyebrow Pill */}
          <div style={styles.eyebrowPill}>
            <span style={styles.eyebrowSparkle}>✦</span>
            <span style={styles.eyebrowText}>PREDICTIVE TASK & SCHEDULE INTELLIGENCE</span>
          </div>


          {/* Main Headline */}
          <h1 style={styles.heroTitle}>
            <span style={styles.heroTitleLine}>Turn Task Lists Into</span>
            <span style={styles.heroHighlight}>Executable Plans</span>
          </h1>

          {/* Subtitle */}
          <p style={styles.heroSubtitle}>
            Traditional to-do apps are static lists. VoxPlan uses <strong>Kahn’s DAG dependency ordering</strong>,{' '}
            <strong>supervised delay-risk machine learning</strong>, and{' '}
            <strong>empirical Bayesian habit learning</strong> to turn your work into realistic calendar proposals.
            All running 100% locally in your browser with zero third-party cloud LLMs.
          </p>

          {/* Call to Actions */}
          <div style={styles.heroCtaGroup}>
            <button
              type="button"
              id="hero-primary-open-app-btn"
              onClick={handleOpenApp}
              style={styles.heroPrimaryBtn}
            >
              <span>Launch VoxPlan App</span>
              <span style={styles.primaryBtnArrow}>→</span>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('features')}
              style={styles.heroSecondaryBtn}
            >
              <span>Explore Capabilities</span>
              <span>↓</span>
            </button>
          </div>

          {/* Trust & Spec Micro-Tags */}
          <div style={styles.microTagsRow}>
            <span style={styles.microTag}>
              <span style={styles.microTagCheck}>✓</span> Local-First IndexedDB
            </span>
            <span style={styles.microTag}>
              <span style={styles.microTagCheck}>✓</span> 0 Cloud LLM Calls
            </span>
            <span style={styles.microTag}>
              <span style={styles.microTagCheck}>✓</span> Topological DAG Solver
            </span>
            <span style={styles.microTag}>
              <span style={styles.microTagCheck}>✓</span> RFC 5545 .ics Export
            </span>
            <span style={styles.microTag}>
              <span style={styles.microTagCheck}>✓</span> Offline Resilient
            </span>
          </div>
        </div>
      </section>

      {/* 3. Authentic Interactive Product Preview Showcase */}
      <section style={styles.previewSection}>
        <div style={styles.previewContainer}>
          {/* Card Header & Tab Switcher */}
          <div style={styles.previewCardHeader}>
            <div style={styles.previewCardBadge}>
              <span style={styles.previewDotRed} />
              <span style={styles.previewDotYellow} />
              <span style={styles.previewDotGreen} />
              <span style={styles.previewTitleText}>VoxPlan Interactive System Architecture</span>
            </div>
            <div
              style={styles.previewTabs}
              role="tablist"
              aria-label="Interactive demonstration showcase tabs"
              onKeyDown={(e) => {
                const tabs = ['schedule', 'risk', 'voice'];
                const idx = tabs.indexOf(activePreviewTab);
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  const nextTab = tabs[(idx + 1) % tabs.length];
                  setActivePreviewTab(nextTab);
                  document.getElementById(`preview-tab-${nextTab}`)?.focus();
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const prevTab = tabs[(idx - 1 + tabs.length) % tabs.length];
                  setActivePreviewTab(prevTab);
                  document.getElementById(`preview-tab-${prevTab}`)?.focus();
                }
              }}
            >
              <button
                type="button"
                role="tab"
                id="preview-tab-schedule"
                aria-selected={activePreviewTab === 'schedule'}
                aria-controls="preview-panel-schedule"
                tabIndex={activePreviewTab === 'schedule' ? 0 : -1}
                onClick={() => setActivePreviewTab('schedule')}
                style={{
                  ...styles.previewTabBtn,
                  ...(activePreviewTab === 'schedule' ? styles.previewTabBtnActive : {}),
                }}
              >
                Adaptive Schedule
              </button>
              <button
                type="button"
                role="tab"
                id="preview-tab-risk"
                aria-selected={activePreviewTab === 'risk'}
                aria-controls="preview-panel-risk"
                tabIndex={activePreviewTab === 'risk' ? 0 : -1}
                onClick={() => setActivePreviewTab('risk')}
                style={{
                  ...styles.previewTabBtn,
                  ...(activePreviewTab === 'risk' ? styles.previewTabBtnActive : {}),
                }}
              >
                ML Risk & Stopwatch
              </button>
              <button
                type="button"
                role="tab"
                id="preview-tab-voice"
                aria-selected={activePreviewTab === 'voice'}
                aria-controls="preview-panel-voice"
                tabIndex={activePreviewTab === 'voice' ? 0 : -1}
                onClick={() => setActivePreviewTab('voice')}
                style={{
                  ...styles.previewTabBtn,
                  ...(activePreviewTab === 'voice' ? styles.previewTabBtnActive : {}),
                }}
              >
                Voice & Commands
              </button>
            </div>
          </div>

          {/* Tab 1: Adaptive Schedule Preview */}
          {activePreviewTab === 'schedule' && (
            <div
              role="tabpanel"
              id="preview-panel-schedule"
              aria-labelledby="preview-tab-schedule"
              tabIndex={0}
              style={styles.previewBody}
            >
              <div style={styles.previewLeftCol}>
                <div style={styles.previewCardTitleWrap}>
                  <span style={styles.stickerYellow}>Topological Ready-Queue</span>
                  <h3 style={styles.previewHeading}>Kahn’s Algorithm + Daily Capacity Bin-Packing</h3>
                </div>
                <p style={styles.previewDesc}>
                  VoxPlan evaluates the Directed Acyclic Graph (DAG) of task prerequisites. Tasks are allocated
                  strictly into working weekdays up to your configured daily working hours limit (e.g. 6.0h/day) with
                  automatic multi-day chunking for oversized work.
                </p>

                <div style={styles.metricCard}>
                  <div style={styles.metricRow}>
                    <span style={styles.metricLabel}>Daily Workload Capacity:</span>
                    <span style={styles.metricVal}>6.0 h / day</span>
                  </div>
                  <div style={styles.metricRow}>
                    <span style={styles.metricLabel}>Cumulative Capacity Utilization:</span>
                    <span style={styles.metricValHighlight}>91.7% (Optimal)</span>
                  </div>
                  <div style={styles.capacityProgressBar}>
                    <div style={{ ...styles.capacityProgressFill, width: '91.7%' }} />
                  </div>
                </div>

                <div style={styles.previewActions}>
                  <button type="button" onClick={handleOpenApp} style={styles.previewLaunchBtn}>
                    Try Adaptive Scheduler in App →
                  </button>
                </div>
              </div>

              <div style={styles.previewRightCol}>
                <div style={styles.mockScheduleContainer}>
                  <div style={styles.mockScheduleHeader}>
                    <span style={styles.mockScheduleTag}>PROPOSED EXECUTION PLAN</span>
                    <span style={styles.mockScheduleStatus}>Zero Conflict Feasible</span>
                  </div>

                  {/* Day 1 */}
                  <div style={styles.mockDaySlot}>
                    <div style={styles.mockDayLabel}>
                      <span style={styles.mockDayName}>Mon, Oct 20</span>
                      <span style={styles.mockDayHours}>5.5h / 6.0h</span>
                    </div>
                    <div style={styles.mockTaskBlock}>
                      <div style={styles.mockTaskPillHigh}>High Priority</div>
                      <div style={styles.mockTaskTitle}>Review weekly project plan & deliverables</div>
                      <div style={styles.mockTaskMeta}>2.0h • Unblocks 1 dependent</div>
                    </div>
                    <div style={styles.mockTaskBlock}>
                      <div style={styles.mockTaskPillMed}>Medium</div>
                      <div style={styles.mockTaskTitle}>Draft architecture audit documentation (Part 1/2)</div>
                      <div style={styles.mockTaskMeta}>3.5h • Chunk 1 of 8.0h task</div>
                    </div>
                  </div>

                  {/* Day 2 */}
                  <div style={styles.mockDaySlot}>
                    <div style={styles.mockDayLabel}>
                      <span style={styles.mockDayName}>Tue, Oct 21</span>
                      <span style={styles.mockDayHours}>5.0h / 6.0h</span>
                    </div>
                    <div style={styles.mockTaskBlock}>
                      <div style={styles.mockTaskPillMed}>Medium</div>
                      <div style={styles.mockTaskTitle}>Draft architecture audit documentation (Part 2/2)</div>
                      <div style={styles.mockTaskMeta}>4.5h • Prerequisite satisfied</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: ML Risk & Stopwatch Preview */}
          {activePreviewTab === 'risk' && (
            <div
              role="tabpanel"
              id="preview-panel-risk"
              aria-labelledby="preview-tab-risk"
              tabIndex={0}
              style={styles.previewBody}
            >
              <div style={styles.previewLeftCol}>
                <div style={styles.previewCardTitleWrap}>
                  <span style={styles.stickerMint}>Supervised ML + Bayesian Pace</span>
                  <h3 style={styles.previewHeading}>Delivery Risk Prediction & Stopwatch Focus</h3>
                </div>
                <p style={styles.previewDesc}>
                  Every task is scored against a trained Random Forest model evaluating days remaining, workload
                  pressure, and task complexity. Meanwhile, an interactive stopwatch tracks actual focused seconds to
                  calibrate your personal Bayesian pace multiplier ($K = 3.0$) with zero remote surveillance.
                </p>

                <div style={styles.stopwatchCard}>
                  <div style={styles.stopwatchHeader}>
                    <span style={styles.stopwatchTitle}>Interactive Focus Stopwatch</span>
                    <span style={previewTimerRunning ? styles.timerRunningBadge : styles.timerPausedBadge}>
                      {previewTimerRunning ? 'ACTIVE FOCUS' : 'PAUSED'}
                    </span>
                  </div>
                  <div style={styles.stopwatchDigits}>{formatTimer(previewTimerSeconds)}</div>
                  <div style={styles.stopwatchControls}>
                    <button
                      type="button"
                      onClick={() => setPreviewTimerRunning(!previewTimerRunning)}
                      style={previewTimerRunning ? styles.pauseBtn : styles.startBtn}
                      aria-label={previewTimerRunning ? 'Pause demonstration stopwatch' : 'Start demonstration stopwatch'}
                    >
                      {previewTimerRunning ? '⏸ Pause Timer' : '▶ Start Tracking'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewTimerRunning(false);
                        setPreviewTimerSeconds(0);
                      }}
                      style={styles.resetBtn}
                      aria-label="Reset demonstration stopwatch"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              <div style={styles.previewRightCol}>
                <div style={styles.mockRiskCard}>
                  <div style={styles.mockRiskHeader}>
                    <div style={styles.mockRiskTagRow}>
                      <span style={styles.mockTagLavender}>Task Detail</span>
                      <span style={styles.mockRiskPillHigh}>Risk: 78% HIGH</span>
                    </div>
                    <span style={styles.mockGiniScore}>Gini Weight: 0.38</span>
                  </div>

                  <h4 style={styles.mockRiskTaskTitle}>Refactor client date formatting utilities</h4>
                  <p style={styles.mockRiskTaskDesc}>
                    Unified ISO-8601 calendar date parsing across interface cards.
                  </p>

                  <div style={styles.riskBreakdownBox}>
                    <div style={styles.riskBreakdownTitle}>Contributing Risk Factors (Random Forest + Telemetry):</div>
                    <div style={styles.riskFactorItem}>
                      <span style={styles.factorDotRed}>●</span>
                      <span>High workload pressure (3 competing commitments due in 48 hours)</span>
                    </div>
                    <div style={styles.riskFactorItem}>
                      <span style={styles.factorDotYellow}>●</span>
                      <span>Personal estimation bias factor: User historically takes 1.25x longer on Maintenance</span>
                    </div>
                    <div style={styles.riskFactorItem}>
                      <span style={styles.factorDotGreen}>●</span>
                      <span>Downstream unblock incentive: 0 pending dependencies</span>
                    </div>
                  </div>

                  <div style={styles.previewCardCta}>
                    <button type="button" onClick={handleOpenApp} style={styles.previewLaunchBtn}>
                      Inspect Full ML Model Panel in App →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Voice & Natural Language Commands */}
          {activePreviewTab === 'voice' && (
            <div
              role="tabpanel"
              id="preview-panel-voice"
              aria-labelledby="preview-tab-voice"
              tabIndex={0}
              style={styles.previewBody}
            >
              <div style={styles.previewLeftCol}>
                <div style={styles.previewCardTitleWrap}>
                  <span style={styles.stickerPeach}>Voice + Typed Symmetry</span>
                  <h3 style={styles.previewHeading}>Conversational Planning & Clarification Dialogue</h3>
                </div>
                <p style={styles.previewDesc}>
                  Speak or type naturally. VoxPlan uses the browser’s Web Speech API paired with a deterministic
                  multi-turn dialogue manager. Destructive actions require explicit confirmation, and ambiguous task
                  names prompt immediate clarification.
                </p>

                <div style={styles.dialogueBox}>
                  <div style={styles.dialogueUser}>
                    <strong>User:</strong> &quot;Move the English assignment to tomorrow&quot;
                  </div>
                  <div style={styles.dialogueAssistant}>
                    <strong>VoxPlan:</strong> &quot;I found 2 tasks matching &apos;English&apos;. Did you mean &apos;English Essay Draft&apos; (due today) or &apos;English Vocabulary Quiz&apos; (due Friday)?&quot;
                  </div>
                  <div style={styles.dialogueUser}>
                    <strong>User:</strong> &quot;The essay draft&quot;
                  </div>
                  <div style={styles.dialogueAssistant}>
                    <strong>VoxPlan:</strong> &quot;Rescheduled &apos;English Essay Draft&apos; to tomorrow (Oct 21).&quot;
                  </div>
                </div>
              </div>

              <div style={styles.previewRightCol}>
                <div style={styles.commandShowcaseCard}>
                  <div style={styles.commandHeader}>
                    <span style={styles.commandBadge}>Supported Command Capabilities</span>
                  </div>
                  <ul style={styles.commandList}>
                    <li>✦ <strong>Task Creation:</strong> &quot;Add task Finish presentation due Friday estimated 3 hours&quot;</li>
                    <li>✦ <strong>Batch Rescheduling:</strong> &quot;Push all overdue tasks to Monday&quot;</li>
                    <li>✦ <strong>Time-Blocking:</strong> &quot;Set working hours 9am to 5pm with lunch blackout at 12pm&quot;</li>
                    <li>✦ <strong>Decision Queries:</strong> &quot;Why was the architecture task split across two days?&quot;</li>
                    <li>✦ <strong>Schedule Acceptance:</strong> &quot;Accept proposal&quot; or &quot;Discard schedule&quot;</li>
                  </ul>
                  <button type="button" onClick={handleOpenApp} style={styles.previewLaunchBtn}>
                    Try Voice Commands in App →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Editorial Word Ribbon: PLAN */}
      <div className="overview-ribbon-wrap" aria-hidden="true">
        <span
          className="overview-ribbon-word"
          ref={(el) => {
            ribbonRefs.current.plan = el;
          }}
        >
          PLAN
        </span>
      </div>

      {/* 4. Features Grid (Only Implemented Capabilities) */}
      <section id="features" style={styles.featuresSection}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionBadge}>CORE CAPABILITIES</div>
          <h2 style={styles.sectionTitle}>Engineered for Real-World Productivity</h2>
          <p style={styles.sectionSubtitle}>
            Every feature in VoxPlan is implemented, mathematically grounded, and covered by 832 automated tests.
          </p>
        </div>

        <div style={styles.featuresGrid}>
          {/* Feature 1 */}
          <div style={styles.featureCard}>
            <div style={styles.featureIconBadgeYellow}>01</div>
            <h3 style={styles.featureCardTitle}>Deterministic DAG Scheduling</h3>
            <p style={styles.featureCardDesc}>
              Resolves complex task dependency graphs with Kahn’s topological sort and 3-color DFS cycle detection.
              Downstream unblocking bonuses (+15 pts/dep) reward critical paths without penalizing ready siblings.
            </p>
            <div style={styles.featureTag}>Kahn Topological Ready-Queue</div>
          </div>

          {/* Feature 2 */}
          <div style={styles.featureCard}>
            <div style={styles.featureIconBadgeMint}>02</div>
            <h3 style={styles.featureCardTitle}>Supervised ML Delay-Risk</h3>
            <p style={styles.featureCardDesc}>
              Random Forest classifier predicting delivery risk (88.3% accuracy, 92.9% F1) based on remaining calendar
              days, workload density, and effort. Displays Gini feature importances with transparent factor breakdowns.
            </p>
            <div style={styles.featureTag}>scikit-learn RandomForest</div>
          </div>

          {/* Feature 3 */}
          <div style={styles.featureCard}>
            <div style={styles.featureIconBadgeLavender}>03</div>
            <h3 style={styles.featureCardTitle}>Empirical Bayesian Pace Learning</h3>
            <p style={styles.featureCardDesc}>
              Personal duration model computing weighted median ratios with empirical Bayesian shrinkage ($K = 3.0$).
              Validated via strict chronological walk-forward holdout testing ($N \ge 8$) to avoid target leakage.
            </p>
            <div style={styles.featureTag}>Bayesian Shrinkage Model</div>
          </div>

          {/* Feature 4 */}
          <div style={styles.featureCard}>
            <div style={styles.featureIconBadgePeach}>04</div>
            <h3 style={styles.featureCardTitle}>Conversational & Voice Planning</h3>
            <p style={styles.featureCardDesc}>
              Natural language command parser paired with browser Web Speech API dictation and speech synthesis. Full
              typed symmetry, multi-turn clarification dialogs, and confirmation prompts for destructive commands.
            </p>
            <div style={styles.featureTag}>Web Speech API + Dialogue State Machine</div>
          </div>

          {/* Feature 5 */}
          <div style={styles.featureCard}>
            <div style={styles.featureIconBadgeSky}>05</div>
            <h3 style={styles.featureCardTitle}>Time-Blocking & Task Chunking</h3>
            <p style={styles.featureCardDesc}>
              Solves intraday availability using half-open intervals $[start, end)$ avoiding meeting blackouts.
              Automatically chunks oversized tasks across multiple eligible days while preserving parent task identity.
            </p>
            <div style={styles.featureTag}>Intraday Half-Open Interval Solver</div>
          </div>

          {/* Feature 6 */}
          <div style={styles.featureCard}>
            <div style={styles.featureIconBadgeYellow}>06</div>
            <h3 style={styles.featureCardTitle}>Visual Editing & .ics Calendar Export</h3>
            <p style={styles.featureCardDesc}>
              Interactive proposal canvas allowing manual day/time drag overrides with live constraint re-validation,
              Undo/Revert stack, and one-click RFC 5545 standard `.ics` export for Google Calendar or Apple iCal.
            </p>
            <div style={styles.featureTag}>RFC 5545 iCalendar Standard</div>
          </div>
        </div>
      </section>

      {/* Editorial Word Ribbon: PREDICT */}
      <div className="overview-ribbon-wrap" aria-hidden="true">
        <span
          className="overview-ribbon-word"
          ref={(el) => {
            ribbonRefs.current.predict = el;
          }}
        >
          PREDICT
        </span>
      </div>

      {/* 5. How It Works Section */}
      <section id="how-it-works" style={styles.howSection}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionBadge}>WORKFLOW</div>
          <h2 style={styles.sectionTitle}>How VoxPlan Works in 4 Steps</h2>
          <p style={styles.sectionSubtitle}>
            From messy to-do lists to structured, calendar-synced execution plans in minutes.
          </p>
        </div>

        <div style={styles.timelineGrid}>
          {/* Step 1 */}
          <div style={styles.timelineCard}>
            <div style={styles.stepNumber}>1</div>
            <h3 style={styles.stepTitle}>Capture & Structure</h3>
            <p style={styles.stepDesc}>
              Enter tasks with natural calendar due dates, effort estimates, and prerequisite dependencies. Use typed
              commands or voice dictation directly from your keyboard.
            </p>
          </div>

          {/* Step 2 */}
          <div style={styles.timelineCard}>
            <div style={styles.stepNumber}>2</div>
            <h3 style={styles.stepTitle}>Track & Calibrate</h3>
            <p style={styles.stepDesc}>
              Start the focus stopwatch when you sit down to work. VoxPlan honestly distinguishes tracked duration from
              self-reported estimates to calibrate your individual pace factor.
            </p>
          </div>

          {/* Step 3 */}
          <div style={styles.timelineCard}>
            <div style={styles.stepNumber}>3</div>
            <h3 style={styles.stepTitle}>Solve Constraints</h3>
            <p style={styles.stepDesc}>
              Click <strong>Adaptive Schedule</strong>. The engine evaluates topological prerequisites, clamps to daily
              working capacity, skips weekends, and carves out meeting blackout buffers.
            </p>
          </div>

          {/* Step 4 */}
          <div style={styles.timelineCard}>
            <div style={styles.stepNumber}>4</div>
            <h3 style={styles.stepTitle}>Fine-Tune & Export</h3>
            <p style={styles.stepDesc}>
              Inspect the visual proposal canvas. Drag sessions to adjust dates or times with live feasibility checking,
              apply the schedule, and export an RFC 5545 `.ics` file for your external calendar.
            </p>
          </div>
        </div>
      </section>

      {/* Editorial Word Ribbon: UNDERSTAND */}
      <div className="overview-ribbon-wrap" aria-hidden="true">
        <span
          className="overview-ribbon-word"
          ref={(el) => {
            ribbonRefs.current.understand = el;
          }}
        >
          UNDERSTAND
        </span>
      </div>

      {/* 6. Local-First Privacy & Safety Architecture */}
      <section id="architecture" style={styles.safetySection}>
        <div style={styles.sectionHeader}>
          <div style={styles.sectionBadge}>PRIVACY & SAFETY FIRST</div>
          <h2 style={styles.sectionTitle}>Built on Principled Boundaries</h2>
          <p style={styles.sectionSubtitle}>
            Your schedule and tasks contain sensitive personal context. VoxPlan treats privacy as a foundational constraint.
          </p>
        </div>

        <div style={styles.comparisonTableCard}>
          <table style={styles.comparisonTable}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                <th style={styles.tableHeaderCell}>Architectural Dimension</th>
                <th style={styles.tableHeaderCellBad}>Traditional Cloud SaaS Planners</th>
                <th style={styles.tableHeaderCellGood}>✦ VoxPlan Local-First Architecture</th>
              </tr>
            </thead>
            <tbody>
              <tr style={styles.tableRow}>
                <td style={styles.tableCellLabel}>Task & Telemetry Storage</td>
                <td style={styles.tableCellBad}>Remote cloud database with user tracking</td>
                <td style={styles.tableCellGood}>100% in-browser IndexedDB (`voxplan_db`)</td>
              </tr>
              <tr style={styles.tableRow}>
                <td style={styles.tableCellLabel}>AI / LLM Integration</td>
                <td style={styles.tableCellBad}>Tasks transmitted to third-party cloud LLM APIs</td>
                <td style={styles.tableCellGood}>0 Cloud LLMs — Deterministic local grammar + local scikit-learn</td>
              </tr>
              <tr style={styles.tableRow}>
                <td style={styles.tableCellLabel}>User Accounts & Identity</td>
                <td style={styles.tableCellBad}>Mandatory login, social tracking & data profiling</td>
                <td style={styles.tableCellGood}>Anonymous, client-generated profile UUID (`prof_...`)</td>
              </tr>
              <tr style={styles.tableRow}>
                <td style={styles.tableCellLabel}>Algorithm Adaptation</td>
                <td style={styles.tableCellBad}>Unchecked silent weight drifting</td>
                <td style={styles.tableCellGood}>Immutable factory weights (`50.0`, `100.0`, `15.0`, `25.0`) with shadow-only sandbox</td>
              </tr>
              <tr style={styles.tableRow}>
                <td style={styles.tableCellLabel}>Production Activation Gate</td>
                <td style={styles.tableCellBad}>Heuristic auto-switching without validation</td>
                <td style={styles.tableCellGood}>Fail-closed activation gate; rejects synthetic evidence in production</td>
              </tr>
              <tr style={styles.tableRow}>
                <td style={styles.tableCellLabel}>Offline Functionality</td>
                <td style={styles.tableCellBad}>Fails or freezes without internet connectivity</td>
                <td style={styles.tableCellGood}>Full task management, timers, and scheduling operate 100% offline</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Editorial Word Ribbon: ACT */}
      <div className="overview-ribbon-wrap" aria-hidden="true">
        <span
          className="overview-ribbon-word"
          ref={(el) => {
            ribbonRefs.current.act = el;
          }}
        >
          ACT
        </span>
      </div>

      {/* 7. Final Call to Action */}
      <section style={styles.ctaSection}>
        <div style={styles.ctaCard}>
          <div style={styles.ctaBadge}>GET STARTED IN SECONDS</div>
          <h2 style={styles.ctaTitle}>Experience Predictive Planning Today</h2>
          <p style={styles.ctaDesc}>
            No registration required. Open the application and click <strong>⚡ Demo Seed</strong> to explore calibrated
            historical telemetry, or start fresh with your own genuine commitments.
          </p>
          <div style={styles.ctaBtnGroup}>
            <button
              type="button"
              id="landing-bottom-open-app-btn"
              onClick={handleOpenApp}
              style={styles.ctaPrimaryBtn}
            >
              <span>Launch VoxPlan Productivity App</span>
              <span style={styles.primaryBtnArrow}>→</span>
            </button>
          </div>
        </div>
      </section>
      </main>

      {/* 8. Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContainer}>
          <div style={styles.footerBrandCol}>
            <div style={styles.brand}>
              <div style={styles.brandBadge}>
                <span>✦</span>
              </div>
              <span style={styles.brandName}>VOXPLAN</span>
            </div>
            <p style={styles.footerTagline}>
              Local-first predictive task management and adaptive scheduling intelligence.
            </p>
          </div>

          <div style={styles.footerLinksCol}>
            <span style={styles.footerLinksHeading}>Navigation</span>
            <button type="button" onClick={handleOpenApp} style={styles.footerLinkBtn}>
              Productivity App (/app)
            </button>
            <button type="button" onClick={() => scrollToSection('features')} style={styles.footerLinkBtn}>
              Features
            </button>
            <button type="button" onClick={() => scrollToSection('how-it-works')} style={styles.footerLinkBtn}>
              How It Works
            </button>
          </div>

          <div style={styles.footerLinksCol}>
            <span style={styles.footerLinksHeading}>Documentation & Code</span>
            <a
              href="https://github.com/kanwal-vyas/VoxPlan"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.footerLink}
            >
              GitHub Repository ↗
            </a>
            <button type="button" onClick={() => scrollToSection('safety')} style={styles.footerLinkBtn}>
              Safety & ML Architecture
            </button>
          </div>
        </div>

        <div style={styles.footerBottom}>
          <p style={styles.copyrightText}>
            © 2026 VoxPlan. Open source personal productivity software under the MIT license.
          </p>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    color: '#25242A',
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    backgroundColor: 'var(--overview-bg, #FFF8EF)',
    transition: 'background-color 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
    willChange: 'background-color',
    lineHeight: 1.6,
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    padding: '16px 24px',
    transition: 'all 0.2s ease',
  },
  headerScrolled: {
    backgroundColor: 'rgba(255, 248, 239, 0.92)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 4px 20px rgba(37, 36, 42, 0.06)',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
  },
  headerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
    textAlign: 'left',
  },
  brandBadge: {
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    backgroundColor: '#FFE58A',
    border: '1px solid rgba(37, 36, 42, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    color: '#25242A',
    boxShadow: '0 2px 0 rgba(37, 36, 42, 0.8)',
  },
  brandName: {
    fontFamily: "var(--font-wordmark, 'Trade Winds', cursive)",
    fontSize: '20px',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    color: '#25242A',
  },
  taglineNote: {
    fontFamily: "var(--font-accent, 'Bigelow Rules', cursive)",
    fontSize: '17px',
    color: '#7A7782',
    fontWeight: '600',
    marginLeft: '2px',
  },
  desktopNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    padding: '4px 6px',
    borderRadius: '9999px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
  },
  navLink: {
    background: 'transparent',
    border: 'none',
    color: '#4A4852',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: '6px 14px',
    borderRadius: '9999px',
    transition: 'all 0.15s ease',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  openAppBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFE58A',
    color: '#25242A',
    border: '1px solid rgba(37, 36, 42, 0.15)',
    borderRadius: '9999px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 0 rgba(37, 36, 42, 0.8)',
    transition: 'all 0.15s ease',
  },
  btnArrow: {
    fontSize: '14px',
    fontWeight: 'bold',
  },
  mobileMenuToggle: {
    display: 'none',
    background: 'none',
    border: '1px solid rgba(37, 36, 42, 0.15)',
    borderRadius: '8px',
    fontSize: '18px',
    padding: '6px 10px',
    cursor: 'pointer',
  },
  mobileMenu: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '16px',
    marginTop: '12px',
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)',
  },
  mobileNavLink: {
    background: 'none',
    border: 'none',
    textAlign: 'left',
    padding: '10px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#25242A',
    cursor: 'pointer',
  },

  /* Hero Section */
  heroSection: {
    padding: '60px 24px 40px',
    textAlign: 'center',
  },
  heroContainer: {
    maxWidth: '860px',
    margin: '0 auto',
  },
  eyebrowPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    border: '1px solid rgba(37, 36, 42, 0.12)',
    borderRadius: '9999px',
    padding: '6px 14px',
    marginBottom: '20px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
  },
  eyebrowSparkle: {
    color: '#E09F3E',
    fontSize: '12px',
  },
  eyebrowText: {
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: "var(--font-compact, 'Unica One', cursive, sans-serif)",
    letterSpacing: '0.08em',
    color: '#4A4852',
  },
  heroTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, serif)",
    fontSize: 'clamp(32px, 5.2vw, 58px)',
    fontWeight: '800',
    lineHeight: 1.35,
    letterSpacing: '-0.02em',
    color: '#25242A',
    margin: '0 0 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
  },
  heroTitleLine: {
    display: 'block',
    lineHeight: 1.25,
  },
  heroHighlight: {
    display: 'inline-block',
    backgroundColor: '#FFE58A',
    padding: '4px 18px',
    borderRadius: '12px',
    lineHeight: 1.25,
    boxShadow: '0 2px 8px rgba(224, 159, 62, 0.18)',
  },
  heroSubtitle: {
    fontSize: 'clamp(16px, 2vw, 19px)',
    color: '#4A4852',
    lineHeight: 1.6,
    maxWidth: '740px',
    margin: '0 auto 32px',
    fontWeight: '500',
  },
  heroCtaGroup: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    flexWrap: 'wrap',
    marginBottom: '36px',
  },
  heroPrimaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#FFE58A',
    color: '#25242A',
    border: '2px solid #25242A',
    borderRadius: '9999px',
    padding: '14px 32px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 0 #25242A',
    transition: 'all 0.15s ease',
  },
  primaryBtnArrow: {
    fontSize: '18px',
  },
  heroSecondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    color: '#4A4852',
    border: '1px solid rgba(37, 36, 42, 0.15)',
    borderRadius: '9999px',
    padding: '14px 26px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  microTagsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    paddingTop: '10px',
  },
  microTag: {
    fontSize: '13px',
    color: '#625F69',
    fontWeight: '600',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  microTagCheck: {
    color: '#3EA370',
    fontWeight: 'bold',
  },

  /* Preview Section */
  previewSection: {
    padding: '20px 24px 60px',
  },
  previewContainer: {
    maxWidth: '1100px',
    margin: '0 auto',
    backgroundColor: '#FFFFFF',
    borderRadius: '24px',
    border: '2px solid rgba(37, 36, 42, 0.12)',
    boxShadow: '0 16px 40px rgba(37, 36, 42, 0.07)',
    overflow: 'hidden',
  },
  previewCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    backgroundColor: '#F8F6F0',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
    flexWrap: 'wrap',
    gap: '12px',
  },
  previewCardBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  previewDotRed: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#FF8F82',
  },
  previewDotYellow: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#FFE58A',
  },
  previewDotGreen: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    backgroundColor: '#BFE8D0',
  },
  previewTitleText: {
    fontSize: '12px',
    fontWeight: '700',
    fontFamily: "'JetBrains Mono', monospace",
    color: '#625F69',
    marginLeft: '6px',
  },
  previewTabs: {
    display: 'flex',
    gap: '6px',
  },
  previewTabBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    padding: '6px 14px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#625F69',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  previewTabBtnActive: {
    backgroundColor: '#FFFFFF',
    color: '#25242A',
    fontWeight: '700',
    boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
  },
  previewBody: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '32px',
    padding: '36px',
    alignItems: 'center',
  },
  previewLeftCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  previewRightCol: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  previewCardTitleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  stickerYellow: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFE58A',
    color: '#5C4100',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  stickerMint: {
    alignSelf: 'flex-start',
    backgroundColor: '#BFE8D0',
    color: '#155230',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  stickerPeach: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFD8C7',
    color: '#6A2A12',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  previewHeading: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, serif)",
    fontSize: '24px',
    fontWeight: '800',
    color: '#25242A',
    margin: 0,
    lineHeight: 1.25,
  },
  previewDesc: {
    fontSize: '14px',
    color: '#4A4852',
    lineHeight: 1.6,
    margin: 0,
  },
  metricCard: {
    backgroundColor: '#FBF9F5',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    borderRadius: '14px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
  },
  metricLabel: {
    color: '#625F69',
    fontWeight: '500',
  },
  metricVal: {
    fontWeight: '700',
    color: '#25242A',
  },
  metricValHighlight: {
    fontWeight: '700',
    color: '#3EA370',
  },
  capacityProgressBar: {
    height: '8px',
    backgroundColor: 'rgba(37, 36, 42, 0.06)',
    borderRadius: '9999px',
    overflow: 'hidden',
    marginTop: '4px',
  },
  capacityProgressFill: {
    height: '100%',
    backgroundColor: '#3EA370',
    borderRadius: '9999px',
  },
  previewActions: {
    marginTop: '8px',
  },
  previewLaunchBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'none',
    border: 'none',
    color: '#5B35C2',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: '4px 0',
  },
  mockScheduleContainer: {
    backgroundColor: '#FFFDF9',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '16px',
    padding: '18px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
  },
  mockScheduleHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
  },
  mockScheduleTag: {
    fontSize: '10px',
    fontWeight: '800',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.05em',
    color: '#7A7782',
  },
  mockScheduleStatus: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#3EA370',
    backgroundColor: '#EBF8F1',
    padding: '2px 8px',
    borderRadius: '9999px',
  },
  mockDaySlot: {
    marginBottom: '14px',
  },
  mockDayLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    fontWeight: '700',
    color: '#4A4852',
    marginBottom: '6px',
  },
  mockDayName: {
    color: '#25242A',
  },
  mockDayHours: {
    color: '#7A7782',
  },
  mockTaskBlock: {
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    borderRadius: '10px',
    padding: '10px 12px',
    marginBottom: '6px',
  },
  mockTaskPillHigh: {
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: '700',
    color: '#C0382B',
    backgroundColor: '#FFEAE8',
    padding: '1px 6px',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  mockTaskPillMed: {
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: '700',
    color: '#9C6500',
    backgroundColor: '#FFF4D6',
    padding: '1px 6px',
    borderRadius: '4px',
    marginBottom: '4px',
  },
  mockTaskTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#25242A',
    marginBottom: '2px',
  },
  mockTaskMeta: {
    fontSize: '11px',
    color: '#7A7782',
  },

  /* Stopwatch Mock */
  stopwatchCard: {
    backgroundColor: '#FDFCF7',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '16px',
    padding: '20px',
    textAlign: 'center',
  },
  stopwatchHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  stopwatchTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#625F69',
  },
  timerRunningBadge: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#155230',
    backgroundColor: '#BFE8D0',
    padding: '2px 8px',
    borderRadius: '9999px',
  },
  timerPausedBadge: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#625F69',
    backgroundColor: '#EBE9E1',
    padding: '2px 8px',
    borderRadius: '9999px',
  },
  stopwatchDigits: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '38px',
    fontWeight: '700',
    color: '#25242A',
    letterSpacing: '0.04em',
    marginBottom: '16px',
  },
  stopwatchControls: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'center',
  },
  startBtn: {
    backgroundColor: '#BFE8D0',
    color: '#155230',
    border: '1px solid rgba(21, 82, 48, 0.2)',
    borderRadius: '9999px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  pauseBtn: {
    backgroundColor: '#FFE58A',
    color: '#5C4100',
    border: '1px solid rgba(92, 65, 0, 0.2)',
    borderRadius: '9999px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  resetBtn: {
    backgroundColor: 'transparent',
    color: '#7A7782',
    border: '1px solid rgba(37, 36, 42, 0.15)',
    borderRadius: '9999px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  mockRiskCard: {
    backgroundColor: '#FFFDF9',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '16px',
    padding: '20px',
  },
  mockRiskHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  mockRiskTagRow: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  mockTagLavender: {
    fontSize: '10px',
    fontWeight: '700',
    backgroundColor: '#E4DEFF',
    color: '#4B35A0',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  mockRiskPillHigh: {
    fontSize: '10px',
    fontWeight: '700',
    backgroundColor: '#FFEAE8',
    color: '#C0382B',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  mockGiniScore: {
    fontSize: '11px',
    fontWeight: '600',
    fontFamily: "'JetBrains Mono', monospace",
    color: '#7A7782',
  },
  mockRiskTaskTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#25242A',
    margin: '0 0 6px',
  },
  mockRiskTaskDesc: {
    fontSize: '13px',
    color: '#625F69',
    margin: '0 0 16px',
  },
  riskBreakdownBox: {
    backgroundColor: '#F8F6F0',
    borderRadius: '12px',
    padding: '14px',
    marginBottom: '16px',
  },
  riskBreakdownTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#25242A',
    marginBottom: '8px',
  },
  riskFactorItem: {
    display: 'flex',
    gap: '8px',
    fontSize: '12px',
    color: '#4A4852',
    marginBottom: '6px',
    alignItems: 'flex-start',
  },
  factorDotRed: { color: '#E53E3E', fontSize: '10px', marginTop: '2px' },
  factorDotYellow: { color: '#D69E2E', fontSize: '10px', marginTop: '2px' },
  factorDotGreen: { color: '#38A169', fontSize: '10px', marginTop: '2px' },
  previewCardCta: {
    display: 'flex',
    justifyContent: 'flex-end',
  },

  /* Dialogue Box */
  dialogueBox: {
    backgroundColor: '#FDFBF7',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '14px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '13px',
  },
  dialogueUser: {
    color: '#5B35C2',
    backgroundColor: '#F3EEFF',
    padding: '8px 12px',
    borderRadius: '8px',
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  dialogueAssistant: {
    color: '#25242A',
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '8px 12px',
    borderRadius: '8px',
    alignSelf: 'flex-start',
    maxWidth: '90%',
  },
  commandShowcaseCard: {
    backgroundColor: '#FFFDF9',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '16px',
    padding: '20px',
  },
  commandHeader: {
    marginBottom: '12px',
  },
  commandBadge: {
    fontFamily: "var(--font-compact, 'Unica One', cursive, sans-serif)",
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#7A7782',
  },
  commandList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '13px',
    color: '#4A4852',
  },

  /* Features Section */
  featuresSection: {
    padding: '80px 24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  sectionHeader: {
    textAlign: 'center',
    marginBottom: '48px',
  },
  sectionBadge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#625F69',
    backgroundColor: 'rgba(37, 36, 42, 0.05)',
    padding: '4px 12px',
    borderRadius: '9999px',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, serif)",
    fontSize: 'clamp(28px, 4vw, 42px)',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    color: '#25242A',
    margin: '0 0 12px',
  },
  sectionSubtitle: {
    fontSize: '16px',
    color: '#625F69',
    maxWidth: '640px',
    margin: '0 auto',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '24px',
  },
  featureCard: {
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '20px',
    padding: '28px',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  featureIconBadgeYellow: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    backgroundColor: '#FFE58A',
    color: '#25242A',
    fontWeight: '800',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'JetBrains Mono', monospace",
  },
  featureIconBadgeMint: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    backgroundColor: '#BFE8D0',
    color: '#155230',
    fontWeight: '800',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'JetBrains Mono', monospace",
  },
  featureIconBadgeLavender: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    backgroundColor: '#E4DEFF',
    color: '#4B35A0',
    fontWeight: '800',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'JetBrains Mono', monospace",
  },
  featureIconBadgePeach: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    backgroundColor: '#FFD8C7',
    color: '#843114',
    fontWeight: '800',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'JetBrains Mono', monospace",
  },
  featureIconBadgeSky: {
    width: '38px',
    height: '38px',
    borderRadius: '12px',
    backgroundColor: '#B9DDF7',
    color: '#1B5480',
    fontWeight: '800',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'JetBrains Mono', monospace",
  },
  featureCardTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, serif)",
    fontSize: '19px',
    fontWeight: '800',
    color: '#25242A',
    margin: 0,
  },
  featureCardDesc: {
    fontSize: '14px',
    color: '#4A4852',
    lineHeight: 1.6,
    margin: 0,
    flexGrow: 1,
  },
  featureTag: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#7A7782',
    fontFamily: "'JetBrains Mono', monospace",
    borderTop: '1px solid rgba(37, 36, 42, 0.08)',
    paddingTop: '12px',
    marginTop: '4px',
  },

  /* How It Works */
  howSection: {
    padding: '80px 24px',
    backgroundColor: '#F9F6F0',
    borderTop: '1px solid rgba(37, 36, 42, 0.06)',
    borderBottom: '1px solid rgba(37, 36, 42, 0.06)',
  },
  timelineGrid: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '24px',
  },
  timelineCard: {
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '18px',
    padding: '24px',
    position: 'relative',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
  },
  stepNumber: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    backgroundColor: '#FFE58A',
    color: '#25242A',
    fontWeight: '800',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    border: '1px solid rgba(37, 36, 42, 0.2)',
  },
  stepTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, serif)",
    fontSize: '18px',
    fontWeight: '800',
    color: '#25242A',
    margin: '0 0 10px',
  },
  stepDesc: {
    fontSize: '14px',
    color: '#4A4852',
    lineHeight: 1.6,
    margin: 0,
  },

  /* Safety & Comparison */
  safetySection: {
    padding: '80px 24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  comparisonTableCard: {
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(37, 36, 42, 0.12)',
    borderRadius: '20px',
    overflowX: 'auto',
    boxShadow: '0 10px 30px rgba(0,0,0,0.04)',
  },
  comparisonTable: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '14px',
  },
  tableHeaderRow: {
    backgroundColor: '#F8F6F0',
    borderBottom: '2px solid rgba(37, 36, 42, 0.1)',
  },
  tableHeaderCell: {
    padding: '16px 20px',
    fontWeight: '700',
    color: '#25242A',
    fontSize: '13px',
  },
  tableHeaderCellBad: {
    padding: '16px 20px',
    fontWeight: '700',
    color: '#C0382B',
    fontSize: '13px',
  },
  tableHeaderCellGood: {
    padding: '16px 20px',
    fontWeight: '700',
    color: '#155230',
    fontSize: '13px',
    backgroundColor: 'rgba(191, 232, 208, 0.3)',
  },
  tableRow: {
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
  },
  tableCellLabel: {
    padding: '14px 20px',
    fontWeight: '600',
    color: '#25242A',
  },
  tableCellBad: {
    padding: '14px 20px',
    color: '#7A7782',
  },
  tableCellGood: {
    padding: '14px 20px',
    color: '#155230',
    fontWeight: '600',
    backgroundColor: 'rgba(191, 232, 208, 0.15)',
  },

  /* Final CTA */
  ctaSection: {
    padding: '40px 24px 80px',
    maxWidth: '960px',
    margin: '0 auto',
  },
  ctaCard: {
    backgroundColor: '#FFE58A',
    borderRadius: '28px',
    padding: '50px 36px',
    textAlign: 'center',
    border: '2px solid #25242A',
    boxShadow: '0 12px 0 #25242A',
  },
  ctaBadge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#5C4100',
    backgroundColor: 'rgba(92, 65, 0, 0.12)',
    padding: '4px 12px',
    borderRadius: '9999px',
    marginBottom: '16px',
  },
  ctaTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, serif)",
    fontSize: 'clamp(28px, 4vw, 40px)',
    fontWeight: '800',
    color: '#25242A',
    margin: '0 0 14px',
    letterSpacing: '-0.02em',
  },
  ctaDesc: {
    fontSize: '16px',
    color: '#4A4852',
    maxWidth: '600px',
    margin: '0 auto 28px',
    lineHeight: 1.6,
  },
  ctaBtnGroup: {
    display: 'flex',
    justifyContent: 'center',
  },
  ctaPrimaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '9999px',
    padding: '16px 36px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'all 0.15s ease',
  },

  /* Footer */
  footer: {
    backgroundColor: '#FFFFFF',
    borderTop: '1px solid rgba(37, 36, 42, 0.1)',
    padding: '50px 24px 24px',
  },
  footerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '40px',
    marginBottom: '40px',
  },
  footerBrandCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  footerTagline: {
    fontSize: '13px',
    color: '#625F69',
    lineHeight: 1.6,
    margin: 0,
  },
  footerLinksCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  footerLinksHeading: {
    fontSize: '12px',
    fontWeight: '800',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#25242A',
    marginBottom: '4px',
  },
  footerLinkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '13px',
    color: '#625F69',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'color 0.15s ease',
  },
  footerLink: {
    fontSize: '13px',
    color: '#625F69',
    textDecoration: 'none',
    transition: 'color 0.15s ease',
  },
  footerBottom: {
    maxWidth: '1200px',
    margin: '0 auto',
    paddingTop: '20px',
    borderTop: '1px solid rgba(37, 36, 42, 0.08)',
    textAlign: 'center',
  },
  copyrightText: {
    fontSize: '12px',
    color: '#7A7782',
    margin: 0,
  },
};
