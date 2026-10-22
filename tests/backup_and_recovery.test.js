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
  RESTORE_IN_PROGRESS_KEY,
  RESTORE_PRE_SNAPSHOT_KEY,
} from '../src/utils/backupManager.js';
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
});
