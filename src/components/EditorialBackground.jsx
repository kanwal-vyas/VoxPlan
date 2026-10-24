import React from 'react';

/**
 * EditorialBackground — Presentation-Only Cinematic Background Canvas
 *
 * Renders oversized editorial typography (PLAN, PREDICT, UNDERSTAND, ACT)
 * and atmospheric background motion for VoxPlan.
 *
 * CRITICAL ARCHITECTURAL RULES:
 * 1. Presentation-only: pointer-events: none, user-select: none, aria-hidden: true.
 * 2. Stacking order: strictly behind real interface content (z-index: 0 vs content z-index: 1+).
 * 3. Never controls or modifies document layout, flow, or height.
 * 4. Completely isolated from task cards, navigation, and the mobile command dock.
 */
export default function EditorialBackground({ currentView = 'today' }) {
  return (
    <div
      id="voxplan-editorial-canvas"
      className="editorial-canvas-layer"
      aria-hidden="true"
      data-current-view={currentView}
    >
      <div className="editorial-words-layer">
        <span
          id="editorial-word-plan"
          className="editorial-word-item editorial-word-plan"
          data-word="PLAN"
        >
          PLAN
        </span>
        <span
          id="editorial-word-predict"
          className="editorial-word-item editorial-word-predict"
          data-word="PREDICT"
        >
          PREDICT
        </span>
        <span
          id="editorial-word-understand"
          className="editorial-word-item editorial-word-understand"
          data-word="UNDERSTAND"
        >
          UNDERSTAND
        </span>
        <span
          id="editorial-word-act"
          className="editorial-word-item editorial-word-act"
          data-word="ACT"
        >
          ACT
        </span>
      </div>
    </div>
  );
}
