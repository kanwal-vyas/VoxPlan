/**
 * Automated Test Suite for VoxPlan Personal Duration Estimation and Task Lifecycle.
 * Runs on Node.js native test runner (node:test).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateWeightedMedian,
  extractEligibleObservations,
  buildPersonalDurationModel,
  estimateTaskDuration,
  getPersonalDurationEstimate,
} from '../src/telemetry/personalModel.js';

import {
  completeTaskLifecycle,
  reopenTaskLifecycle,
} from '../src/telemetry/taskLifecycle.js';

describe('1. Personal Duration Estimator - Core Math & Observations', () => {
  it('calculateWeightedMedian returns null for empty or invalid inputs', () => {
    assert.equal(calculateWeightedMedian([]), null);
    assert.equal(calculateWeightedMedian(null), null);
    assert.equal(calculateWeightedMedian([{ value: NaN, weight: 1 }]), null);
    assert.equal(calculateWeightedMedian([{ value: 2.0, weight: 0 }]), null);
  });

  it('calculateWeightedMedian calculates correct weighted median with varying weights', () => {
    // Two items: 1.0 (weight 1.0) and 2.0 (weight 1.0) -> median is 1.5
    assert.equal(calculateWeightedMedian([
      { value: 1.0, weight: 1.0 },
      { value: 2.0, weight: 1.0 },
    ]), 1.5);

    // Heavy weight on 1.2: 1.2 (weight 3.0) and 2.0 (weight 0.5) -> median is 1.2
    assert.equal(calculateWeightedMedian([
      { value: 1.2, weight: 3.0 },
      { value: 2.0, weight: 0.5 },
    ]), 1.2);
  });

  it('1. No observations returns original estimate without claiming personalization (cold_start)', () => {
    const result = getPersonalDurationEstimate([], [], { estimatedEffort: 3.0 });
    assert.equal(result.personalization_status, 'cold_start');
    assert.equal(result.user_estimate_hours, 3.0);
    assert.equal(result.predicted_duration_hours, 3.0);
    assert.equal(result.eligible_observation_count, 0);
    assert.equal(result.estimation_bias_ratio, 1.0);
    assert.equal(result.uncertainty, null);
    assert.match(result.explanation, /No measured completion history yet/i);
  });

  it('2. Missing estimate returns a clear unavailable state', () => {
    const result = getPersonalDurationEstimate([], [], { estimatedEffort: null });
    assert.equal(result.personalization_status, 'unavailable');
    assert.equal(result.predicted_duration_hours, null);
    assert.equal(result.user_estimate_hours, null);
    assert.match(result.explanation, /No estimated effort provided/i);

    const resultZero = getPersonalDurationEstimate([], [], { estimatedEffort: 0 });
    assert.equal(resultZero.personalization_status, 'unavailable');
  });

  it('3. One valid tracked observation applies gentle shrinkage toward 1.0', () => {
    // 1 task: estimated 2h, took 3h (ratio 1.5). Weight = 1.0
    // Shrunk ratio = (1 / (1 + 3)) * 1.5 + (3 / (1 + 3)) * 1.0 = 0.375 + 0.75 = 1.125
    const events = [
      {
        event_id: 'evt-1',
        task_id: 'task-1',
        event_type: 'task_created',
        timestamp: '2026-10-10T10:00:00Z',
        payload: { title: 'Test 1', estimated_effort: 2.0 },
      },
      {
        event_id: 'evt-2',
        task_id: 'task-1',
        event_type: 'task_completed',
        timestamp: '2026-10-10T13:00:00Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 3 * 3600 },
      },
    ];

    const result = getPersonalDurationEstimate(events, [], { estimatedEffort: 4.0 });
    assert.equal(result.personalization_status, 'sparse');
    assert.equal(result.eligible_observation_count, 1);
    assert.equal(result.tracked_observation_count, 1);
    assert.equal(result.self_reported_observation_count, 0);
    // bias ratio should be 1.13 (rounded 1.125)
    assert.equal(result.estimation_bias_ratio, 1.13);
    // 4h * 1.13 = ~4.5h
    assert.equal(result.predicted_duration_hours, 4.5);
    assert.ok(result.uncertainty);
    assert.equal(result.uncertainty.range_label, 'Heuristic range');
  });

  it('4. Multiple consistent observations adjust smoothly toward empirical ratio', () => {
    // 4 tasks: each estimated 2h, took 3h (ratio 1.5). All tracked (weight = 4.0)
    // Shrunk ratio = (4 / (4 + 3)) * 1.5 + (3 / (4 + 3)) * 1.0 = (6.0 + 3.0) / 7.0 = 9 / 7 = ~1.286 -> 1.29
    const events = [];
    for (let i = 1; i <= 4; i++) {
      events.push({
        event_id: `evt-c-${i}`,
        task_id: `task-${i}`,
        event_type: 'task_created',
        timestamp: `2026-10-1${i}T10:00:00Z`,
        payload: { title: `Task ${i}`, estimated_effort: 2.0 },
      });
      events.push({
        event_id: `evt-comp-${i}`,
        task_id: `task-${i}`,
        event_type: 'task_completed',
        timestamp: `2026-10-1${i}T13:00:00Z`,
        payload: { duration_source: 'tracked', tracked_duration_seconds: 3 * 3600 },
      });
    }

    const result = getPersonalDurationEstimate(events, [], { estimatedEffort: 2.0 });
    assert.equal(result.personalization_status, 'developing');
    assert.equal(result.eligible_observation_count, 4);
    assert.equal(result.estimation_bias_ratio, 1.29);
    // 2.0 * 1.29 = 2.6h
    assert.equal(result.predicted_duration_hours, 2.6);
  });

  it('5. Self-reported observations receive lower weight (0.5 vs 1.0)', () => {
    // 1 self-reported task: estimated 2h, took 4h (ratio 2.0). Weight = 0.5
    // Shrunk ratio = (0.5 / 3.5) * 2.0 + (3.0 / 3.5) * 1.0 = (1.0 + 3.0) / 3.5 = 4 / 3.5 = ~1.14
    const events = [
      {
        event_id: 'evt-sr-1',
        task_id: 'task-sr-1',
        event_type: 'task_created',
        timestamp: '2026-10-12T10:00:00Z',
        payload: { title: 'Self reported task', estimated_effort: 2.0 },
      },
      {
        event_id: 'evt-sr-2',
        task_id: 'task-sr-1',
        event_type: 'task_completed',
        timestamp: '2026-10-12T14:00:00Z',
        payload: { duration_source: 'self_reported', self_reported_duration_seconds: 4 * 3600 },
      },
    ];

    const model = buildPersonalDurationModel(events, []);
    assert.equal(model.eligibleCount, 1);
    assert.equal(model.selfReportedCount, 1);
    assert.equal(model.trackedCount, 0);
    assert.equal(model.effectiveWeight, 0.5);
    assert.equal(model.biasRatio, 1.14);
  });

  it('6. Unknown-duration observations are excluded', () => {
    const events = [
      {
        event_id: 'evt-u-1',
        task_id: 'task-u-1',
        event_type: 'task_created',
        timestamp: '2026-10-12T10:00:00Z',
        payload: { title: 'Unknown task', estimated_effort: 2.0 },
      },
      {
        event_id: 'evt-u-2',
        task_id: 'task-u-1',
        event_type: 'task_completed',
        timestamp: '2026-10-12T14:00:00Z',
        payload: { duration_source: 'unknown', tracked_duration_seconds: null },
      },
    ];

    const model = buildPersonalDurationModel(events, []);
    assert.equal(model.eligibleCount, 0);
    assert.equal(model.status, 'cold_start');
  });

  it('7. Invalid, negative, and non-finite values are excluded', () => {
    const events = [
      {
        event_id: 'evt-inv-1',
        task_id: 'task-inv-1',
        event_type: 'task_created',
        timestamp: '2026-10-12T10:00:00Z',
        payload: { title: 'Invalid task 1', estimated_effort: -2.0 }, // negative effort
      },
      {
        event_id: 'evt-inv-2',
        task_id: 'task-inv-1',
        event_type: 'task_completed',
        timestamp: '2026-10-12T14:00:00Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 3600 },
      },
      {
        event_id: 'evt-inv-3',
        task_id: 'task-inv-2',
        event_type: 'task_created',
        timestamp: '2026-10-12T10:00:00Z',
        payload: { title: 'Invalid task 2', estimated_effort: 2.0 },
      },
      {
        event_id: 'evt-inv-4',
        task_id: 'task-inv-2',
        event_type: 'task_completed',
        timestamp: '2026-10-12T14:00:00Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: -500 }, // negative duration
      },
      {
        event_id: 'evt-inv-5',
        task_id: 'task-inv-3',
        event_type: 'task_created',
        timestamp: '2026-10-12T10:00:00Z',
        payload: { title: 'Invalid task 3', estimated_effort: 2.0 },
      },
      {
        event_id: 'evt-inv-6',
        task_id: 'task-inv-3',
        event_type: 'task_completed',
        timestamp: '2026-10-12T14:00:00Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 300 * 3600 }, // > 200 hours implausible
      },
    ];

    const model = buildPersonalDurationModel(events, []);
    assert.equal(model.eligibleCount, 0);
  });

  it('8. Extreme outliers do not dominate the estimate due to clamping & median', () => {
    // 3 normal tasks (ratio 1.2) and 1 extreme typo task (1h estimated, 100h recorded = ratio 100 clamped to 10)
    const events = [];
    for (let i = 1; i <= 3; i++) {
      events.push({
        event_id: `evt-norm-${i}`,
        task_id: `task-norm-${i}`,
        event_type: 'task_created',
        timestamp: `2026-10-1${i}T10:00:00Z`,
        payload: { title: `Task ${i}`, estimated_effort: 2.0 },
      });
      events.push({
        event_id: `evt-norm-c-${i}`,
        task_id: `task-norm-${i}`,
        event_type: 'task_completed',
        timestamp: `2026-10-1${i}T13:00:00Z`,
        payload: { duration_source: 'tracked', tracked_duration_seconds: 2.4 * 3600 }, // ratio 1.2
      });
    }

    // Outlier task
    events.push({
      event_id: 'evt-out-1',
      task_id: 'task-out-1',
      event_type: 'task_created',
      timestamp: '2026-10-15T10:00:00Z',
      payload: { title: 'Outlier', estimated_effort: 1.0 },
    });
    events.push({
      event_id: 'evt-out-2',
      task_id: 'task-out-1',
      event_type: 'task_completed',
      timestamp: '2026-10-15T20:00:00Z',
      payload: { duration_source: 'tracked', tracked_duration_seconds: 80 * 3600 }, // ratio 80 -> clamped to 10.0
    });

    const model = buildPersonalDurationModel(events, []);
    // Weighted median of [1.2, 1.2, 1.2, 10.0] with weights 1 is 1.2!
    assert.equal(model.rawBiasRatio, 1.2);
    // The extreme outlier did not skew the raw weighted median
    assert.ok(model.biasRatio < 1.3);
  });

  it('9. Shrinkage prevents excessive corrections from sparse observations', () => {
    // 1 observation with ratio 3.0 (user took 3x longer on 1 task)
    const events = [
      {
        event_id: 'evt-sp-1',
        task_id: 'task-sp-1',
        event_type: 'task_created',
        timestamp: '2026-10-10T10:00:00Z',
        payload: { title: 'Sparse task', estimated_effort: 1.0 },
      },
      {
        event_id: 'evt-sp-2',
        task_id: 'task-sp-1',
        event_type: 'task_completed',
        timestamp: '2026-10-10T13:00:00Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 3.0 * 3600 },
      },
    ];

    const model = buildPersonalDurationModel(events, []);
    // Shrunk ratio: (1/4)*3.0 + (3/4)*1.0 = 0.75 + 0.75 = 1.50
    // Rather than 3.0, the model only adjusts to 1.50
    assert.equal(model.biasRatio, 1.5);
  });

  it('10. Duplicate completion events do not inflate the sample count', () => {
    const singleEvent = {
      event_id: 'evt-dup-comp-1',
      task_id: 'task-dup-1',
      event_type: 'task_completed',
      timestamp: '2026-10-10T13:00:00Z',
      payload: { duration_source: 'tracked', tracked_duration_seconds: 2 * 3600 },
    };

    // Ingest the exact same event 3 times
    const events = [
      {
        event_id: 'evt-dup-c-1',
        task_id: 'task-dup-1',
        event_type: 'task_created',
        timestamp: '2026-10-10T10:00:00Z',
        payload: { title: 'Dup task', estimated_effort: 2.0 },
      },
      singleEvent,
      singleEvent,
      singleEvent,
    ];

    const model = buildPersonalDurationModel(events, []);
    assert.equal(model.eligibleCount, 1);
  });

  it('11. Reopened tasks are not double-counted or counted while open', () => {
    // Task completed, then reopened -> currently open, so NOT eligible
    const events = [
      {
        event_id: 'evt-ro-1',
        task_id: 'task-ro-1',
        event_type: 'task_created',
        timestamp: '2026-10-10T10:00:00Z',
        payload: { title: 'Reopen task', estimated_effort: 2.0 },
      },
      {
        event_id: 'evt-ro-2',
        task_id: 'task-ro-1',
        event_type: 'task_completed',
        timestamp: '2026-10-10T12:00:00Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 2 * 3600 },
      },
      {
        event_id: 'evt-ro-3',
        task_id: 'task-ro-1',
        event_type: 'task_reopened',
        timestamp: '2026-10-10T13:00:00Z',
        payload: { reopened_at: '2026-10-10T13:00:00Z' },
      },
    ];

    const model = buildPersonalDurationModel(events, []);
    assert.equal(model.eligibleCount, 0);

    // Now re-complete the reopened task:
    events.push({
      event_id: 'evt-ro-4',
      task_id: 'task-ro-1',
      event_type: 'task_completed',
      timestamp: '2026-10-10T15:00:00Z',
      payload: { duration_source: 'tracked', tracked_duration_seconds: 3 * 3600 },
    });

    const model2 = buildPersonalDurationModel(events, []);
    // Exactly 1 eligible task observation (not 2)
    assert.equal(model2.eligibleCount, 1);
    assert.equal(model2.observations[0].observedHours, 3.0);
  });

  it('12. Missing categories do not cause fabricated category personalization', () => {
    const events = [
      {
        event_id: 'evt-cat-1',
        task_id: 'task-cat-1',
        event_type: 'task_created',
        timestamp: '2026-10-10T10:00:00Z',
        payload: { title: 'Category test' }, // no category or effort in payload
      },
      {
        event_id: 'evt-cat-2',
        task_id: 'task-cat-1',
        event_type: 'task_completed',
        timestamp: '2026-10-10T12:00:00Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 2 * 3600 },
      },
    ];

    // Current tasks provide effort
    const tasks = [{ id: 'task-cat-1', estimatedEffort: 2.0 }];
    const obs = extractEligibleObservations(events, tasks);
    assert.equal(obs.length, 1);
    assert.equal(obs[0].category, 'General');
  });

  it('13. Deleting history restores cold-start behaviour', () => {
    // Model with active history
    const events = [
      {
        event_id: 'evt-del-1',
        task_id: 'task-del-1',
        event_type: 'task_created',
        timestamp: '2026-10-10T10:00:00Z',
        payload: { title: 'Delete test', estimated_effort: 2.0 },
      },
      {
        event_id: 'evt-del-2',
        task_id: 'task-del-1',
        event_type: 'task_completed',
        timestamp: '2026-10-10T12:00:00Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 4 * 3600 },
      },
    ];

    const modelBefore = buildPersonalDurationModel(events, []);
    assert.equal(modelBefore.eligibleCount, 1);

    // After clearing events
    const modelAfter = buildPersonalDurationModel([], []);
    assert.equal(modelAfter.status, 'cold_start');
    assert.equal(modelAfter.eligibleCount, 0);

    const prediction = estimateTaskDuration(modelAfter, { estimatedEffort: 2.0 });
    assert.equal(prediction.personalization_status, 'cold_start');
    assert.equal(prediction.predicted_duration_hours, 2.0);
  });

  it('14. Predictions do not use post-completion fields as input features (target leakage safety)', () => {
    // Candidate task presented for prediction at planning time
    const planningTask = {
      id: 'candidate-task-1',
      title: 'Infrastructure Deployment',
      priority: 'high',
      dueDate: '2026-11-20',
      estimatedEffort: 4.0,
      category: 'Engineering',
      // None of the post-completion fields exist on planningTask
    };

    const model = buildPersonalDurationModel([], []);
    const prediction = estimateTaskDuration(model, planningTask);

    assert.equal(prediction.user_estimate_hours, 4.0);
    // Prediction does not require completedAt or trackedDurationSeconds
    assert.ok(prediction.predicted_duration_hours != null);
  });
});

describe('2. Task Lifecycle Transitions & Command-Bar Integration', () => {
  it('completeTaskLifecycle successfully completes an open task', async () => {
    const openTask = {
      id: 't-101',
      title: 'Prepare Slide Deck',
      completed: false,
      dueDate: '2026-11-01',
    };

    const result = await completeTaskLifecycle({
      task: openTask,
      durationInfo: { durationSource: 'self_reported', selfReportedDurationSeconds: 1800 },
    });

    assert.equal(result.success, true);
    assert.equal(result.updatedTask.completed, true);
    assert.ok(result.updatedTask.completedAt);
    assert.equal(result.updatedTask.durationSource, 'self_reported');
    assert.equal(result.updatedTask.selfReportedDurationSeconds, 1800);
    assert.equal(result.telemetryPayload.duration_source, 'self_reported');
  });

  it('completeTaskLifecycle finalizes active timer session when running', async () => {
    const openTask = {
      id: 't-102',
      title: 'Code Review',
      completed: false,
    };

    const activeTimerState = {
      taskId: 't-102',
      isRunning: true,
      startedAt: Date.now() - 15000, // 15 seconds ago
      accumulatedSeconds: 105,       // 105s previously accumulated
    };

    const result = await completeTaskLifecycle({
      task: openTask,
      activeTimerState,
      durationInfo: {}, // untimed command-bar completion
    });

    assert.equal(result.success, true);
    assert.equal(result.timerStopped, true);
    assert.equal(result.updatedTask.durationSource, 'tracked');
    // Tracked seconds should be ~120s
    assert.ok(result.updatedTask.trackedDurationSeconds >= 119);
    assert.equal(result.telemetryPayload.duration_source, 'tracked');
  });

  it('completeTaskLifecycle is idempotent: repeated complete returns already_completed', async () => {
    const completedTask = {
      id: 't-103',
      title: 'Already Completed',
      completed: true,
      completedAt: '2026-10-16T08:00:00Z',
    };

    const result = await completeTaskLifecycle({ task: completedTask });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'already_completed');
  });

  it('reopenTaskLifecycle reopens a completed task', () => {
    const completedTask = {
      id: 't-104',
      title: 'Completed Task',
      completed: true,
      completedAt: '2026-10-16T08:00:00Z',
    };

    const result = reopenTaskLifecycle({ task: completedTask });
    assert.equal(result.success, true);
    assert.equal(result.updatedTask.completed, false);
    assert.equal(result.updatedTask.completedAt, null);
  });

  it('reopenTaskLifecycle is idempotent: reopening an already open task returns already_open', () => {
    const openTask = {
      id: 't-105',
      title: 'Open Task',
      completed: false,
    };

    const result = reopenTaskLifecycle({ task: openTask });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'already_open');
  });
});
