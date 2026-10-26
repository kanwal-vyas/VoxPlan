import React, { useEffect, useRef } from 'react';
import './ProductTour.css';
import TourSpotlight from './TourSpotlight';
import TourCallout from './TourCallout';
import { computeSpotlightRect } from '../../productTour/positionHelper';

/**
 * TourOverlay
 *
 * Full-screen accessible modal orchestrator for the VoxPlan Product Tour.
 * Manages the backdrop, spotlight cutout, floating callout, and screen-reader announcements.
 */
export default function TourOverlay({
  isActive,
  currentStepIndex,
  activeStep,
  totalSteps,
  mode,
  targetRect,
  isTargetFound,
  onNext,
  onPrev,
  onSkip,
  onExit,
  onSwitchMode,
}) {
  const calloutRef = useRef(null);
  const spotlightBox = isTargetFound && targetRect ? computeSpotlightRect(targetRect) : null;

  // Focus callout card when step changes for keyboard accessibility
  useEffect(() => {
    if (isActive) {
      const el = document.getElementById('voxplan-tour-callout-card');
      if (el) {
        el.focus();
      }
    }
  }, [isActive, currentStepIndex]);

  if (!isActive || !activeStep) {
    return null;
  }

  return (
    <div
      className="voxplan-tour-root"
      id="voxplan-product-tour-root"
      aria-label="Interactive Product Tour"
    >
      {/* Screen reader live region for non-visual announcements */}
      <div
        className="sr-only"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: '0',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: '0',
        }}
        aria-live="polite"
        aria-atomic="true"
      >
        {`Product Tour Step ${currentStepIndex + 1} of ${totalSteps}: ${activeStep.title}. ${activeStep.description}`}
      </div>

      {/* SVG Mask Definition punching a clear, unblurred hole in the backdrop */}
      <svg
        className="voxplan-tour-mask-defs"
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 9989,
        }}
      >
        <defs>
          <mask id="voxplan-tour-spotlight-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100vw" height="100vh">
            {/* White area renders backdrop */}
            <rect x="0" y="0" width="100vw" height="100vh" fill="#ffffff" />
            {/* Black area punches 100% clear window over target element */}
            {spotlightBox && (
              <rect
                x={spotlightBox.left}
                y={spotlightBox.top}
                width={spotlightBox.width}
                height={spotlightBox.height}
                rx={spotlightBox.borderRadius}
                ry={spotlightBox.borderRadius}
                fill="#000000"
              />
            )}
          </mask>
        </defs>
      </svg>

      {/* Backdrop overlay */}
      <div
        className="voxplan-tour-backdrop"
        onClick={onExit}
        aria-hidden="true"
      />

      {/* Spotlight cutout */}
      <TourSpotlight
        targetRect={targetRect}
        isTargetFound={isTargetFound}
      />

      {/* Floating callout */}
      <TourCallout
        ref={calloutRef}
        step={activeStep}
        stepIndex={currentStepIndex}
        totalSteps={totalSteps}
        targetRect={targetRect}
        isTargetFound={isTargetFound}
        mode={mode}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={onSkip}
        onExit={onExit}
        onSwitchMode={onSwitchMode}
      />
    </div>
  );
}
