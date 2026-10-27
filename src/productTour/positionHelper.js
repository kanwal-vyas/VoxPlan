/**
 * VoxPlan Product Tour Positioning Helper
 *
 * Computes callout modal position relative to target rect and viewport boundaries.
 * Guarantees that the callout card and all navigation controls remain 100% visible inside the viewport.
 */

export const CALLOUT_WIDTH = 440;
export const CALLOUT_HEIGHT = 490;
export const CALLOUT_MARGIN = 14;
export const SPOTLIGHT_PADDING = 8;

/**
 * Computes spotlight cutout coordinates with padding and rounded corners.
 * @param {object|null} targetRect DOMRect-like object { top, left, width, height, bottom, right }
 * @param {number} [padding=8] Padding in pixels around the target element
 * @returns {object|null}
 */
export function computeSpotlightRect(targetRect, padding = SPOTLIGHT_PADDING) {
  if (!targetRect) return null;
  const pad = typeof padding === 'number' ? padding : SPOTLIGHT_PADDING;
  const top = Math.max(0, targetRect.top - pad);
  const left = Math.max(0, targetRect.left - pad);
  const width = Math.round(targetRect.width + pad * 2);
  const height = Math.round(targetRect.height + pad * 2);
  const right = left + width;
  const bottom = top + height;
  const minDim = Math.min(width, height);
  const borderRadius = Math.min(14, Math.max(6, Math.round(minDim * 0.1)));

  return {
    top: Math.round(top),
    left: Math.round(left),
    width,
    height,
    right,
    bottom,
    padding: pad,
    borderRadius,
  };
}

/**
 * Computes callout position relative to target rect and viewport boundaries.
 * @param {object|null} targetRect DOMRect like object { top, left, width, height, bottom, right }
 * @param {string} preferredPlacement 'bottom' | 'top' | 'left' | 'right' | 'center'
 * @param {boolean} isMobile Whether viewport is mobile sized (<= 768px)
 * @returns {object} { isCenter: boolean, style: object }
 */
export function computeCalloutPosition(targetRect, preferredPlacement, isMobile) {
  if (isMobile) {
    if (!targetRect || preferredPlacement === 'center') {
      return { isCenter: true, isMobileTop: false, style: {} };
    }
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const isTargetInLowerHalf = targetRect.top > winHeight * 0.45;
    return {
      isCenter: false,
      isMobileTop: isTargetInLowerHalf,
      style: isTargetInLowerHalf
        ? { top: 'max(12px, env(safe-area-inset-top, 12px))', bottom: 'auto' }
        : { bottom: 'max(12px, env(safe-area-inset-bottom, 12px))', top: 'auto' },
    };
  }

  if (!targetRect) {
    return { isCenter: true, style: {} };
  }

  const calloutWidth = CALLOUT_WIDTH;
  const calloutHeight = CALLOUT_HEIGHT;
  const margin = CALLOUT_MARGIN;

  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  // Determine candidate placements in preference order
  let candidates = [];
  if (preferredPlacement === 'left') {
    candidates = ['left', 'right', 'bottom', 'top'];
  } else if (preferredPlacement === 'right') {
    candidates = ['right', 'left', 'bottom', 'top'];
  } else if (preferredPlacement === 'top') {
    candidates = ['top', 'bottom', 'left', 'right'];
  } else {
    // Default 'bottom'
    candidates = ['bottom', 'top', 'left', 'right'];
  }

  // Find first placement that fits within viewport boundaries
  let bestPlacement = null;
  for (const p of candidates) {
    if (p === 'bottom' && targetRect.bottom + margin + calloutHeight <= winHeight - 16) {
      bestPlacement = 'bottom';
      break;
    }
    if (p === 'top' && targetRect.top - margin - calloutHeight >= 16) {
      bestPlacement = 'top';
      break;
    }
    if (p === 'left' && targetRect.left - margin - calloutWidth >= 16) {
      bestPlacement = 'left';
      break;
    }
    if (p === 'right' && targetRect.right + margin + calloutWidth <= winWidth - 16) {
      bestPlacement = 'right';
      break;
    }
  }

  const placement = bestPlacement || preferredPlacement || 'bottom';
  let top = 0;
  let left = 0;

  if (placement === 'bottom') {
    top = targetRect.bottom + margin;
    left = targetRect.left + (targetRect.width / 2) - (calloutWidth / 2);
  } else if (placement === 'top') {
    top = targetRect.top - calloutHeight - margin;
    left = targetRect.left + (targetRect.width / 2) - (calloutWidth / 2);
  } else if (placement === 'left') {
    top = targetRect.top;
    left = targetRect.left - calloutWidth - margin;
  } else if (placement === 'right') {
    top = targetRect.top;
    left = targetRect.right + margin;
  }

  // Strict Viewport Clamping: Card can never overflow off-screen in any direction
  left = Math.max(16, Math.min(winWidth - calloutWidth - 16, left));
  top = Math.max(16, Math.min(winHeight - calloutHeight - 16, top));

  return {
    isCenter: false,
    style: {
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
    },
  };
}
