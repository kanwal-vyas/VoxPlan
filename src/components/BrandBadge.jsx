import React from 'react';

/**
 * VoxPlan Brand Badge Component
 *
 * The canonical brand symbol: a dark, four-pointed sparkle inside a warm yellow
 * rounded square, with a subtle border and 2px offset bottom shadow.
 *
 * Source of truth reused across the Overview page (LandingPage),
 * the main workspace (/app Header), and the initial LoadingScreen.
 *
 * @param {object} props
 * @param {number} [props.size=32] Outer box dimension in pixels (default 32)
 * @param {object} [props.style] Optional style overrides
 * @param {string} [props.className] Optional CSS class name
 * @param {string} [props.id] Optional DOM element ID
 */
export default function BrandBadge({
  size = 32,
  style = {},
  className = '',
  id,
}) {
  const borderRadius = Math.round((size * 10) / 32);
  const fontSize = Math.round((size * 16) / 32);
  const shadowOffset = Math.max(1, Math.round((size * 2) / 32));

  return (
    <div
      id={id}
      className={`voxplan-brand-badge ${className}`.trim()}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${borderRadius}px`,
        backgroundColor: '#FFE58A',
        border: '1px solid rgba(37, 36, 42, 0.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: `${fontSize}px`,
        color: '#25242A',
        boxShadow: `0 ${shadowOffset}px 0 rgba(37, 36, 42, 0.8)`,
        lineHeight: 1,
        userSelect: 'none',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
    >
      <span style={{ display: 'inline-block', lineHeight: 1 }}>✦</span>
    </div>
  );
}
