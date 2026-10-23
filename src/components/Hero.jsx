import React from 'react';

export default function Hero() {
  const counts = { task1: 96.4, task2: 54.2, task3: 18.7 };

  return (
    <section
      className="hero-section"
      style={styles.hero}
      aria-label="Hero"
    >
      <div style={styles.grid} className="hero-composition">
        {/* Left: Editorial Typography & Intent */}
        <div style={styles.leftColumn}>
          <div style={styles.eyebrowPill}>
            <span style={styles.eyebrowIcon}>✦</span>
            <span style={styles.eyebrowText}>PREDICTIVE TASK INTELLIGENCE</span>
          </div>

          <h1 className="hero-headline" style={styles.headline}>
            Plan with clarity.<br />
            Act with focus.
          </h1>

          <p className="hero-statement" style={styles.statement}>
            VoxPlan turns daily tasks into structured timelines, using private local intelligence to highlight which initiatives are at risk before deadlines slip.
          </p>

          <div style={styles.ctaRow} className="ctaRow">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('pulse') || document.getElementById('today-focus-card');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              style={styles.primaryBtn}
            >
              <span>Explore Today's Workspace</span>
              <span>↓</span>
            </button>

            <span style={styles.noteTag}>
              Local-first · Offline reliable
            </span>
          </div>
        </div>

        {/* Right: Layered Preview Cards (Desktop only) */}
        <div style={styles.rightColumn} className="hero-preview-cards">
          <div style={styles.previewHeader}>
            <span style={styles.previewTag}>✦ ILLUSTRATIVE PREVIEW</span>
            <span style={styles.previewSub}>Design demonstration</span>
          </div>

          {/* Card 1: High Risk */}
          <div
            style={{
              ...styles.cleanCard,
              borderLeft: '4px solid #D9383A',
            }}
            className="hero-card-item"
          >
            <div style={styles.cardHeader}>
              <div style={styles.categoryWrap}>
                <span style={styles.categoryLabel}>SECURITY</span>
                <span style={styles.priorityHighlightRisk}>
                  HIGH RISK
                </span>
              </div>
              <span style={{ color: '#D9383A', fontSize: '13px', fontWeight: '800' }}>
                {counts.task1}% risk
              </span>
            </div>
            <h3 style={styles.cardTitle}>Revise Cryptography</h3>
            <div style={styles.cardFooter}>
              <span style={styles.cardDue}>Due today · 10h effort</span>
              <span style={{ fontSize: '12px', color: '#D9383A', fontWeight: '600' }}>bottleneck ↗</span>
            </div>
          </div>

          {/* Card 2: Medium Risk */}
          <div
            style={{
              ...styles.cleanCard,
              borderLeft: '4px solid #B45309',
            }}
            className="hero-card-item"
          >
            <div style={styles.cardHeader}>
              <div style={styles.categoryWrap}>
                <span style={styles.categoryLabel}>NETWORKING</span>
                <span style={styles.priorityHighlightWarning}>
                  MEDIUM
                </span>
              </div>
              <span style={{ color: '#B45309', fontSize: '13px', fontWeight: '800' }}>
                {counts.task2}% risk
              </span>
            </div>
            <h3 style={styles.cardTitle}>Practice Subnetting</h3>
            <div style={styles.cardFooter}>
              <span style={styles.cardDue}>Due today · 6h effort</span>
              <span style={{ fontSize: '12px', color: '#B45309', fontWeight: '600' }}>in progress →</span>
            </div>
          </div>

          {/* Card 3: Low Risk */}
          <div
            style={{
              ...styles.cleanCard,
              borderLeft: '4px solid #2D6A4F',
            }}
            className="hero-card-item"
          >
            <div style={styles.cardHeader}>
              <div style={styles.categoryWrap}>
                <span style={styles.categoryLabel}>ARCHITECTURE</span>
                <span style={styles.priorityHighlightSuccess}>
                  LOW
                </span>
              </div>
              <span style={{ color: '#2D6A4F', fontSize: '13px', fontWeight: '800' }}>
                {counts.task3}% risk
              </span>
            </div>
            <h3 style={styles.cardTitle}>Study OSI Model</h3>
            <div style={styles.cardFooter}>
              <span style={styles.cardDue}>Due tomorrow · 3.5h effort</span>
              <span style={{ fontSize: '12px', color: '#2D6A4F', fontWeight: '600' }}>on track ✓</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  hero: {
    padding: '36px 0 24px 0',
    position: 'relative',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: '48px',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  leftColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  eyebrowPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(30, 30, 34, 0.08)',
    padding: '4px 12px',
    borderRadius: '8px',
    width: 'fit-content',
    boxShadow: '0 1px 4px rgba(30, 30, 34, 0.03)',
  },
  eyebrowIcon: {
    color: '#C85A32',
    fontSize: '11px',
  },
  eyebrowText: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.06em',
    color: '#5E5B66',
  },
  headline: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 'clamp(32px, 4.5vw, 52px)',
    fontWeight: '800',
    lineHeight: '1.08',
    letterSpacing: '-0.03em',
    color: '#1E1E22',
    margin: 0,
  },
  statement: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#5E5B66',
    maxWidth: '480px',
    margin: 0,
    fontWeight: '500',
  },
  ctaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    marginTop: '6px',
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#1E1E22',
    color: '#FFFFFF',
    border: 'none',
    padding: '11px 22px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(30, 30, 34, 0.12)',
    transition: 'all 0.15s ease',
  },
  noteTag: {
    fontSize: '13px',
    color: '#7C7885',
    fontWeight: '600',
  },
  rightColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 4px',
  },
  previewTag: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '700',
    color: '#7C7885',
    letterSpacing: '0.04em',
  },
  previewSub: {
    fontSize: '11px',
    color: '#9B98A3',
    fontWeight: '500',
  },
  cleanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    padding: '16px 20px',
    boxShadow: '0 2px 8px rgba(30, 30, 34, 0.04)',
    border: '1px solid rgba(30, 30, 34, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
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
    color: '#7C7885',
    letterSpacing: '0.04em',
  },
  priorityHighlightRisk: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#FDF0ED',
    color: '#D9383A',
  },
  priorityHighlightWarning: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#FFF8E7',
    color: '#B45309',
  },
  priorityHighlightSuccess: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#EBF5EE',
    color: '#2D6A4F',
  },
  cardTitle: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '17px',
    fontWeight: '700',
    color: '#1E1E22',
    margin: 0,
    letterSpacing: '-0.01em',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: '6px',
    borderTop: '1px solid rgba(30, 30, 34, 0.06)',
  },
  cardDue: {
    fontSize: '12px',
    color: '#7C7885',
    fontWeight: '500',
  },
};
