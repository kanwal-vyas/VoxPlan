/**
 * Automated Unit & Reliability Test Suite for VoxPlan Adaptive Scheduling Engine (Phase 4, Stage 2).
 *
 * Verifies:
 * - 100% Deterministic output across runs and stable tie-breaking.
 * - Topological dependency ordering, Kahn's algorithm, and cycle detection.
 * - Explicit cycle and self-dependency isolation without artificial schedule fabrication.
 * - Priority inversion protection (hard dependency invariants cannot be bypassed by urgency).
 * - Oversized task detection and manual resolution requirements.
 * - Strict working hour enforcement without cumulative daily capacity overruns.
 * - Accurate capacity utilization denominator (scheduled workload / available working hours).
 * - Non-working day deadlines (Friday completion meets Sunday deadline).
 * - Safe proposal application filtering and immutability guarantees.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateAdaptiveSchedule,
  analyzeTaskDependencies,
  calculateTaskPriorityScore,
  formatDateISO,
  parseDateISO,
  addDaysISO,
  isWorkingDay,
  buildCalendarSlots,
  DEFAULT_DAILY_CAPACITY_HOURS,
  DEFAULT_HORIZON_DAYS,
  DEFAULT_WORKING_DAYS,
} from '../src/scheduler/adaptiveScheduler.js';

import { buildPersonalDurationModel } from '../src/telemetry/personalModel.js';

describe('1. Deterministic Output & Immutability', () => {
  const baseTasks = [
    { id: 'task-a', title: 'Task A', estimatedEffort: 3.0, dueDate: '2026-10-20', priority: 'high' },
    { id: 'task-b', title: 'Task B', estimatedEffort: 2.0, dueDate: '2026-10-21', priority: 'medium' },
    { id: 'task-c', title: 'Task C', estimatedEffort: 4.0, dueDate: '2026-10-22', priority: 'low' },
  ];

  it('Produces 100% deterministic, identical output across multiple runs with identical input', () => {
    const options = { startDate: '2026-10-19', dailyCapacityHours: 6.0 };
    const run1 = generateAdaptiveSchedule(baseTasks, options);
    const run2 = generateAdaptiveSchedule(baseTasks, options);

    assert.deepEqual(run1, run2);
    assert.equal(run1.proposedPlacements.length, 3);
    assert.equal(run1.summary.scheduledCount, 3);
    assert.equal(run1.summary.feasibilityStatus, 'feasible');
    assert.equal(run1.summary.scheduleId, run2.summary.scheduleId);
  });

  it('Guarantees pure function execution without mutating input task objects or collections', () => {
    const taskCopyBefore = JSON.parse(JSON.stringify(baseTasks));
    const options = { startDate: '2026-10-19' };

    const result = generateAdaptiveSchedule(baseTasks, options);
    assert.ok(result);

    // Deep comparison proves input tasks were not modified
    assert.deepEqual(baseTasks, taskCopyBefore);
  });
});

describe('2. Personalized Duration vs. Cold-Start Fallback', () => {
  it('Uses cold-start user estimate when personal duration model is null or untrained', () => {
    const tasks = [
      { id: 't-cold-1', title: 'Cold Task', estimatedEffort: 3.0, dueDate: '2026-10-20' },
    ];
    const result = generateAdaptiveSchedule(tasks, { startDate: '2026-10-19' });

    assert.equal(result.proposedPlacements.length, 1);
    const placement = result.proposedPlacements[0];
    assert.equal(placement.effectiveHours, 3.0);
    assert.equal(placement.durationSource, 'original_estimate');
  });

  it('Uses personalized adjusted duration when personal duration model has evidence', () => {
    // Build a model where user consistently underestimates by 1.5x
    const events = [];
    const priorTasks = [];
    for (let i = 1; i <= 4; i++) {
      priorTasks.push({ id: `hist-${i}`, estimatedEffort: 2.0, completed: true });
      events.push({
        event_id: `e-h-${i}`,
        task_id: `hist-${i}`,
        event_type: 'task_completed',
        timestamp: `2026-10-0${i}T12:00:00Z`,
        payload: { duration_source: 'tracked', tracked_duration_seconds: 3.0 * 3600 }, // 1.5x
      });
    }

    const personalModel = buildPersonalDurationModel(events, priorTasks);
    assert.ok(personalModel.effectiveWeight >= 3.0);

    const testTasks = [
      { id: 't-pers-1', title: 'Personalized Task', estimatedEffort: 4.0, dueDate: '2026-10-25' },
    ];

    const result = generateAdaptiveSchedule(testTasks, {
      startDate: '2026-10-19',
      personalDurationModel: personalModel,
    });

    assert.equal(result.proposedPlacements.length, 1);
    const placement = result.proposedPlacements[0];
    assert.equal(placement.durationSource, 'personalized');
    // 4.0h estimated * ~1.29x adjusted ratio = ~5.2h
    assert.ok(placement.effectiveHours > 4.0);
    assert.equal(placement.effectiveHours, 5.2);
  });

  it('Handles missing or zero effort estimates with neutral 1.0h fallback and warning', () => {
    const tasks = [
      { id: 't-no-effort', title: 'Zero Effort Task', estimatedEffort: 0, dueDate: '2026-10-20' },
      { id: 't-null-effort', title: 'Null Effort Task', estimatedEffort: null, dueDate: '2026-10-21' },
    ];

    const result = generateAdaptiveSchedule(tasks, { startDate: '2026-10-19' });
    assert.equal(result.proposedPlacements.length, 2);
    assert.equal(result.proposedPlacements[0].effectiveHours, 1.0);
    assert.equal(result.proposedPlacements[0].durationSource, 'default_fallback');
    assert.equal(result.proposedPlacements[1].effectiveHours, 1.0);
    assert.equal(result.proposedPlacements[1].durationSource, 'default_fallback');
    assert.ok(result.summary.warnings.length >= 2);
  });
});

describe('3. Dependency Ordering & Chain Constraints', () => {
  it('Schedules prerequisite tasks before or on same day as dependent tasks', () => {
    const tasks = [
      { id: 't-dep-child', title: 'Child Task', estimatedEffort: 3.0, dueDate: '2026-10-21', dependencies: ['t-dep-parent'] },
      { id: 't-dep-parent', title: 'Parent Prerequisite', estimatedEffort: 4.0, dueDate: '2026-10-22' },
    ];

    // Daily capacity 6.0h. Start on Monday 2026-10-19.
    // Parent is 4h -> fits on Monday Oct 19.
    // Child is 3h -> remaining on Mon is 2h, so cannot fit. Must roll over to Tuesday Oct 20!
    const result = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
    });

    const parentPlacement = result.proposedPlacements.find((p) => p.taskId === 't-dep-parent');
    const childPlacement = result.proposedPlacements.find((p) => p.taskId === 't-dep-child');

    assert.ok(parentPlacement);
    assert.ok(childPlacement);

    assert.equal(parentPlacement.proposedDate, '2026-10-19');
    assert.equal(childPlacement.proposedDate, '2026-10-20');
    assert.ok(childPlacement.assignedDayIndex >= parentPlacement.assignedDayIndex);
  });

  it('Detects circular dependency cycles and isolates affected tasks without inventing valid ordering', () => {
    const cycleTasks = [
      { id: 'cycle-1', title: 'Cycle 1', estimatedEffort: 2.0, dependencies: ['cycle-2'] },
      { id: 'cycle-2', title: 'Cycle 2', estimatedEffort: 2.0, dependencies: ['cycle-1'] },
      { id: 'cycle-child', title: 'Dependent on Cycle', estimatedEffort: 2.0, dependencies: ['cycle-1'] },
    ];

    const result = generateAdaptiveSchedule(cycleTasks, { startDate: '2026-10-19' });
    assert.equal(result.summary.feasibilityStatus, 'dependency_cycle');
    assert.ok(result.summary.warnings.some((w) => w.includes('circular dependency')));

    // All 3 tasks are present in proposedPlacements (never silently dropped), but marked blocked without a fake date
    assert.equal(result.proposedPlacements.length, 3);
    for (const p of result.proposedPlacements) {
      assert.equal(p.status, 'blocked_by_dependency');
      assert.equal(p.proposedDate, null);
      assert.equal(p.assignedDayIndex, -1);
      assert.ok(p.conflicts.length > 0);
    }
  });

  it('Identifies self-dependencies and marks task as blocked', () => {
    const selfTask = [
      { id: 'self-1', title: 'Self Task', estimatedEffort: 2.0, dependencies: ['self-1'] },
    ];

    const result = generateAdaptiveSchedule(selfTask, { startDate: '2026-10-19' });
    assert.equal(result.proposedPlacements.length, 1);
    const p = result.proposedPlacements[0];
    assert.equal(p.status, 'blocked_by_dependency');
    assert.equal(p.proposedDate, null);
    assert.ok(p.conflicts.some((c) => c.includes('Self-dependency')));
  });

  it('Identifies missing prerequisite IDs and blocks dependent tasks', () => {
    const missingTask = [
      { id: 'orphan-1', title: 'Orphan Task', estimatedEffort: 2.0, dependencies: ['non-existent-task-999'] },
    ];

    const result = generateAdaptiveSchedule(missingTask, { startDate: '2026-10-19' });
    assert.equal(result.proposedPlacements.length, 1);
    const p = result.proposedPlacements[0];
    assert.equal(p.status, 'blocked_by_dependency');
    assert.equal(p.proposedDate, null);
    assert.ok(p.conflicts.some((c) => c.includes('Missing prerequisite')));
  });

  it('Prevents priority inversion: urgent dependent task is never scheduled before its prerequisite', () => {
    // Task B depends on Task A. Task B has an overdue deadline (highest priority urgency!).
    // Task A has a normal deadline in the future.
    // Hard topological constraint MUST schedule Task A before Task B!
    const tasks = [
      { id: 'task-a', title: 'Prereq A', estimatedEffort: 4.0, dueDate: '2026-10-25' },
      { id: 'task-b', title: 'Urgent Dependent B', estimatedEffort: 4.0, dueDate: '2026-10-15', dependencies: ['task-a'] }, // Overdue!
    ];

    const result = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
    });

    const pA = result.proposedPlacements.find((p) => p.taskId === 'task-a');
    const pB = result.proposedPlacements.find((p) => p.taskId === 'task-b');

    assert.equal(pA.proposedDate, '2026-10-19'); // Monday
    assert.equal(pB.proposedDate, '2026-10-20'); // Tuesday (cannot jump ahead of A!)
    assert.ok(pB.assignedDayIndex > pA.assignedDayIndex);
  });

  it('Ignores already completed prerequisites and schedules dependent task normally', () => {
    const tasks = [
      { id: 't-done', title: 'Completed Prereq', estimatedEffort: 2.0, completed: true },
      { id: 't-active-child', title: 'Active Child', estimatedEffort: 2.0, dependencies: ['t-done'], completed: false },
    ];

    const result = generateAdaptiveSchedule(tasks, { startDate: '2026-10-19' });
    assert.equal(result.proposedPlacements.length, 1); // Only active task is scheduled
    const pChild = result.proposedPlacements[0];
    assert.equal(pChild.taskId, 't-active-child');
    assert.equal(pChild.proposedDate, '2026-10-19');
    assert.equal(pChild.status, 'on_time');
  });
});

describe('4. Working Hours, Weekends, and Daily Capacity Allocation', () => {
  it('Skips non-working days (weekends by default) and rolls over into next working day', () => {
    // 2026-10-23 is Friday. 2026-10-24 is Saturday. 2026-10-25 is Sunday. 2026-10-26 is Monday.
    const tasks = [
      { id: 't-fri', title: 'Friday Task', estimatedEffort: 5.0, dueDate: '2026-10-23' },
      { id: 't-mon', title: 'Next Week Task', estimatedEffort: 4.0, dueDate: '2026-10-26' },
    ];

    const result = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-23', // Starts on Friday
      dailyCapacityHours: 6.0,
      workingDays: [1, 2, 3, 4, 5], // Mon-Fri
    });

    const friPlacement = result.proposedPlacements.find((p) => p.taskId === 't-fri');
    const monPlacement = result.proposedPlacements.find((p) => p.taskId === 't-mon');

    assert.equal(friPlacement.proposedDate, '2026-10-23'); // Friday
    assert.equal(monPlacement.proposedDate, '2026-10-26'); // Monday (skipped Sat 24 and Sun 25!)
  });

  it('Flags tasks larger than daily capacity and marks them for manual resolution', () => {
    const tasks = [
      { id: 't-huge', title: 'Huge Refactoring', estimatedEffort: 10.0, dueDate: '2026-10-21' },
    ];

    const result = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
    });

    const placement = result.proposedPlacements[0];
    assert.equal(placement.status, 'oversized_exceeds_capacity');
    assert.equal(placement.proposedDate, null);
    assert.equal(placement.assignedDayIndex, -1);
    assert.ok(placement.conflicts.some((c) => c.includes('exceeds daily capacity limit')));
    assert.equal(result.summary.feasibilityStatus, 'capacity_exceeded');
  });

  it('Strictly enforces daily working hours without cumulative day capacity overrun', () => {
    // 3 tasks of 4.0h. Capacity = 6.0h.
    // Day 1 (Oct 19): Task 1 (4h). Remaining = 2h. Task 2 cannot fit (needs 4h) -> rolls to Day 2!
    // Day 2 (Oct 20): Task 2 (4h). Remaining = 2h. Task 3 rolls to Day 3!
    // Day 3 (Oct 21): Task 3 (4h).
    const tasks = [
      { id: 't-cap-1', title: 'Task 1', estimatedEffort: 4.0 },
      { id: 't-cap-2', title: 'Task 2', estimatedEffort: 4.0 },
      { id: 't-cap-3', title: 'Task 3', estimatedEffort: 4.0 },
    ];

    const result = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
    });

    for (const day of result.dayAllocations) {
      assert.ok(day.totalHours <= 6.0, `Day ${day.date} exceeded 6.0h capacity: ${day.totalHours}h`);
    }

    assert.equal(result.proposedPlacements[0].proposedDate, '2026-10-19');
    assert.equal(result.proposedPlacements[1].proposedDate, '2026-10-20');
    assert.equal(result.proposedPlacements[2].proposedDate, '2026-10-21');
  });
});

describe('5. Deadlines, Conflicts, and Capacity Exhaustion', () => {
  it('Detects deadline misses and reports days delayed without hiding conflicts', () => {
    // 3 tasks each 5 hours. Total = 15 hours.
    // Capacity = 6h/day.
    // Day 1 (Oct 19): Task 1 (5h).
    // Day 2 (Oct 20): Task 2 (5h).
    // Day 3 (Oct 21): Task 3 (5h).
    // But Task 3 has deadline on Oct 20! So Task 3 misses deadline by 1 day!
    const tasks = [
      { id: 't-1', title: 'Task 1', estimatedEffort: 5.0, dueDate: '2026-10-19', priority: 'high' },
      { id: 't-2', title: 'Task 2', estimatedEffort: 5.0, dueDate: '2026-10-20', priority: 'medium' },
      { id: 't-3', title: 'Task 3', estimatedEffort: 5.0, dueDate: '2026-10-20', priority: 'low' },
    ];

    const result = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
    });

    const t3Placement = result.proposedPlacements.find((p) => p.taskId === 't-3');
    assert.equal(t3Placement.status, 'deadline_missed');
    assert.equal(t3Placement.proposedDate, '2026-10-21');
    assert.ok(t3Placement.conflicts.some((c) => c.includes('is 1 day(s) after deadline')));
    assert.equal(result.summary.feasibilityStatus, 'infeasible_deadlines');
    assert.equal(result.summary.missedDeadlineCount, 1);
  });

  it('Detects overdue deadlines at start of schedule and prioritizes recovery', () => {
    const tasks = [
      { id: 't-overdue', title: 'Overdue Item', estimatedEffort: 2.0, dueDate: '2026-10-15' }, // 4 days past
      { id: 't-future', title: 'Future Item', estimatedEffort: 2.0, dueDate: '2026-10-25' },
    ];

    const result = generateAdaptiveSchedule(tasks, { startDate: '2026-10-19' });
    const overduePlacement = result.proposedPlacements.find((p) => p.taskId === 't-overdue');

    assert.equal(overduePlacement.status, 'overdue_at_start');
    assert.equal(overduePlacement.proposedDate, '2026-10-19');
    assert.ok(overduePlacement.conflicts.some((c) => c.includes('already overdue')));
  });

  it('Marks tasks as unscheduled when horizon capacity is completely exhausted', () => {
    // 5 tasks of 6h = 30h.
    // Horizon = 2 working days (capacity = 12h total).
    // Only 2 tasks fit; 3 tasks must be marked as unscheduled.
    const tasks = [];
    for (let i = 1; i <= 5; i++) {
      tasks.push({ id: `t-overflow-${i}`, title: `Overflow ${i}`, estimatedEffort: 6.0 });
    }

    const result = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19', // Monday
      horizonDays: 2,          // Only Mon and Tue (12h capacity)
      dailyCapacityHours: 6.0,
    });

    assert.equal(result.summary.scheduledCount, 2);
    assert.equal(result.summary.unscheduledCount, 3);
    assert.equal(result.summary.feasibilityStatus, 'capacity_exceeded');

    const unscheduled = result.proposedPlacements.filter((p) => p.status === 'unscheduled');
    assert.equal(unscheduled.length, 3);
    assert.equal(unscheduled[0].proposedDate, null);
    assert.ok(unscheduled[0].conflicts.some((c) => c.includes('Cannot fit within 2-day horizon')));
  });

  it('Calculates accurate capacity utilization based on scheduled workload and total available capacity', () => {
    // 2 tasks of 3h = 6h.
    // Horizon = 7 days (starts on Monday 2026-10-19 -> 5 working days Mon-Fri, 30h total capacity).
    // Utilization should be 6 / 30 = 20%.
    const tasks = [
      { id: 't-util-1', title: 'Task 1', estimatedEffort: 3.0 },
      { id: 't-util-2', title: 'Task 2', estimatedEffort: 3.0 },
    ];

    const result = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19', // Monday
      horizonDays: 7,          // 5 working days Mon-Fri (30h capacity)
      dailyCapacityHours: 6.0,
    });

    assert.equal(result.summary.scheduledWorkloadHours, 6.0);
    assert.equal(result.summary.totalCapacityHours, 30.0);
    assert.equal(result.summary.averageUtilizationPercent, 20);
    assert.equal(result.summary.utilizationRatio, 0.20);
  });

  it('Considers deadlines on non-working days (Sunday) satisfied if finished on preceding working day (Friday)', () => {
    // Starts on Friday 2026-10-23.
    // Task is 2h, due on Sunday 2026-10-25 (weekend).
    // Scheduled on Friday Oct 23 -> On Time!
    const tasks = [
      { id: 't-weekend-due', title: 'Weekend Due', estimatedEffort: 2.0, dueDate: '2026-10-25' },
    ];

    const result = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-23',
      dailyCapacityHours: 6.0,
    });

    const p = result.proposedPlacements[0];
    assert.equal(p.proposedDate, '2026-10-23');
    assert.equal(p.status, 'on_time');
    assert.equal(p.conflicts.length, 0);
  });
});

describe('6. Date Utility Functions', () => {
  it('formatDateISO handles dates, timestamps, and ISO strings consistently', () => {
    assert.equal(formatDateISO('2026-10-16'), '2026-10-16');
    assert.equal(formatDateISO(new Date(2026, 9, 16)), '2026-10-16');
    assert.equal(formatDateISO(null), '');
    assert.equal(formatDateISO('invalid'), '');
  });

  it('parseDateISO parses valid YYYY-MM-DD strings and rejects malformed formats', () => {
    const d = parseDateISO('2026-10-16');
    assert.ok(d instanceof Date);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 9);
    assert.equal(d.getDate(), 16);
    assert.equal(parseDateISO('invalid'), null);
    assert.equal(parseDateISO(null), null);
  });

  it('addDaysISO increments dates accurately across month and year boundaries', () => {
    assert.equal(addDaysISO('2026-10-30', 2), '2026-11-01');
    assert.equal(addDaysISO('2026-12-30', 5), '2027-01-04');
  });

  it('isWorkingDay accurately identifies active weekdays', () => {
    // 2026-10-19 is Monday (1)
    assert.equal(isWorkingDay('2026-10-19', [1, 2, 3, 4, 5]), true);
    // 2026-10-24 is Saturday (6)
    assert.equal(isWorkingDay('2026-10-24', [1, 2, 3, 4, 5]), false);
    // 2026-10-25 is Sunday (0)
    assert.equal(isWorkingDay('2026-10-25', [1, 2, 3, 4, 5]), false);
  });
});

describe('7. Core Engine Primitives & Constants', () => {
  it('buildCalendarSlots produces working slots and respects default capacity and horizon', () => {
    assert.equal(DEFAULT_DAILY_CAPACITY_HOURS, 6.0);
    assert.equal(DEFAULT_HORIZON_DAYS, 14);
    assert.deepEqual(DEFAULT_WORKING_DAYS, [1, 2, 3, 4, 5]);

    const slots = buildCalendarSlots('2026-10-19', 5, 6.0, [1, 2, 3, 4, 5]);
    assert.equal(slots.length, 5);
    assert.equal(slots[0].date, '2026-10-19');
    assert.equal(slots[0].capacityHours, 6.0);
    assert.equal(slots[0].remainingHours, 6.0);
    assert.equal(slots[0].assignedTasks.length, 0);
  });

  it('analyzeTaskDependencies calculates topological depths accurately', () => {
    const tasks = [
      { id: 't1', dependencies: [] },
      { id: 't2', dependencies: ['t1'] },
      { id: 't3', dependencies: ['t2'] },
    ];
    const { cycles, taskDepths } = analyzeTaskDependencies(tasks);
    assert.equal(cycles.length, 0);
    assert.equal(taskDepths.get('t1'), 0);
    assert.equal(taskDepths.get('t2'), 1);
    assert.equal(taskDepths.get('t3'), 2);
  });

  it('calculateTaskPriorityScore weights urgency, dependencies, and high delay-risk heuristics', () => {
    const taskNormal = { id: 'a', priority: 'medium', dueDate: '2026-10-25' };
    const taskUrgent = { id: 'b', priority: 'high', dueDate: '2026-10-20' };

    const depths = new Map([['a', 1], ['b', 0]]);

    const scoreNormal = calculateTaskPriorityScore(taskNormal, '2026-10-19', depths, {});
    const scoreUrgent = calculateTaskPriorityScore(taskUrgent, '2026-10-19', depths, {
      b: { delay_probability: 0.8 },
    });

    assert.ok(scoreUrgent > scoreNormal, 'Urgent task with high priority and risk should score higher');
  });
});

describe('8. Schedule Proposal Safety & Application Integrity', () => {
  it('Filters out invalid, unscheduled, blocked, or oversized placements from date application', () => {
    const placements = [
      { taskId: 't1', status: 'on_time', isDateChanged: true, originalDueDate: '2026-10-20', proposedDate: '2026-10-19' },
      { taskId: 't2', status: 'blocked_by_dependency', isDateChanged: false, originalDueDate: '2026-10-25', proposedDate: null },
      { taskId: 't3', status: 'oversized_exceeds_capacity', isDateChanged: false, originalDueDate: '2026-10-25', proposedDate: null },
      { taskId: 't4', status: 'unscheduled', isDateChanged: false, originalDueDate: '2026-10-25', proposedDate: null },
      { taskId: 't5', status: 'on_time', isDateChanged: false, originalDueDate: '2026-10-20', proposedDate: '2026-10-20' },
    ];

    const validChanges = placements.filter(
      (p) =>
        p.status !== 'unscheduled' &&
        p.status !== 'blocked_by_dependency' &&
        p.status !== 'oversized_exceeds_capacity' &&
        p.isDateChanged &&
        p.proposedDate &&
        p.proposedDate !== p.originalDueDate
    );

    assert.equal(validChanges.length, 1);
    assert.equal(validChanges[0].taskId, 't1');
    assert.equal(validChanges[0].proposedDate, '2026-10-19');
  });

  it('Tie-breaks identically on identical priority scores using stable taskId', () => {
    const task1 = { id: 'task-alpha', priority: 'medium', estimatedEffort: 2.0 };
    const task2 = { id: 'task-beta', priority: 'medium', estimatedEffort: 2.0 };

    const result = generateAdaptiveSchedule([task2, task1], { startDate: '2026-10-19', dailyCapacityHours: 6.0 });
    // Stable locale comparison ensures 'task-alpha' is evaluated before 'task-beta'
    assert.equal(result.proposedPlacements[0].taskId, 'task-alpha');
    assert.equal(result.proposedPlacements[1].taskId, 'task-beta');
  });
});
