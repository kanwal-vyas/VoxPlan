import React, { useState, useEffect } from 'react';

export default function Hero({ modelMetadata }) {
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
      {/* Background Organic Shapes */}
      <div style={styles.bgBlobYellow} />
      <div style={styles.bgBlobPeach} />
      <div style={styles.bgBlobMint} />

      <div style={styles.grid} className="hero-composition">
        {/* Left: Modern Editorial Typography with Highlighter Strokes */}
        <div style={styles.leftColumn}>
          <div style={styles.eyebrowPill}>
            <span>✦</span>
            <span style={styles.eyebrowText}>PREDICTIVE STUDY & TASK INTELLIGENCE</span>
          </div>

          <h1 style={styles.headline}>
            PLAN <span className="hl hl-butter hl-animated">LESS.</span><br />
            DO <span className="hl hl-lilac hl-animated">MORE.</span>
          </h1>

          <p style={styles.statement}>
            VoxPlan turns your messy to-do list into a structured plan, then uses <span className="hl hl-mint">supervised machine learning</span> to highlight which initiatives are likely to fall behind.
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
              <span>Explore active notes</span>
              <span>↓</span>
            </button>

            <span className="note-tag" style={{ marginLeft: '4px' }}>
              ✎ real-time risk predictions
            </span>
          </div>
        </div>

        {/* Right: Clean Modern Editorial Task Cards */}
        <div style={styles.rightColumn}>
          {/* Card 1: High Risk (Coral Highlight) */}
          <div
            style={{
              ...styles.cleanCard,
              backgroundColor: '#FFFFFF',
              borderLeft: '4px solid #FF8F82',
            }}
            className="digital-card"
          >
            <div style={styles.cardHeader}>
              <div style={styles.categoryWrap}>
                <span style={styles.categoryLabel}>SECURITY</span>
                <span className="hl hl-coral" style={styles.priorityHighlight}>
                  HIGH PRIORITY
                </span>
              </div>
              <span className="annotated-circle" style={{ color: '#D9483B', fontSize: '13px', fontWeight: '800' }}>
                {counts.task1}% risk
              </span>
            </div>
            <h3 style={styles.cardTitle}>Revise Cryptography</h3>
            <div style={styles.cardFooter}>
              <span style={styles.cardDue}>Due today · 10h effort</span>
              <span className="note-tag" style={{ color: '#D9483B' }}>urgent bottleneck ↗</span>
            </div>
          </div>

          {/* Card 2: Medium Risk (Butter Yellow Highlight) */}
          <div
            style={{
              ...styles.cleanCard,
              backgroundColor: '#FFFFFF',
              borderLeft: '4px solid #FFE58A',
            }}
            className="digital-card"
          >
            <div style={styles.cardHeader}>
              <div style={styles.categoryWrap}>
                <span style={styles.categoryLabel}>NETWORKING</span>
                <span className="hl hl-butter" style={styles.priorityHighlight}>
                  MEDIUM
                </span>
              </div>
              <span className="annotated-circle" style={{ color: '#B45309', fontSize: '13px', fontWeight: '800' }}>
                {counts.task2}% risk
              </span>
            </div>
            <h3 style={styles.cardTitle}>Practice Subnetting</h3>
            <div style={styles.cardFooter}>
              <span style={styles.cardDue}>Due today · 6h effort</span>
              <span className="note-tag" style={{ color: '#B45309' }}>in progress →</span>
            </div>
          </div>

          {/* Card 3: Low Risk (Mint Highlight) */}
          <div
            style={{
              ...styles.cleanCard,
              backgroundColor: '#FFFFFF',
              borderLeft: '4px solid #BFE8D0',
            }}
            className="digital-card"
          >
            <div style={styles.cardHeader}>
              <div style={styles.categoryWrap}>
                <span style={styles.categoryLabel}>ARCHITECTURE</span>
                <span className="hl hl-mint" style={styles.priorityHighlight}>
                  LOW
                </span>
              </div>
              <span className="annotated-circle" style={{ color: '#166534', fontSize: '13px', fontWeight: '800' }}>
                {counts.task3}% risk
              </span>
            </div>
            <h3 style={styles.cardTitle}>Study OSI Model</h3>
            <div style={styles.cardFooter}>
              <span style={styles.cardDue}>Due tomorrow · 3.5h effort</span>
              <span className="note-tag" style={{ color: '#166534' }}>on track ✓</span>
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
    top: '5%',
    left: '-60px',
    width: '340px',
    height: '340px',
    backgroundColor: 'rgba(255, 229, 138, 0.45)',
    borderRadius: '50%',
    filter: 'blur(90px)',
    zIndex: -1,
  },
  bgBlobPeach: {
    position: 'absolute',
    top: '35%',
    right: '-40px',
    width: '360px',
    height: '360px',
    backgroundColor: 'rgba(255, 181, 167, 0.35)',
    borderRadius: '50%',
    filter: 'blur(100px)',
    zIndex: -1,
  },
  bgBlobMint: {
    position: 'absolute',
    bottom: '-10%',
    left: '30%',
    width: '280px',
    height: '280px',
    backgroundColor: 'rgba(191, 232, 208, 0.4)',
    borderRadius: '50%',
    filter: 'blur(90px)',
    zIndex: -1,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
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
    border: '1px solid rgba(37, 36, 42, 0.1)',
    padding: '6px 14px',
    borderRadius: '9999px',
    width: 'fit-content',
    boxShadow: '0 2px 8px rgba(37, 36, 42, 0.04)',
    color: '#706D73',
  },
  eyebrowText: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#25242A',
  },
  headline: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 'clamp(48px, 6vw, 82px)',
    fontWeight: '800',
    lineHeight: '0.94',
    letterSpacing: '-0.04em',
    color: '#25242A',
    margin: 0,
  },
  statement: {
    fontSize: '18px',
    lineHeight: '1.65',
    color: '#4A4852',
    maxWidth: '480px',
    margin: 0,
    fontWeight: '500',
  },
  ctaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '18px',
    flexWrap: 'wrap',
    marginTop: '6px',
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: 'none',
    padding: '14px 28px',
    borderRadius: '9999px',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(37, 36, 42, 0.15)',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  cleanCard: {
    borderRadius: '16px',
    padding: '20px 24px',
    boxShadow: '0 4px 16px rgba(37, 36, 42, 0.05)',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    cursor: 'pointer',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  categoryLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#706D73',
    letterSpacing: '0.04em',
  },
  priorityHighlight: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    color: '#25242A',
  },
  cardTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '20px',
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
    borderTop: '1px solid rgba(37, 36, 42, 0.06)',
  },
  cardDue: {
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '500',
  },
};
