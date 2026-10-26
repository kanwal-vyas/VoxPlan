import React from 'react';
import { computeSpotlightRect } from '../../productTour/positionHelper';

/**
 * TourSpotlight
 *
 * Renders the glowing spotlight cutout around the targeted DOM element.
 * Applies high-contrast terracotta border, dual hairline separation, and beacon indicator.
 */
export default function TourSpotlight({ targetRect, isTargetFound }) {
  if (!isTargetFound || !targetRect) {
    return null;
  }

  const spotlightBox = computeSpotlightRect(targetRect);
  if (!spotlightBox) {
    return null;
  }

  const isNearTop = spotlightBox.top < 26;

  return (
    <div
      className="voxplan-tour-spotlight"
      style={{
        top: `${spotlightBox.top}px`,
        left: `${spotlightBox.left}px`,
        width: `${spotlightBox.width}px`,
        height: `${spotlightBox.height}px`,
        borderRadius: `${spotlightBox.borderRadius}px`,
      }}
      aria-hidden="true"
    >
      <div
        className={`voxplan-tour-spotlight-beacon-tag ${
          isNearTop ? 'voxplan-tour-spotlight-beacon-tag-bottom' : ''
        }`}
      >
        <span className="voxplan-tour-spotlight-beacon-dot" />
        <span>Target</span>
      </div>
    </div>
  );
}
