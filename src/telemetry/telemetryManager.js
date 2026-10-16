/**
 * VoxPlan Telemetry Manager.
 * Orchestrates event creation, validation, durable IndexedDB persistence,
 * real-time UI subscriptions, and active timer session state.
 */

import { createEvent, generateUUID, SCHEMA_VERSION } from './eventSchema.js';
import {
  saveEvent,
  getEventsByProfile,
  clearEventsByProfile,
  saveTimerSession,
  clearTimerSessionsByProfile,
} from './indexedDbStore.js';
import { computeBehavioralStats } from './behavioralStats.js';

const PROFILE_ID_KEY = 'voxplan_profile_id';
const ACTIVE_TIMER_KEY = 'voxplan_active_timer';

/**
 * Returns the persistent, stable anonymous local profile ID.
 */
export function getOrCreateProfileId() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'prof_local_test';
  }
  let profileId = localStorage.getItem(PROFILE_ID_KEY);
  if (!profileId || !profileId.startsWith('prof_')) {
    profileId = `prof_${generateUUID()}`;
    localStorage.setItem(PROFILE_ID_KEY, profileId);
  }
  return profileId;
}

class TelemetryManager {
  constructor() {
    this.profileId = getOrCreateProfileId();
    this.subscribers = new Set();
    this.eventsCache = [];
    this.isInitialized = false;
    this.activeTimer = this.loadActiveTimer();
    this.recordedProposalActions = new Set();
  }

  /**
   * Initializes the manager, loading cached events from IndexedDB.
   */
  async init() {
    if (this.isInitialized) return;
    try {
      this.eventsCache = await getEventsByProfile(this.profileId);
      this.isInitialized = true;
      this.notifySubscribers();
    } catch (err) {
      console.warn('Error loading telemetry events during init:', err);
      this.isInitialized = true;
    }
  }

  /**
   * Subscribes a listener to event and stats updates.
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers() {
    for (const callback of this.subscribers) {
      try {
        callback(this.eventsCache);
      } catch (e) {
        console.error('Subscriber notification failed:', e);
      }
    }
  }

  /**
   * Internal method to persist a validated event and notify subscribers.
   */
  async record(eventType, taskId, payload = {}) {
    try {
      const event = createEvent({
        profileId: this.profileId,
        taskId,
        eventType,
        payload,
      });

      // Update in-memory cache immediately
      this.eventsCache.push(event);

      // Persist to IndexedDB
      await saveEvent(event);

      this.notifySubscribers();
      return event;
    } catch (err) {
      console.error(`Telemetry error recording [${eventType}]:`, err);
      return null;
    }
  }

  // --- Task Lifecycle Events ---

  async recordTaskCreated(task) {
    if (!task || !task.id) return null;
    return this.record('task_created', task.id, {
      title: task.title,
      category: task.category || 'General',
      priority: task.priority || 'medium',
      due_date: task.dueDate || null,
      estimated_effort: task.estimatedEffort ?? task.estimated_effort ?? null,
      dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    });
  }

  async recordTaskStarted(taskId, sessionId) {
    const startedAt = new Date().toISOString();
    return this.record('task_started', taskId, {
      session_id: sessionId,
      started_at: startedAt,
    });
  }

  async recordTaskPaused(taskId, sessionId, elapsedSeconds) {
    const pausedAt = new Date().toISOString();
    return this.record('task_paused', taskId, {
      session_id: sessionId,
      paused_at: pausedAt,
      elapsed_seconds: Math.max(0, Math.round(elapsedSeconds)),
    });
  }

  async recordTaskCompleted(taskId, durationInfo = {}) {
    const completedAt = new Date().toISOString();
    const {
      trackedDurationSeconds = null,
      selfReportedDurationSeconds = null,
      durationSource = 'unknown',
    } = durationInfo;

    return this.record('task_completed', taskId, {
      completed_at: completedAt,
      duration_source: durationSource,
      tracked_duration_seconds:
        trackedDurationSeconds != null ? Math.max(0, Math.round(trackedDurationSeconds)) : null,
      self_reported_duration_seconds:
        selfReportedDurationSeconds != null ? Math.max(0, Math.round(selfReportedDurationSeconds)) : null,
    });
  }

  async recordTaskReopened(taskId) {
    const reopenedAt = new Date().toISOString();
    return this.record('task_reopened', taskId, {
      reopened_at: reopenedAt,
    });
  }

  async recordTaskRescheduled(taskId, previousDueDate, newDueDate, reason = 'manual_update') {
    return this.record('task_rescheduled', taskId, {
      previous_due_date: previousDueDate || null,
      new_due_date: newDueDate || null,
      reason,
    });
  }

  async recordTaskPriorityChanged(taskId, previousPriority, newPriority) {
    return this.record('task_priority_changed', taskId, {
      previous_priority: previousPriority,
      new_priority: newPriority,
    });
  }

  async recordTaskEffortRevised(taskId, previousEffort, newEffort) {
    return this.record('task_effort_revised', taskId, {
      previous_effort: previousEffort,
      new_effort: newEffort,
    });
  }

  async recordTaskReordered(taskId, previousIndex, newIndex, taskIdsOrder = []) {
    return this.record('task_reordered', taskId, {
      previous_index: previousIndex,
      new_index: newIndex,
      task_ids_order: taskIdsOrder.slice(0, 50),
    });
  }

  async recordRecommendationAction(recommendationType, recommendationId, accepted, details = {}) {
    const eventType = accepted ? 'recommendation_accepted' : 'recommendation_rejected';
    return this.record(eventType, null, {
      recommendation_type: recommendationType,
      recommendation_id: recommendationId,
      details,
    });
  }

  // --- Schedule Feedback Events (Phase 4, Stage 5) ---

  async recordScheduleProposalGenerated(proposal) {
    if (!proposal || !proposal.summary?.scheduleId) return null;
    const scheduleId = proposal.summary.scheduleId;
    const dedupeKey = `gen_${scheduleId}`;
    if (this.recordedProposalActions.has(dedupeKey)) return null;
    this.recordedProposalActions.add(dedupeKey);

    const summary = proposal.summary;
    return this.record('schedule_proposal_generated', null, {
      schedule_id: scheduleId,
      scheduler_version: 1,
      strategy: summary.strategy || 'adaptive',
      daily_capacity_hours: summary.dailyCapacityHours || 6.0,
      horizon_days: summary.horizonDays || 14,
      total_eligible_tasks: summary.totalEligibleTasks || 0,
      scheduled_count: summary.scheduledCount || 0,
      date_changes_count: summary.dateChangesCount || 0,
      feasibility: summary.feasibilityStatus || summary.feasibility || 'feasible',
    });
  }

  async recordScheduleProposalAccepted(proposal, appliedPlacements = []) {
    if (!proposal || !proposal.summary?.scheduleId) return null;
    const scheduleId = proposal.summary.scheduleId;
    const dedupeKey = `acc_${scheduleId}`;
    if (this.recordedProposalActions.has(dedupeKey)) return null;
    this.recordedProposalActions.add(dedupeKey);

    const summary = proposal.summary;
    return this.record('schedule_proposal_accepted', null, {
      schedule_id: scheduleId,
      scheduler_version: 1,
      strategy: summary.strategy || 'adaptive',
      changes_count: appliedPlacements.length,
      applied_placements: appliedPlacements.map((p) => ({
        task_id: p.taskId || p.task_id,
        original_due_date: p.originalDueDate || p.original_due_date || null,
        proposed_date: p.proposedDate || p.proposed_date,
      })),
    });
  }

  async recordScheduleProposalDiscarded(proposal, reason = 'user_discard') {
    if (!proposal || !proposal.summary?.scheduleId) return null;
    const scheduleId = proposal.summary.scheduleId;
    const dedupeKey = `disc_${scheduleId}`;
    if (this.recordedProposalActions.has(dedupeKey)) return null;
    this.recordedProposalActions.add(dedupeKey);

    const summary = proposal.summary;
    return this.record('schedule_proposal_discarded', null, {
      schedule_id: scheduleId,
      scheduler_version: 1,
      strategy: summary.strategy || 'adaptive',
      reason,
      changes_count: summary.dateChangesCount || 0,
    });
  }

  // --- Active Timer State Management ---

  loadActiveTimer() {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      const saved = localStorage.getItem(ACTIVE_TIMER_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && parsed.taskId && parsed.sessionId) {
        return parsed;
      }
    } catch {}
    return null;
  }

  persistActiveTimer(timerState) {
    this.activeTimer = timerState;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      if (timerState) {
        localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(timerState));
      } else {
        localStorage.removeItem(ACTIVE_TIMER_KEY);
      }
    } catch (e) {
      console.warn('Could not persist active timer:', e);
    }
  }

  getActiveTimer() {
    return this.activeTimer;
  }

  /**
   * Starts a working timer for a task.
   */
  async startTimer(taskId) {
    // If another timer is running, pause it first
    if (this.activeTimer && this.activeTimer.isRunning && this.activeTimer.taskId !== taskId) {
      await this.pauseTimer(this.activeTimer.taskId);
    }

    const sessionId = this.activeTimer?.taskId === taskId
      ? this.activeTimer.sessionId
      : `sess_${generateUUID()}`;

    const accumulatedSeconds = this.activeTimer?.taskId === taskId
      ? (this.activeTimer.accumulatedSeconds || 0)
      : 0;

    const newTimerState = {
      taskId,
      sessionId,
      startedAt: Date.now(),
      accumulatedSeconds,
      isRunning: true,
    };

    this.persistActiveTimer(newTimerState);
    await this.recordTaskStarted(taskId, sessionId);
    return newTimerState;
  }

  /**
   * Pauses the timer for a task and records the elapsed session.
   */
  async pauseTimer(taskId) {
    if (!this.activeTimer || this.activeTimer.taskId !== taskId) return null;

    let totalSeconds = this.activeTimer.accumulatedSeconds || 0;
    if (this.activeTimer.isRunning && this.activeTimer.startedAt) {
      const deltaSec = Math.max(0, (Date.now() - this.activeTimer.startedAt) / 1000);
      // Guard against impossible jumps (e.g. clock change > 24 hours)
      if (deltaSec < 86400) {
        totalSeconds += deltaSec;
      }
    }

    const updatedState = {
      ...this.activeTimer,
      startedAt: null,
      accumulatedSeconds: totalSeconds,
      isRunning: false,
    };

    this.persistActiveTimer(updatedState);
    await this.recordTaskPaused(taskId, this.activeTimer.sessionId, totalSeconds);

    // Also persist session snapshot to IndexedDB
    await saveTimerSession({
      session_id: this.activeTimer.sessionId,
      task_id: taskId,
      profile_id: this.profileId,
      total_seconds: totalSeconds,
      status: 'paused',
      updated_at: new Date().toISOString(),
    });

    return updatedState;
  }

  /**
   * Stops and clears the timer when a task is completed or cancelled.
   */
  async stopTimer(taskId) {
    if (!this.activeTimer || this.activeTimer.taskId !== taskId) return 0;

    let finalSeconds = this.activeTimer.accumulatedSeconds || 0;
    if (this.activeTimer.isRunning && this.activeTimer.startedAt) {
      const deltaSec = Math.max(0, (Date.now() - this.activeTimer.startedAt) / 1000);
      if (deltaSec < 86400) {
        finalSeconds += deltaSec;
      }
    }

    await saveTimerSession({
      session_id: this.activeTimer.sessionId,
      task_id: taskId,
      profile_id: this.profileId,
      total_seconds: finalSeconds,
      status: 'completed',
      updated_at: new Date().toISOString(),
    });

    this.persistActiveTimer(null);
    return Math.round(finalSeconds);
  }

  // --- Statistics & Data Inspection ---

  getStats(currentTasks = []) {
    return computeBehavioralStats(this.eventsCache, currentTasks);
  }

  getEvents() {
    return [...this.eventsCache];
  }

  /**
   * Permanently clears telemetry history for this profile.
   * Active tasks are left completely untouched.
   */
  async clearHistory() {
    await clearEventsByProfile(this.profileId);
    await clearTimerSessionsByProfile(this.profileId);
    this.persistActiveTimer(null);
    this.recordedProposalActions.clear();
    this.eventsCache = [];
    this.notifySubscribers();
    return true;
  }

  /**
   * Exports the entire behavioral event history as JSON.
   */
  exportHistoryJson() {
    return JSON.stringify(
      {
        profile_id: this.profileId,
        schema_version: SCHEMA_VERSION,
        exported_at: new Date().toISOString(),
        total_events: this.eventsCache.length,
        events: this.eventsCache,
      },
      null,
      2
    );
  }
}

// Singleton export
export const telemetry = new TelemetryManager();
