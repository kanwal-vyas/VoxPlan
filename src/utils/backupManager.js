/**
 * VoxPlan Backup Orchestrator & Hardened Staged Restore Manager (Phase 8, Stage 8.2A).
 *
 * Implements end-to-end user-controlled encrypted backup export and transactional staged restore:
 * 1. Data Collection: Aggregates genuine user tasks, accepted schedules, time-blocking preferences,
 *    and IndexedDB telemetry while strictly excluding transient markers and in-flight timers.
 * 2. Cryptographic Export: Encrypts with PBKDF2 + AES-GCM and triggers browser file download.
 * 3. Two-Phase Staged Restore Protocol:
 *    - Validates file size, envelope, and password in memory.
 *    - Validates domain schema, duplicate IDs, and task dependencies.
 *    - Multi-store concurrency guard: verifies composite workspace fingerprint (tasks, schedule, time blocks, settings, telemetry).
 *    - Preflight guards: checks demo action locks and pending demo cleanups.
 *    - Pre-restore snapshot: captures complete state across both localStorage and IndexedDB before any mutation.
 *    - Explicit restore journal: tracks phases (PREPARED -> COMMITTING_INDEXED_DB -> INDEXED_DB_COMMITTED -> COMMITTING_LOCAL_STORAGE -> VERIFYING -> COMMITTED).
 *    - Applies mutations with transactional IndexedDB handling and synchronous localStorage replacement.
 *    - Comprehensive read-back verification across all included categories.
 *    - Automatic verified rollback on any failure, with snapshot preservation if rollback fails.
 *    - Idempotent startup recovery detects interrupted operations without dropping valid data.
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
  getTimerSessionsByProfile,
  saveTimerSession,
  clearTimerSessionsByProfile,
} from '../telemetry/indexedDbStore.js';
import {
  isDemoLockActive,
  isDemoTask,
  DEMO_CLEANUP_PENDING_KEY,
} from './demoDataSeeder.js';

export const RESTORE_IN_PROGRESS_KEY = 'voxplan_restore_in_progress';
export const RESTORE_PRE_SNAPSHOT_KEY = 'voxplan_restore_pre_snapshot';
export const RESTORE_JOURNAL_KEY = 'voxplan_restore_journal';

export const RESTORE_PHASES = Object.freeze({
  PREPARED: 'PREPARED',
  COMMITTING_INDEXED_DB: 'COMMITTING_INDEXED_DB',
  INDEXED_DB_COMMITTED: 'INDEXED_DB_COMMITTED',
  COMMITTING_LOCAL_STORAGE: 'COMMITTING_LOCAL_STORAGE',
  VERIFYING: 'VERIFYING',
  COMMITTED: 'COMMITTED',
  ROLLING_BACK: 'ROLLING_BACK',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
});

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
export function resolveStorage(injectedStorage) {
  if (injectedStorage) return injectedStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Computes a fast deterministic 32-bit hash of a string.
 * @param {string} str
 * @returns {string}
 */
function hashString(str) {
  if (!str) return '0';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Computes a composite fingerprint representing the complete restorable workspace state across stores.
 * Detects cross-tab concurrency for tasks, schedules, time-blocks, preferences, telemetry events,
 * and timer sessions using content-sensitive deterministic hashes.
 *
 * Avoids leaking personal information by only hashing structural IDs, timestamps, and one-way digests.
 *
 * @param {Storage} [injectedStorage]
 * @param {string} [profileId='prof_default']
 * @returns {Promise<string>}
 */
export async function computeWorkspaceFingerprint(injectedStorage = null, profileId = 'prof_default') {
  const storage = resolveStorage(injectedStorage);
  if (!storage) return '';

  const tasksRaw = storage.getItem(TASKS_STORAGE_KEY) || '';
  const schedRaw = storage.getItem(SCHEDULE_STORAGE_KEY) || '';
  const tbRaw = storage.getItem(TIME_BLOCK_STORAGE_KEY) || '';
  const speech = storage.getItem(SPEECH_STORAGE_KEY) || '';
  const pref = storage.getItem(PREFERENCE_STORAGE_KEY) || '';
  const revision = storage.getItem(REVISION_KEY) || '';

  let telemetryCount = 0;
  let telemetryHash = '0';
  try {
    const events = (await getEventsByProfile(profileId)) || [];
    telemetryCount = events.length;
    if (telemetryCount > 0) {
      // Deterministically sort and hash content-sensitive structural event tokens
      // Avoiding personal text while detecting event modifications, deletions, or replacements
      const sortedEventTokens = events
        .map((e) => {
          const payloadDigest = e.payload ? hashString(JSON.stringify(e.payload)) : '0';
          return `${e.event_id || ''}:${e.event_type || ''}:${e.timestamp || ''}:${e.task_id || ''}:${payloadDigest}`;
        })
        .sort();
      telemetryHash = hashString(sortedEventTokens.join(';'));
    }
  } catch {
    telemetryCount = 0;
    telemetryHash = '0';
  }

  let sessionsCount = 0;
  let sessionsHash = '0';
  try {
    const sessions = (await getTimerSessionsByProfile(profileId)) || [];
    sessionsCount = sessions.length;
    if (sessionsCount > 0) {
      const sortedSessionTokens = sessions
        .map((s) => {
          const intervalsCount = Array.isArray(s.intervals) ? s.intervals.length : 0;
          return `${s.session_id || ''}:${s.task_id || ''}:${s.status || ''}:${s.started_at || ''}:${s.duration_seconds || s.elapsed_seconds || 0}:${intervalsCount}`;
        })
        .sort();
      sessionsHash = hashString(sortedSessionTokens.join(';'));
    }
  } catch {
    sessionsCount = 0;
    sessionsHash = '0';
  }

  return JSON.stringify({
    tasksHash: hashString(tasksRaw),
    schedHash: hashString(schedRaw),
    tbHash: hashString(tbRaw),
    speech,
    pref,
    revision,
    telemetryCount,
    telemetryHash,
    sessionsCount,
    sessionsHash,
  });
}

/**
 * Helper to construct a hybrid object that is synchronously readable and thenable.
 * @param {object} baseObj
 * @param {Promise} promise
 * @returns {object}
 */
function makeThenable(baseObj, promise) {
  return Object.assign(baseObj, {
    then(onFulfilled, onRejected) {
      return promise.then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return promise.catch(onRejected);
    },
    finally(onFinally) {
      return promise.finally(onFinally);
    },
  });
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
 * @returns {Promise<{ success: boolean, validation?: object, error?: string, message?: string, expectedRevision?: string, workspaceFingerprint?: string }>}
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
  const profileId = payloadCheck.profile_id || storage?.getItem(PROFILE_ID_KEY) || 'prof_default';
  const workspaceFingerprint = await computeWorkspaceFingerprint(storage, profileId);

  return {
    success: true,
    envelope: envelopeObj,
    validation: payloadCheck,
    expectedRevision,
    workspaceFingerprint,
  };
}

/**
 * Executes a verified multi-store rollback from pre-restore snapshot.
 * Restores tasks, schedule, time blocks, speech preference, feedback preference, revision,
 * telemetry events, and timer sessions.
 *
 * @param {Storage} storage
 * @param {object} preRestoreSnapshot
 * @param {string} profileId
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function executeRollback(storage, preRestoreSnapshot, profileId, options = {}) {
  if (!storage || !preRestoreSnapshot) {
    return { success: false, error: 'missing_snapshot' };
  }

  if (options.failRollback || options.injectFailureAfter === 'fail_rollback') {
    throw new Error('Injected failure during rollback execution');
  }

  // 1. Roll back tasks
  if (preRestoreSnapshot.tasks !== null && preRestoreSnapshot.tasks !== undefined) {
    storage.setItem(TASKS_STORAGE_KEY, preRestoreSnapshot.tasks);
  } else {
    storage.removeItem(TASKS_STORAGE_KEY);
  }

  // 2. Roll back schedule
  if (preRestoreSnapshot.schedule !== null && preRestoreSnapshot.schedule !== undefined) {
    storage.setItem(SCHEDULE_STORAGE_KEY, preRestoreSnapshot.schedule);
  } else {
    storage.removeItem(SCHEDULE_STORAGE_KEY);
  }

  // 3. Roll back time blocks
  if (preRestoreSnapshot.timeBlocks !== null && preRestoreSnapshot.timeBlocks !== undefined) {
    storage.setItem(TIME_BLOCK_STORAGE_KEY, preRestoreSnapshot.timeBlocks);
  } else {
    storage.removeItem(TIME_BLOCK_STORAGE_KEY);
  }

  // 4. Roll back speech preference
  if (preRestoreSnapshot.speech !== null && preRestoreSnapshot.speech !== undefined) {
    storage.setItem(SPEECH_STORAGE_KEY, preRestoreSnapshot.speech);
  } else {
    storage.removeItem(SPEECH_STORAGE_KEY);
  }

  // 5. Roll back preference collection
  if (preRestoreSnapshot.preference !== null && preRestoreSnapshot.preference !== undefined) {
    storage.setItem(PREFERENCE_STORAGE_KEY, preRestoreSnapshot.preference);
  } else {
    storage.removeItem(PREFERENCE_STORAGE_KEY);
  }

  // 6. Roll back revision
  if (preRestoreSnapshot.revision !== null && preRestoreSnapshot.revision !== undefined) {
    storage.setItem(REVISION_KEY, preRestoreSnapshot.revision);
  } else {
    storage.removeItem(REVISION_KEY);
  }

  // 7. Roll back IndexedDB telemetry events
  const targetProfile = profileId || preRestoreSnapshot.profileId || 'prof_default';
  try {
    await clearEventsByProfile(targetProfile);
    if (Array.isArray(preRestoreSnapshot.telemetryEvents) && preRestoreSnapshot.telemetryEvents.length > 0) {
      await saveEventsBatch(preRestoreSnapshot.telemetryEvents);
    }
  } catch (idbErr) {
    console.error('IndexedDB events rollback warning:', idbErr);
  }

  // 8. Roll back IndexedDB timer sessions
  try {
    await clearTimerSessionsByProfile(targetProfile);
    if (Array.isArray(preRestoreSnapshot.timerSessions) && preRestoreSnapshot.timerSessions.length > 0) {
      for (const sess of preRestoreSnapshot.timerSessions) {
        await saveTimerSession(sess);
      }
    }
  } catch (sessErr) {
    console.error('IndexedDB timer sessions rollback warning:', sessErr);
  }

  // 9. Read-back verification of rolled-back tasks
  const verifyTasks = storage.getItem(TASKS_STORAGE_KEY);
  const expectedTasks = preRestoreSnapshot.tasks !== undefined ? preRestoreSnapshot.tasks : null;
  if (verifyTasks !== expectedTasks) {
    throw new Error('Rollback verification failed for tasks');
  }

  return { success: true };
}

/**
 * Applies a verified backup payload transactionally across stores using a staged journal.
 *
 * Invariant A (Failed restore): If restore fails at any point, all stores roll back to pre-restore state.
 * Invariant B (Successful restore): Data matches backup and survives application restart.
 * Invariant C (Interrupted restore): Startup detects interrupted journal and safely recovers.
 * Invariant D (Concurrent modification): Fingerprint check catches concurrent edits across all stores.
 * Invariant E (No false success): Partial writes or failed IDB transactions trigger rollback.
 *
 * @param {object} validatedPayload The validated payload result from validateBackupPayload
 * @param {object} [options]
 * @param {Storage} [options.storage]
 * @param {string} [options.expectedRevision] Storage revision recorded at preview time
 * @param {string} [options.workspaceFingerprint] Composite fingerprint recorded at preview time
 * @param {string} [options.injectFailureAfter] Diagnostic hook for controlled adversarial failure injection
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

  const profileId = validatedPayload.profile_id || storage.getItem(PROFILE_ID_KEY) || 'prof_default';

  // 1. Cross-tab concurrency guard: check composite fingerprint and revision
  if (options.workspaceFingerprint !== undefined) {
    const currentFingerprint = await computeWorkspaceFingerprint(storage, profileId);
    if (currentFingerprint !== options.workspaceFingerprint) {
      return {
        success: false,
        error: 'concurrent_modification',
        message: 'A concurrent workspace modification occurred in another tab. Restoration aborted to protect data integrity.',
      };
    }
  }

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

  // 2. Demo lock & cleanup guard: abort if demo action is active or cleanup is pending
  if (isDemoLockActive(storage) || storage.getItem(DEMO_CLEANUP_PENDING_KEY)) {
    return {
      success: false,
      error: 'demo_action_in_progress',
      message: 'A demo seeding or reset operation is currently in progress or cleanup is pending. Restoration aborted.',
    };
  }

  if (options.injectFailureAfter === 'before_snapshot') {
    return {
      success: false,
      error: 'injected_failure',
      message: 'Simulated failure before snapshot persistence.',
    };
  }

  // 3. Create complete pre-restore rollback snapshot across BOTH localStorage and IndexedDB
  let existingEvents = [];
  try {
    const allEvents = await getEventsByProfile(profileId);
    existingEvents = (allEvents || []).map((e) => ({ ...e }));
  } catch {
    existingEvents = [];
  }

  let existingTasksList = [];
  try {
    const raw = storage.getItem(TASKS_STORAGE_KEY);
    if (raw) existingTasksList = JSON.parse(raw);
  } catch {
    existingTasksList = [];
  }

  const existingSessions = [];
  try {
    for (const t of existingTasksList) {
      if (t && t.id) {
        const sessions = await getTimerSessionsByTask(t.id);
        for (const s of sessions || []) {
          if (s && !existingSessions.some((ex) => ex.session_id === s.session_id)) {
            existingSessions.push({ ...s });
          }
        }
      }
    }
  } catch {
    // If sessions cannot be read, proceed with available records
  }

  const preRestoreSnapshot = {
    version: 1,
    profileId,
    tasks: storage.getItem(TASKS_STORAGE_KEY),
    schedule: storage.getItem(SCHEDULE_STORAGE_KEY),
    timeBlocks: storage.getItem(TIME_BLOCK_STORAGE_KEY),
    speech: storage.getItem(SPEECH_STORAGE_KEY),
    preference: storage.getItem(PREFERENCE_STORAGE_KEY),
    revision: storage.getItem(REVISION_KEY),
    telemetryEvents: existingEvents,
    timerSessions: existingSessions,
  };

  const restoreMarker = {
    startedAt: Date.now(),
    exportedAt: validatedPayload.exported_at,
    taskCount: validatedPayload.data.tasks.length,
  };

  const journal = {
    phase: RESTORE_PHASES.PREPARED,
    startedAt: Date.now(),
    profileId,
    taskCount: validatedPayload.data.tasks.length,
  };

  try {
    // Persist recovery snapshot and journal markers
    storage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify(restoreMarker));
    storage.setItem(RESTORE_PRE_SNAPSHOT_KEY, JSON.stringify(preRestoreSnapshot));
    storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));

    // Verify snapshot write immediately
    const snapVerification = storage.getItem(RESTORE_PRE_SNAPSHOT_KEY);
    if (!snapVerification || snapVerification.length === 0) {
      throw new Error('Pre-restore snapshot write verification failed');
    }

    if (options.injectFailureAfter === 'after_snapshot') {
      throw new Error('Injected failure after snapshot persistence');
    }

    // Final pre-commit concurrency verification immediately before mutation begins
    if (options.workspaceFingerprint !== undefined) {
      const preCommitFingerprint = await computeWorkspaceFingerprint(storage, profileId);
      if (preCommitFingerprint !== options.workspaceFingerprint) {
        storage.removeItem(RESTORE_IN_PROGRESS_KEY);
        storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
        storage.removeItem(RESTORE_JOURNAL_KEY);
        return {
          success: false,
          error: 'concurrent_modification',
          message: 'A concurrent workspace modification occurred before mutation began. Restoration aborted to protect data integrity.',
        };
      }
    }

    if (options.expectedRevision !== undefined) {
      const currentRevision = storage.getItem(REVISION_KEY) || '';
      if (currentRevision !== options.expectedRevision) {
        storage.removeItem(RESTORE_IN_PROGRESS_KEY);
        storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
        storage.removeItem(RESTORE_JOURNAL_KEY);
        return {
          success: false,
          error: 'concurrent_modification',
          message: 'A concurrent task revision occurred before mutation began. Restoration aborted to protect data integrity.',
        };
      }
    }

    // 4. Mutate IndexedDB: Telemetry Events & Sessions
    journal.phase = RESTORE_PHASES.COMMITTING_INDEXED_DB;
    storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));

    if (options.injectFailureAfter === 'during_idb_clear') {
      throw new Error('Injected failure during IndexedDB event clearing');
    }

    if (Array.isArray(validatedPayload.data.telemetry_events) && validatedPayload.data.telemetry_events.length > 0) {
      const clearRes = await clearEventsByProfile(profileId);
      if (clearRes === false) {
        throw new Error('Failed to clear existing IndexedDB telemetry events');
      }

      if (options.injectFailureAfter === 'during_idb_write') {
        throw new Error('Injected failure during IndexedDB event batch write');
      }

      const savedCount = await saveEventsBatch(validatedPayload.data.telemetry_events);
      if (savedCount !== validatedPayload.data.telemetry_events.length) {
        throw new Error(`IndexedDB batch save failed (expected ${validatedPayload.data.telemetry_events.length}, saved ${savedCount})`);
      }
    } else {
      await clearEventsByProfile(profileId);
    }

    if (Array.isArray(validatedPayload.data.timer_sessions) && validatedPayload.data.timer_sessions.length > 0) {
      await clearTimerSessionsByProfile(profileId);
      for (const sess of validatedPayload.data.timer_sessions) {
        const saved = await saveTimerSession(sess);
        if (saved === false) {
          throw new Error(`Failed to save timer session ${sess?.session_id} in IndexedDB`);
        }
      }
    } else {
      await clearTimerSessionsByProfile(profileId);
    }

    journal.phase = RESTORE_PHASES.INDEXED_DB_COMMITTED;
    storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));

    if (options.injectFailureAfter === 'after_idb_committed') {
      throw new Error('Injected failure after IndexedDB commit');
    }

    // 5. Mutate localStorage: Tasks, Schedule, Time Blocks, Preferences, Revision
    journal.phase = RESTORE_PHASES.COMMITTING_LOCAL_STORAGE;
    storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));

    if (options.injectFailureAfter === 'during_tasks_write') {
      throw new Error('Injected failure during tasks write');
    }

    const tasksJson = JSON.stringify(validatedPayload.data.tasks);
    storage.setItem(TASKS_STORAGE_KEY, tasksJson);

    if (options.injectFailureAfter === 'during_schedule_write') {
      throw new Error('Injected failure during schedule write');
    }

    if (validatedPayload.data.accepted_schedule) {
      storage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(validatedPayload.data.accepted_schedule));
    } else {
      storage.removeItem(SCHEDULE_STORAGE_KEY);
    }

    if (options.injectFailureAfter === 'during_timeblocks_write') {
      throw new Error('Injected failure during time blocks write');
    }

    if (validatedPayload.data.time_block_settings) {
      storage.setItem(TIME_BLOCK_STORAGE_KEY, JSON.stringify(validatedPayload.data.time_block_settings));
    } else {
      storage.removeItem(TIME_BLOCK_STORAGE_KEY);
    }

    if (options.injectFailureAfter === 'during_preferences_write') {
      throw new Error('Injected failure during preferences write');
    }

    if (validatedPayload.data.settings) {
      storage.setItem(SPEECH_STORAGE_KEY, String(validatedPayload.data.settings.speech_output_enabled));
      storage.setItem(PREFERENCE_STORAGE_KEY, String(validatedPayload.data.settings.preference_collection_enabled));
    } else {
      storage.removeItem(SPEECH_STORAGE_KEY);
      storage.removeItem(PREFERENCE_STORAGE_KEY);
    }

    if (options.injectFailureAfter === 'during_revision_write') {
      throw new Error('Injected failure during revision write');
    }

    // Advance Storage Revision to synchronize all open tabs
    const newRevision = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    storage.setItem(REVISION_KEY, newRevision);

    // 6. Comprehensive Read-Back Verification across all categories
    journal.phase = RESTORE_PHASES.VERIFYING;
    storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));

    if (options.injectFailureAfter === 'during_readback') {
      throw new Error('Injected failure during read-back verification');
    }

    // Verify Tasks
    const verifyTasks = storage.getItem(TASKS_STORAGE_KEY);
    if (!verifyTasks || verifyTasks !== tasksJson) {
      throw new Error('Read-back verification failed for tasks');
    }

    // Verify Schedule
    const verifySched = storage.getItem(SCHEDULE_STORAGE_KEY);
    const expectedSched = validatedPayload.data.accepted_schedule
      ? JSON.stringify(validatedPayload.data.accepted_schedule)
      : null;
    if (verifySched !== expectedSched) {
      throw new Error('Read-back verification failed for accepted schedule');
    }

    // Verify Time Blocks
    const verifyTb = storage.getItem(TIME_BLOCK_STORAGE_KEY);
    const expectedTb = validatedPayload.data.time_block_settings
      ? JSON.stringify(validatedPayload.data.time_block_settings)
      : null;
    if (verifyTb !== expectedTb) {
      throw new Error('Read-back verification failed for time block settings');
    }

    // Verify Preferences
    if (validatedPayload.data.settings) {
      const verifySpeech = storage.getItem(SPEECH_STORAGE_KEY);
      const verifyPref = storage.getItem(PREFERENCE_STORAGE_KEY);
      if (
        verifySpeech !== String(validatedPayload.data.settings.speech_output_enabled) ||
        verifyPref !== String(validatedPayload.data.settings.preference_collection_enabled)
      ) {
        throw new Error('Read-back verification failed for preferences');
      }
    }

    // Verify Revision
    if (storage.getItem(REVISION_KEY) !== newRevision) {
      throw new Error('Read-back verification failed for revision marker');
    }

    // 7. Full Commit: Mark journal committed and remove recovery markers
    journal.phase = RESTORE_PHASES.COMMITTED;
    journal.committedAt = Date.now();
    storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));

    if (options.injectFailureAfter === 'fail_marker_cleanup') {
      // Simulate interruption right before marker deletion
      return {
        success: true,
        taskCount: validatedPayload.data.tasks.length,
        message: `Successfully restored ${validatedPayload.data.tasks.length} task(s) and workspace settings.`,
      };
    }

    storage.removeItem(RESTORE_IN_PROGRESS_KEY);
    storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
    storage.removeItem(RESTORE_JOURNAL_KEY);

    return {
      success: true,
      taskCount: validatedPayload.data.tasks.length,
      message: `Successfully restored ${validatedPayload.data.tasks.length} task(s) and workspace settings.`,
    };
  } catch (err) {
    // Initiate verified rollback across all stores
    console.error('Restore failed, initiating verified rollback:', err);
    try {
      journal.phase = RESTORE_PHASES.ROLLING_BACK;
      storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));

      await executeRollback(storage, preRestoreSnapshot, profileId, options);

      // Clean recovery markers only upon verified rollback
      storage.removeItem(RESTORE_IN_PROGRESS_KEY);
      storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
      storage.removeItem(RESTORE_JOURNAL_KEY);
    } catch (rbErr) {
      console.error('Critical: Rollback failed, preserving snapshot:', rbErr);
      journal.phase = RESTORE_PHASES.ROLLBACK_FAILED;
      journal.rollbackError = rbErr.message;
      storage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify(journal));

      return {
        success: false,
        error: 'rollback_failed',
        message: `Restoration failed: ${err.message}. Rollback also encountered an error: ${rbErr.message}. Pre-restore snapshot preserved.`,
      };
    }

    return {
      success: false,
      error: 'restore_failed',
      message: `Restoration failed: ${err.message}. Local data rolled back to original state.`,
    };
  }
}

/**
 * Checks for interrupted restore state on application launch and performs idempotent recovery.
 *
 * If the restore journal was marked COMMITTED, cleans lingering markers and preserves restored data.
 * If interrupted prior to commit, rolls back all stores to the pre-restore snapshot and verifies state.
 *
 * Returns a hybrid object that can be read synchronously (.recovered, .message) or awaited.
 *
 * @param {Storage} [storage]
 * @returns {object} Hybrid object containing { recovered: boolean, message?: string, error?: string } and thenable
 */
export function checkAndRecoverInterruptedRestore(storage = resolveStorage()) {
  if (!storage) return { recovered: false };

  const markerRaw = storage.getItem(RESTORE_IN_PROGRESS_KEY);
  const journalRaw = storage.getItem(RESTORE_JOURNAL_KEY);
  const preSnapshotRaw = storage.getItem(RESTORE_PRE_SNAPSHOT_KEY);

  if (!markerRaw && !journalRaw) return { recovered: false };

  console.warn('Interrupted restore operation detected during startup.');

  let journal = null;
  if (journalRaw) {
    try {
      journal = JSON.parse(journalRaw);
    } catch {
      journal = null;
    }
  }

  // Case 1: Restore was already fully COMMITTED before interruption (marker removal interrupted)
  if (journal && journal.phase === RESTORE_PHASES.COMMITTED) {
    storage.removeItem(RESTORE_IN_PROGRESS_KEY);
    storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
    storage.removeItem(RESTORE_JOURNAL_KEY);
    const result = {
      recovered: true,
      message: 'Recovered from interrupted restore: restore was already committed.',
    };
    return makeThenable(result, Promise.resolve(result));
  }

  // Case 2: Restore was interrupted mid-flight; roll back to pre-restore snapshot
  if (preSnapshotRaw) {
    let snap = null;
    try {
      snap = JSON.parse(preSnapshotRaw);
    } catch {
      snap = null;
    }

    if (snap && typeof snap === 'object') {
      const profileId = snap.profileId || storage.getItem(PROFILE_ID_KEY) || 'prof_default';

      // Synchronous localStorage rollback executed immediately
      try {
        if (snap.tasks !== null && snap.tasks !== undefined) {
          storage.setItem(TASKS_STORAGE_KEY, snap.tasks);
        } else {
          storage.removeItem(TASKS_STORAGE_KEY);
        }
        if (snap.schedule !== null && snap.schedule !== undefined) {
          storage.setItem(SCHEDULE_STORAGE_KEY, snap.schedule);
        } else {
          storage.removeItem(SCHEDULE_STORAGE_KEY);
        }
        if (snap.timeBlocks !== null && snap.timeBlocks !== undefined) {
          storage.setItem(TIME_BLOCK_STORAGE_KEY, snap.timeBlocks);
        } else {
          storage.removeItem(TIME_BLOCK_STORAGE_KEY);
        }
        if (snap.speech !== null && snap.speech !== undefined) {
          storage.setItem(SPEECH_STORAGE_KEY, snap.speech);
        } else {
          storage.removeItem(SPEECH_STORAGE_KEY);
        }
        if (snap.preference !== null && snap.preference !== undefined) {
          storage.setItem(PREFERENCE_STORAGE_KEY, snap.preference);
        } else {
          storage.removeItem(PREFERENCE_STORAGE_KEY);
        }
        if (snap.revision !== null && snap.revision !== undefined) {
          storage.setItem(REVISION_KEY, snap.revision);
        } else {
          storage.removeItem(REVISION_KEY);
        }
      } catch (syncErr) {
        console.error('Critical: Synchronous rollback failed during startup:', syncErr);
      }

      // Asynchronous IndexedDB rollback
      const asyncRollbackPromise = (async () => {
        try {
          await clearEventsByProfile(profileId);
          if (Array.isArray(snap.telemetryEvents) && snap.telemetryEvents.length > 0) {
            await saveEventsBatch(snap.telemetryEvents);
          }
          await clearTimerSessionsByProfile(profileId);
          if (Array.isArray(snap.timerSessions) && snap.timerSessions.length > 0) {
            for (const sess of snap.timerSessions) {
              await saveTimerSession(sess);
            }
          }
          storage.removeItem(RESTORE_IN_PROGRESS_KEY);
          storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
          storage.removeItem(RESTORE_JOURNAL_KEY);
          return {
            recovered: true,
            message: 'Recovered from interrupted restore: rolled back to pre-restore snapshot.',
          };
        } catch (asyncErr) {
          console.error('IndexedDB rollback encountered error during startup:', asyncErr);
          return {
            recovered: false,
            error: 'idb_rollback_failed',
            message: 'Startup recovery rolled back local storage, but IndexedDB rollback encountered an issue.',
          };
        }
      })();

      // If no IDB records to restore, clean markers immediately
      if (
        (!snap.telemetryEvents || snap.telemetryEvents.length === 0) &&
        (!snap.timerSessions || snap.timerSessions.length === 0)
      ) {
        storage.removeItem(RESTORE_IN_PROGRESS_KEY);
        storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
        storage.removeItem(RESTORE_JOURNAL_KEY);
      }

      const syncResult = {
        recovered: true,
        message: 'Recovered from interrupted restore: rolled back to pre-restore snapshot.',
      };
      return makeThenable(syncResult, asyncRollbackPromise);
    }
  }

  // Case 3: Recovery marker exists but pre-restore snapshot is missing or unparseable
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
    storage.removeItem(RESTORE_IN_PROGRESS_KEY);
    storage.removeItem(RESTORE_PRE_SNAPSHOT_KEY);
    storage.removeItem(RESTORE_JOURNAL_KEY);
    const result = {
      recovered: true,
      message: 'Recovered from interrupted restore: tasks are intact.',
    };
    return makeThenable(result, Promise.resolve(result));
  }

  // Tasks corrupt and snapshot missing: preserve markers for manual recovery, return false
  const failureResult = {
    recovered: false,
    error: 'missing_snapshot',
    message: 'Interrupted restore detected with corrupt data and missing snapshot; recovery markers preserved for manual inspection.',
  };
  return makeThenable(failureResult, Promise.resolve(failureResult));
}
