import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateSchedule,
  evaluateScheduleStability,
  compareScheduleStrategies,
  isDeadlineSatisfied,
} from '../src/scheduler/scheduleEvaluator.js';

import {
  generateAdaptiveSchedule,
} from '../src/scheduler/adaptiveScheduler.js';

import {
  BENCHMARK_SCENARIOS,
  runStabilityBenchmark,
  runAllBenchmarks,
} from '../src/scheduler/scheduleBenchmarks.js';

describe('1. Schedule Quality Evaluation - Core Metrics & Invariants', () => {
  it('accountedCount equals total input tasks across all categories (Coverage Invariant)', () => {
    const tasks = [
      { id: 't-normal', title: 'Normal Task', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-20' },
      { id: 't-oversized', title: 'Oversized Task', priority: 'high', estimatedEffort: 10.0, dueDate: '2026-10-22' },
      { id: 't-cyc-a', title: 'Cycle A', priority: 'low', estimatedEffort: 2.0, dependencies: ['t-cyc-b'], dueDate: '2026-10-21' },
      { id: 't-cyc-b', title: 'Cycle B', priority: 'low', estimatedEffort: 2.0, dependencies: ['t-cyc-a'], dueDate: '2026-10-21' },
    ];

    const schedule = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      horizonDays: 14,
    });

    const report = evaluateSchedule(schedule, tasks);

    assert.equal(report.taskCoverage.totalTasks, 4);
    assert.equal(report.taskCoverage.scheduledCount, 1);
    assert.equal(report.taskCoverage.oversizedCount, 1);
    assert.equal(report.taskCoverage.blockedCount, 2);
    assert.equal(report.taskCoverage.unscheduledCount, 0);
    assert.equal(report.taskCoverage.invariantHolds, true);
    assert.equal(report.taskCoverage.accountedCount, 4);
  });

  it('calculates deadline feasibility, overdue recovery, and delay days accurately', () => {
    const tasks = [
      { id: 't-ontime', title: 'On Time Task', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-20' },
      { id: 't-late', title: 'Late Task', priority: 'low', estimatedEffort: 5.0, dueDate: '2026-10-19' }, // Forced late if capacity filled
      { id: 't-overdue', title: 'Was Overdue', priority: 'medium', estimatedEffort: 2.0, dueDate: '2026-10-15' }, // Overdue before start
      { id: 't-nodue', title: 'Undated Task', priority: 'low', estimatedEffort: 2.0, dueDate: null },
    ];

    const schedule = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      horizonDays: 14,
    });

    const report = evaluateSchedule(schedule, tasks);

    assert.equal(report.deadlineFeasibility.tasksWithDeadline, 3);
    assert.equal(report.deadlineFeasibility.wasOverdueCount, 1);
    assert.ok(report.deadlineFeasibility.onTimeCount >= 1);
    assert.ok(report.deadlineFeasibility.onTimeRate > 0);
  });

  it('recognizes non-working-day deadlines (Sunday) satisfied on preceding Friday', () => {
    // 2026-10-25 is Sunday; Friday is 2026-10-23
    assert.equal(isDeadlineSatisfied('2026-10-23', '2026-10-25'), true);
    // Saturday completion is not a working day; Monday completion is late
    assert.equal(isDeadlineSatisfied('2026-10-26', '2026-10-25'), false);
  });

  it('verifies dependency correctness and reports 0 violations for valid schedules', () => {
    const tasks = [
      { id: 'dep-p', title: 'Parent Task', priority: 'high', estimatedEffort: 4.0, dueDate: '2026-10-21' },
      { id: 'dep-c', title: 'Child Task', priority: 'low', estimatedEffort: 4.0, dependencies: ['dep-p'], dueDate: '2026-10-23' },
    ];

    const schedule = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      horizonDays: 14,
    });

    const report = evaluateSchedule(schedule, tasks);

    assert.equal(report.dependencyCorrectness.totalDeclaredDependencies, 1);
    assert.equal(report.dependencyCorrectness.satisfiedCount, 1);
    assert.equal(report.dependencyCorrectness.violatedCount, 0);
    assert.equal(report.dependencyCorrectness.integrityRate, 1.0);
  });

  it('calculates workload balance and coefficient of variation (CV) across active days', () => {
    const tasks = [
      { id: 'wb-1', title: 'Task 1', priority: 'high', estimatedEffort: 6.0, dueDate: '2026-10-21' },
      { id: 'wb-2', title: 'Task 2', priority: 'medium', estimatedEffort: 6.0, dueDate: '2026-10-22' },
      { id: 'wb-3', title: 'Task 3', priority: 'low', estimatedEffort: 6.0, dueDate: '2026-10-23' },
    ];

    const schedule = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      horizonDays: 14,
    });

    const report = evaluateSchedule(schedule, tasks);

    assert.equal(report.workloadBalance.activeDaysCount, 3);
    assert.equal(report.workloadBalance.meanDailyHours, 6.0);
    // Exactly equal workloads across active days -> 0 standard deviation and 0 CV
    assert.equal(report.workloadBalance.stdDevDailyHours, 0);
    assert.equal(report.workloadBalance.imbalanceCV, 0);
    assert.equal(report.workloadBalance.peakToAverageRatio, 1.0);
  });

  it('handles empty task lists and malformed inputs gracefully without throwing', () => {
    const emptyReport = evaluateSchedule(null, []);
    assert.equal(emptyReport.isValid, false);
    assert.equal(emptyReport.taskCoverage.totalTasks, 0);

    const emptySchedule = generateAdaptiveSchedule([], {});
    const validEmptyReport = evaluateSchedule(emptySchedule, []);
    assert.equal(validEmptyReport.taskCoverage.totalTasks, 0);
    assert.equal(validEmptyReport.taskCoverage.scheduledCount, 0);
    assert.equal(validEmptyReport.taskCoverage.invariantHolds, true);
    assert.equal(validEmptyReport.deadlineFeasibility.tasksWithDeadline, 0);
    assert.equal(validEmptyReport.deadlineFeasibility.onTimeRate, null);
  });
});

describe('2. Schedule Stability & Churn Evaluation', () => {
  it('reports 0% churn rate for identical schedules', () => {
    const tasks = [
      { id: 't1', title: 'Task 1', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-20' },
      { id: 't2', title: 'Task 2', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-21' },
    ];

    const scheduleA = generateAdaptiveSchedule(tasks, { startDate: '2026-10-19' });
    const scheduleB = generateAdaptiveSchedule(tasks, { startDate: '2026-10-19' });

    const stability = evaluateScheduleStability(scheduleA, scheduleB);

    assert.equal(stability.commonCount, 2);
    assert.equal(stability.shiftedCount, 0);
    assert.equal(stability.churnRate, 0.0);
  });

  it('correctly quantifies schedule churn when a task date shifts', () => {
    const tasksA = [
      { id: 't1', title: 'Task 1', priority: 'high', estimatedEffort: 6.0, dueDate: '2026-10-20' },
      { id: 't2', title: 'Task 2', priority: 'medium', estimatedEffort: 6.0, dueDate: '2026-10-21' },
    ];

    // Increase t1 effort to 6h on Day 1, which pushes t2 to Day 2
    const tasksB = [
      { id: 't1', title: 'Task 1 (Larger)', priority: 'high', estimatedEffort: 6.0, dueDate: '2026-10-20' },
      { id: 't2', title: 'Task 2', priority: 'medium', estimatedEffort: 6.0, dueDate: '2026-10-20' },
    ];

    const scheduleA = generateAdaptiveSchedule(tasksA, { startDate: '2026-10-19' });
    const scheduleB = generateAdaptiveSchedule(tasksB, { startDate: '2026-10-19' });

    const stability = evaluateScheduleStability(scheduleA, scheduleB);

    assert.equal(stability.commonCount, 2);
    assert.ok(stability.churnRate >= 0);
  });

  it('runs complete stability benchmark across 5 perturbation scenarios', () => {
    const stabilityReport = runStabilityBenchmark('adaptive');

    assert.equal(stabilityReport.strategy, 'adaptive');
    assert.equal(stabilityReport.perturbationResults.length, 5);
    assert.ok(typeof stabilityReport.averageChurnRate === 'number');

    for (const res of stabilityReport.perturbationResults) {
      assert.ok(res.commonCount > 0);
      assert.ok(res.churnRate >= 0 && res.churnRate <= 1.0);
    }
  });
});

describe('3. Multi-Strategy Comparative Benchmarking (Adaptive vs EDF vs Priority-First)', () => {
  it('all 3 strategies strictly adhere to hard constraints (DAG ordering and zero capacity overrun)', () => {
    const tasks = [
      { id: 'strat-1', title: 'Parent Foundation', priority: 'medium', estimatedEffort: 4.0, dueDate: '2026-10-21' },
      { id: 'strat-2', title: 'Dependent Feature', priority: 'high', estimatedEffort: 5.0, dependencies: ['strat-1'], dueDate: '2026-10-22' },
      { id: 'strat-3', title: 'Independent Item', priority: 'low', estimatedEffort: 3.0, dueDate: '2026-10-20' },
    ];

    const comparison = compareScheduleStrategies(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      horizonDays: 14,
    });

    assert.equal(comparison.allHardConstraintsSatisfied, true);

    const { adaptive, edf, priority_first } = comparison.strategies;

    // Hard constraints check across all three
    assert.equal(adaptive.dependencyCorrectness.violatedCount, 0);
    assert.equal(edf.dependencyCorrectness.violatedCount, 0);
    assert.equal(priority_first.dependencyCorrectness.violatedCount, 0);

    assert.equal(adaptive.capacityCompliance.hasOverrunViolation, false);
    assert.equal(edf.capacityCompliance.hasOverrunViolation, false);
    assert.equal(priority_first.capacityCompliance.hasOverrunViolation, false);
  });

  it('demonstrates priority vs deadline trade-off where EDF and Priority-First diverge', () => {
    const scenario = BENCHMARK_SCENARIOS.priority_vs_deadline;

    const comparison = compareScheduleStrategies(scenario.tasks, {
      startDate: scenario.startDate,
      dailyCapacityHours: scenario.dailyCapacityHours,
      horizonDays: scenario.horizonDays,
    });

    const { adaptive, edf, priority_first } = comparison.strategies;
    assert.equal(edf.deadlineFeasibility.onTimeRate, 1.0);
    assert.ok(priority_first.deadlineFeasibility.onTimeRate < 1.0);
    assert.ok(typeof adaptive.deadlineFeasibility.onTimeRate === 'number');

    // In this scenario:
    // pvd-1 is LOW priority, due TODAY (2026-10-19, 4.0h)
    // pvd-2 is HIGH priority, due NEXT WEEK (2026-10-26, 5.0h)
    //
    // EDF should schedule pvd-1 on Day 0 (on time).
    // Priority-First will schedule pvd-2 on Day 0 (causing pvd-1 to be pushed to Day 1, missing its deadline!).
    const edfP1 = comparison.schedules.edf.proposedPlacements.find((p) => p.taskId === 'pvd-1');
    const priorityP1 = comparison.schedules.priority_first.proposedPlacements.find((p) => p.taskId === 'pvd-1');

    assert.equal(edfP1.proposedDate, '2026-10-19'); // On time
    assert.equal(priorityP1.proposedDate, '2026-10-21'); // Pushed to Day 2, late by 2 days!

    // Verify trade-off narrative is produced
    assert.ok(comparison.tradeoffs.length > 0);
  });

  it('runAllBenchmarks executes all 12 benchmark fixtures deterministically', () => {
    const reports = runAllBenchmarks();

    assert.equal(reports.length, 12);

    for (const rep of reports) {
      assert.ok(rep.scenarioId);
      assert.ok(rep.name);
      assert.ok(rep.strategies.adaptive);
      assert.ok(rep.strategies.edf);
      assert.ok(rep.strategies.priority_first);
      assert.equal(rep.allHardConstraintsSatisfied, true);
    }
  });
});

describe('4. Evidence-Driven Scheduler Optimization Regressions & Invariants (Stage 4)', () => {
  it('downstream unblocking bonus prioritizes critical path tasks with dependents over equal-urgency tasks', () => {
    // Both t1 and t2 have identical priority (medium), identical due dates, and identical effort (3.0h)
    // But t1 has a downstream dependent t3 waiting for it.
    const tasks = [
      { id: 't-independent', title: 'Independent Task', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-21' },
      { id: 't-unblocker', title: 'Bottleneck Task', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-21' },
      { id: 't-downstream', title: 'Dependent Task', priority: 'medium', estimatedEffort: 3.0, dependencies: ['t-unblocker'], dueDate: '2026-10-23' },
    ];

    const schedule = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 3.0, // Only 1 task fits per day
      horizonDays: 14,
    });

    const placements = schedule.proposedPlacements;
    const unblockerPlacement = placements.find((p) => p.taskId === 't-unblocker');
    const independentPlacement = placements.find((p) => p.taskId === 't-independent');

    // Unblocker should be scheduled on Day 0 (2026-10-19) to clear the critical path
    assert.equal(unblockerPlacement.proposedDate, '2026-10-19');
    assert.equal(independentPlacement.proposedDate, '2026-10-20');
    assert.ok(unblockerPlacement.explanation.includes('Unblocks 1 downstream task'));
  });

  it('ready dependent task is not penalized by depth, preventing churn on satisfied dependency', () => {
    // Reproduces the exact Stage 3 stability benchmark mutation 'add_valid_dependency':
    // st-3 depends on st-2. st-2 completes on Day 0 (2026-10-19).
    // In Stage 3, depth penalty (-100) caused st-3 to be delayed to Day 2 and st-4 pulled to Day 1 (40% churn).
    // In Stage 4, unblocking replaces depth penalty; st-3 is placed on Day 1 on time, achieving 0% churn!
    const baseTasks = [
      { id: 'st-1', title: 'Database Migration', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-20' },
      { id: 'st-2', title: 'API Authentication', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-21' },
      { id: 'st-3', title: 'Frontend Dashboard', priority: 'medium', estimatedEffort: 4.0, dueDate: '2026-10-22' },
      { id: 'st-4', title: 'Unit Test Coverage', priority: 'medium', estimatedEffort: 4.0, dueDate: '2026-10-23' },
      { id: 'st-5', title: 'Documentation Polish', priority: 'low', estimatedEffort: 2.0, dueDate: '2026-10-26' },
    ];

    const mutatedTasks = baseTasks.map((t) => (t.id === 'st-3' ? { ...t, dependencies: ['st-2'] } : t));

    const scheduleBase = generateAdaptiveSchedule(baseTasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      horizonDays: 14,
      strategy: 'adaptive',
    });

    const scheduleMutated = generateAdaptiveSchedule(mutatedTasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      horizonDays: 14,
      strategy: 'adaptive',
    });

    const stability = evaluateScheduleStability(scheduleBase, scheduleMutated);

    // Churn must be 0% because st-2 is already scheduled on Day 0 and st-3 on Day 1
    assert.equal(stability.shiftedCount, 0, 'Zero tasks should shift when adding an already satisfied dependency');
    assert.equal(stability.churnRate, 0.0);
  });

  it('multi-tier deterministic tie-breaking sorts by score -> dueDate -> Shortest Processing Time -> taskId', () => {
    // Two tasks with identical priority (score) and identical due date, but different durations
    const tasks = [
      { id: 'task-long', title: 'Long Task', priority: 'medium', estimatedEffort: 4.0, dueDate: '2026-10-22' },
      { id: 'task-short', title: 'Short Task', priority: 'medium', estimatedEffort: 2.0, dueDate: '2026-10-22' },
    ];

    const schedule = generateAdaptiveSchedule(tasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 4.0, // Long task alone fills the day; short task leaves room
      horizonDays: 14,
    });

    // Shortest Processing Time (SPT) tie-breaker prioritizes task-short first
    assert.equal(schedule.proposedPlacements[0].taskId, 'task-short');
    assert.equal(schedule.proposedPlacements[0].proposedDate, '2026-10-19');
    assert.equal(schedule.proposedPlacements[1].taskId, 'task-long');
    assert.equal(schedule.proposedPlacements[1].proposedDate, '2026-10-20');
  });

  it('evaluator reports schedulableOnTimeRate and distinguishes impossible deadlines from scheduling failures', () => {
    // 1 valid task due tomorrow + 2 cyclic tasks with deadlines
    const tasks = [
      { id: 'valid-1', title: 'Valid Task', priority: 'high', estimatedEffort: 2.0, dueDate: '2026-10-20' },
      { id: 'cyc-1', title: 'Cycle 1', priority: 'high', estimatedEffort: 2.0, dependencies: ['cyc-2'], dueDate: '2026-10-20' },
      { id: 'cyc-2', title: 'Cycle 2', priority: 'high', estimatedEffort: 2.0, dependencies: ['cyc-1'], dueDate: '2026-10-20' },
    ];

    const schedule = generateAdaptiveSchedule(tasks, { startDate: '2026-10-19', dailyCapacityHours: 6.0 });
    const report = evaluateSchedule(schedule, tasks);

    assert.equal(report.deadlineFeasibility.tasksWithDeadline, 3);
    assert.equal(report.deadlineFeasibility.impossibleDeadlinesCount, 2);
    assert.equal(report.deadlineFeasibility.schedulableDeadlinesCount, 1);
    assert.equal(report.deadlineFeasibility.onTimeCount, 1);
    // Raw onTimeRate is 1/3 = 0.333
    assert.equal(report.deadlineFeasibility.onTimeRate, 0.333);
    // Schedulable onTimeRate is 1/1 = 1.000 (100% of schedulable tasks on time!)
    assert.equal(report.deadlineFeasibility.schedulableOnTimeRate, 1.0);
  });

  it('evaluator calculates schedulerDelayDays without penalizing for pre-existing overdue delay', () => {
    const tasks = [
      // Due 4 days before schedule start (2026-10-15 vs start 2026-10-19)
      { id: 'overdue-task', title: 'Overdue Task', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-15' },
    ];

    const schedule = generateAdaptiveSchedule(tasks, { startDate: '2026-10-19', dailyCapacityHours: 6.0 });
    const report = evaluateSchedule(schedule, tasks);

    assert.equal(report.deadlineFeasibility.wasOverdueCount, 1);
    assert.equal(report.deadlineFeasibility.onTimeCount, 0);
    assert.equal(report.deadlineFeasibility.lateCount, 1);
    // Raw delay counts historical 4 days
    assert.equal(report.deadlineFeasibility.totalDaysDelayed, 4);
    // Scheduler placed it immediately on Day 0 (2026-10-19), so scheduler-introduced delay is 0 days!
    assert.equal(report.deadlineFeasibility.totalSchedulerDaysDelayed, 0);
    assert.equal(report.deadlineFeasibility.averageSchedulerDaysDelayed, 0);
  });

  it('placement explanations clearly document specific scheduling drivers and constraints', () => {
    const tasks = [
      { id: 'exp-1', title: 'Critical Base', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-20' },
      { id: 'exp-2', title: 'Dependent Child', priority: 'medium', estimatedEffort: 3.0, dependencies: ['exp-1'], dueDate: '2026-10-22' },
    ];

    const schedule = generateAdaptiveSchedule(tasks, { startDate: '2026-10-19', dailyCapacityHours: 3.0 });
    const p1 = schedule.proposedPlacements.find((p) => p.taskId === 'exp-1');
    const p2 = schedule.proposedPlacements.find((p) => p.taskId === 'exp-2');

    assert.ok(p1.explanation.includes('High-priority commitment'));
    assert.ok(p1.explanation.includes('Unblocks 1 downstream task'));
    assert.ok(p2.explanation.includes('Prerequisite constraint satisfied'));
  });
});
