/**
 * VoxPlan Notification System Types & Schemas
 *
 * Defines notification categories, priority levels, action target types,
 * and standard schemas for local-first notification management.
 */

export const NOTIFICATION_CATEGORIES = Object.freeze({
  DEADLINE: 'deadline',     // Upcoming task due dates
  OVERDUE: 'overdue',       // Tasks past their deadline
  SCHEDULE: 'schedule',     // Schedule proposals, feasibility warnings, conflicts
  DEPENDENCY: 'dependency', // Tasks blocked or newly unblocked
  SYSTEM: 'system',         // App updates, backup reminders, permission advice
});

export const NOTIFICATION_PRIORITIES = Object.freeze({
  CRITICAL: 'critical', // Immediate action needed (overdue, infeasible plan)
  HIGH: 'high',         // Imminent deadline (< 1 hour)
  NORMAL: 'normal',     // Standard notifications (due today, unblocked)
  LOW: 'low',           // Informational notices (system tips, successful backup)
});

export const ACTION_TARGET_TYPES = Object.freeze({
  TASK: 'task',
  SCHEDULE: 'schedule',
  CALENDAR: 'calendar',
  BACKUP: 'backup',
  SETTINGS: 'settings',
});

/**
 * Validates whether an object adheres to the VoxPlan Notification schema.
 * @param {object} item
 * @returns {boolean}
 */
export function isValidNotification(item) {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.id !== 'string' || !item.id.trim()) return false;
  if (!Object.values(NOTIFICATION_CATEGORIES).includes(item.category)) return false;
  if (typeof item.title !== 'string' || !item.title.trim()) return false;
  if (typeof item.message !== 'string') return false;
  if (typeof item.timestamp !== 'string') return false;
  return true;
}
