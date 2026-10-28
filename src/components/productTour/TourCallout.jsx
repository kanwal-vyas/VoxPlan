import React, { useMemo } from 'react';
import MotifIcon from '../MotifIcon';
import { TOUR_MODES } from '../../productTour/tourStorage';
import { computeCalloutPosition } from '../../productTour/positionHelper';

/**
 * TourCallout
 *
 * Floating explanatory modal card positioned near the highlighted control.
 */
export default function TourCallout({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  isTargetFound,
  mode,
  onNext,
  onPrev,
  onSkip,
  onExit,
  onSwitchMode,
}) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const isLastStep = stepIndex === totalSteps - 1;

  const { isCenter, isMobileTop, style } = useMemo(() => {
    if (step.placement === 'center' || !isTargetFound) {
      return { isCenter: true, isMobileTop: false, style: {} };
    }
    return computeCalloutPosition(targetRect, step.placement, isMobile);
  }, [targetRect, step.placement, isTargetFound, isMobile]);

  const progressPercent = Math.round(((stepIndex + 1) / totalSteps) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="voxplan-tour-title"
      aria-describedby="voxplan-tour-desc"
      className={`voxplan-tour-callout ${isCenter ? 'voxplan-tour-callout-center' : ''} ${isMobileTop ? 'voxplan-tour-callout-top-mobile' : ''}`}
      style={style}
      tabIndex={-1}
      id="voxplan-tour-callout-card"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Header with Step Badge & Close */}
      <div className="voxplan-tour-header">
        <div className="voxplan-tour-badge-row">
          <span className="voxplan-tour-step-badge">
            STEP {stepIndex + 1} OF {totalSteps}
          </span>
          <span className="voxplan-tour-category-tag">{step.category}</span>
          {isTargetFound && (
            <span className="voxplan-tour-target-found-chip" title="Feature clearly highlighted on screen">
              <span className="voxplan-tour-target-found-dot" aria-hidden="true" />
              Target Highlighted
            </span>
          )}
        </div>
        <button
          type="button"
          className="voxplan-tour-close-btn"
          onClick={onExit}
          aria-label="Close product tour"
          title="Exit tour (Escape)"
        >
          <MotifIcon name="close" size={14} />
        </button>
      </div>

      {/* 2. Mode Switcher Ribbon */}
      <div className="voxplan-tour-mode-banner">
        <span className="voxplan-tour-mode-text" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <MotifIcon name={mode === TOUR_MODES.DEMO ? 'tools' : 'eye'} size={13} />
          <span>{mode === TOUR_MODES.DEMO ? 'Mode: Hands-on Demo' : 'Mode: Guided Observation'}</span>
        </span>
        <button
          type="button"
          className="voxplan-tour-mode-btn"
          onClick={() => onSwitchMode(mode === TOUR_MODES.DEMO ? TOUR_MODES.OBSERVE : TOUR_MODES.DEMO)}
          title="Switch between observation walkthrough and disposable hands-on demo"
        >
          {mode === TOUR_MODES.DEMO ? 'Switch to Observation' : 'Switch to Hands-on Demo'}
        </button>
      </div>

      {/* 3. Title & Description */}
      <h3 id="voxplan-tour-title" className="voxplan-tour-title">
        {step.title}
      </h3>
      <p id="voxplan-tour-desc" className="voxplan-tour-desc">
        {step.description}
      </p>

      {/* 4. Missing Target Notice (Graceful Fallback) */}
      {!isTargetFound && (
        <div className="voxplan-tour-target-notice" role="status">
          <MotifIcon name="info" size={14} style={{ marginRight: '6px' }} />
          <span>Target control is in a background view or drawer. Follow the instructions below.</span>
        </div>
      )}

      {/* 5. Contextual Action Box */}
      {step.actionPrompt && (
        <div className="voxplan-tour-action-box">
          <span className="voxplan-tour-action-label">Action Hint</span>
          <div>{step.actionPrompt}</div>
        </div>
      )}

      {/* 6. Platform Boundary & Limitations */}
      {step.limitations && (
        <div className="voxplan-tour-limits-box">
          <span className="voxplan-tour-limits-label">System Boundary:</span>
          <span>{step.limitations}</span>
        </div>
      )}

      {/* 7. Footer: Progress Bar and Navigation Buttons */}
      <div className="voxplan-tour-footer">
        <div className="voxplan-tour-progress-info">
          <span className="voxplan-tour-progress-text">
            {stepIndex + 1} / {totalSteps} ({progressPercent}%)
          </span>
          <div className="voxplan-tour-progress-bar" aria-hidden="true">
            <div
              className="voxplan-tour-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="voxplan-tour-controls">
          <button
            type="button"
            className="voxplan-tour-btn-skip"
            onClick={onSkip}
            title="Skip remaining tour steps"
          >
            Skip Tour
          </button>

          <button
            type="button"
            className="voxplan-tour-btn-secondary"
            onClick={onPrev}
            disabled={stepIndex === 0}
            aria-label="Previous step"
          >
            <MotifIcon name="arrow-left" size={12} style={{ marginRight: '4px' }} />
            <span>Back</span>
          </button>

          <button
            type="button"
            className="voxplan-tour-btn-primary"
            onClick={onNext}
            aria-label={isLastStep ? 'Finish product tour' : 'Next tour step'}
            id="voxplan-tour-next-btn"
          >
            {isLastStep ? (
              <>
                <span>Finish Tour</span>
                <MotifIcon name="sparkle" size={12} style={{ marginLeft: '4px' }} />
              </>
            ) : (
              <>
                <span>Next</span>
                <MotifIcon name="arrow-right" size={12} style={{ marginLeft: '4px' }} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
