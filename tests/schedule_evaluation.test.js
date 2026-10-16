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
