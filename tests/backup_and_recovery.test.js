import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  encryptBackupPayload,
  decryptBackupPayload,
  deriveKeyFromPassword,
  uint8ArrayToBase64,
  base64ToUint8Array,
  BACKUP_FORMAT_IDENTIFIER,
  CURRENT_ENVELOPE_VERSION,
  MAX_BACKUP_FILE_SIZE,
} from '../src/utils/backupCrypto.js';
import {
  validateBackupEnvelope,
  validateBackupPayload,
  MAX_ALLOWED_TASKS,
} from '../src/utils/backupValidator.js';
import {
  collectBackupData,
  exportEncryptedBackup,
  validateAndPreviewBackup,
  restoreBackupData,
  checkAndRecoverInterruptedRestore,
  computeWorkspaceFingerprint,
  RESTORE_IN_PROGRESS_KEY,
  RESTORE_PRE_SNAPSHOT_KEY,
  RESTORE_JOURNAL_KEY,
  RESTORE_PHASES,
} from '../src/utils/backupManager.js';
import {
  DEMO_ACTION_LOCK_KEY,
  DEMO_CLEANUP_PENDING_KEY,
  clearDemoSeed,
} from '../src/utils/demoDataSeeder.js';
import {
  getEventsByProfile,
  saveEventsBatch,
  clearEventsByProfile,
  getTimerSessionsByTask,
  saveTimerSession,
  clearTimerSessionsByProfile,
} from '../src/telemetry/indexedDbStore.js';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { evaluateActivationGate } from '../src/scheduler/activationGateEvaluator.js';

class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(k) {
    return this.store.has(k) ? this.store.get(k) : null;
  }
  setItem(k, v) {
    this.store.set(k, String(v));
  }
  removeItem(k) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

describe('Phase 8, Stage 8.2: Encrypted Local Backups & Verified Recovery Test Suite', () => {
  let mockStorage;
  const testPassword = 'StrongTestPassphrase2026!';
  const fastIterations = 100000; // minimum allowed bound for fast deterministic testing

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  describe('1. Cryptography Primitives & Envelope Invariants', () => {
    it('1.1 performs authenticated encryption and decryption round-trip with matching plaintext', async () => {
      const plaintext = JSON.stringify({ hello: 'voxplan', taskCount: 42 });
      const envelope = await encryptBackupPayload(plaintext, testPassword, { iterations: fastIterations });

      assert.strictEqual(envelope.format, BACKUP_FORMAT_IDENTIFIER);
      assert.strictEqual(envelope.version, CURRENT_ENVELOPE_VERSION);
      assert.strictEqual(envelope.kdf.algorithm, 'PBKDF2');
      assert.strictEqual(envelope.kdf.iterations, fastIterations);
      assert.strictEqual(envelope.encryption.cipher, 'AES-GCM');

      const decrypted = await decryptBackupPayload(envelope, testPassword);
      assert.strictEqual(decrypted, plaintext);
    });

    it('1.2 rejects incorrect password and leaves system intact without leaking internal errors', async () => {
      const plaintext = JSON.stringify({ secret: 'user_data' });
      const envelope = await encryptBackupPayload(plaintext, testPassword, { iterations: fastIterations });

      await assert.rejects(
        async () => {
          await decryptBackupPayload(envelope, 'WrongPasswordEntirely!');
        },
        /Decryption failed: Incorrect password or corrupted\/tampered backup file/
      );
    });

    it('1.3 rejects tampered ciphertext (authenticated AES-GCM tag mismatch)', async () => {
      const plaintext = JSON.stringify({ items: [1, 2, 3] });
      const envelope = await encryptBackupPayload(plaintext, testPassword, { iterations: fastIterations });

      // Flip byte in ciphertext
      const bytes = base64ToUint8Array(envelope.ciphertext);
      bytes[0] ^= 0xff;
      envelope.ciphertext = uint8ArrayToBase64(bytes);

      await assert.rejects(
        async () => {
          await decryptBackupPayload(envelope, testPassword);
        },
        /Decryption failed/
      );
    });

    it('1.4 rejects tampered envelope metadata (AAD authentication failure)', async () => {
      const plaintext = JSON.stringify({ sensitive: true });
      const envelope = await encryptBackupPayload(plaintext, testPassword, { iterations: fastIterations });

      // Tamper with unencrypted iterations in envelope header
      envelope.kdf.iterations = fastIterations + 1000;

      await assert.rejects(
        async () => {
          await decryptBackupPayload(envelope, testPassword);
        },
        /Decryption failed/
      );
    });

    it('1.5 enforces salt length (16 bytes) and IV length (12 bytes)', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      assert.strictEqual(salt.byteLength, 16);

      const invalidSalt = crypto.getRandomValues(new Uint8Array(8));
      await assert.rejects(
        async () => {
          await deriveKeyFromPassword(testPassword, invalidSalt, fastIterations);
        },
        /Cryptographic salt must be exactly 16 bytes/
      );
    });

    it('1.6 enforces KDF iteration bounds [100000, 1000000] to prevent resource exhaustion', async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16));

      // Below lower bound
      await assert.rejects(
        async () => {
          await deriveKeyFromPassword(testPassword, salt, 50000);
        },
        /iteration count must be an integer between 100000 and 1000000/
      );

      // Above upper bound
      await assert.rejects(
        async () => {
          await deriveKeyFromPassword(testPassword, salt, 2000000);
        },
        /iteration count must be an integer between 100000 and 1000000/
      );
    });

    it('1.7 rejects oversized payloads exceeding 10 MB limit', async () => {
      const hugeString = 'X'.repeat(MAX_BACKUP_FILE_SIZE + 100);
      await assert.rejects(
        async () => {
          await encryptBackupPayload(hugeString, testPassword, { iterations: fastIterations });
        },
        /Payload size exceeds maximum allowed backup size/
      );
    });
  });

  describe('2. Defensive Envelope & Payload Schema Validation', () => {
    it('2.1 validates a well-formed backup envelope', () => {
      const validEnvelope = {
        format: 'voxplan_encrypted_backup',
        version: 1,
        app_version: '1.0.0',
        created_at: new Date().toISOString(),
        kdf: {
          algorithm: 'PBKDF2',
          hash: 'SHA-256',
          iterations: 600000,
          salt: 'MDEyMzQ1Njc4OWFiY2RlZg==',
        },
        encryption: {
          cipher: 'AES-GCM',
          key_length: 256,
          iv: 'MDEyMzQ1Njc4OWFi',
          tag_length: 128,
        },
        ciphertext: 'AQIDBAUGBwgJCgsMDQ4PEA==',
      };

      const res = validateBackupEnvelope(validEnvelope);
      assert.strictEqual(res.valid, true);
    });

    it('2.2 rejects unsupported envelope format or version', () => {
      const resBadFormat = validateBackupEnvelope({ format: 'other_format', version: 1 });
      assert.strictEqual(resBadFormat.valid, false);
      assert.strictEqual(resBadFormat.error, 'unsupported_format');

      const resBadVersion = validateBackupEnvelope({
        format: 'voxplan_encrypted_backup',
        version: 99,
      });
      assert.strictEqual(resBadVersion.valid, false);
      assert.strictEqual(resBadVersion.error, 'unsupported_envelope_version');
    });

    it('2.3 detects and rejects duplicate task IDs in backup payload', () => {
      const duplicatePayload = {
        schema_version: 1,
        exported_at: new Date().toISOString(),
        data: {
          tasks: [
            { id: 'task-1', title: 'Task One', priority: 'high', completed: false },
            { id: 'task-1', title: 'Task One Duplicate', priority: 'low', completed: true },
          ],
        },
      };

      const res = validateBackupPayload(JSON.stringify(duplicatePayload));
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.error, 'duplicate_task_id');
      assert.ok(res.message.includes('task-1'));
    });

    it('2.4 validates task records, normalizes missing fields, and flags broken dependencies as warnings', () => {
      const payloadWithBrokenDep = {
        schema_version: 1,
        exported_at: new Date().toISOString(),
        data: {
          tasks: [
            {
              id: 'task-root',
              title: 'Root Project Architecture',
              priority: 'urgent',
              completed: false,
              estimatedEffort: 3.5,
              dependencies: ['non-existent-task-id'],
            },
            {
              id: 'task-leaf',
              title: 'Frontend Documentation',
              priority: 'invalid_priority_fallback_to_medium',
              completed: true,
              dependencies: ['task-root'],
            },
          ],
          accepted_schedule: {
            scheduleId: 'sched-123',
            placements: [{ taskId: 'task-root', scheduledDate: '2026-10-23' }],
          },
          settings: {
            speech_output_enabled: true,
            preference_collection_enabled: false,
          },
        },
      };

      const res = validateBackupPayload(JSON.stringify(payloadWithBrokenDep));
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.summary.taskCount, 2);
      assert.strictEqual(res.summary.completedCount, 1);
      assert.strictEqual(res.summary.activeCount, 1);
      assert.strictEqual(res.summary.hasAcceptedSchedule, true);

      // Verify dependency warning
      assert.strictEqual(res.warnings.length, 1);
      assert.ok(res.warnings[0].includes('non-existent-task-id'));

      // Verify normalization of invalid priority
      const leafTask = res.data.tasks.find((t) => t.id === 'task-leaf');
      assert.strictEqual(leafTask.priority, 'medium');
    });

    it('2.5 rejects task count exceeding maximum safety limit', () => {
      const hugeTasks = Array.from({ length: MAX_ALLOWED_TASKS + 5 }, (_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        priority: 'medium',
      }));

      const res = validateBackupPayload(
        JSON.stringify({
          schema_version: 1,
          data: { tasks: hugeTasks },
        })
      );

      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.error, 'task_count_exceeded');
    });
  });

  describe('3. Staged Restoration, Rollback & Concurrency Safeguards', () => {
    it('3.1 rejects restoration if a concurrent modification occurred in another tab (revision mismatch)', async () => {
      mockStorage.setItem('voxplan_tasks_revision', 'rev-initial-123');

      const validatedPayload = {
        schema_version: 1,
        exported_at: new Date().toISOString(),
        data: {
          tasks: [{ id: 't-new', title: 'New Task', priority: 'medium', completed: false }],
        },
      };

      // Staged preview was taken at revision 'rev-initial-123', but another tab bumped it to 'rev-concurrent-999'
      mockStorage.setItem('voxplan_tasks_revision', 'rev-concurrent-999');

      const res = await restoreBackupData(validatedPayload, {
        storage: mockStorage,
        expectedRevision: 'rev-initial-123',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'concurrent_modification');
      // Verify storage was not mutated
      assert.strictEqual(mockStorage.getItem('voxplan_tasks'), null);
    });

    it('3.2 blocks restoration if an active demo lock exists in storage', async () => {
      mockStorage.setItem('voxplan_demo_action_lock', String(Date.now()));

      const validatedPayload = {
        schema_version: 1,
        data: {
          tasks: [{ id: 't-demo-blocked', title: 'Demo Blocked', priority: 'medium', completed: false }],
        },
      };

      const res = await restoreBackupData(validatedPayload, { storage: mockStorage });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'demo_action_in_progress');
    });

    it('3.3 performs full verified restore and updates tasks, schedule, settings, and revision', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 'old-1', title: 'Old Task' }]));
      mockStorage.setItem('voxplan_tasks_revision', 'rev-old');

      const validatedPayload = {
        schema_version: 1,
        exported_at: '2026-10-22T12:00:00.000Z',
        data: {
          tasks: [
            { id: 'res-1', title: 'Restored Task 1', priority: 'high', completed: false },
            { id: 'res-2', title: 'Restored Task 2', priority: 'low', completed: true },
          ],
          accepted_schedule: { scheduleId: 'sched-restored', placements: [] },
          time_block_settings: { workingHours: { start: '09:00', end: '18:00' } },
          settings: { speech_output_enabled: true, preference_collection_enabled: true },
          telemetry_events: [],
          timer_sessions: [],
        },
      };

      const res = await restoreBackupData(validatedPayload, {
        storage: mockStorage,
        expectedRevision: 'rev-old',
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.taskCount, 2);

      // Verify persisted tasks
      const restoredTasks = JSON.parse(mockStorage.getItem('voxplan_tasks'));
      assert.strictEqual(restoredTasks.length, 2);
      assert.strictEqual(restoredTasks[0].id, 'res-1');

      // Verify schedule and settings
      assert.ok(mockStorage.getItem('voxplan_accepted_schedule').includes('sched-restored'));
      assert.strictEqual(mockStorage.getItem('voxplan_speech_output_enabled'), 'true');

      // Verify recovery markers were cleaned up after verified write
      assert.strictEqual(mockStorage.getItem(RESTORE_IN_PROGRESS_KEY), null);
      assert.strictEqual(mockStorage.getItem(RESTORE_PRE_SNAPSHOT_KEY), null);

      // Verify new revision was generated
      const newRev = mockStorage.getItem('voxplan_tasks_revision');
      assert.notStrictEqual(newRev, 'rev-old');
      assert.ok(newRev.length > 5);
    });

    it('3.4 rolls back storage if a write failure occurs during restore', async () => {
      const originalTasksJson = JSON.stringify([{ id: 'preserve-me', title: 'Pre-existing Task' }]);
      mockStorage.setItem('voxplan_tasks', originalTasksJson);
      mockStorage.setItem('voxplan_tasks_revision', 'rev-stable');

      // Create a faulty storage mock where writing to accepted_schedule throws
      const faultyStorage = {
        store: mockStorage.store,
        getItem: (k) => mockStorage.getItem(k),
        removeItem: (k) => mockStorage.removeItem(k),
        setItem: (k, v) => {
          if (k === 'voxplan_accepted_schedule') {
            throw new Error('Simulated QuotaExceededError on schedule');
          }
          mockStorage.setItem(k, v);
        },
      };

      const validatedPayload = {
        schema_version: 1,
        data: {
          tasks: [{ id: 'incoming', title: 'Incoming Task', priority: 'medium', completed: false }],
          accepted_schedule: { scheduleId: 'sched-crash' },
        },
      };

      const res = await restoreBackupData(validatedPayload, {
        storage: faultyStorage,
        expectedRevision: 'rev-stable',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'restore_failed');

      // Verify rollback restored original tasks
      const currentTasks = mockStorage.getItem('voxplan_tasks');
      assert.strictEqual(currentTasks, originalTasksJson);
      assert.strictEqual(mockStorage.getItem('voxplan_tasks_revision'), 'rev-stable');
    });

    it('3.5 detects interrupted restore on launch and successfully rolls back if tasks were corrupted', () => {
      const preSnapshot = {
        tasks: JSON.stringify([{ id: 'unbroken-task', title: 'Safe Task' }]),
        schedule: null,
        revision: 'rev-unbroken',
      };

      mockStorage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify({ startedAt: Date.now() }));
      mockStorage.setItem(RESTORE_PRE_SNAPSHOT_KEY, JSON.stringify(preSnapshot));
      // Corrupted tasks payload from interrupted write
      mockStorage.setItem('voxplan_tasks', '{ incomplete json');

      const recovery = checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(recovery.recovered, true);

      // Verify restored from pre-restore snapshot
      const recoveredTasks = JSON.parse(mockStorage.getItem('voxplan_tasks'));
      assert.strictEqual(recoveredTasks[0].id, 'unbroken-task');
      assert.strictEqual(mockStorage.getItem(RESTORE_IN_PROGRESS_KEY), null);
    });
  });

  describe('4. End-to-End Export, Preview, and Restore Pipeline', () => {
    it('4.1 exports tasks from storage, decrypts via validateAndPreviewBackup, and verifies preview summary', async () => {
      mockStorage.setItem(
        'voxplan_tasks',
        JSON.stringify([
          { id: 'user-t1', title: 'Quarterly Planning', priority: 'urgent', completed: false },
          { id: 'user-t2', title: 'Code Refactoring', priority: 'high', completed: true },
        ])
      );
      mockStorage.setItem('voxplan_tasks_revision', 'rev-live-1');

      const exportRes = await exportEncryptedBackup(testPassword, {
        storage: mockStorage,
        triggerDownload: false,
        iterations: fastIterations,
      });

      assert.strictEqual(exportRes.success, true);
      assert.strictEqual(exportRes.metadata.task_count, 2);

      // Simulate user opening the file in Restore Tab
      const previewRes = await validateAndPreviewBackup(
        JSON.stringify(exportRes.envelope),
        testPassword,
        { storage: mockStorage }
      );

      assert.strictEqual(previewRes.success, true);
      assert.strictEqual(previewRes.validation.summary.taskCount, 2);
      assert.strictEqual(previewRes.validation.summary.completedCount, 1);
      assert.strictEqual(previewRes.validation.summary.activeCount, 1);
      assert.strictEqual(previewRes.expectedRevision, 'rev-live-1');
    });

    it('4.2 preserves ambiguous non-demo tasks during export without misclassifying them as demo data', async () => {
      mockStorage.setItem(
        'voxplan_tasks',
        JSON.stringify([
          // Genuine task with title identical to demo task but without provenance
          { id: 'custom-id-99', title: 'Prepare quarterly product roadmap presentation', priority: 'high', completed: false },
          // Legitimate demo task with provenance
          { id: 'task-demo-showcase-01', title: 'Prepare quarterly product roadmap presentation', isDemoSeed: true, provenanceSource: 'demo_seeder' },
        ])
      );

      const backupData = await collectBackupData({
        storage: mockStorage,
        includeDemoTasks: false,
      });

      // The genuine task must be preserved and exported; demo task with explicit provenance excluded
      assert.strictEqual(backupData.data.tasks.length, 1);
      assert.strictEqual(backupData.data.tasks[0].id, 'custom-id-99');
    });
  });

  describe('5. Protected Scheduler Invariants & Production Gate Preservation', () => {
    it('5.1 strictly preserves factory baseline weights and object immutability', () => {
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
      assert.strictEqual(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS), true);
    });

    it('5.2 production activation gate fails closed and adaptation is locked', () => {
      const evalResult = evaluateActivationGate();

      assert.strictEqual(evalResult.isAdaptationUnlocked, false);
      assert.strictEqual(evalResult.productionApplied, false);
      assert.strictEqual(evalResult.productionInvariance.productionApplied, false);
      assert.strictEqual(evalResult.productionInvariance.isAdaptationUnlocked, false);
      assert.notStrictEqual(evalResult.outcome, 'eligible_for_supervised_review');
    });
  });

  describe('6. Adversarial Cross-Store Failure Injection & Atomicity Audit', () => {
    it('6.1 injected schedule write failure rolls back tasks, schedule, and revision to pre-restore baseline', async () => {
      const originalTasks = [{ id: 'task-orig-1', title: 'Baseline Task', priority: 'high', completed: false }];
      mockStorage.setItem('voxplan_tasks', JSON.stringify(originalTasks));
      mockStorage.setItem('voxplan_accepted_schedule', JSON.stringify({ slots: ['orig-slot'] }));
      mockStorage.setItem('voxplan_tasks_revision', 'rev-base-61');

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_test_61',
        data: {
          tasks: [{ id: 'new-t1', title: 'Restored Task', priority: 'low', completed: true }],
          accepted_schedule: { slots: ['new-slot-1'] },
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        injectFailureAfter: 'during_schedule_write',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'restore_failed');

      // Verify all stores rolled back to original state
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks')), originalTasks);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_accepted_schedule')), { slots: ['orig-slot'] });
      assert.strictEqual(mockStorage.getItem('voxplan_tasks_revision'), 'rev-base-61');
      assert.strictEqual(mockStorage.getItem(RESTORE_IN_PROGRESS_KEY), null);
    });

    it('6.2 injected preferences write failure triggers full verified rollback across all stores', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-pre', title: 'Task Pre' }]));
      mockStorage.setItem('voxplan_accepted_schedule', JSON.stringify({ slots: ['pre'] }));
      mockStorage.setItem('voxplan_speech_output_enabled', 'false');
      mockStorage.setItem('voxplan_preference_collection_enabled', 'true');
      mockStorage.setItem('voxplan_tasks_revision', 'rev-pre-62');

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_test_62',
        data: {
          tasks: [{ id: 't-post', title: 'Task Post' }],
          accepted_schedule: { slots: ['post'] },
          settings: { speech_output_enabled: true, preference_collection_enabled: false },
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        injectFailureAfter: 'during_preferences_write',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks'))[0].id, 't-pre');
      assert.strictEqual(mockStorage.getItem('voxplan_speech_output_enabled'), 'false');
      assert.strictEqual(mockStorage.getItem('voxplan_preference_collection_enabled'), 'true');
      assert.strictEqual(mockStorage.getItem('voxplan_tasks_revision'), 'rev-pre-62');
    });

    it('6.3 storage failure during snapshot persistence aborts before mutating any store', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-safe', title: 'Safe Task' }]));
      const faultyStorage = {
        getItem: (k) => mockStorage.getItem(k),
        removeItem: (k) => mockStorage.removeItem(k),
        setItem: (k, v) => {
          if (k === RESTORE_PRE_SNAPSHOT_KEY) {
            throw new Error('QuotaExceededError: Pre-restore snapshot too large');
          }
          mockStorage.setItem(k, v);
        },
      };

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_test_63',
        data: {
          tasks: [{ id: 't-overwrite', title: 'Overwritten Task' }],
        },
      };

      const res = await restoreBackupData(payload, { storage: faultyStorage });
      assert.strictEqual(res.success, false);
      assert.strictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks'))[0].id, 't-safe');
    });

    it('6.4 failure during IndexedDB event write triggers full rollback and preserves genuine user telemetry', async () => {
      const profileId = 'prof_test_64';
      await clearEventsByProfile(profileId);
      await saveEventsBatch([
        { event_id: 'orig-ev-1', profile_id: profileId, event_type: 'task_completed', timestamp: '2026-01-01T10:00:00Z' },
      ]);
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-orig-64', title: 'Orig Task' }]));

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: profileId,
        data: {
          tasks: [{ id: 't-new-64', title: 'New Task' }],
          telemetry_events: [{ event_id: 'new-ev-1', profile_id: profileId, event_type: 'app_launch' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        injectFailureAfter: 'during_idb_write',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'restore_failed');

      // Verify tasks remained original
      assert.strictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks'))[0].id, 't-orig-64');

      // Verify user telemetry events were NOT wiped out
      const recoveredEvents = await getEventsByProfile(profileId);
      assert.strictEqual(recoveredEvents.length, 1);
      assert.strictEqual(recoveredEvents[0].event_id, 'orig-ev-1');
    });

    it('6.5 failure during timer session write does not report false success and rolls back stores', async () => {
      const profileId = 'prof_test_65';
      await clearTimerSessionsByProfile(profileId);
      await saveTimerSession({ session_id: 'orig-sess-1', profile_id: profileId, task_id: 't-orig-65', duration: 1500 });
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-orig-65', title: 'Orig Task' }]));

      const faultySession = { session_id: '', profile_id: profileId, task_id: 't-new-65' };
      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: profileId,
        data: {
          tasks: [{ id: 't-new-65', title: 'New Task' }],
          timer_sessions: [faultySession],
        },
      };

      const res = await restoreBackupData(payload, { storage: mockStorage });
      assert.strictEqual(res.success, false);
      assert.strictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks'))[0].id, 't-orig-65');
    });

    it('6.6 read-back verification failure triggers rollback and refuses to report false success', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-base-66', title: 'Base' }]));

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_test_66',
        data: {
          tasks: [{ id: 't-candidate', title: 'Candidate' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        injectFailureAfter: 'during_readback',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'restore_failed');
      assert.strictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks'))[0].id, 't-base-66');
    });

    it('6.7 rollback failure preserves recovery snapshot and journal without wiping metadata', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-base-67', title: 'Base' }]));

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_test_67',
        data: {
          tasks: [{ id: 't-candidate-67', title: 'Candidate' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        injectFailureAfter: 'during_readback',
        failRollback: true,
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'rollback_failed');

      // Pre-restore snapshot and journal MUST be preserved in storage for manual recovery
      assert.notStrictEqual(mockStorage.getItem(RESTORE_PRE_SNAPSHOT_KEY), null);
      assert.notStrictEqual(mockStorage.getItem(RESTORE_JOURNAL_KEY), null);
      const journal = JSON.parse(mockStorage.getItem(RESTORE_JOURNAL_KEY));
      assert.strictEqual(journal.phase, RESTORE_PHASES.ROLLBACK_FAILED);
    });

    it('6.8 marker cleanup interruption after commit is recovered on startup without losing restored data', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-base-68', title: 'Base' }]));

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_test_68',
        data: {
          tasks: [{ id: 't-new-68', title: 'Newly Restored Task' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        injectFailureAfter: 'fail_marker_cleanup',
      });

      assert.strictEqual(res.success, true);
      assert.notStrictEqual(mockStorage.getItem(RESTORE_JOURNAL_KEY), null);

      // Startup recovery runs
      const recovery = checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(recovery.recovered, true);

      // Restored tasks are preserved (NOT rolled back to t-base-68)
      const tasks = JSON.parse(mockStorage.getItem('voxplan_tasks'));
      assert.strictEqual(tasks[0].id, 't-new-68');

      // Lingering markers are cleanly cleared
      assert.strictEqual(mockStorage.getItem(RESTORE_JOURNAL_KEY), null);
      assert.strictEqual(mockStorage.getItem(RESTORE_IN_PROGRESS_KEY), null);
    });
  });

  describe('7. Snapshot Completeness, Integrity & Edge Cases', () => {
    it('7.1 rollback correctly removes time_block_settings if originally null', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-71', title: 'Task 71' }]));

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_test_71',
        data: {
          tasks: [{ id: 't-71-new', title: 'Task 71 New' }],
          time_block_settings: { workStart: '09:00', workEnd: '17:00' },
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        injectFailureAfter: 'during_readback',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(mockStorage.getItem('voxplan_time_block_settings'), null);
    });

    it('7.2 rollback correctly restores speech and preference collection settings', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-72', title: 'Task 72' }]));
      mockStorage.setItem('voxplan_speech_output_enabled', 'false');
      mockStorage.setItem('voxplan_preference_collection_enabled', 'true');

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_test_72',
        data: {
          tasks: [{ id: 't-72-new', title: 'Task 72 New' }],
          settings: { speech_output_enabled: true, preference_collection_enabled: false },
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        injectFailureAfter: 'during_readback',
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(mockStorage.getItem('voxplan_speech_output_enabled'), 'false');
      assert.strictEqual(mockStorage.getItem('voxplan_preference_collection_enabled'), 'true');
    });

    it('7.3 startup recovery preserves markers and reports error when snapshot is corrupt JSON', () => {
      mockStorage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify({ startedAt: Date.now() }));
      mockStorage.setItem(RESTORE_PRE_SNAPSHOT_KEY, '{ invalid corrupt json snapshot !!!');
      mockStorage.setItem('voxplan_tasks', '{ invalid corrupt tasks');

      const recovery = checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(recovery.recovered, false);
      assert.strictEqual(recovery.error, 'missing_snapshot');

      // Markers preserved for safety
      assert.notStrictEqual(mockStorage.getItem(RESTORE_IN_PROGRESS_KEY), null);
    });

    it('7.4 startup recovery safely clears markers if tasks are already valid and snapshot is missing', () => {
      mockStorage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify({ startedAt: Date.now() }));
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 'intact-task', title: 'Intact' }]));

      const recovery = checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(recovery.recovered, true);
      assert.strictEqual(mockStorage.getItem(RESTORE_IN_PROGRESS_KEY), null);
    });
  });

  describe('8. Interrupted Operation Recovery at Every Meaningful State Transition', () => {
    it('8.1 recovers after interruption at PREPARED phase (snapshot persisted, zero mutations)', async () => {
      const origTasks = [{ id: 'orig-t-81', title: 'Unmutated Task' }];
      mockStorage.setItem('voxplan_tasks', JSON.stringify(origTasks));
      mockStorage.setItem('voxplan_accepted_schedule', JSON.stringify({ slots: ['s81'] }));

      const snapshot = {
        version: 1,
        tasks: JSON.stringify(origTasks),
        schedule: JSON.stringify({ slots: ['s81'] }),
        timeBlocks: null,
        speech: null,
        preference: null,
        revision: 'rev-81',
      };
      mockStorage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify({ startedAt: Date.now() }));
      mockStorage.setItem(RESTORE_PRE_SNAPSHOT_KEY, JSON.stringify(snapshot));
      mockStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify({ phase: RESTORE_PHASES.PREPARED }));

      const recovery = await checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(recovery.recovered, true);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks')), origTasks);
      assert.strictEqual(mockStorage.getItem(RESTORE_JOURNAL_KEY), null);
    });

    it('8.2 recovers after interruption at INDEXED_DB_COMMITTED phase (IDB modified, localStorage untouched)', async () => {
      const profileId = 'prof_test_82';
      const origEvents = [{ event_id: 'ev-orig-82', profile_id: profileId, event_type: 'task_created' }];
      await clearEventsByProfile(profileId);
      await saveEventsBatch(origEvents);

      const origTasks = [{ id: 'orig-t-82', title: 'Task 82' }];
      mockStorage.setItem('voxplan_tasks', JSON.stringify(origTasks));

      // Simulate partial restore in IDB
      await clearEventsByProfile(profileId);
      await saveEventsBatch([{ event_id: 'ev-interrupted-82', profile_id: profileId, event_type: 'in_flight' }]);

      const snapshot = {
        version: 1,
        profileId,
        tasks: JSON.stringify(origTasks),
        telemetryEvents: origEvents,
      };
      mockStorage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify({ startedAt: Date.now() }));
      mockStorage.setItem(RESTORE_PRE_SNAPSHOT_KEY, JSON.stringify(snapshot));
      mockStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify({ phase: RESTORE_PHASES.INDEXED_DB_COMMITTED, profileId }));

      const recovery = await checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(recovery.recovered, true);

      // Verify IDB rolled back to origEvents
      const evs = await getEventsByProfile(profileId);
      assert.strictEqual(evs.length, 1);
      assert.strictEqual(evs[0].event_id, 'ev-orig-82');
    });

    it('8.3 recovers after interruption during COMMITTING_LOCAL_STORAGE phase', async () => {
      const origTasks = [{ id: 't-83-orig', title: 'Orig' }];
      const origSchedule = { slots: ['orig-83'] };
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-83-half-written', title: 'Half Written' }]));
      mockStorage.removeItem('voxplan_accepted_schedule');

      const snapshot = {
        version: 1,
        tasks: JSON.stringify(origTasks),
        schedule: JSON.stringify(origSchedule),
      };
      mockStorage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify({ startedAt: Date.now() }));
      mockStorage.setItem(RESTORE_PRE_SNAPSHOT_KEY, JSON.stringify(snapshot));
      mockStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify({ phase: RESTORE_PHASES.COMMITTING_LOCAL_STORAGE }));

      const recovery = checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(recovery.recovered, true);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks')), origTasks);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_accepted_schedule')), origSchedule);
    });

    it('8.4 repeated startup recovery runs are safe and idempotent', async () => {
      const origTasks = [{ id: 't-84', title: 'Idempotent' }];
      mockStorage.setItem('voxplan_tasks', JSON.stringify(origTasks));
      mockStorage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify({ startedAt: Date.now() }));
      mockStorage.setItem(RESTORE_PRE_SNAPSHOT_KEY, JSON.stringify({ version: 1, tasks: JSON.stringify(origTasks) }));

      const rec1 = await checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(rec1.recovered, true);

      // Run again
      const rec2 = await checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(rec2.recovered, false);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks')), origTasks);
    });
  });

  describe('9. Expanded Cross-Tab Concurrency & Conflict Rejection', () => {
    it('9.1 rejects restore if accepted schedule is modified concurrently in another tab', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-91', title: 'Task 91' }]));
      mockStorage.setItem('voxplan_accepted_schedule', JSON.stringify({ slots: ['initial-slot'] }));

      const fingerprint = await computeWorkspaceFingerprint(mockStorage);

      // Concurrent tab changes accepted schedule
      mockStorage.setItem('voxplan_accepted_schedule', JSON.stringify({ slots: ['concurrent-edit-slot'] }));

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_default',
        data: {
          tasks: [{ id: 't-91-new', title: 'New' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        workspaceFingerprint: fingerprint,
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'concurrent_modification');
    });

    it('9.2 rejects restore if time block settings are modified concurrently in another tab', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-92', title: 'Task 92' }]));
      mockStorage.setItem('voxplan_time_block_settings', JSON.stringify({ focusHours: 4 }));

      const fingerprint = await computeWorkspaceFingerprint(mockStorage);

      // Concurrent tab modifies time block settings
      mockStorage.setItem('voxplan_time_block_settings', JSON.stringify({ focusHours: 6 }));

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_default',
        data: {
          tasks: [{ id: 't-92-new', title: 'New' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        workspaceFingerprint: fingerprint,
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'concurrent_modification');
    });

    it('9.3 rejects restore if user preference is modified concurrently in another tab', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-93', title: 'Task 93' }]));
      mockStorage.setItem('voxplan_speech_output_enabled', 'false');

      const fingerprint = await computeWorkspaceFingerprint(mockStorage);

      // Concurrent tab toggles speech preference
      mockStorage.setItem('voxplan_speech_output_enabled', 'true');

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_default',
        data: {
          tasks: [{ id: 't-93-new', title: 'New' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        workspaceFingerprint: fingerprint,
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'concurrent_modification');
    });

    it('9.4 rejects restore if demo action lock becomes active in another tab', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-94', title: 'Task 94' }]));
      mockStorage.setItem(DEMO_ACTION_LOCK_KEY, String(Date.now()));

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_default',
        data: {
          tasks: [{ id: 't-94-new', title: 'New' }],
        },
      };

      const res = await restoreBackupData(payload, { storage: mockStorage });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'demo_action_in_progress');
    });

    it('9.5 rejects restore if demo cleanup is pending in another tab', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-95', title: 'Task 95' }]));
      mockStorage.setItem(DEMO_CLEANUP_PENDING_KEY, 'prof_demo_showcase');

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_default',
        data: {
          tasks: [{ id: 't-95-new', title: 'New' }],
        },
      };

      const res = await restoreBackupData(payload, { storage: mockStorage });
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'demo_action_in_progress');
    });

    it('9.6 rejects restore if an existing telemetry event content is modified without changing record count', async () => {
      const profileId = 'prof_test_96';
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-96', title: 'Task 96' }]));
      mockStorage.setItem('voxplan_profile_id', profileId);

      await clearEventsByProfile(profileId);
      await saveEventsBatch([
        { event_id: 'ev-96-1', profile_id: profileId, event_type: 'task_created', timestamp: '2026-10-20T10:00:00Z', payload: { category: 'Planning' } },
      ]);

      const fingerprint = await computeWorkspaceFingerprint(mockStorage, profileId);

      // Mutate the event payload without changing total count (count remains 1)
      await saveEventsBatch([
        { event_id: 'ev-96-1', profile_id: profileId, event_type: 'task_created', timestamp: '2026-10-20T10:00:00Z', payload: { category: 'Execution' } },
      ]);

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: profileId,
        data: {
          tasks: [{ id: 't-96-restored', title: 'Restored' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        workspaceFingerprint: fingerprint,
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'concurrent_modification');
    });

    it('9.7 rejects restore if an existing timer session is modified without changing session count', async () => {
      const profileId = 'prof_test_97';
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-97', title: 'Task 97' }]));
      mockStorage.setItem('voxplan_profile_id', profileId);

      await clearTimerSessionsByProfile(profileId);
      await saveTimerSession({
        session_id: 'sess-97-1',
        profile_id: profileId,
        task_id: 't-97',
        status: 'active',
        started_at: '2026-10-20T10:00:00Z',
        duration_seconds: 120,
      });

      const fingerprint = await computeWorkspaceFingerprint(mockStorage, profileId);

      // Mutate the session status and duration without changing session count
      await saveTimerSession({
        session_id: 'sess-97-1',
        profile_id: profileId,
        task_id: 't-97',
        status: 'paused',
        started_at: '2026-10-20T10:00:00Z',
        duration_seconds: 240,
      });

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: profileId,
        data: {
          tasks: [{ id: 't-97-restored', title: 'Restored' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        workspaceFingerprint: fingerprint,
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'concurrent_modification');
    });

    it('9.8 rejects restore if one record is replaced with another while preserving total count', async () => {
      const profileId = 'prof_test_98';
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-98', title: 'Task 98' }]));
      mockStorage.setItem('voxplan_profile_id', profileId);

      await clearEventsByProfile(profileId);
      await saveEventsBatch([
        { event_id: 'ev-98-orig', profile_id: profileId, event_type: 'task_created', timestamp: '2026-10-20T10:00:00Z' },
      ]);

      const fingerprint = await computeWorkspaceFingerprint(mockStorage, profileId);

      // Replace the record: clear and insert a different event ID (preserving count = 1)
      await clearEventsByProfile(profileId);
      await saveEventsBatch([
        { event_id: 'ev-98-replacement', profile_id: profileId, event_type: 'task_started', timestamp: '2026-10-20T10:05:00Z' },
      ]);

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: profileId,
        data: {
          tasks: [{ id: 't-98-restored', title: 'Restored' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        workspaceFingerprint: fingerprint,
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'concurrent_modification');
    });

    it('9.9 rejects restore if schedule, preference, or time-block is modified between preview and restore', async () => {
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-99', title: 'Task 99' }]));
      mockStorage.setItem('voxplan_time_block_settings', JSON.stringify({ focusHours: 3 }));
      mockStorage.setItem('voxplan_preference_collection_enabled', 'true');

      const previewFingerprint = await computeWorkspaceFingerprint(mockStorage);

      // User or background worker updates preference between preview and restore
      mockStorage.setItem('voxplan_preference_collection_enabled', 'false');

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_default',
        data: {
          tasks: [{ id: 't-99-new', title: 'Restored' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: mockStorage,
        workspaceFingerprint: previewFingerprint,
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'concurrent_modification');
    });

    it('9.10 rejects restore if data changes after initial concurrency check but before mutation begins (pre-commit check)', async () => {
      const profileId = 'prof_test_910';
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-910', title: 'Task 910' }]));
      mockStorage.setItem('voxplan_profile_id', profileId);

      const fingerprint = await computeWorkspaceFingerprint(mockStorage, profileId);

      // Create a storage proxy that modifies workspace state after initial concurrency check (e.g. during pre-snapshot write)
      const concurrentStorage = {
        getItem: (k) => mockStorage.getItem(k),
        removeItem: (k) => mockStorage.removeItem(k),
        setItem: (k, v) => {
          mockStorage.setItem(k, v);
          // When snapshot key is written, simulate a concurrent write from another tab before mutation
          if (k === RESTORE_PRE_SNAPSHOT_KEY) {
            mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-910-concurrent', title: 'Concurrent Edit' }]));
          }
        },
      };

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: profileId,
        data: {
          tasks: [{ id: 't-910-restored', title: 'Restored' }],
        },
      };

      const res = await restoreBackupData(payload, {
        storage: concurrentStorage,
        workspaceFingerprint: fingerprint,
      });

      assert.strictEqual(res.success, false);
      assert.strictEqual(res.error, 'concurrent_modification');
      // Verify markers were cleaned up and did not leave in-progress state
      assert.strictEqual(mockStorage.getItem(RESTORE_IN_PROGRESS_KEY), null);
      assert.strictEqual(mockStorage.getItem(RESTORE_PRE_SNAPSHOT_KEY), null);
      assert.strictEqual(mockStorage.getItem(RESTORE_JOURNAL_KEY), null);
    });
  });

  describe('10. Complete Multi-Store Workspace Preservation & Restart Persistence', () => {
    it('10.1 failed restore preserves every single included category in its exact original state', async () => {
      const profileId = 'prof_test_10_1';
      const baselineTasks = [
        { id: 'base-t1', title: 'Genuine Project Plan', priority: 'urgent', completed: false },
        { id: 'demo-c-1', title: 'Initialize repository & CI configuration', priority: 'high', completed: true },
      ];
      const baselineSchedule = { sprintId: 'sprint-2026-w42', slots: ['base-s1', 'base-s2'] };
      const baselineTimeBlocks = { dailyLimitHours: 6.5, preferredFocusBlocks: ['09:00-11:00'] };

      mockStorage.setItem('voxplan_tasks', JSON.stringify(baselineTasks));
      mockStorage.setItem('voxplan_accepted_schedule', JSON.stringify(baselineSchedule));
      mockStorage.setItem('voxplan_time_block_settings', JSON.stringify(baselineTimeBlocks));
      mockStorage.setItem('voxplan_speech_output_enabled', 'true');
      mockStorage.setItem('voxplan_preference_collection_enabled', 'false');
      mockStorage.setItem('voxplan_tasks_revision', 'rev-base-101');
      mockStorage.setItem('voxplan_profile_id', profileId);

      await clearEventsByProfile(profileId);
      await saveEventsBatch([
        { event_id: 'ev-base-1', profile_id: profileId, event_type: 'task_created', timestamp: '2026-01-01T08:00:00Z' },
      ]);
      await clearTimerSessionsByProfile(profileId);
      await saveTimerSession({ session_id: 'sess-base-1', profile_id: profileId, task_id: 'base-t1', duration: 3600 });

      // Attempt restore of invalid payload (duplicate task IDs)
      const duplicatePayload = {
        exported_at: new Date().toISOString(),
        profile_id: profileId,
        data: {
          tasks: [
            { id: 'dup-id', title: 'Task A' },
            { id: 'dup-id', title: 'Task B' },
          ],
        },
      };

      const validation = validateBackupPayload(JSON.stringify(duplicatePayload));
      assert.strictEqual(validation.valid, false);

      // Verify every store is 100% unchanged
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks')), baselineTasks);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_accepted_schedule')), baselineSchedule);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_time_block_settings')), baselineTimeBlocks);
      assert.strictEqual(mockStorage.getItem('voxplan_speech_output_enabled'), 'true');
      assert.strictEqual(mockStorage.getItem('voxplan_preference_collection_enabled'), 'false');
      assert.strictEqual(mockStorage.getItem('voxplan_tasks_revision'), 'rev-base-101');

      const events = await getEventsByProfile(profileId);
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].event_id, 'ev-base-1');
      const sessions = await getTimerSessionsByTask('base-t1');
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].session_id, 'sess-base-1');
    });

    it('10.2 successful restore updates all categories and survives full application restart', async () => {
      const profileId = 'prof_test_10_2';
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 'old-task', title: 'Old' }]));
      mockStorage.setItem('voxplan_profile_id', profileId);

      const restoreTasks = [
        { id: 'restored-1', title: 'Architecture Review', priority: 'urgent', completed: false },
        { id: 'restored-2', title: 'Write Automated Tests', priority: 'high', completed: true },
      ];
      const restoreSchedule = { sprintId: 'sprint-new-2026', slots: ['slot-A', 'slot-B'] };
      const restoreTimeBlocks = { dailyLimitHours: 8.0 };
      const restoreEvents = [
        { event_id: 'ev-new-102', profile_id: profileId, event_type: 'task_completed', timestamp: '2026-03-01T12:00:00Z' },
      ];
      const restoreSessions = [
        { session_id: 'sess-new-102', profile_id: profileId, task_id: 'restored-1', duration: 1800 },
      ];

      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: profileId,
        data: {
          tasks: restoreTasks,
          accepted_schedule: restoreSchedule,
          time_block_settings: restoreTimeBlocks,
          settings: { speech_output_enabled: true, preference_collection_enabled: true },
          telemetry_events: restoreEvents,
          timer_sessions: restoreSessions,
        },
      };

      const res = await restoreBackupData(payload, { storage: mockStorage });
      assert.strictEqual(res.success, true);

      // Verify all data restored in stores
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks')), restoreTasks);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_accepted_schedule')), restoreSchedule);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_time_block_settings')), restoreTimeBlocks);
      assert.strictEqual(mockStorage.getItem('voxplan_speech_output_enabled'), 'true');
      assert.strictEqual(mockStorage.getItem('voxplan_preference_collection_enabled'), 'true');

      // Simulate full application restart
      const restartRecovery = checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(restartRecovery.recovered, false);

      // Verify all data survived restart
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks')), restoreTasks);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_accepted_schedule')), restoreSchedule);
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_time_block_settings')), restoreTimeBlocks);
      assert.strictEqual(mockStorage.getItem('voxplan_speech_output_enabled'), 'true');
      assert.strictEqual(mockStorage.getItem('voxplan_preference_collection_enabled'), 'true');

      const eventsAfter = await getEventsByProfile(profileId);
      assert.strictEqual(eventsAfter.length, 1);
      assert.strictEqual(eventsAfter[0].event_id, 'ev-new-102');
    });

    it('10.3 excluded operational markers are never imported or restored as user data', async () => {
      const payload = {
        exported_at: new Date().toISOString(),
        profile_id: 'prof_default',
        data: {
          tasks: [{ id: 'user-t1', title: 'Regular Task' }],
        },
      };

      await restoreBackupData(payload, { storage: mockStorage });

      assert.strictEqual(mockStorage.getItem(DEMO_ACTION_LOCK_KEY), null);
      assert.strictEqual(mockStorage.getItem(DEMO_CLEANUP_PENDING_KEY), null);
      assert.strictEqual(mockStorage.getItem('voxplan_active_timer'), null);
      assert.strictEqual(mockStorage.getItem('voxplan_user_tasks_backup'), null);
    });
  });

  describe('11. Recovery Protocol & Demo Cleanup Interaction Invariants', () => {
    it('11.1 simultaneous restore journal and demo cleanup pending markers resolve restore first without deleting cleanup marker', async () => {
      const origTasks = [{ id: 't-pre-11', title: 'Pre Task' }];
      mockStorage.setItem('voxplan_tasks', JSON.stringify([{ id: 't-corrupted-mid-restore' }]));
      mockStorage.setItem(DEMO_CLEANUP_PENDING_KEY, 'prof_demo_showcase');

      const snapshot = {
        version: 1,
        tasks: JSON.stringify(origTasks),
      };
      mockStorage.setItem(RESTORE_IN_PROGRESS_KEY, JSON.stringify({ startedAt: Date.now() }));
      mockStorage.setItem(RESTORE_PRE_SNAPSHOT_KEY, JSON.stringify(snapshot));
      mockStorage.setItem(RESTORE_JOURNAL_KEY, JSON.stringify({ phase: RESTORE_PHASES.COMMITTING_LOCAL_STORAGE }));

      // Startup recovery runs
      const recovery = checkAndRecoverInterruptedRestore(mockStorage);
      assert.strictEqual(recovery.recovered, true);

      // Tasks rolled back cleanly to pre-restore baseline
      assert.deepStrictEqual(JSON.parse(mockStorage.getItem('voxplan_tasks')), origTasks);

      // Restore markers cleared
      assert.strictEqual(mockStorage.getItem(RESTORE_JOURNAL_KEY), null);
      assert.strictEqual(mockStorage.getItem(RESTORE_IN_PROGRESS_KEY), null);

      // Demo cleanup pending marker was NOT wiped out by restore recovery!
      assert.strictEqual(mockStorage.getItem(DEMO_CLEANUP_PENDING_KEY), 'prof_demo_showcase');
    });

    it('11.2 genuine user tasks resembling demo canonical IDs or titles are not deleted during demo reset', async () => {
      const originalWindow = globalThis.window;
      globalThis.window = {
        localStorage: mockStorage,
      };
      try {
        const genuineAmbiguousTask = {
          id: 'demo-c-1',
          title: 'Initialize repository & CI configuration',
          priority: 'high',
          completed: false,
        };
        const legitimateDemoTask = {
          id: 'demo-c-2',
          title: 'Define domain data models & schemas',
          isDemoSeed: true,
          provenanceSource: 'demo_seeding_utility',
        };

        mockStorage.setItem('voxplan_tasks', JSON.stringify([genuineAmbiguousTask, legitimateDemoTask]));

        // Clear demo seed
        const res = await clearDemoSeed({ clearEventsFn: () => Promise.resolve(true) });
        assert.strictEqual(res.success, true);

        // The genuine user task MUST be preserved; only legitimate demo task was deleted
        const remainingTasks = JSON.parse(mockStorage.getItem('voxplan_tasks'));
        assert.strictEqual(remainingTasks.length, 1);
        assert.strictEqual(remainingTasks[0].id, 'demo-c-1');
        assert.strictEqual(remainingTasks[0].title, 'Initialize repository & CI configuration');
      } finally {
        globalThis.window = originalWindow;
      }
    });
  });
});
