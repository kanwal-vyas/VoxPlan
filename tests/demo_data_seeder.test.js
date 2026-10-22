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
  DEMO_SEED_KEY,
  DEMO_STORAGE_TASKS_KEY,
  DEMO_BACKUP_TASKS_KEY,
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
});
