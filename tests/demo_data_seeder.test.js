/**
 * Unit Tests for VoxPlan Demo Data Seeder Utility.
 * Verifies all 11 criteria specified in Section 3 of the Demo Readiness Audit.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  generateDemoDataset,
  hasExistingUserData,
  applyDemoSeed,
  clearDemoSeed,
  isDemoTask,
  parseAndValidateBackup,
  CANONICAL_DEMO_TASK_IDS,
  CANONICAL_DEMO_TASK_TITLES,
  DEMO_SEED_KEY,
  DEMO_STORAGE_TASKS_KEY,
  DEMO_BACKUP_TASKS_KEY,
  DEMO_ACTION_LOCK_KEY,
  acquireDemoLock,
  releaseDemoLock,
} from '../src/utils/demoDataSeeder.js';
import { clearDemoEventsByProfile, saveEvent, getEventsByProfile } from '../src/telemetry/indexedDbStore.js';
import { validateEvent } from '../src/telemetry/eventSchema.js';
import { computeBehavioralStats } from '../src/telemetry/behavioralStats.js';
import {
  extractEligibleObservations,
  buildPersonalDurationModel,
  evaluatePersonalDurationModel,
} from '../src/telemetry/personalModel.js';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { evaluateActivationGate } from '../src/scheduler/activationGateEvaluator.js';

describe('Demo Data Seeder & Profile Calibration Audit', () => {
  const fixedRefDate = new Date('2026-10-20T12:00:00.000Z');

  it('1. entry point is explicitly defined and produces deterministic datasets', () => {
    const data1 = generateDemoDataset({ referenceDate: fixedRefDate, profileId: 'prof_test_1' });
    const data2 = generateDemoDataset({ referenceDate: fixedRefDate, profileId: 'prof_test_1' });

    assert.strictEqual(typeof generateDemoDataset, 'function');
    assert.strictEqual(data1.tasks.length, 12);
    assert.strictEqual(data1.events.length, 36); // 8 completed * 4 events + 4 active * 1 event = 36
    assert.deepStrictEqual(data1, data2);
  });

  it('2. all generated events satisfy real application Schema v2 contracts', () => {
    const { events } = generateDemoDataset({ referenceDate: fixedRefDate });

    for (const ev of events) {
      const { valid, errors } = validateEvent(ev);
      assert.strictEqual(valid, true, `Event ${ev.event_id} (${ev.event_type}) failed validation: ${errors.join(', ')}`);
      assert.strictEqual(ev.schema_version, 2);
      assert.strictEqual(ev.isSyntheticData, true);
      assert.strictEqual(ev.isDemoSeed, true);
      assert.strictEqual(ev.provenanceSource, 'demo_seeding_utility');
    }
  });

  it('3. timestamps, durations, completion states, and dependencies are coherent', () => {
    const { tasks, events } = generateDemoDataset({ referenceDate: fixedRefDate });

    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    for (const t of tasks) {
      assert.ok(t.id && typeof t.id === 'string');
      assert.ok(t.title && typeof t.title === 'string');
      assert.ok(Number.isFinite(t.estimatedEffort) && t.estimatedEffort > 0);
      assert.ok(Array.isArray(t.dependencies));

      // Check dependency integrity: prerequisite must exist in dataset
      for (const depId of t.dependencies) {
        assert.ok(taskMap.has(depId), `Task ${t.id} depends on non-existent ${depId}`);
      }

      if (t.completed) {
        assert.ok(t.completedAt, `Completed task ${t.id} must have completedAt`);
        assert.ok(new Date(t.completedAt) <= fixedRefDate, 'Completed date must be in the past');
      } else {
        assert.strictEqual(t.completedAt, undefined);
      }
    }

    // Verify event ordering: created <= started <= paused <= completed
    for (const t of tasks.filter((t) => t.completed)) {
      const taskEvents = events.filter((e) => e.task_id === t.id);
      const created = taskEvents.find((e) => e.event_type === 'task_created');
      const started = taskEvents.find((e) => e.event_type === 'task_started');
      const completed = taskEvents.find((e) => e.event_type === 'task_completed');

      assert.ok(created && started && completed);
      assert.ok(new Date(created.timestamp) <= new Date(started.timestamp));
      assert.ok(new Date(started.timestamp) <= new Date(completed.timestamp));
    }
  });

  it('4. habit insights receives sufficient observations and exits sparse data state', () => {
    const { events } = generateDemoDataset({ referenceDate: fixedRefDate });
    const stats = computeBehavioralStats(events);

    assert.strictEqual(stats.isSufficientData, true);
    assert.strictEqual(stats.totalCompletedCount, 8);
    assert.ok(stats.totalCompletedCount >= 3, 'Must satisfy N >= 3 requirement');
    assert.ok(stats.trackedDurationCount >= 3);
    assert.ok(Number.isFinite(stats.totalTrackedSeconds) && stats.totalTrackedSeconds > 0);
    assert.ok(stats.categoryStats && Object.keys(stats.categoryStats).length >= 3);
  });

  it('5. personal duration estimator receives sufficient observations (N >= 8) for walk-forward holdout', () => {
    const { tasks, events } = generateDemoDataset({ referenceDate: fixedRefDate });
    const eligibleObs = extractEligibleObservations(events, tasks);

    assert.strictEqual(eligibleObs.length, 8);
    assert.ok(eligibleObs.length >= 8, 'Must have N >= 8 for walk-forward evaluation');

    const model = buildPersonalDurationModel(events, tasks);
    assert.ok(model.eligibleCount >= 8);
    assert.ok(Number.isFinite(model.biasRatio));
    assert.ok(model.biasRatio > 0.5 && model.biasRatio < 2.0);

    const evalResult = evaluatePersonalDurationModel(events, tasks);
    assert.strictEqual(evalResult.status, 'evaluated');
    assert.strictEqual(evalResult.heldOutPredictionCount, 5, 'Must have at least 5 held-out walk-forward predictions');
    assert.ok(evalResult.metrics && Number.isFinite(evalResult.metrics.mae_model));
  });

  it('6. protects existing user data against accidental overwrite without explicit confirmation', async () => {
    // Mock window & localStorage
    const mockStorage = new Map();
    mockStorage.set(
      DEMO_STORAGE_TASKS_KEY,
      JSON.stringify([{ id: 'custom-user-task-1', title: 'Real important user task', completed: false }])
    );

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      assert.strictEqual(hasExistingUserData(), true);

      // Attempt apply without confirmation
      const resBlocked = await applyDemoSeed({ confirmOverwrite: false });
      assert.strictEqual(resBlocked.success, false);
      assert.ok(resBlocked.message.includes('Existing user tasks detected'));

      // Attempt apply with confirmation
      const resConfirmed = await applyDemoSeed({ confirmOverwrite: true });
      assert.strictEqual(resConfirmed.success, true);
      assert.strictEqual(resConfirmed.taskCount, 12);
      assert.strictEqual(mockStorage.get(DEMO_SEED_KEY), 'true');
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('7. cleanup procedure resets tasks and removes demo seed marker idempotently', async () => {
    const mockStorage = new Map();
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify([{ id: 'demo-1' }]));
    mockStorage.set(DEMO_SEED_KEY, 'true');

    let eventsCleared = false;
    const clearEventsFn = async (_pId) => {
      eventsCleared = true;
    };

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      const res = await clearDemoSeed({ clearEventsFn });
      assert.strictEqual(res.success, true);
      assert.strictEqual(eventsCleared, true);
      assert.strictEqual(mockStorage.has(DEMO_STORAGE_TASKS_KEY), false);
      assert.strictEqual(mockStorage.has(DEMO_SEED_KEY), false);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('8. strictly preserves factory scheduler weights and activation gate invariants', () => {
    const canonicalExpected = {
      urgencyWeight: 50.0,
      priorityWeight: 100.0,
      unblockWeight: 15.0,
      riskWeight: 25.0,
    };

    assert.deepStrictEqual(FACTORY_SCHEDULER_WEIGHTS, canonicalExpected);
    assert.strictEqual(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS), true);

    const { events } = generateDemoDataset();
    assert.ok(events.length > 0);
    // Submitting demo seed synthetic data to production activation gate
    const gateResult = evaluateActivationGate({
      evaluationPairs: [{ baselineScore: 80, candidateScore: 85, clusterKey: 'demo-c-1' }],
      isSyntheticData: true,
      environment: 'production',
      samplingAssurance: {
        clusterIndependenceStatus: 'verified',
        provenance: 'demo_seeding_utility',
      },
    });

    // In production, synthetic demo data must fail closed and never unlock adaptation
    assert.strictEqual(gateResult.isEligibleForSupervisedReview, false);
    assert.strictEqual(gateResult.productionApplied, false);
    assert.strictEqual(gateResult.isAdaptationUnlocked, false);
    assert.notStrictEqual(gateResult.outcome, 'ELIGIBLE_FOR_SUPERVISED_REVIEW');
  });

  it('9. backs up existing user tasks and restores them on reset without wiping unrelated work', async () => {
    const mockStorage = new Map();
    const userOriginalTasks = [
      { id: 'user-task-101', title: 'Real user task A', completed: false },
      { id: 'user-task-102', title: 'Real user task B', completed: true },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(userOriginalTasks));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      // 1. Seed demo with confirmed overwrite
      const seedRes = await applyDemoSeed({ confirmOverwrite: true });
      assert.strictEqual(seedRes.success, true);
      assert.strictEqual(mockStorage.has(DEMO_BACKUP_TASKS_KEY), true);
      assert.strictEqual(mockStorage.get(DEMO_SEED_KEY), 'true');

      // 2. Reset demo
      const clearRes = await clearDemoSeed();
      assert.strictEqual(clearRes.success, true);
      assert.strictEqual(mockStorage.has(DEMO_SEED_KEY), false);
      assert.strictEqual(mockStorage.has(DEMO_BACKUP_TASKS_KEY), false);

      // 3. User original tasks must be restored!
      const restored = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      assert.deepStrictEqual(restored, userOriginalTasks);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('10. clearDemoEventsByProfile deletes ONLY synthetic demo events, preserving genuine user events', async () => {
    const profileId = 'prof_isolation_test';
    const genuineUserEvent = {
      event_id: 'real-ev-1',
      profile_id: profileId,
      event_type: 'task_created',
      timestamp: new Date().toISOString(),
      schema_version: 2,
      isSyntheticData: false,
      provenanceSource: 'user_action',
      payload: { title: 'Genuine task' },
    };

    const demoSeededEvent = {
      event_id: 'demo-ev-1',
      profile_id: profileId,
      event_type: 'task_created',
      timestamp: new Date().toISOString(),
      schema_version: 2,
      isSyntheticData: true,
      isDemoSeed: true,
      provenanceSource: 'demo_seeding_utility',
      payload: { title: 'Demo task' },
    };

    // Save both events
    await saveEvent(genuineUserEvent);
    await saveEvent(demoSeededEvent);

    const eventsBefore = await getEventsByProfile(profileId);
    assert.strictEqual(eventsBefore.length, 2);

    // Run selective demo cleanup
    const clearResult = await clearDemoEventsByProfile(profileId);
    assert.strictEqual(clearResult, true);

    const eventsAfter = await getEventsByProfile(profileId);
    assert.strictEqual(eventsAfter.length, 1);
    assert.strictEqual(eventsAfter[0].event_id, 'real-ev-1');
    assert.strictEqual(eventsAfter[0].isSyntheticData, false);
  });

  it('11. genuine tasks created during active demo are preserved and merged upon reset', async () => {
    const mockStorage = new Map();
    const originalTasks = [
      { id: 'user-t-1', title: 'Pre-existing Task 1', completed: false },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(originalTasks));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      // 1. Seed demo
      await applyDemoSeed({ confirmOverwrite: true });
      assert.strictEqual(mockStorage.has(DEMO_BACKUP_TASKS_KEY), true);

      // 2. User creates a new genuine task while demo is active
      const currentTasks = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      const newGenuineTask = {
        id: 'task-user-created-during-demo',
        title: 'Urgent user work added mid-demo',
        completed: false,
        createdAt: new Date().toISOString(),
      };
      mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify([newGenuineTask, ...currentTasks]));

      // 3. Reset demo
      const clearRes = await clearDemoSeed();
      assert.strictEqual(clearRes.success, true);

      // 4. Verification: both the pre-existing task AND the task created during demo must survive!
      const restored = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      assert.strictEqual(restored.length, 2);
      assert.ok(restored.some((t) => t.id === 'user-t-1'));
      assert.ok(restored.some((t) => t.id === 'task-user-created-during-demo'));
      // No demo tasks remain
      assert.ok(restored.every((t) => !isDemoTask(t)));
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('12. malformed backup JSON does not cause destructive wipe of current genuine tasks and is quarantined safely', async () => {
    const mockStorage = new Map();
    const currentTasks = [
      { id: 'safe-user-task-1', title: 'Work In Progress', completed: false },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(currentTasks));
    mockStorage.set(DEMO_BACKUP_TASKS_KEY, '{ invalid json truncated...');

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      const clearRes = await clearDemoSeed();
      assert.strictEqual(clearRes.success, false);
      assert.ok(clearRes.message.includes('malformed'));

      // Crucial: current tasks were NOT wiped!
      const finalTasks = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      assert.strictEqual(finalTasks.length, 1);
      assert.strictEqual(finalTasks[0].id, 'safe-user-task-1');

      // Crucial: malformed backup string was quarantined, not silently lost
      const quarantineKey = Array.from(mockStorage.keys()).find((k) => k.startsWith('voxplan_quarantine_backup_'));
      assert.ok(quarantineKey, 'Corrupted backup must be quarantined in a recovery key');
      assert.strictEqual(mockStorage.get(quarantineKey), '{ invalid json truncated...');
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('13. backward compatibility: restores both legacy raw task arrays and versioned backup envelopes', () => {
    // 1. Test legacy array
    const legacyArrayRaw = JSON.stringify([
      { id: 'legacy-t-1', title: 'Legacy Array Task', completed: false },
    ]);
    const legacyParsed = parseAndValidateBackup(legacyArrayRaw);
    assert.strictEqual(legacyParsed.valid, true);
    assert.strictEqual(legacyParsed.tasks.length, 1);
    assert.strictEqual(legacyParsed.metadata.format, 'legacy_array');

    // 2. Test versioned envelope
    const envelopeRaw = JSON.stringify({
      schema_version: 1,
      backed_up_at: '2026-10-22T10:00:00.000Z',
      profile_id: 'prof_test',
      task_count: 1,
      tasks: [{ id: 'env-t-1', title: 'Envelope Task', completed: true }],
    });
    const envelopeParsed = parseAndValidateBackup(envelopeRaw);
    assert.strictEqual(envelopeParsed.valid, true);
    assert.strictEqual(envelopeParsed.tasks.length, 1);
    assert.strictEqual(envelopeParsed.metadata.format, 'versioned_envelope');
  });

  it('14. confirmation cancellation causes zero mutation to storage or active state', async () => {
    const mockStorage = new Map();
    const originalTasks = [
      { id: 'user-t-1', title: 'Original Task', completed: false },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(originalTasks));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      // Simulating user declining confirmation: confirmOverwrite = false
      const res = await applyDemoSeed({ confirmOverwrite: false });
      assert.strictEqual(res.success, false);
      assert.ok(res.message.includes('Existing user tasks detected'));

      // Storage must remain completely untouched
      assert.strictEqual(mockStorage.get(DEMO_STORAGE_TASKS_KEY), JSON.stringify(originalTasks));
      assert.strictEqual(mockStorage.has(DEMO_BACKUP_TASKS_KEY), false);
      assert.strictEqual(mockStorage.has(DEMO_SEED_KEY), false);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('15. partial write failure during IndexedDB event saving triggers automatic rollback of localStorage', async () => {
    const mockStorage = new Map();
    const originalTasks = [
      { id: 'user-t-preserve', title: 'Preserve Me', completed: false },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(originalTasks));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      let callCount = 0;
      const failingSaveEventFn = async () => {
        callCount++;
        if (callCount > 2) {
          throw new Error('Disk IO or Quota Failure in IndexedDB');
        }
        return true;
      };

      const res = await applyDemoSeed({
        confirmOverwrite: true,
        saveEventFn: failingSaveEventFn,
      });

      assert.strictEqual(res.success, false);
      assert.ok(res.message.includes('telemetry persistence failed'));

      // Crucial: localStorage was rolled back to pre-seed original tasks!
      const currentTasks = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      assert.deepStrictEqual(currentTasks, originalTasks);
      assert.strictEqual(mockStorage.has(DEMO_SEED_KEY), false);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('16. storage quota error during backup creation aborts seeding safely and preserves existing tasks intact', async () => {
    const mockStorage = new Map();
    const originalTasks = [
      { id: 'vital-task', title: 'Vital user task', completed: false },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(originalTasks));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => {
          if (k === DEMO_BACKUP_TASKS_KEY) {
            throw new Error('QuotaExceededError: LocalStorage limit reached');
          }
          mockStorage.set(k, String(v));
        },
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      const res = await applyDemoSeed({ confirmOverwrite: true });
      assert.strictEqual(res.success, false);
      assert.ok(res.message.includes('Storage write failure during backup'));

      // Vital tasks must remain untouched in primary storage
      const currentTasks = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      assert.deepStrictEqual(currentTasks, originalTasks);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('17. non-demo task with "demo-" in title or custom ID without provenance marker is NOT falsely classified as demo task', () => {
    assert.ok(CANONICAL_DEMO_TASK_IDS.has('demo-c-1'));
    assert.strictEqual(CANONICAL_DEMO_TASK_IDS.has('demo-presentation-notes'), false);

    const userCustomTask = {
      id: 'demo-presentation-notes',
      title: 'Prepare demo for executive staff',
      completed: false,
    };
    // Crucial: not a canonical demo ID and has no demo provenance markers
    assert.strictEqual(isDemoTask(userCustomTask), false);

    assert.strictEqual(CANONICAL_DEMO_TASK_TITLES['demo-c-1'], 'Initialize repository & CI configuration');

    // Canonical demo ID without provenance is ONLY recognized if title matches canonical demo title
    const canonicalLegacy = { id: 'demo-c-1', title: CANONICAL_DEMO_TASK_TITLES['demo-c-1'] };
    assert.strictEqual(isDemoTask(canonicalLegacy), true);

    // Canonical demo ID with genuine user title is preserved as user task (Scenario A)
    const canonicalCollision = { id: 'demo-c-1', title: 'Prepare Tax Return 2026' };
    assert.strictEqual(isDemoTask(canonicalCollision), false);

    // Any ID with explicit provenance marker is recognized
    const markedTask = { id: 'custom-id-999', isDemoSeed: true };
    assert.strictEqual(isDemoTask(markedTask), true);
  });

  it('18. repeated seed attempts do not overwrite an existing genuine backup with mixed demo data', async () => {
    const mockStorage = new Map();
    const originalTasks = [
      { id: 'real-user-1', title: 'Original Genuine Task', completed: false },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(originalTasks));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      // 1. Initial seed with genuine user data
      await applyDemoSeed({ confirmOverwrite: true });
      const backup1 = mockStorage.get(DEMO_BACKUP_TASKS_KEY);
      assert.ok(backup1);

      // 2. User adds another task while demo is active
      const tasksInDemo = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      tasksInDemo.push({ id: 'task-user-added', title: 'User Task Mid-Demo' });
      mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(tasksInDemo));

      // 3. User clicks seed again (repeated seed)
      await applyDemoSeed({ confirmOverwrite: true });

      // Crucial: The backup must NOT contain the 12 demo tasks!
      const backup2Raw = mockStorage.get(DEMO_BACKUP_TASKS_KEY);
      const backup2 = parseAndValidateBackup(backup2Raw);
      assert.strictEqual(backup2.valid, true);
      assert.ok(backup2.tasks.every((t) => !isDemoTask(t)), 'Backup must NEVER contain demo-seeded tasks');
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('19. [Scenario A] canonical demo ID collision: genuine task with id demo-c-1 survives seed and reset intact', async () => {
    const mockStorage = new Map();
    const genuineCollidingTask = {
      id: 'demo-c-1',
      title: 'Prepare Tax Return 2026',
      description: 'Crucial genuine personal tax document task',
      priority: 'high',
      dueDate: '2026-11-15',
      completed: false,
    };
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify([genuineCollidingTask]));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      // 1. Genuine task must be recognized as user data despite id matching canonical demo id
      assert.strictEqual(hasExistingUserData(), true);

      // 2. Seed demo dataset
      const seedRes = await applyDemoSeed({ confirmOverwrite: true });
      assert.strictEqual(seedRes.success, true);

      // Verify backup contains the genuine task, NOT filtered out
      const backupRaw = mockStorage.get(DEMO_BACKUP_TASKS_KEY);
      assert.ok(backupRaw, 'Backup must exist');
      const backupParsed = parseAndValidateBackup(backupRaw);
      assert.strictEqual(backupParsed.valid, true);
      assert.strictEqual(backupParsed.tasks.length, 1);
      assert.strictEqual(backupParsed.tasks[0].id, 'demo-c-1');
      assert.strictEqual(backupParsed.tasks[0].title, 'Prepare Tax Return 2026');

      // 3. Reset demo
      const clearRes = await clearDemoSeed();
      assert.strictEqual(clearRes.success, true);

      // 4. Genuine task must be completely restored!
      const finalTasks = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      assert.strictEqual(finalTasks.length, 1);
      assert.strictEqual(finalTasks[0].id, 'demo-c-1');
      assert.strictEqual(finalTasks[0].title, 'Prepare Tax Return 2026');
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('20. [Scenario E] partial telemetry persistence failure fails closed and triggers rollback', async () => {
    const mockStorage = new Map();
    const originalTasks = [
      { id: 'user-t-safe', title: 'Existing User Work', completed: false },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(originalTasks));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      // saveEventFn returns false on the 4th event (partial write without throw)
      let count = 0;
      const partialSaveFn = async () => {
        count++;
        return count <= 3; // saves only 3 events, then returns false
      };

      const seedRes = await applyDemoSeed({
        confirmOverwrite: true,
        saveEventFn: partialSaveFn,
      });

      // Must fail closed and report incomplete persistence
      assert.strictEqual(seedRes.success, false);
      assert.ok(seedRes.message.includes('telemetry persistence incomplete'));

      // Storage must be rolled back to pre-seed original tasks
      const currentTasks = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      assert.deepStrictEqual(currentTasks, originalTasks);
      assert.strictEqual(mockStorage.has(DEMO_SEED_KEY), false);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('21. [Scenario F] partial telemetry cleanup failure reports explicit partialSuccess and warning contract', async () => {
    const mockStorage = new Map();
    const originalTasks = [
      { id: 'user-t-before', title: 'Task Before Demo', completed: false },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(originalTasks));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      await applyDemoSeed({ confirmOverwrite: true });

      // clearEventsFn reports false (failure/incomplete)
      const failingClearFn = async () => false;

      const clearRes = await clearDemoSeed({ clearEventsFn: failingClearFn });

      // Must NOT report full success
      assert.strictEqual(clearRes.success, false);
      assert.strictEqual(clearRes.partialSuccess, true);
      assert.strictEqual(clearRes.tasksRestored, true);
      assert.strictEqual(clearRes.telemetryCleaned, false);
      assert.ok(clearRes.message.includes('telemetry cleanup reported incomplete'));

      // Crucial: genuine tasks WERE restored safely despite telemetry failure
      const finalTasks = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      assert.strictEqual(finalTasks.length, 1);
      assert.strictEqual(finalTasks[0].id, 'user-t-before');
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('22. [Scenario D] backup validation rejects unsupported schema version, count mismatch, and deduplicates IDs', () => {
    // 1. Unsupported future schema version
    const futureEnvelope = JSON.stringify({
      schema_version: 99,
      tasks: [{ id: 't-1', title: 'Task 1' }],
    });
    const futureRes = parseAndValidateBackup(futureEnvelope);
    assert.strictEqual(futureRes.valid, false);
    assert.ok(futureRes.error.includes('unsupported_schema_version_99'));

    // 2. Declared task_count mismatch
    const mismatchEnvelope = JSON.stringify({
      schema_version: 1,
      task_count: 5,
      tasks: [{ id: 't-1', title: 'Task 1' }],
    });
    const mismatchRes = parseAndValidateBackup(mismatchEnvelope);
    assert.strictEqual(mismatchRes.valid, false);
    assert.ok(mismatchRes.error.includes('task_count_mismatch'));

    // 3. Duplicate task IDs deduplicated safely
    const dupEnvelope = JSON.stringify({
      schema_version: 1,
      tasks: [
        { id: 't-dup', title: 'Version A' },
        { id: 't-dup', title: 'Version B' },
      ],
    });
    const dupRes = parseAndValidateBackup(dupEnvelope);
    assert.strictEqual(dupRes.valid, true);
    assert.strictEqual(dupRes.tasks.length, 1);
    assert.strictEqual(dupRes.tasks[0].title, 'Version A');
  });

  it('23. [Scenario G] cross-tab concurrency lock prevents racing seed/reset operations and auto-expires', async () => {
    const mockStorage = new Map();
    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      // 1. Simulate an active lock from another tab held just now
      mockStorage.set(DEMO_ACTION_LOCK_KEY, String(Date.now()));

      // Concurrent seed attempt must be rejected
      const seedRes = await applyDemoSeed({ confirmOverwrite: true });
      assert.strictEqual(seedRes.success, false);
      assert.ok(seedRes.message.includes('already in progress'));

      // Concurrent clear attempt must be rejected
      const clearRes = await clearDemoSeed();
      assert.strictEqual(clearRes.success, false);
      assert.ok(clearRes.message.includes('already in progress'));

      // 2. Simulate expired lock (e.g. from crashed tab 10 seconds ago)
      mockStorage.set(DEMO_ACTION_LOCK_KEY, String(Date.now() - 10000));
      assert.strictEqual(acquireDemoLock(), true);
      releaseDemoLock();
      assert.strictEqual(mockStorage.has(DEMO_ACTION_LOCK_KEY), false);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('24. [Scenario B] task conflict resolution: active non-demo additions override or coexist with restored backup', async () => {
    const mockStorage = new Map();
    const userOriginalTasks = [
      { id: 't-shared', title: 'Original Version of Shared Task', completed: false },
      { id: 't-unique-pre', title: 'Unique Pre-existing Task', completed: true },
    ];
    mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(userOriginalTasks));

    const originalWindow = globalThis.window;
    globalThis.window = {
      localStorage: {
        getItem: (k) => mockStorage.get(k) || null,
        setItem: (k, v) => mockStorage.set(k, String(v)),
        removeItem: (k) => mockStorage.delete(k),
      },
    };

    try {
      await applyDemoSeed({ confirmOverwrite: true });

      // During the demo, user creates a new task AND edits the shared task
      const activeTasksDuringDemo = [
        { id: 't-shared', title: 'Updated Version of Shared Task Mid-Demo', completed: true },
        { id: 't-new-mid', title: 'Newly Added Mid-Demo Task', completed: false },
        // ... demo tasks also present in active store ...
        ...generateDemoDataset().tasks,
      ];
      mockStorage.set(DEMO_STORAGE_TASKS_KEY, JSON.stringify(activeTasksDuringDemo));

      // Reset demo
      const clearRes = await clearDemoSeed();
      assert.strictEqual(clearRes.success, true);

      // Verify merged outcome
      const finalTasks = JSON.parse(mockStorage.get(DEMO_STORAGE_TASKS_KEY));
      assert.strictEqual(finalTasks.length, 3);

      const shared = finalTasks.find((t) => t.id === 't-shared');
      assert.ok(shared);
      // Active mid-demo edit overrides the stale pre-seed backup version
      assert.strictEqual(shared.title, 'Updated Version of Shared Task Mid-Demo');
      assert.strictEqual(shared.completed, true);

      // Pre-existing unique task is restored
      assert.ok(finalTasks.some((t) => t.id === 't-unique-pre'));

      // New task created mid-demo is preserved
      assert.ok(finalTasks.some((t) => t.id === 't-new-mid'));

      // All 12 demo tasks are gone
      assert.ok(finalTasks.every((t) => !isDemoTask(t)));
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
