/**
 * VoxPlan Task Lifecycle Transitions.
 * Standardizes task completion, reopening, and timer finalization logic
 * so that UI card actions and command-bar commands produce identical,
 * validated telemetry and consistent state mutations.
 */

/**
 * Transitions an open task into a completed task.
 * Idempotent: If task is already completed, returns success: false with reason 'already_completed'.
 *
 * @param {object} params
 * @param {object} params.task Target task object
 * @param {object|null} params.activeTimerState Current active timer state
 * @param {object} [params.durationInfo={}] Optional duration information ({ durationSource, trackedDurationSeconds, selfReportedDurationSeconds })
 * @param {Function} [params.stopTimerFn] Optional timer stop callback returning tracked seconds
 * @returns {Promise<{
 *   success: boolean,
 *   reason?: string,
 *   updatedTask?: object,
 *   telemetryPayload?: object,
 *   timerStopped?: boolean
 * }>}
 */
export async function completeTaskLifecycle({
  task,
  activeTimerState = null,
  durationInfo = {},
  stopTimerFn = null,
}) {
  if (!task || !task.id) {
    return { success: false, reason: 'invalid_task' };
  }

  // Idempotency: Do not complete an already completed task
  if (task.completed) {
    return { success: false, reason: 'already_completed', task };
  }

  let finalTrackedSec = null;
  let timerStopped = false;

  // Finalize active timer if one is running for this task
  if (activeTimerState && activeTimerState.taskId === task.id) {
    if (typeof stopTimerFn === 'function') {
      finalTrackedSec = await stopTimerFn(task.id);
    } else {
      let total = activeTimerState.accumulatedSeconds || 0;
      if (activeTimerState.isRunning && activeTimerState.startedAt) {
        total += Math.max(0, (Date.now() - activeTimerState.startedAt) / 1000);
      }
      finalTrackedSec = Math.max(0, Math.round(total));
    }
    timerStopped = true;
  }

  // Determine tracked seconds: prioritize explicitly passed tracked seconds, then finalized timer seconds
  const trackedSec =
    durationInfo.durationSource === 'tracked'
      ? (durationInfo.trackedDurationSeconds ?? finalTrackedSec ?? null)
      : (finalTrackedSec !== null && finalTrackedSec > 0 ? finalTrackedSec : null);

  // Resolve duration source
  let durationSource = durationInfo.durationSource;
  if (!durationSource) {
    if (trackedSec !== null && trackedSec > 0) {
      durationSource = 'tracked';
    } else if (durationInfo.selfReportedDurationSeconds != null && durationInfo.selfReportedDurationSeconds > 0) {
      durationSource = 'self_reported';
    } else {
      durationSource = 'unknown';
    }
  }

  const effectiveDurationInfo = {
    durationSource,
    duration_source: durationSource,
    trackedDurationSeconds: trackedSec !== null && trackedSec > 0 ? trackedSec : null,
    tracked_duration_seconds: trackedSec !== null && trackedSec > 0 ? trackedSec : null,
    selfReportedDurationSeconds:
      durationInfo.selfReportedDurationSeconds != null && durationInfo.selfReportedDurationSeconds > 0
        ? durationInfo.selfReportedDurationSeconds
        : null,
    self_reported_duration_seconds:
      durationInfo.selfReportedDurationSeconds != null && durationInfo.selfReportedDurationSeconds > 0
        ? durationInfo.selfReportedDurationSeconds
        : null,
  };

  const completedAt = new Date().toISOString();

  const updatedTask = {
    ...task,
    completed: true,
    completedAt,
    durationSource: effectiveDurationInfo.durationSource,
    trackedDurationSeconds: effectiveDurationInfo.trackedDurationSeconds,
    selfReportedDurationSeconds: effectiveDurationInfo.selfReportedDurationSeconds,
  };

  return {
    success: true,
    updatedTask,
    telemetryPayload: effectiveDurationInfo,
    timerStopped,
  };
}

/**
 * Transitions a completed task back into an open (pending) task.
 * Idempotent: If task is already open, returns success: false with reason 'already_open'.
 *
 * @param {object} params
 * @param {object} params.task Target task object
 * @returns {{
 *   success: boolean,
 *   reason?: string,
 *   updatedTask?: object
 * }}
 */
export function reopenTaskLifecycle({ task }) {
  if (!task || !task.id) {
    return { success: false, reason: 'invalid_task' };
  }

  // Idempotency: Do not reopen an already open task
  if (!task.completed) {
    return { success: false, reason: 'already_open', task };
  }

  const updatedTask = {
    ...task,
    completed: false,
    completedAt: null,
  };

  return {
    success: true,
    updatedTask,
  };
}
