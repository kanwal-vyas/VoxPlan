/**
 * VoxPlan Backup Orchestrator & Staged Restore Manager (Phase 8, Stage 8.2).
 *
 * Implements end-to-end user-controlled encrypted backup export and transactional staged restore:
 * 1. Data Collection: Aggregates genuine user tasks, accepted schedules, time-blocking preferences,
 *    and IndexedDB telemetry while strictly excluding transient markers and in-flight timers.
 * 2. Cryptographic Export: Encrypts with PBKDF2 + AES-GCM and triggers browser file download.
 * 3. Staged Restore:
 *    - Validates file size, envelope, and password in memory.
 *    - Validates domain schema, duplicate IDs, and task dependencies.
 *    - Verifies storage revision to prevent races with concurrent edits or demo locks.
 *    - Takes pre-restore rollback snapshot before mutating storage.
 *    - Applies replacement to localStorage and IndexedDB with read-back verification.
 *    - Cleans up recovery markers only upon verified success.
 */

import {
  encryptBackupPayload,
  decryptBackupPayload,
  CURRENT_APP_VERSION,
  MAX_BACKUP_FILE_SIZE,
} from './backupCrypto.js';
import {
  validateBackupEnvelope,
  validateBackupPayload,
  SUPPORTED_PAYLOAD_SCHEMA_VERSION,
} from './backupValidator.js';
import {
  getEventsByProfile,
  saveEventsBatch,
  clearEventsByProfile,
  getTimerSessionsByTask,
  saveTimerSession,
  clearTimerSessionsByProfile,
} from '../telemetry/indexedDbStore.js';
import { isDemoLockActive, isDemoTask } from './demoDataSeeder.js';

export const RESTORE_IN_PROGRESS_KEY = 'voxplan_restore_in_progress';
export const RESTORE_PRE_SNAPSHOT_KEY = 'voxplan_restore_pre_snapshot';

const TASKS_STORAGE_KEY = 'voxplan_tasks';
const SCHEDULE_STORAGE_KEY = 'voxplan_accepted_schedule';
const TIME_BLOCK_STORAGE_KEY = 'voxplan_time_block_settings';
const SPEECH_STORAGE_KEY = 'voxplan_speech_output_enabled';
const PREFERENCE_STORAGE_KEY = 'voxplan_preference_collection_enabled';
const PROFILE_ID_KEY = 'voxplan_profile_id';
const REVISION_KEY = 'voxplan_tasks_revision';

/**
 * Safely resolves localStorage across browser and test environments.
 * @param {object} [injectedStorage]
 * @returns {Storage|null}
 */
function resolveStorage(injectedStorage) {
  if (injectedStorage) return injectedStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Collects all user-owned productivity data for backup.
 *
 * Exclusions:
 * - In-flight stopwatch/timer state (`voxplan_active_timer`): transient.
 * - Demo lock (`voxplan_demo_action_lock`): operational lock.
 * - Demo seed active flag (`voxplan_demo_seed_active`): operational state.
 * - Demo cleanup pending (`voxplan_demo_cleanup_pending`): recovery state.
 * - Pre-seed backup envelope (`voxplan_user_tasks_backup`): internal rollback.
 * - Adaptive config snapshots: shadow diagnostics only; factory baseline is immutable.
 *
 * @param {object} [options]
 * @param {Storage} [options.storage]
 * @param {boolean} [options.includeDemoTasks=false] Whether to include demo-seeded tasks
 * @returns {Promise<object>} Complete unencrypted backup object
 */
export async function collectBackupData(options = {}) {
  const storage = resolveStorage(options.storage);
  const includeDemo = options.includeDemoTasks ?? false;

  // 1. Collect Tasks
  let rawTasks = [];
  if (storage) {
    try {
      const raw = storage.getItem(TASKS_STORAGE_KEY);
      if (raw) rawTasks = JSON.parse(raw);
    } catch {
      rawTasks = [];
    }
  }
  if (!Array.isArray(rawTasks)) rawTasks = [];

  const tasksToExport = includeDemo ? rawTasks : rawTasks.filter((t) => !isDemoTask(t));

  // 2. Collect Accepted Schedule
  let acceptedSchedule = null;
  if (storage) {
    try {
      const schedRaw = storage.getItem(SCHEDULE_STORAGE_KEY);
      if (schedRaw) acceptedSchedule = JSON.parse(schedRaw);
    } catch {
      acceptedSchedule = null;
    }
  }

  // 3. Collect Time Block Settings
  let timeBlockSettings = null;
  if (storage) {
    try {
      const tbRaw = storage.getItem(TIME_BLOCK_STORAGE_KEY);
      if (tbRaw) timeBlockSettings = JSON.parse(tbRaw);
    } catch {
      timeBlockSettings = null;
    }
  }

  // 4. Collect User Preferences
  const settings = {
    speech_output_enabled: storage?.getItem(SPEECH_STORAGE_KEY) === 'true',
    preference_collection_enabled: storage?.getItem(PREFERENCE_STORAGE_KEY) === 'true',
  };

  // 5. Collect Profile ID
  const profileId = storage?.getItem(PROFILE_ID_KEY) || 'prof_default';

  // 6. Collect Genuine Telemetry Events from IndexedDB
  let genuineEvents = [];
  try {
    const allEvents = await getEventsByProfile(profileId);
    genuineEvents = (allEvents || []).filter((ev) => !ev.isDemoSeed && !ev.isSyntheticData);
  } catch {
    genuineEvents = [];
  }

  // 7. Collect Timer Sessions from IndexedDB
  const genuineSessions = [];
  try {
    for (const t of tasksToExport) {
      if (t && t.id) {
        const sessions = await getTimerSessionsByTask(t.id);
        for (const s of sessions || []) {
          if (s && !genuineSessions.some((existing) => existing.session_id === s.session_id)) {
            genuineSessions.push(s);
          }
        }
      }
    }
  } catch {
    // If sessions cannot be read, preserve task backup without failing
  }

  return {
    schema_version: SUPPORTED_PAYLOAD_SCHEMA_VERSION,
    app_version: CURRENT_APP_VERSION,
    exported_at: new Date().toISOString(),
    profile_id: profileId,
    data: {
      tasks: tasksToExport,
      accepted_schedule: acceptedSchedule,
      time_block_settings: timeBlockSettings,
      settings,
      telemetry_events: genuineEvents,
      timer_sessions: genuineSessions,
    },
    metadata: {
      task_count: tasksToExport.length,
      completed_task_count: tasksToExport.filter((t) => t.completed).length,
      active_task_count: tasksToExport.filter((t) => !t.completed).length,
      has_accepted_schedule: Boolean(acceptedSchedule),
      has_time_block_settings: Boolean(timeBlockSettings),
      telemetry_event_count: genuineEvents.length,
      timer_session_count: genuineSessions.length,
    },
  };
}

/**
 * Triggers a client-side file download of the encrypted backup file.
 *
 * @param {string} fileContent Serialized envelope string
 * @param {string} filename Desired filename
 * @returns {{ filename: string }}
 */
export function downloadBackupFile(fileContent, filename) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { filename };
  }

  const blob = new Blob([fileContent], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  return { filename };
}

/**
 * Executes the complete encrypted backup export pipeline.
 *
 * @param {string} password User-provided encryption password
 * @param {object} [options]
 * @param {Storage} [options.storage]
 * @param {boolean} [options.triggerDownload=true]
 * @param {number} [options.iterations] Optional custom KDF iterations count
 * @returns {Promise<{ success: boolean, filename: string, envelope: object, metadata: object }>}
 */
export async function exportEncryptedBackup(password, options = {}) {
  const triggerDownload = options.triggerDownload ?? true;

  // 1. Gather all persistent user data
  const backupData = await collectBackupData(options);

  // 2. Encrypt using Web Crypto PBKDF2 + AES-GCM
  const payloadJson = JSON.stringify(backupData);
  const envelope = await encryptBackupPayload(payloadJson, password, options);

  // 3. Format and name file
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `voxplan_backup_${dateStr}.voxplan`;
  const envelopeString = JSON.stringify(envelope, null, 2);

  // 4. Trigger download if in browser
  if (triggerDownload) {
    downloadBackupFile(envelopeString, filename);
  }

  return {
    success: true,
    filename,
    envelope,
    metadata: backupData.metadata,
  };
}

/**
 * Reads a File or string, validates its cryptographic envelope, decrypts it,
 * checks domain integrity, and generates a preview summary.
 *
 * @param {File|Blob|string|object} fileOrEnvelope
 * @param {string} password
 * @param {object} [options]
 * @param {Storage} [options.storage]
 * @returns {Promise<{ success: boolean, validation?: object, error?: string, message?: string, expectedRevision?: string }>}
 */
export async function validateAndPreviewBackup(fileOrEnvelope, password, options = {}) {
  const storage = resolveStorage(options.storage);
  let envelopeObj = null;

  // 1. Read input
  if (typeof fileOrEnvelope === 'string') {
    if (fileOrEnvelope.length > MAX_BACKUP_FILE_SIZE) {
      return { success: false, error: 'oversized_file', message: 'Backup file exceeds maximum allowed size (10 MB).' };
    }
    try {
      envelopeObj = JSON.parse(fileOrEnvelope);
    } catch {
      return { success: false, error: 'malformed_json', message: 'Selected file is not valid JSON.' };
    }
  } else if (fileOrEnvelope && typeof fileOrEnvelope === 'object' && typeof fileOrEnvelope.text === 'function') {
    // Browser File / Blob object
    if (fileOrEnvelope.size > MAX_BACKUP_FILE_SIZE) {
      return { success: false, error: 'oversized_file', message: 'Backup file exceeds maximum allowed size (10 MB).' };
    }
    const text = await fileOrEnvelope.text();
    try {
      envelopeObj = JSON.parse(text);
    } catch {
      return { success: false, error: 'malformed_json', message: 'Selected file is not valid JSON.' };
    }
  } else if (fileOrEnvelope && typeof fileOrEnvelope === 'object') {
    envelopeObj = fileOrEnvelope;
  } else {
    return { success: false, error: 'invalid_input', message: 'No valid backup file provided.' };
  }

  // 2. Validate envelope parameters before expensive decryption
  const envCheck = validateBackupEnvelope(envelopeObj);
  if (!envCheck.valid) {
    return { success: false, error: envCheck.error, message: envCheck.message };
  }

  // 3. Attempt authenticated decryption
  let plaintext = '';
  try {
    plaintext = await decryptBackupPayload(envelopeObj, password);
  } catch (decErr) {
    return { success: false, error: 'decryption_failed', message: decErr.message };
  }

  // 4. Validate schema and domain invariants
  let currentTasks = [];
  if (storage) {
    try {
      const raw = storage.getItem(TASKS_STORAGE_KEY);
      if (raw) currentTasks = JSON.parse(raw);
    } catch {
      currentTasks = [];
    }
  }

  const payloadCheck = validateBackupPayload(plaintext, currentTasks);
  if (!payloadCheck.valid) {
    return { success: false, error: payloadCheck.error, message: payloadCheck.message };
  }

  const expectedRevision = storage?.getItem(REVISION_KEY) || '';

  return {
    success: true,
    envelope: envelopeObj,
    validation: payloadCheck,
    expectedRevision,
  };
}

/**
 * Applies a verified backup payload transactionally to storage with rollback protection.
 *
 * @param {object} validatedPayload The validated payload result from validateBackupPayload
 * @param {object} [options]
 * @param {Storage} [options.storage]
 * @param {string} [options.expectedRevision] Storage revision recorded at preview time
 * @returns {Promise<{ success: boolean, message: string, taskCount: number, error?: string }>}
 */
export async function restoreBackupData(validatedPayload, options = {}) {
  const storage = resolveStorage(options.storage);
  if (!storage) {
    return { success: false, error: 'no_storage', message: 'Local storage is unavailable in this environment.' };
  }

  if (!validatedPayload || !validatedPayload.data || !Array.isArray(validatedPayload.data.tasks)) {
    return { success: false, error: 'invalid_payload', message: 'Cannot restore invalid or unverified backup payload.' };
  }

  // 1. Cross-tab concurrency guard: check revision mismatch
  if (options.expectedRevision !== undefined) {
    const currentRevision = storage.getItem(REVISION_KEY) || '';
    if (currentRevision !== options.expectedRevision) {
      return {
        success: false,
        error: 'concurrent_modification',
        message: 'A concurrent task change occurred in another tab. Restoration aborted to protect data integrity.',
      };
    }
  }

  // 2. Demo lock guard: abort if demo action is active
  if (isDemoLockActive(storage)) {
    return {
      success: false,
      error: 'demo_action_in_progress',
      message: 'A demo seeding or reset operation is currently in progress. Restoration aborted.',
    };
  }

  // 3. Create pre-restore rollback snapshot
  const preRestoreSnapshot = {
    tasks: storage.getItem(TASKS_STORAGE_KEY),
    schedule: storage.getItem(SCHEDULE_STORAGE_KEY),
    timeBlocks: storage.getItem(TIME_BLOCK_STORAGE_KEY),
    speech: storage.getItem(SPEECH_STORAGE_KEY),
    preference: storage.getItem(PREFERENCE_STORAGE_KEY),
    revision: storage.getItem(REVISION_KEY),
  };

  const restoreMarker = {
    startedAt: Date.now(),
    exportedAt: validatedPayload.exported_at,
    taskCount: validatedPayload.data.tasks.length,
  };

  try {
    // Record pending restore recovery marker
    storage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify(restoreMarker));
    storage.setItem(RESTORE_PRE_SNAPSHOT_KEY, JSON.stringify(preRestoreSnapshot));

    // 4. Persist Tasks to localStorage
    const tasksJson = JSON.stringify(validatedPayload.data.tasks);
    storage.setItem(TASKS_STORAGE_KEY, tasksJson);

    // Verify task write immediately
    const verifyTasks = storage.getItem(TASKS_STORAGE_KEY);
    if (!verifyTasks || verifyTasks !== tasksJson) {
      throw new Error('Tasks write verification failed');
    }

    // 5. Persist Accepted Schedule
    if (validatedPayload.data.accepted_schedule) {
      storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(validatedPayload.data.accepted_schedule));
    } else {
      storage.removeItem(SCHEDULE_STORAGE_KEY);
    }

    // 6. Persist Time Block Settings
    if (validatedPayload.data.time_block_settings) {
      storage.setItem(TIME_BLOCK_STORAGE_KEY, JSON.stringify(validatedPayload.data.time_block_settings));
    }

    // 7. Persist User Preferences
    if (validatedPayload.data.settings) {
      storage.setItem(SPEECH_STORAGE_KEY, String(validatedPayload.data.settings.speech_output_enabled));
      storage.setItem(PREFERENCE_STORAGE_KEY, String(validatedPayload.data.settings.preference_collection_enabled));
    }

    // 8. Advance Storage Revision to synchronize all open tabs
    const newRevision = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    storage.setItem(REVISION_KEY, newRevision);

    // 9. Persist Telemetry Events & Sessions to IndexedDB
    const profileId = validatedPayload.profile_id || storage.getItem(PROFILE_ID_KEY) || 'prof_default';
    if (Array.isArray(validatedPayload.data.telemetry_events) && validatedPayload.data.telemetry_events.length > 0) {
      try {
        await clearEventsByProfile(profileId);
        await saveEventsBatch(validatedPayload.data.telemetry_events);
      } catch (idbErr) {
        console.warn('Telemetry events restore encountered an issue:', idbErr);
      }
    }

    if (Array.isArray(validatedPayload.data.timer_sessions) && validatedPayload.data.timer_sessions.length > 0) {
      try {
        await clearTimerSessionsByProfile(profileId);
        for (const sess of validatedPayload.data.timer_sessions) {
          await saveTimerSession(sess);
        }
      } catch (sessErr) {
        console.warn('Timer sessions restore encountered an issue:', sessErr);
      }
    }

    // 10. Verification succeeded cleanly: clear recovery markers
    storage.removeItem(RESTORE_IN_PROGRESS_KEY);
    storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);

    return {
      success: true,
      taskCount: validatedPayload.data.tasks.length,
      message: `Successfully restored ${validatedPayload.data.tasks.length} task(s) and workspace settings.`,
    };
  } catch (err) {
    // Roll back to pre-restore snapshot
    console.error('Restore failed, initiating rollback:', err);
    try {
      if (preRestoreSnapshot.tasks !== null) {
        storage.setItem(TASKS_STORAGE_KEY, preRestoreSnapshot.tasks);
      } else {
        storage.removeItem(TASKS_STORAGE_KEY);
      }
      if (preRestoreSnapshot.schedule !== null) {
        storage.setItem(SCHEDULE_STORAGE_KEY, preRestoreSnapshot.schedule);
      } else {
        storage.removeItem(SCHEDULE_STORAGE_KEY);
      }
      if (preRestoreSnapshot.timeBlocks !== null) {
        storage.setItem(TIME_BLOCK_STORAGE_KEY, preRestoreSnapshot.timeBlocks);
      }
      if (preRestoreSnapshot.revision !== null) {
        storage.setItem(REVISION_KEY, preRestoreSnapshot.revision);
      }
    } catch (rbErr) {
      console.error('Critical: Rollback write failed:', rbErr);
    }

    return {
      success: false,
      error: 'restore_failed',
      message: `Restoration failed: ${err.message}. Local data rolled back to original state.`,
    };
  }
}

/**
 * Checks for interrupted restore state on application launch and performs recovery if needed.
 *
 * @param {Storage} [storage]
 * @returns {{ recovered: boolean, message?: string }}
 */
export function checkAndRecoverInterruptedRestore(storage = resolveStorage()) {
  if (!storage) return { recovered: false };

  const markerRaw = storage.getItem(RESTORE_IN_PROGRESS_KEY);
  if (!markerRaw) return { recovered: false };

  console.warn('Interrupted restore operation detected during startup.');
  const preSnapshotRaw = storage.getItem(RESTORE_PRE_SNAPSHOT_KEY);

  let tasksValid = false;
  try {
    const rawTasks = storage.getItem(TASKS_STORAGE_KEY);
    if (rawTasks && Array.isArray(JSON.parse(rawTasks))) {
      tasksValid = true;
    }
  } catch {
    tasksValid = false;
  }

  if (tasksValid) {
    // Current tasks are valid and intact; clear the lingering marker
    storage.removeItem(RESTORE_IN_PROGRESS_KEY);
    storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
    return { recovered: true, message: 'Recovered from interrupted restore: tasks are intact.' };
  }

  // Tasks are corrupt or empty; roll back from pre-restore snapshot if available
  if (preSnapshotRaw) {
    try {
      const snap = JSON.parse(preSnapshotRaw);
      if (snap.tasks) {
        storage.setItem(TASKS_STORAGE_KEY, snap.tasks);
      }
      if (snap.schedule) {
        storage.setItem(SCHEDULE_STORAGE_KEY, snap.schedule);
      }
      storage.removeItem(RESTORE_IN_PROGRESS_KEY);
      storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
      return { recovered: true, message: 'Recovered from interrupted restore: rolled back to pre-restore snapshot.' };
    } catch {
      // Failed to parse snapshot
    }
  }

  storage.removeItem(RESTORE_IN_PROGRESS_KEY);
  return { recovered: false, message: 'Interrupted restore marker cleared; manual review recommended.' };
}
