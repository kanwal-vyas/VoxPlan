import React from 'react';

/**
 * TourLauncher
 *
 * Minimal, tasteful button to start or restart the VoxPlan Interactive Tour.
 * Fits harmoniously into LandingPage hero/nav and Header action bar.
 */
export default function TourLauncher({
  onLaunch,
  label = 'Interactive Tour',
  variant = 'pill',
  style = {},
  id = 'voxplan-tour-launcher-btn',
}) {
  const handleClick = (e) => {
    e.preventDefault();
    if (typeof onLaunch === 'function') {
      onLaunch();
    }
  };

  if (variant === 'menuItem') {
    return (
      <button
        type="button"
        id={id}
        onClick={handleClick}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          padding: '10px 14px',
          fontSize: '13px',
          fontWeight: '600',
          color: '#3D2645',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          ...style,
        }}
      >
        <span style={{ color: '#E5A83B' }}>✦</span>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      id={id}
      onClick={handleClick}
      className="voxplan-tour-launcher-btn"
      style={style}
      title="Start the interactive guided product tour"
      aria-label="Start interactive VoxPlan product tour"
    >
      <span className="voxplan-tour-launcher-sparkle">✦</span>
      <span>{label}</span>
    </button>
  );
}
