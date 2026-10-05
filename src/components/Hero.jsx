import React, { useState, useEffect } from 'react';

export default function Hero({ modelMetadata, onScrollToSection }) {
  const [counts, setCounts] = useState({ task1: 0, task2: 0, task3: 0 });

  useEffect(() => {
    const timer = setTimeout(() => {
      let step = 0;
      const interval = setInterval(() => {
        step += 1;
        const progress = Math.min(1, step / 30);
        const ease = 1 - Math.pow(1 - progress, 3);
        setCounts({
          task1: Math.round(ease * 96.4 * 10) / 10,
          task2: Math.round(ease * 54.2 * 10) / 10,
          task3: Math.round(ease * 18.7 * 10) / 10,
        });
        if (progress >= 1) clearInterval(interval);
      }, 30);
      return () => clearInterval(interval);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  return (
    <section style={styles.hero} aria-label="Hero">
      {/* Background Decorative Pastels */}
      <div style={styles.bgBlobYellow} />
      <div style={styles.bgBlobPeach} />

      <div style={styles.grid} className="hero-composition">
        {/* Left: Joyful Big Headline */}
        <div style={styles.leftColumn}>
          <div style={styles.eyebrowPill}>
            <span>✨</span>
            <span style={styles.eyebrowText}>YOUR PROJECT, BUT SMARTER</span>
          </div>

          <h1 style={styles.headline}>
            YOUR TO-DO LIST<br />
            JUST GOT<br />
            <span style={styles.highlightText}>A BRAIN.</span>
          </h1>

          <p style={styles.statement}>
            VoxPlan turns your messy tasks into an intelligent project plan, then uses machine learning to predict which ones are likely to fall behind.
          </p>

          <div style={styles.ctaRow}>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('landscape') || document.getElementById('pulse');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              style={styles.primaryBtn}
            >
              <span>Explore My Tasks</span>
              <span>↓</span>
            </button>

            <span style={styles.handwrittenHint}>
              ← smart predictions included!
            </span>
          </div>
        </div>

        {/* Right: Tactile Floating Sticky Note Tasks Stack */}
        <div style={styles.rightColumn} className="hero-cards-stack">
          {/* Sticky Note 1: High Risk (Peach/Coral) */}
          <div
            style={{
              ...styles.stickyCard,
              backgroundColor: '#FFEFEA',
              border: '2px solid #FF8F82',
              transform: 'rotate(-2.5deg)',
              animation: 'floatSlow 4.5s ease-in-out infinite',
              zIndex: 3,
            }}
            className="note-tilt-left"
          >
            <div className="tape-top" />
            <div style={styles.cardHeader}>
              <span style={{ ...styles.cardCategory, color: '#D9483B' }}>SECURITY</span>
              <span style={{ ...styles.cardPriority, backgroundColor: '#FF8F82', color: '#FFFFFF' }}>
                HIGH PRIORITY
              </span>
            </div>
            <h3 style={styles.cardTitle}>Revise Cryptography</h3>
            <div style={styles.cardFooter}>
              <span style={styles.cardDue}>Due Today</span>
              <div style={{ ...styles.riskBadge, backgroundColor: '#FFE0DC', color: '#C92A1D' }}>
                <span>⚠️</span>
                <span style={styles.riskNum}>{counts.task1}% risk</span>
              </div>
            </div>
          </div>

          {/* Sticky Note 2: Medium Risk (Butter Yellow) */}
          <div
            style={{
              ...styles.stickyCard,
              backgroundColor: '#FFF9DB',
              border: '2px solid #F59E0B',
              transform: 'rotate(2.8deg) translateY(-20px)',
              animation: 'floatGentle 5s ease-in-out infinite 0.5s',
              zIndex: 2,
              marginLeft: '30px',
            }}
            className="note-tilt-right"
          >
            <div className="tape-top" />
            <div style={styles.cardHeader}>
              <span style={{ ...styles.cardCategory, color: '#B45309' }}>NETWORKING</span>
              <span style={{ ...styles.cardPriority, backgroundColor: '#FFE58A', color: '#92400E' }}>
                MEDIUM
              </span>
            </div>
            <h3 style={styles.cardTitle}>Practice Subnetting</h3>
            <div style={styles.cardFooter}>
              <span style={styles.cardDue}>Due Today</span>
              <div style={{ ...styles.riskBadge, backgroundColor: '#FEF3C7', color: '#B45309' }}>
                <span>⚡</span>
                <span style={styles.riskNum}>{counts.task2}% risk</span>
              </div>
            </div>
          </div>

          {/* Sticky Note 3: Low Risk (Mint Green) */}
          <div
            style={{
              ...styles.stickyCard,
              backgroundColor: '#EBF8F1',
              border: '2px solid #3EA370',
              transform: 'rotate(-1.2deg) translateY(-40px)',
              animation: 'floatSlow 4.8s ease-in-out infinite 1s',
              zIndex: 1,
              marginLeft: '-10px',
            }}
            className="note-tilt-slight"
          >
            <div className="tape-top" />
            <div style={styles.cardHeader}>
              <span style={{ ...styles.cardCategory, color: '#27754E' }}>ARCHITECTURE</span>
              <span style={{ ...styles.cardPriority, backgroundColor: '#BFE8D0', color: '#166534' }}>
                LOW PRIORITY
              </span>
            </div>
            <h3 style={styles.cardTitle}>Study OSI Model</h3>
            <div style={styles.cardFooter}>
              <span style={styles.cardDue}>Due Tomorrow</span>
              <div style={{ ...styles.riskBadge, backgroundColor: '#D1FAE5', color: '#065F46' }}>
                <span>✓</span>
                <span style={styles.riskNum}>{counts.task3}% risk</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  hero: {
    padding: '72px 0 84px 0',
    position: 'relative',
  },
  bgBlobYellow: {
    position: 'absolute',
    top: '10%',
    left: '-80px',
    width: '320px',
    height: '320px',
    backgroundColor: '#FFE58A',
    borderRadius: '50%',
    filter: 'blur(90px)',
    opacity: 0.45,
    zIndex: -1,
  },
  bgBlobPeach: {
    position: 'absolute',
    top: '30%',
    right: '-60px',
    width: '360px',
    height: '360px',
    backgroundColor: '#FFB5A7',
    borderRadius: '50%',
    filter: 'blur(100px)',
    opacity: 0.4,
    zIndex: -1,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.15fr 1fr',
    gap: '64px',
    alignItems: 'center',
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  eyebrowPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid rgba(37, 36, 42, 0.08)',
    padding: '6px 14px',
    borderRadius: '9999px',
    width: 'fit-content',
    boxShadow: '0 2px 8px rgba(37, 36, 42, 0.04)',
  },
  eyebrowText: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    color: '#25242A',
  },
  headline: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 'clamp(44px, 5.5vw, 76px)',
    fontWeight: '800',
    lineHeight: '0.96',
    letterSpacing: '-0.04em',
    color: '#25242A',
    margin: 0,
  },
  highlightText: {
    color: '#FF8F82',
    position: 'relative',
    display: 'inline-block',
  },
  statement: {
    fontSize: '18px',
    lineHeight: '1.6',
    color: '#4A4852',
    maxWidth: '480px',
    margin: 0,
    fontWeight: '500',
  },
  ctaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap',
    marginTop: '8px',
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#FFE58A',
    color: '#25242A',
    border: '2px solid #25242A',
    padding: '14px 28px',
    borderRadius: '9999px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 5px 0 #25242A',
  },
  handwrittenHint: {
    fontFamily: "'Caveat', cursive",
    fontSize: '22px',
    color: '#7A7782',
    fontWeight: '600',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0px',
    position: 'relative',
    padding: '20px 0',
  },
  stickyCard: {
    borderRadius: '16px',
    padding: '20px 24px',
    boxShadow: '0 10px 28px rgba(37, 36, 42, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    position: 'relative',
    cursor: 'pointer',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  cardCategory: {
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.06em',
  },
  cardPriority: {
    fontSize: '10px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '9999px',
  },
  cardTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '22px',
    fontWeight: '700',
    color: '#25242A',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '6px',
    borderTop: '1px dashed rgba(37, 36, 42, 0.12)',
  },
  cardDue: {
    fontSize: '13px',
    color: '#7A7782',
    fontWeight: '600',
  },
  riskBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '700',
  },
  riskNum: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontWeight: '800',
  },
};
