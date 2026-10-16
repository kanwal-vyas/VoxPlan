/**
 * Comprehensive Automated Tests for VoxPlan Behavioral Telemetry Layer.
 * Executable via: node --test tests/telemetry.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION,
  validateEvent,
  createEvent,
  generateUUID,
} from '../src/telemetry/eventSchema.js';

import {
  saveEvent,
  getEventsByProfile,
  clearEventsByProfile,
} from '../src/telemetry/indexedDbStore.js';

import {
  computeBehavioralStats,
  calculateMedian,
} from '../src/telemetry/behavioralStats.js';

describe('1. Behavioral Event Schema & Validation', () => {
  test('generates valid UUIDs', () => {
    const id1 = generateUUID();
    const id2 = generateUUID();
    assert.ok(typeof id1 === 'string' && id1.length >= 32);
    assert.notEqual(id1, id2);
  });

  test('validates valid task_created event', () => {
    const validEvent = {
      event_id: 'evt_test_1',
      profile_id: 'prof_test_user',
      task_id: 'task_abc_123',
      event_type: 'task_created',
      timestamp: '2026-10-16T12:00:00.000Z',
      schema_version: 1,
      payload: {
        title: 'Review Project Architecture',
        priority: 'high',
        category: 'Engineering',
        due_date: '2026-10-20',
        estimated_effort: 3.5,
      },
    };

    const res = validateEvent(validEvent);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  test('rejects missing or malformed fields safely', () => {
    // Missing event_id
    const badId = validateEvent({
      profile_id: 'prof_1',
      task_id: 'task_1',
      event_type: 'task_created',
      timestamp: new Date().toISOString(),
      schema_version: 1,
      payload: { title: 'Test' },
    });
    assert.equal(badId.valid, false);
    assert.ok(badId.errors.some((e) => e.includes('event_id')));

    // Invalid event_type
    const badType = validateEvent({
      event_id: 'evt_1',
      profile_id: 'prof_1',
      task_id: 'task_1',
      event_type: 'invalid_type_abc',
      timestamp: new Date().toISOString(),
      schema_version: 1,
      payload: {},
    });
    assert.equal(badType.valid, false);

    // Missing task_id on task-specific event
    const missingTask = validateEvent({
      event_id: 'evt_2',
      profile_id: 'prof_1',
      event_type: 'task_started',
      timestamp: new Date().toISOString(),
      schema_version: 1,
      payload: { session_id: 'sess_1' },
    });
    assert.equal(missingTask.valid, false);
    assert.ok(missingTask.errors.some((e) => e.includes('task_id')));

    // Invalid timestamp
    const badTimestamp = validateEvent({
      event_id: 'evt_3',
      profile_id: 'prof_1',
      task_id: 'task_1',
      event_type: 'task_reopened',
      timestamp: 'not-a-date',
      schema_version: 1,
      payload: {},
    });
    assert.equal(badTimestamp.valid, false);

    // Negative duration in task_completed
    const negDuration = validateEvent({
      event_id: 'evt_4',
      profile_id: 'prof_1',
      task_id: 'task_1',
      event_type: 'task_completed',
      timestamp: new Date().toISOString(),
      schema_version: 1,
      payload: {
        duration_source: 'tracked',
        tracked_duration_seconds: -120,
      },
    });
    assert.equal(negDuration.valid, false);
  });

  test('createEvent factory creates validated frozen event', () => {
    const ev = createEvent({
      profileId: 'prof_alice',
      taskId: 'task_001',
      eventType: 'task_started',
      payload: { session_id: 'sess_xyz' },
    });

    assert.ok(ev.event_id.startsWith('evt_'));
    assert.equal(ev.profile_id, 'prof_alice');
    assert.equal(ev.task_id, 'task_001');
    assert.equal(ev.event_type, 'task_started');
    assert.equal(ev.schema_version, SCHEMA_VERSION);
    assert.ok(Object.isFrozen(ev));
  });
});

describe('2. Durable Storage & Profile Isolation', () => {
  const profileA = `prof_a_${generateUUID()}`;
  const profileB = `prof_b_${generateUUID()}`;

  test('saves and retrieves events isolated by profile', async () => {
    const evA1 = createEvent({
      profileId: profileA,
      taskId: 'task_A1',
      eventType: 'task_created',
      payload: { title: 'Task A1' },
    });
    const evA2 = createEvent({
      profileId: profileA,
      taskId: 'task_A1',
      eventType: 'task_started',
      payload: { session_id: 'sess_1' },
    });
    const evB1 = createEvent({
      profileId: profileB,
      taskId: 'task_B1',
      eventType: 'task_created',
      payload: { title: 'Task B1' },
    });

    await saveEvent(evA1);
    await saveEvent(evA2);
    await saveEvent(evB1);

    const eventsA = await getEventsByProfile(profileA);
    const eventsB = await getEventsByProfile(profileB);

    assert.equal(eventsA.length, 2);
    assert.ok(eventsA.every((e) => e.profile_id === profileA));

    assert.equal(eventsB.length, 1);
    assert.equal(eventsB[0].profile_id, profileB);
  });

  test('handles duplicate events idempotently without duplication', async () => {
    const duplicateProfile = `prof_dup_${generateUUID()}`;
    const fixedEventId = 'evt_duplicate_test_1';
    const ev = createEvent({
      profileId: duplicateProfile,
      taskId: 'task_dup',
      eventType: 'task_created',
      payload: { title: 'Duplicate test' },
      eventId: fixedEventId,
    });

    await saveEvent(ev);
    await saveEvent(ev); // Duplicate call
    await saveEvent(ev); // Triplicate call

    const retrieved = await getEventsByProfile(duplicateProfile);
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].event_id, fixedEventId);
  });

  test('clearEventsByProfile deletes profile history without affecting other profiles', async () => {
    const toClear = `prof_clear_${generateUUID()}`;
    const toKeep = `prof_keep_${generateUUID()}`;

    await saveEvent(
      createEvent({
        profileId: toClear,
        taskId: 'task_c',
        eventType: 'task_created',
        payload: { title: 'To Clear' },
      })
    );
    await saveEvent(
      createEvent({
        profileId: toKeep,
        taskId: 'task_k',
        eventType: 'task_created',
        payload: { title: 'To Keep' },
      })
    );

    const cleared = await clearEventsByProfile(toClear);
    assert.equal(cleared, true);

    const eventsCleared = await getEventsByProfile(toClear);
    const eventsKept = await getEventsByProfile(toKeep);

    assert.equal(eventsCleared.length, 0);
    assert.equal(eventsKept.length, 1);
  });
});

describe('3. Working Duration Distinctions & Lifecycle Transitions', () => {
  test('supports tracked vs self-reported vs unknown durations', () => {
    // 1. Tracked duration from timer sessions
    const trackedEv = createEvent({
      profileId: 'prof_1',
      taskId: 'task_1',
      eventType: 'task_completed',
      payload: {
        duration_source: 'tracked',
        tracked_duration_seconds: 3600, // 1 hour
      },
    });
    assert.equal(trackedEv.payload.duration_source, 'tracked');
    assert.equal(trackedEv.payload.tracked_duration_seconds, 3600);

    // 2. Self-reported estimate when timer was not used
    const reportedEv = createEvent({
      profileId: 'prof_1',
      taskId: 'task_2',
      eventType: 'task_completed',
      payload: {
        duration_source: 'self_reported',
        self_reported_duration_seconds: 2700, // 45 min
      },
    });
    assert.equal(reportedEv.payload.duration_source, 'self_reported');
    assert.equal(reportedEv.payload.self_reported_duration_seconds, 2700);

    // 3. Unknown duration (user skipped without timing or estimating)
    const unknownEv = createEvent({
      profileId: 'prof_1',
      taskId: 'task_3',
      eventType: 'task_completed',
      payload: {
        duration_source: 'unknown',
      },
    });
    assert.equal(unknownEv.payload.duration_source, 'unknown');
    assert.equal(unknownEv.payload.tracked_duration_seconds, undefined);
  });

  test('records deadline reschedules with previous and new dates', () => {
    const reschedEv = createEvent({
      profileId: 'prof_1',
      taskId: 'task_1',
      eventType: 'task_rescheduled',
      payload: {
        previous_due_date: '2026-10-18',
        new_due_date: '2026-10-25',
        reason: 'scope_adjustment',
      },
    });
    assert.equal(reschedEv.payload.previous_due_date, '2026-10-18');
    assert.equal(reschedEv.payload.new_due_date, '2026-10-25');
  });

  test('records priority changes', () => {
    const prioEv = createEvent({
      profileId: 'prof_1',
      taskId: 'task_1',
      eventType: 'task_priority_changed',
      payload: {
        previous_priority: 'medium',
        new_priority: 'high',
      },
    });
    assert.equal(prioEv.payload.new_priority, 'high');
  });
});

describe('4. Behavioral Statistics & Sparse Data Honesty', () => {
  test('returns insufficient_data state when observations are sparse (< 3)', () => {
    const sparseEvents = [
      createEvent({
        profileId: 'prof_sparse',
        taskId: 'task_s1',
        eventType: 'task_created',
        payload: { title: 'Sparse 1', category: 'Dev' },
      }),
      createEvent({
        profileId: 'prof_sparse',
        taskId: 'task_s1',
        eventType: 'task_completed',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 1800 },
      }),
    ];

    const stats = computeBehavioralStats(sparseEvents);
    assert.equal(stats.totalCompletedCount, 1);
    assert.equal(stats.isSufficientData, false);
    assert.equal(stats.medianTrackedMinutes, null);
    assert.equal(stats.estimationInsight.sufficientData, false);
    assert.ok(stats.estimationInsight.biasSummary.includes('Awaiting 3+'));
  });

  test('calculates correct median duration and weekday metrics with 3+ completed tasks', () => {
    const profileFull = 'prof_stat_full';
    const events = [
      // Task 1: 30 minutes (1800s), estimated 0.5h (1800s)
      createEvent({
        profileId: profileFull,
        taskId: 'task_1',
        eventType: 'task_created',
        payload: { title: 'Task 1', category: 'Engineering', estimated_effort: 0.5 },
      }),
      createEvent({
        profileId: profileFull,
        taskId: 'task_1',
        eventType: 'task_completed',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 1800 },
        timestamp: '2026-10-19T10:00:00.000Z', // Monday
      }),

      // Task 2: 60 minutes (3600s), estimated 1.0h (3600s)
      createEvent({
        profileId: profileFull,
        taskId: 'task_2',
        eventType: 'task_created',
        payload: { title: 'Task 2', category: 'Engineering', estimated_effort: 1.0 },
      }),
      createEvent({
        profileId: profileFull,
        taskId: 'task_2',
        eventType: 'task_completed',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 3600 },
        timestamp: '2026-10-20T14:00:00.000Z', // Tuesday
      }),

      // Task 3: 90 minutes (5400s), estimated 1.5h (5400s)
      createEvent({
        profileId: profileFull,
        taskId: 'task_3',
        eventType: 'task_created',
        payload: { title: 'Task 3', category: 'Planning', estimated_effort: 1.5 },
      }),
      createEvent({
        profileId: profileFull,
        taskId: 'task_3',
        eventType: 'task_completed',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 5400 },
        timestamp: '2026-10-20T16:00:00.000Z', // Tuesday
      }),

      // 1 Postponement event
      createEvent({
        profileId: profileFull,
        taskId: 'task_1',
        eventType: 'task_rescheduled',
        payload: { previous_due_date: '2026-10-18', new_due_date: '2026-10-22' },
      }),
    ];

    const stats = computeBehavioralStats(events);

    assert.equal(stats.totalCompletedCount, 3);
    assert.equal(stats.isSufficientData, true);
    assert.equal(stats.trackedDurationCount, 3);

    // Median of [30, 60, 90] minutes is 60 minutes
    assert.equal(stats.medianTrackedMinutes, 60);

    // Total tracked seconds = 1800 + 3600 + 5400 = 10800s (3 hours)
    assert.equal(stats.totalTrackedSeconds, 10800);

    // Estimation accuracy: all 3 tasks took exactly estimated effort (ratio 1.0)
    assert.equal(stats.estimationInsight.sufficientData, true);
    assert.equal(stats.estimationInsight.averageRatio, 1.0);
    assert.equal(stats.estimationInsight.percentageVariance, 0);

    // Weekday counts: Mon = 1, Tue = 2
    const mon = stats.weekdayCompletions.find((w) => w.day === 'Mon');
    const tue = stats.weekdayCompletions.find((w) => w.day === 'Tue');
    assert.equal(mon.count, 1);
    assert.equal(tue.count, 2);

    // Postponement count
    assert.equal(stats.postponementsCount, 1);
  });

  test('calculateMedian handles odd and even sized lists', () => {
    assert.equal(calculateMedian([10, 20, 30]), 20);
    assert.equal(calculateMedian([10, 20, 30, 40]), 25);
    assert.equal(calculateMedian([]), null);
  });

  test('reopening a completed task removes it from completed stats', () => {
    const profile = 'prof_reopen_test';
    const events = [
      createEvent({
        profileId: profile,
        taskId: 'task_r1',
        eventType: 'task_created',
        payload: { title: 'Reopened Task' },
      }),
      createEvent({
        profileId: profile,
        taskId: 'task_r1',
        eventType: 'task_completed',
        payload: { duration_source: 'unknown' },
      }),
      createEvent({
        profileId: profile,
        taskId: 'task_r1',
        eventType: 'task_reopened',
        payload: {},
      }),
    ];

    const stats = computeBehavioralStats(events);
    assert.equal(stats.totalCompletedCount, 0);
  });
});
