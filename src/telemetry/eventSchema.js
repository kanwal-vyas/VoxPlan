/**
 * VoxPlan Behavioral Telemetry Event Schema.
 * Defines versioned, strictly validated behavioral event representations.
 */

export const SCHEMA_VERSION = 2;

export const EVENT_TYPES = Object.freeze([
  'task_created',
  'task_started',
  'task_paused',
  'task_completed',
  'task_reopened',
  'task_rescheduled',
  'task_priority_changed',
  'task_effort_revised',
  'task_reordered',
  'recommendation_accepted',
  'recommendation_rejected',
  'schedule_proposal_generated',
  'schedule_proposal_accepted',
  'schedule_proposal_discarded',
  'schedule_preference_expressed',
]);

/**
 * Generates a unique UUID v4.
 * Uses crypto.randomUUID() when available in browser or Node 18+, with safe fallback.
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validates an ISO-8601 timestamp string.
 */
export function isValidISODate(dateStr) {
  if (typeof dateStr !== 'string' || !dateStr.trim()) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

/**
 * Validates that an event object satisfies the versioned behavioral schema.
 * @param {object} event
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEvent(event) {
  const errors = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['Event must be a non-null object.'] };
  }

  // 1. event_id
  if (typeof event.event_id !== 'string' || !event.event_id.trim()) {
    errors.push('event_id must be a non-empty string.');
  }

  // 2. profile_id
  if (typeof event.profile_id !== 'string' || !event.profile_id.trim()) {
    errors.push('profile_id must be a non-empty string.');
  }

  // 3. event_type
  if (!EVENT_TYPES.includes(event.event_type)) {
    errors.push(`event_type must be one of: ${EVENT_TYPES.join(', ')}.`);
  }

  // 4. task_id: required for task lifecycle events
  const isGlobalEvent =
    event.event_type === 'recommendation_accepted' ||
    event.event_type === 'recommendation_rejected' ||
    event.event_type === 'schedule_proposal_generated' ||
    event.event_type === 'schedule_proposal_accepted' ||
    event.event_type === 'schedule_proposal_discarded' ||
    event.event_type === 'schedule_preference_expressed';
  if (!isGlobalEvent) {
    if (typeof event.task_id !== 'string' || !event.task_id.trim()) {
      errors.push('task_id must be a non-empty string.');
    }
  }

  // 5. timestamp
  if (!isValidISODate(event.timestamp)) {
    errors.push('timestamp must be a valid ISO-8601 date string.');
  }

  // 6. schema_version
  if (typeof event.schema_version !== 'number' || event.schema_version < 1) {
    errors.push('schema_version must be an integer >= 1.');
  }

  // 7. payload
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
    errors.push('payload must be a non-null object.');
    return { valid: errors.length === 0, errors };
  }

  const p = event.payload;

  switch (event.event_type) {
    case 'task_created':
      if (typeof p.title !== 'string' || !p.title.trim()) {
        errors.push('task_created payload must have non-empty title.');
      }
      break;

    case 'task_started':
      if (typeof p.session_id !== 'string' || !p.session_id.trim()) {
        errors.push('task_started payload must have non-empty session_id.');
      }
      if (p.started_at && !isValidISODate(p.started_at)) {
        errors.push('task_started started_at must be valid ISO date.');
      }
      break;

    case 'task_paused':
      if (typeof p.session_id !== 'string' || !p.session_id.trim()) {
        errors.push('task_paused payload must have non-empty session_id.');
      }
      if (typeof p.elapsed_seconds !== 'number' || p.elapsed_seconds < 0 || isNaN(p.elapsed_seconds)) {
        errors.push('task_paused payload must have non-negative elapsed_seconds.');
      }
      break;

    case 'task_completed':
      if (!['tracked', 'self_reported', 'unknown'].includes(p.duration_source)) {
        errors.push("task_completed duration_source must be 'tracked', 'self_reported', or 'unknown'.");
      }
      if (p.tracked_duration_seconds != null && (typeof p.tracked_duration_seconds !== 'number' || p.tracked_duration_seconds < 0)) {
        errors.push('tracked_duration_seconds must be a non-negative number.');
      }
      if (p.self_reported_duration_seconds != null && (typeof p.self_reported_duration_seconds !== 'number' || p.self_reported_duration_seconds < 0)) {
        errors.push('self_reported_duration_seconds must be a non-negative number.');
      }
      break;

    case 'task_reopened':
      if (p.reopened_at && !isValidISODate(p.reopened_at)) {
        errors.push('task_reopened reopened_at must be valid ISO date.');
      }
      break;

    case 'task_rescheduled':
      if (p.new_due_date !== null && typeof p.new_due_date !== 'string') {
        errors.push('task_rescheduled new_due_date must be string or null.');
      }
      break;

    case 'task_priority_changed':
      if (!['high', 'medium', 'low'].includes(String(p.new_priority).toLowerCase())) {
        errors.push("task_priority_changed new_priority must be 'high', 'medium', or 'low'.");
      }
      break;

    case 'task_effort_revised':
      if (p.new_effort != null && (typeof p.new_effort !== 'number' || p.new_effort < 0)) {
        errors.push('task_effort_revised new_effort must be a non-negative number.');
      }
      break;

    case 'task_reordered':
      if (typeof p.previous_index !== 'number' || typeof p.new_index !== 'number') {
        errors.push('task_reordered must contain numeric previous_index and new_index.');
      }
      break;

    case 'recommendation_accepted':
    case 'recommendation_rejected':
      if (typeof p.recommendation_type !== 'string' || !p.recommendation_type.trim()) {
        errors.push('recommendation payload must contain recommendation_type.');
      }
      break;

    case 'schedule_proposal_generated':
      if (typeof p.schedule_id !== 'string' || !p.schedule_id.trim()) {
        errors.push('schedule_proposal_generated payload must contain schedule_id.');
      }
      break;

    case 'schedule_proposal_accepted':
      if (typeof p.schedule_id !== 'string' || !p.schedule_id.trim()) {
        errors.push('schedule_proposal_accepted payload must contain schedule_id.');
      }
      break;

    case 'schedule_proposal_discarded':
      if (typeof p.schedule_id !== 'string' || !p.schedule_id.trim()) {
        errors.push('schedule_proposal_discarded payload must contain schedule_id.');
      }
      break;

    case 'schedule_preference_expressed':
      if (typeof p.comparison_id !== 'string' || !p.comparison_id.trim()) {
        errors.push('schedule_preference_expressed payload must contain comparison_id.');
      }
      if (typeof p.source !== 'string' || !p.source.trim()) {
        errors.push('schedule_preference_expressed payload must contain source.');
      }
      if (!p.alternative_a || typeof p.alternative_a !== 'object' || Array.isArray(p.alternative_a)) {
        errors.push('schedule_preference_expressed payload must contain alternative_a object.');
      }
      if (!p.alternative_b || typeof p.alternative_b !== 'object' || Array.isArray(p.alternative_b)) {
        errors.push('schedule_preference_expressed payload must contain alternative_b object.');
      }
      if (!['alternative_a', 'alternative_b', 'neutral', 'both_unacceptable'].includes(p.selected)) {
        errors.push("schedule_preference_expressed selected must be 'alternative_a', 'alternative_b', 'neutral', or 'both_unacceptable'.");
      }
      break;

    default:
      break;
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Creates and validates a new behavioral event.
 * @returns {object} The validated event.
 * @throws {Error} If validation fails.
 */
export function createEvent({
  profileId,
  taskId = null,
  eventType,
  payload = {},
  timestamp = null,
  eventId = null,
}) {
  const event = {
    event_id: eventId || `evt_${generateUUID()}`,
    profile_id: profileId,
    task_id: taskId,
    event_type: eventType,
    timestamp: timestamp || new Date().toISOString(),
    schema_version: SCHEMA_VERSION,
    payload: { ...payload },
  };

  const validation = validateEvent(event);
  if (!validation.valid) {
    throw new Error(`Invalid behavioral event (${eventType}): ${validation.errors.join('; ')}`);
  }

  return Object.freeze(event);
}
