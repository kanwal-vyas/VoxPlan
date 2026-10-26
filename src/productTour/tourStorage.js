/**
 * VoxPlan Product Tour Storage Helper
 *
 * Provides isolated, safe local persistence for tour completion and preferences.
 * STRICT ISOLATION INVARIANT:
 * - Never modifies, reads, or overrides user tasks ('voxplan_tasks').
 * - Never modifies notification history ('voxplan_notifications').
 * - Never modifies sticky note storage ('voxplan_task_sticky_notes').
 * - Operates exclusively on 'voxplan_product_tour_state'.
 */

export const TOUR_STORAGE_KEY = 'voxplan_product_tour_state';

export const TOUR_MODES = {
  OBSERVE: 'observe',
  DEMO: 'demo',
};

const DEFAULT_TOUR_STATE = {
  completed: false,
  completedAt: null,
  lastStepIndex: 0,
  mode: TOUR_MODES.OBSERVE,
  version: '1.0',
};

/**
 * Loads the current tour state from isolated storage.
 * @returns {object} Tour state object
 */
export function loadTourState() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_TOUR_STATE };
  }

  try {
    const raw = window.localStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TOUR_STATE };
    const parsed = JSON.parse(raw);
    return {
      completed: Boolean(parsed.completed),
      completedAt: parsed.completedAt || null,
      lastStepIndex: typeof parsed.lastStepIndex === 'number' ? parsed.lastStepIndex : 0,
      mode: parsed.mode === TOUR_MODES.DEMO ? TOUR_MODES.DEMO : TOUR_MODES.OBSERVE,
      version: parsed.version || '1.0',
    };
  } catch (err) {
    console.warn('[ProductTour] Unable to read tour storage, using defaults:', err);
    return { ...DEFAULT_TOUR_STATE };
  }
}

/**
 * Safely persists tour state to isolated storage.
 * @param {object} updates Partial updates to tour state
 */
export function saveTourState(updates = {}) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    const current = loadTourState();
    const next = { ...current, ...updates };
    window.localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[ProductTour] Unable to save tour storage:', err);
  }
}

/**
 * Marks the tour as completed.
 */
export function markTourCompleted() {
  saveTourState({
    completed: true,
    completedAt: new Date().toISOString(),
  });
}

/**
 * Resets the tour completion state so the user can take it again.
 */
export function resetTourState() {
  saveTourState({
    completed: false,
    completedAt: null,
    lastStepIndex: 0,
  });
}
