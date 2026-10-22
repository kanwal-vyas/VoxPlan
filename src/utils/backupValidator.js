/**
 * VoxPlan Backup Payload & Envelope Validator (Phase 8, Stage 8.2).
 *
 * Provides defensive schema validation, domain integrity checks, duplicate ID detection,
 * and restore preview generation.
 *
 * Invariant: Never mutates application storage during validation.
 */

import {
  BACKUP_FORMAT_IDENTIFIER,
  CURRENT_ENVELOPE_VERSION,
  MIN_KDF_ITERATIONS,
  MAX_KDF_ITERATIONS,
} from './backupCrypto.js';

export const SUPPORTED_PAYLOAD_SCHEMA_VERSION = 1;
export const MAX_ALLOWED_TASKS = 2000;
export const MAX_ALLOWED_EVENTS = 10000;
export const VALID_PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);

/**
 * Validates the unencrypted cryptographic envelope structure before attempting decryption.
 *
 * @param {object} envelope
 * @returns {{ valid: boolean, error?: string, message?: string }}
 */
export function validateBackupEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, error: 'invalid_envelope', message: 'Backup file must contain a valid JSON object.' };
  }

  if (envelope.format !== BACKUP_FORMAT_IDENTIFIER) {
    return {
      valid: false,
      error: 'unsupported_format',
      message: `Invalid backup format "${envelope.format}". Expected "${BACKUP_FORMAT_IDENTIFIER}".`,
    };
  }

  if (envelope.version !== CURRENT_ENVELOPE_VERSION) {
    return {
      valid: false,
      error: 'unsupported_envelope_version',
      message: `Unsupported backup envelope version ${envelope.version}. Current version is ${CURRENT_ENVELOPE_VERSION}.`,
    };
  }

  if (!envelope.kdf || typeof envelope.kdf !== 'object') {
    return { valid: false, error: 'missing_kdf', message: 'Envelope is missing KDF specification.' };
  }

  if (envelope.kdf.algorithm !== 'PBKDF2' || envelope.kdf.hash !== 'SHA-256') {
    return {
      valid: false,
      error: 'unsupported_kdf',
      message: 'Envelope specifies unsupported KDF parameters. Expected PBKDF2 with SHA-256.',
    };
  }

  const iter = envelope.kdf.iterations;
  if (typeof iter !== 'number' || !Number.isInteger(iter) || iter < MIN_KDF_ITERATIONS || iter > MAX_KDF_ITERATIONS) {
    return {
      valid: false,
      error: 'kdf_iterations_out_of_bounds',
      message: `KDF iterations (${iter}) must be an integer between ${MIN_KDF_ITERATIONS} and ${MAX_KDF_ITERATIONS}.`,
    };
  }

  if (typeof envelope.kdf.salt !== 'string' || envelope.kdf.salt.trim() === '') {
    return { valid: false, error: 'invalid_salt', message: 'Envelope is missing cryptographic salt.' };
  }

  if (!envelope.encryption || typeof envelope.encryption !== 'object') {
    return { valid: false, error: 'missing_encryption', message: 'Envelope is missing encryption specification.' };
  }

  if (envelope.encryption.cipher !== 'AES-GCM' || envelope.encryption.tag_length !== 128) {
    return {
      valid: false,
      error: 'unsupported_cipher',
      message: 'Envelope specifies unsupported cipher. Expected AES-GCM with 128-bit tag.',
    };
  }

  if (typeof envelope.encryption.iv !== 'string' || envelope.encryption.iv.trim() === '') {
    return { valid: false, error: 'invalid_iv', message: 'Envelope is missing encryption initialization vector (IV).' };
  }

  if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.trim() === '') {
    return { valid: false, error: 'missing_ciphertext', message: 'Envelope is missing encrypted payload ciphertext.' };
  }

  return { valid: true };
}

/**
 * Validates a single task record defensively against VoxPlan's domain model.
 *
 * @param {object} task Raw task record
 * @param {number} index Array index for error context
 * @returns {{ valid: boolean, error?: string, normalizedTask?: object }}
 */
export function validateTaskRecord(task, index) {
  if (!task || typeof task !== 'object') {
    return { valid: false, error: `Task at index ${index} must be an object.` };
  }

  if (typeof task.id !== 'string' || task.id.trim() === '') {
    return { valid: false, error: `Task at index ${index} is missing a non-empty string "id".` };
  }

  if (typeof task.title !== 'string' || task.title.trim() === '') {
    return { valid: false, error: `Task "${task.id}" is missing a non-empty string "title".` };
  }

  const normalizedPriority = typeof task.priority === 'string' && VALID_PRIORITIES.includes(task.priority.toLowerCase())
    ? task.priority.toLowerCase()
    : 'medium';

  const normalizedCategory = typeof task.category === 'string' && task.category.trim() !== ''
    ? task.category.trim()
    : 'General';

  const rawEffort = task.estimatedEffort ?? task.estimated_duration ?? 2.0;
  const numEffort = typeof rawEffort === 'number' && !isNaN(rawEffort) && rawEffort >= 0 ? rawEffort : 2.0;

  const dependencies = Array.isArray(task.dependencies)
    ? task.dependencies.filter((d) => typeof d === 'string' && d.trim() !== '')
    : [];

  const completed = Boolean(task.completed);

  const normalizedTask = {
    id: task.id.trim(),
    title: task.title.trim(),
    description: typeof task.description === 'string' ? task.description : '',
    priority: normalizedPriority,
    category: normalizedCategory,
    dueDate: typeof task.dueDate === 'string' ? task.dueDate : (typeof task.due_date === 'string' ? task.due_date : null),
    completed,
    estimatedEffort: numEffort,
    dependencies,
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : new Date().toISOString(),
    ...(task.isDemoSeed ? { isDemoSeed: true } : {}),
    ...(typeof task.actual_duration === 'number' ? { actual_duration: task.actual_duration } : {}),
    ...(typeof task.tracked_duration === 'number' ? { tracked_duration: task.tracked_duration } : {}),
    ...(typeof task.self_reported_duration === 'number' ? { self_reported_duration: task.self_reported_duration } : {}),
    ...(typeof task.tracking_type === 'string' ? { tracking_type: task.tracking_type } : {}),
    ...(Array.isArray(task.status_history) ? { status_history: task.status_history } : {}),
  };

  return { valid: true, normalizedTask };
}

/**
 * Validates the decrypted JSON payload string, checking domain invariants,
 * duplicate IDs, broken dependencies, and generating a preview summary.
 *
 * @param {string} payloadJsonString Decrypted plaintext string
 * @param {object[]} [currentTasks] Currently loaded tasks in the application
 * @returns {{ valid: boolean, error?: string, message?: string, data?: object, summary?: object, warnings?: string[] }}
 */
export function validateBackupPayload(payloadJsonString, currentTasks = []) {
  if (typeof payloadJsonString !== 'string' || payloadJsonString.trim() === '') {
    return { valid: false, error: 'empty_payload', message: 'Decrypted backup payload is empty.' };
  }

  let payload;
  try {
    payload = JSON.parse(payloadJsonString);
  } catch (parseErr) {
    return {
      valid: false,
      error: 'malformed_json',
      message: `Decrypted payload is not valid JSON: ${parseErr.message}`,
    };
  }

  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'invalid_payload_root', message: 'Payload root must be an object.' };
  }

  if (payload.schema_version !== SUPPORTED_PAYLOAD_SCHEMA_VERSION) {
    return {
      valid: false,
      error: 'unsupported_schema_version',
      message: `Unsupported backup schema version ${payload.schema_version}. Current supported version is ${SUPPORTED_PAYLOAD_SCHEMA_VERSION}.`,
    };
  }

  if (!payload.data || typeof payload.data !== 'object') {
    return { valid: false, error: 'missing_data_node', message: 'Backup payload is missing "data" node.' };
  }

  const warnings = [];

  // 1. Validate Tasks Array
  if (!Array.isArray(payload.data.tasks)) {
    return { valid: false, error: 'tasks_not_array', message: 'Backup data.tasks must be an array.' };
  }

  if (payload.data.tasks.length > MAX_ALLOWED_TASKS) {
    return {
      valid: false,
      error: 'task_count_exceeded',
      message: `Backup contains ${payload.data.tasks.length} tasks, exceeding the safety limit of ${MAX_ALLOWED_TASKS}.`,
    };
  }

  const normalizedTasks = [];
  const seenTaskIds = new Set();

  for (let i = 0; i < payload.data.tasks.length; i++) {
    const rawTask = payload.data.tasks[i];
    const taskValidation = validateTaskRecord(rawTask, i);
    if (!taskValidation.valid) {
      return {
        valid: false,
        error: 'invalid_task_record',
        message: taskValidation.error,
      };
    }

    const task = taskValidation.normalizedTask;
    if (seenTaskIds.has(task.id)) {
      return {
        valid: false,
        error: 'duplicate_task_id',
        message: `Backup contains duplicate task identifier "${task.id}".`,
      };
    }
    seenTaskIds.add(task.id);
    normalizedTasks.push(task);
  }

  // 2. Validate Dependency References
  for (const t of normalizedTasks) {
    for (const depId of t.dependencies) {
      if (!seenTaskIds.has(depId)) {
        warnings.push(`Broken dependency: task "${t.title}" (${t.id}) references missing task ID "${depId}".`);
      }
    }
  }

  // 3. Validate Accepted Schedule (Optional)
  let normalizedSchedule = null;
  if (payload.data.accepted_schedule && typeof payload.data.accepted_schedule === 'object') {
    const sched = payload.data.accepted_schedule;
    if (typeof sched.scheduleId === 'string' && Array.isArray(sched.placements)) {
      normalizedSchedule = sched;
    } else {
      warnings.push('Accepted schedule record is incomplete or malformed and will be omitted.');
    }
  }

  // 4. Validate Time Block Settings (Optional)
  let normalizedTimeBlocks = null;
  if (payload.data.time_block_settings && typeof payload.data.time_block_settings === 'object') {
    const tb = payload.data.time_block_settings;
    if (tb.workingHours && typeof tb.workingHours === 'object') {
      normalizedTimeBlocks = tb;
    }
  }

  // 5. Validate User Settings (Optional)
  const normalizedSettings = {
    speech_output_enabled: Boolean(payload.data.settings?.speech_output_enabled),
    preference_collection_enabled: Boolean(payload.data.settings?.preference_collection_enabled),
  };

  // 6. Validate Telemetry Events (Optional)
  const normalizedEvents = [];
  if (Array.isArray(payload.data.telemetry_events)) {
    if (payload.data.telemetry_events.length > MAX_ALLOWED_EVENTS) {
      warnings.push(`Telemetry events count (${payload.data.telemetry_events.length}) exceeds safety cap. Truncating to ${MAX_ALLOWED_EVENTS}.`);
    }
    const eventsSlice = payload.data.telemetry_events.slice(0, MAX_ALLOWED_EVENTS);
    for (const ev of eventsSlice) {
      if (ev && typeof ev === 'object' && typeof ev.event_id === 'string' && typeof ev.event_type === 'string') {
        normalizedEvents.push(ev);
      }
    }
  }

  // 7. Validate Timer Sessions (Optional)
  const normalizedSessions = [];
  if (Array.isArray(payload.data.timer_sessions)) {
    for (const sess of payload.data.timer_sessions) {
      if (sess && typeof sess === 'object' && typeof sess.session_id === 'string') {
        normalizedSessions.push(sess);
      }
    }
  }

  const completedCount = normalizedTasks.filter((t) => t.completed).length;
  const activeCount = normalizedTasks.filter((t) => !t.completed).length;

  return {
    valid: true,
    schema_version: payload.schema_version,
    exported_at: payload.exported_at || new Date().toISOString(),
    profile_id: payload.profile_id || null,
    data: {
      tasks: normalizedTasks,
      accepted_schedule: normalizedSchedule,
      time_block_settings: normalizedTimeBlocks,
      settings: normalizedSettings,
      telemetry_events: normalizedEvents,
      timer_sessions: normalizedSessions,
    },
    summary: {
      taskCount: normalizedTasks.length,
      completedCount,
      activeCount,
      hasAcceptedSchedule: Boolean(normalizedSchedule),
      hasTimeBlocks: Boolean(normalizedTimeBlocks),
      eventCount: normalizedEvents.length,
      sessionCount: normalizedSessions.length,
      currentTaskCount: Array.isArray(currentTasks) ? currentTasks.length : 0,
    },
    warnings,
  };
}
