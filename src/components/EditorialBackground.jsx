import React from 'react';

/**
 * EditorialBackground — Presentation-Only Animated Colour Fields Canvas
 *
 * Replaces the faint word typography with expressive, oversized abstract forms
 * and animated colour fields that create atmosphere across VoxPlan even without
 * scrolling.
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
      <div className="colour-fields-layer">
        {/* Warm Marigold / Terracotta Sun Arc (Top-Right) */}
        <div
          id="colour-field-sun"
          className="colour-field-item colour-field-sun"
          data-field="sun"
        />

        {/* Dusty Lavender / Soft Plum Wave (Mid-Left) */}
        <div
          id="colour-field-lavender"
          className="colour-field-item colour-field-lavender"
          data-field="lavender"
        />

        {/* Muted Sage / Mint Meadow Arc (Bottom-Right) */}
        <div
          id="colour-field-sage"
          className="colour-field-item colour-field-sage"
          data-field="sage"
        />

        {/* Warm Peach / Butter Glow Ambient Well (Top-Left) */}
        <div
          id="colour-field-peach"
          className="colour-field-item colour-field-peach"
          data-field="peach"
        />
      </div>
    </div>
  );
}
