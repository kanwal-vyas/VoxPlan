import React, { useState, useEffect, useRef } from 'react';

export default function LoadingScreen({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    // Organically step from 0 to 100% in ~0.85 seconds
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        const jump = Math.floor(Math.random() * 24) + 16;
        return Math.min(100, prev + jump);
      });
    }, 90);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress === 100 && !completedRef.current) {
      completedRef.current = true;
      const exitTimer = setTimeout(() => {
        setIsExiting(true);
      }, 80);

      const doneTimer = setTimeout(() => {
        if (onComplete) onComplete();
      }, 350);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(doneTimer);
      };
    }
  }, [progress, onComplete]);

  return (
    <div
      style={{
        ...styles.overlay,
        opacity: isExiting ? 0 : 1,
        pointerEvents: isExiting ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          ...styles.centerContainer,
          opacity: isExiting ? 0 : 1,
          transform: isExiting ? 'scale(0.96) translateY(-16px)' : 'scale(1) translateY(0)',
          transition: 'opacity 0.28s ease, transform 0.28s ease',
        }}
      >
        {/* Animated Pastel Blob */}
        <div style={styles.blobGlow} />

        {/* Wordmark */}
        <div style={styles.logoGroup}>
          <div style={styles.logoBadge}>✨</div>
          <h1 style={styles.logo}>VOXPLAN</h1>
        </div>

        <p style={styles.subtitle}>planning your next move...</p>

        {/* Staggered Pastel Dots */}
        <div style={styles.dotsRow}>
          <span style={{ ...styles.dot, backgroundColor: '#FF8F82', animationDelay: '0ms' }} />
          <span style={{ ...styles.dot, backgroundColor: '#FFE58A', animationDelay: '180ms' }} />
          <span style={{ ...styles.dot, backgroundColor: '#C9B6FF', animationDelay: '360ms' }} />
          <span style={{ ...styles.dot, backgroundColor: '#BFE8D0', animationDelay: '540ms' }} />
        </div>

        {/* Playful Progress Bar & Number */}
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progress}%` }} />
          </div>
          <span style={styles.progressText}>{progress}%</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFF8EF',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  },
  centerContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    position: 'relative',
    textAlign: 'center',
    padding: '24px',
  },
  blobGlow: {
    position: 'absolute',
    width: '260px',
    height: '260px',
    backgroundColor: '#FFE58A',
    borderRadius: '50%',
    filter: 'blur(70px)',
    opacity: 0.5,
    zIndex: -1,
  },
  logoGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoBadge: {
    fontSize: '24px',
  },
  logo: {
    fontFamily: "'Syne', sans-serif",
    fontSize: '44px',
    fontWeight: '800',
    letterSpacing: '-0.03em',
    color: '#25242A',
    margin: 0,
  },
  subtitle: {
    fontFamily: "'Caveat', cursive",
    fontSize: '24px',
    color: '#7A7782',
    margin: 0,
    fontWeight: '600',
  },
  dotsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '8px 0',
  },
  dot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'loadingDot 1.2s infinite ease-in-out',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)',
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '180px',
    marginTop: '6px',
  },
  progressBar: {
    flex: 1,
    height: '8px',
    backgroundColor: 'rgba(37, 36, 42, 0.08)',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#25242A',
    borderRadius: '9999px',
    transition: 'width 0.15s ease',
  },
  progressText: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '700',
    color: '#25242A',
    width: '38px',
    textAlign: 'right',
  },
};
