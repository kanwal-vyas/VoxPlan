/**
 * VoxPlan Pure Event & Reminder Detector
 *
 * Scans tasks, deadlines, dependencies, and schedule proposals to generate
 * candidate notifications. Pure and deterministic; accepts current time
 * and existing deduplication keys to guarantee idempotency.
 */

import { NOTIFICATION_CATEGORIES, NOTIFICATION_PRIORITIES, ACTION_TARGET_TYPES } from './types.js';
import { formatTaskDueDate } from '../conversation/compoundCommandParser.js';

/**
 * Parses a dueDate string into a local Date object.
 * If only YYYY-MM-DD is provided, defaults to 18:00 (end of workday) on that date.
 * @param {string} dueDateStr
 * @returns {Date|null}
 */
export function parseTaskDeadline(dueDateStr) {
  if (!dueDateStr || typeof dueDateStr !== 'string') return null;
  const trimmed = dueDateStr.trim();
  const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!dateMatch) return null;

  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10) - 1;
  const day = parseInt(dateMatch[3], 10);
  const hours = dateMatch[4] !== undefined ? parseInt(dateMatch[4], 10) : 18; // Default 6:00 PM
  const minutes = dateMatch[5] !== undefined ? parseInt(dateMatch[5], 10) : 0;
  const seconds = dateMatch[6] !== undefined ? parseInt(dateMatch[6], 10) : 0;

  const d = new Date(year, month, day, hours, minutes, seconds);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Detects all eligible notification events from current application state.
 *
 * @param {object} params
 * @param {Array<object>} params.tasks Active task list
 * @param {object|null} [params.acceptedSchedule] Currently accepted schedule proposal
 * @param {Set<string>|Array<string>} [params.existingDedupKeys] Keys already present in the store
 * @param {object} [params.preferences] User notification preferences
 * @param {Date} [params.now=new Date()] Injected current local date for testability
 * @returns {Array<object>} Candidate notifications
 */
export function detectNotificationEvents({
  tasks = [],
  acceptedSchedule = null,
  existingDedupKeys = new Set(),
  preferences = {},
  now = new Date(),
}) {
  const candidates = [];
  const dedupSet = existingDedupKeys instanceof Set
    ? existingDedupKeys
    : new Set(Array.isArray(existingDedupKeys) ? existingDedupKeys : []);

  const leadTimeMinutes = typeof preferences.leadTimeMinutes === 'number'
    ? preferences.leadTimeMinutes
    : 60;

  const enabledCategories = preferences.categories || {
    deadline: true,
    overdue: true,
    schedule: true,
    dependency: true,
    system: true,
  };

  const nowTime = now.getTime();
  const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Map of completed tasks for dependency evaluation
  const completedTaskIds = new Set(tasks.filter((t) => t.completed).map((t) => t.id));
  const allTaskIds = new Set(tasks.map((t) => t.id));

  // 1. Task Deadline & Overdue Evaluation
  for (const task of tasks) {
    if (!task || task.completed) continue;
    if (!task.dueDate) continue;

    const deadline = parseTaskDeadline(task.dueDate);
    if (!deadline) continue;

    const diffMinutes = Math.round((deadline.getTime() - nowTime) / (60 * 1000));
    const isPastDue = diffMinutes < 0;

    // A. Overdue Tasks (past deadline and still incomplete)
    if (isPastDue && enabledCategories.overdue !== false) {
      // Overdue key is scoped to task ID and due date
      const dedupKey = `overdue:${task.id}:${task.dueDate}`;
      if (!dedupSet.has(dedupKey)) {
        const formattedDeadline = formatTaskDueDate(task.dueDate, now);
        candidates.push({
          id: `notif-overdue-${task.id}`,
          category: NOTIFICATION_CATEGORIES.OVERDUE,
          priority: NOTIFICATION_PRIORITIES.CRITICAL,
          title: `Overdue Task: ${task.title}`,
          message: `"${task.title}" was due ${formattedDeadline.toLowerCase()}. Review or reschedule to keep your momentum.`,
          timestamp: now.toISOString(),
          read: false,
          dismissed: false,
          dedupKey,
          target: {
            type: ACTION_TARGET_TYPES.TASK,
            id: task.id,
            view: 'tasks',
          },
          meta: {
            taskId: task.id,
            dueDate: task.dueDate,
            diffMinutes,
          },
        });
      }
    }

    // B. Upcoming Deadlines (within lead time window, not past due)
    if (!isPastDue && enabledCategories.deadline !== false) {
      // Check if within configured lead time window
      const isWithinLeadTime = diffMinutes <= leadTimeMinutes;
      // Or if due today and lead time is at least 60m
      const isDueToday = task.dueDate.startsWith(todayDateStr);

      if (isWithinLeadTime) {
        const dedupKey = `deadline:${task.id}:${task.dueDate}:${leadTimeMinutes}`;
        if (!dedupSet.has(dedupKey)) {
          let timeDescription;
          if (diffMinutes <= 0) {
            timeDescription = 'now';
          } else if (diffMinutes <= 15) {
            timeDescription = 'in less than 15 minutes';
          } else if (diffMinutes <= 60) {
            timeDescription = `in ${diffMinutes} minutes`;
          } else if (isDueToday) {
            timeDescription = 'today';
          } else {
            timeDescription = 'tomorrow';
          }

          candidates.push({
            id: `notif-deadline-${task.id}-${todayDateStr}`,
            category: NOTIFICATION_CATEGORIES.DEADLINE,
            priority: diffMinutes <= 60 ? NOTIFICATION_PRIORITIES.HIGH : NOTIFICATION_PRIORITIES.NORMAL,
            title: `Deadline Approaching: ${task.title}`,
            message: `"${task.title}" is due ${timeDescription}.`,
            timestamp: now.toISOString(),
            read: false,
            dismissed: false,
            dedupKey,
            target: {
              type: ACTION_TARGET_TYPES.TASK,
              id: task.id,
              view: 'today',
            },
            meta: {
              taskId: task.id,
              dueDate: task.dueDate,
              diffMinutes,
            },
          });
        }
      } else if (isDueToday && leadTimeMinutes >= 60) {
        const dedupKey = `deadline:today:${task.id}:${task.dueDate}`;
        if (!dedupSet.has(dedupKey)) {
          candidates.push({
            id: `notif-due-today-${task.id}-${todayDateStr}`,
            category: NOTIFICATION_CATEGORIES.DEADLINE,
            priority: NOTIFICATION_PRIORITIES.NORMAL,
            title: `Task Due Today: ${task.title}`,
            message: `"${task.title}" is scheduled to be completed today.`,
            timestamp: now.toISOString(),
            read: false,
            dismissed: false,
            dedupKey,
            target: {
              type: ACTION_TARGET_TYPES.TASK,
              id: task.id,
              view: 'today',
            },
            meta: {
              taskId: task.id,
              dueDate: task.dueDate,
              diffMinutes,
            },
          });
        }
      }
    }
  }

  // 2. Dependency & Blocker Alerts
  if (enabledCategories.dependency !== false) {
    for (const task of tasks) {
      if (!task || task.completed) continue;
      const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
      if (deps.length === 0) continue;

      const incompletePrereqs = deps.filter((depId) => allTaskIds.has(depId) && !completedTaskIds.has(depId));

      // Newly unblocked: previously had dependencies, but all are now completed
      if (incompletePrereqs.length === 0 && deps.length > 0) {
        const dedupKey = `unblocked:${task.id}`;
        if (!dedupSet.has(dedupKey)) {
          candidates.push({
            id: `notif-unblocked-${task.id}`,
            category: NOTIFICATION_CATEGORIES.DEPENDENCY,
            priority: NOTIFICATION_PRIORITIES.NORMAL,
            title: `Task Ready to Start: ${task.title}`,
            message: `All prerequisites for "${task.title}" are complete. You can begin working on it now.`,
            timestamp: now.toISOString(),
            read: false,
            dismissed: false,
            dedupKey,
            target: {
              type: ACTION_TARGET_TYPES.TASK,
              id: task.id,
              view: 'tasks',
            },
            meta: {
              taskId: task.id,
              resolvedDependencies: deps,
            },
          });
        }
      }
    }
  }

  // 3. Schedule Warnings & Feasibility Alerts
  if (enabledCategories.schedule !== false && acceptedSchedule) {
    const summary = acceptedSchedule.summary || {};
    const isInfeasible = summary.feasibilityStatus === 'infeasible_overconstrained' ||
      summary.feasibility === 'infeasible_overconstrained' ||
      summary.infeasibleTasksCount > 0;

    if (isInfeasible) {
      const scheduleId = summary.scheduleId || acceptedSchedule.acceptedAt || 'active';
      const dedupKey = `schedule:warning:${scheduleId}`;
      if (!dedupSet.has(dedupKey)) {
        candidates.push({
          id: `notif-schedule-warning-${scheduleId}`,
          category: NOTIFICATION_CATEGORIES.SCHEDULE,
          priority: NOTIFICATION_PRIORITIES.HIGH,
          title: 'Schedule Attention Needed',
          message: 'Your current adaptive schedule has detected tight capacity or deadline constraints. Open Schedule to review recommendations.',
          timestamp: now.toISOString(),
          read: false,
          dismissed: false,
          dedupKey,
          target: {
            type: ACTION_TARGET_TYPES.SCHEDULE,
            view: 'today',
            action: 'open_schedule',
          },
          meta: {
            scheduleId,
            feasibilityStatus: summary.feasibilityStatus,
          },
        });
      }
    }
  }

  return candidates;
}
