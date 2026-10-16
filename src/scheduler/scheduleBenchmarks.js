/**
 * VoxPlan Deterministic Benchmark Suite (Phase 4, Stage 3).
 *
 * Provides clearly labeled, deterministic benchmark scenarios covering key
 * scheduling trade-offs, hard constraint satisfaction, and edge cases.
 *
 * NOTE: These fixtures are synthetic benchmark configurations designed for reproducible
 * algorithmic evaluation. They must NOT be represented as actual user performance or
 * as proof of real-world personalization.
 */

import { compareScheduleStrategies, evaluateScheduleStability } from './scheduleEvaluator.js';
import { generateAdaptiveSchedule } from './adaptiveScheduler.js';

export const BENCHMARK_SCENARIOS = {
  // 1. Normal Backlog with Mixed Priorities & Deadlines
  normal_mixed_backlog: {
    id: 'normal_mixed_backlog',
    name: 'Normal Backlog (Mixed Priorities & Deadlines)',
    description: 'Realistic sprint backlog with varied priorities, staggered deadlines, and normal effort.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    tasks: [
      { id: 'nb-1', title: 'Fix Login Auth Bug', priority: 'high', estimatedEffort: 2.0, dueDate: '2026-10-20' },
      { id: 'nb-2', title: 'Update Billing UI', priority: 'medium', estimatedEffort: 3.5, dueDate: '2026-10-21' },
      { id: 'nb-3', title: 'Write API Documentation', priority: 'low', estimatedEffort: 4.0, dueDate: '2026-10-23' },
      { id: 'nb-4', title: 'Refactor DB Connection Pool', priority: 'high', estimatedEffort: 5.0, dueDate: '2026-10-26' },
      { id: 'nb-5', title: 'Implement CSV Export', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-27' },
      { id: 'nb-6', title: 'Clean Up Legacy CSS', priority: 'low', estimatedEffort: 2.0, dueDate: '2026-10-28' },
    ],
  },

  // 2. Shared Deadline Contention
  shared_deadline: {
    id: 'shared_deadline',
    name: 'Shared Deadline Contention',
    description: 'Multiple tasks competing for the exact same due date under daily capacity limits.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    tasks: [
      { id: 'sd-1', title: 'Client Report Draft', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-20' },
      { id: 'sd-2', title: 'Financial Audit Prep', priority: 'high', estimatedEffort: 4.0, dueDate: '2026-10-20' },
      { id: 'sd-3', title: 'Security Patch Release', priority: 'medium', estimatedEffort: 2.5, dueDate: '2026-10-20' },
      { id: 'sd-4', title: 'Newsletter Send', priority: 'low', estimatedEffort: 2.0, dueDate: '2026-10-20' },
    ],
  },

  // 3. Priority vs Deadline Trade-Off
  // A high-priority task with a distant deadline vs low-priority task due tomorrow
  priority_vs_deadline: {
    id: 'priority_vs_deadline',
    name: 'Priority vs. Deadline Tension',
    description: 'High-priority task with distant deadline competing against low-priority urgent task.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    tasks: [
      { id: 'pvd-1', title: 'Urgent Filing Fee Payment', priority: 'low', estimatedEffort: 4.0, dueDate: '2026-10-19' },
      { id: 'pvd-2', title: 'Core Product Feature', priority: 'high', estimatedEffort: 5.0, dueDate: '2026-10-26' },
      { id: 'pvd-3', title: 'Quarterly OKR Review', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-23' },
    ],
  },

  // 4. Linear Dependency Chain & Completed Prerequisite
  linear_dependency_chain: {
    id: 'linear_dependency_chain',
    name: 'Dependency Chain & Completed Prerequisite',
    description: 'Multi-stage chain where prerequisite completion dictates downstream feasibility.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    tasks: [
      { id: 'ldc-done', title: 'System Architecture Design', priority: 'high', estimatedEffort: 4.0, completed: true },
      { id: 'ldc-1', title: 'Database Schema Setup', priority: 'high', estimatedEffort: 4.0, dependencies: ['ldc-done'], dueDate: '2026-10-21' },
      { id: 'ldc-2', title: 'Backend API Endpoints', priority: 'high', estimatedEffort: 5.0, dependencies: ['ldc-1'], dueDate: '2026-10-23' },
      { id: 'ldc-3', title: 'Frontend Client Integration', priority: 'medium', estimatedEffort: 5.0, dependencies: ['ldc-2'], dueDate: '2026-10-26' },
    ],
  },

  // 5. Dependency Cycle & Downstream Blocked Tasks
  dependency_cycle_blocked: {
    id: 'dependency_cycle_blocked',
    name: 'Dependency Cycle & Downstream Isolation',
    description: 'Circular cycle (A <-> B) with downstream dependent C. Cycle must not be silently broken.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    tasks: [
      { id: 'cyc-a', title: 'Subsystem A Integration', priority: 'high', estimatedEffort: 3.0, dependencies: ['cyc-b'], dueDate: '2026-10-21' },
      { id: 'cyc-b', title: 'Subsystem B Integration', priority: 'high', estimatedEffort: 3.0, dependencies: ['cyc-a'], dueDate: '2026-10-21' },
      { id: 'cyc-c', title: 'End-to-End System Test', priority: 'medium', estimatedEffort: 4.0, dependencies: ['cyc-a'], dueDate: '2026-10-23' },
      { id: 'cyc-ok', title: 'Independent Marketing Blog', priority: 'low', estimatedEffort: 2.0, dueDate: '2026-10-20' },
    ],
  },

  // 6. Oversized Task Exceeding Daily Capacity
  oversized_task: {
    id: 'oversized_task',
    name: 'Oversized Task (> Daily Capacity)',
    description: '10.0h task under 6.0h daily capacity. Must require manual resolution without single-day cramming.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    tasks: [
      { id: 'over-1', title: 'Massive Monolith Migration', priority: 'high', estimatedEffort: 10.0, dueDate: '2026-10-22' },
      { id: 'over-2', title: 'Regular Sprint Task', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-20' },
    ],
  },

  // 7. Insufficient Capacity Before Deadlines
  insufficient_capacity: {
    id: 'insufficient_capacity',
    name: 'Insufficient Capacity Before Deadlines',
    description: 'Total workload exceeds available working hours before early deadlines.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0, // 2 days = 12h available before 2026-10-20 EOD
    horizonDays: 14,
    tasks: [
      { id: 'ic-1', title: 'Critical Feature Alpha', priority: 'high', estimatedEffort: 5.0, dueDate: '2026-10-20' },
      { id: 'ic-2', title: 'Critical Feature Beta', priority: 'high', estimatedEffort: 5.0, dueDate: '2026-10-20' },
      { id: 'ic-3', title: 'Critical Feature Gamma', priority: 'high', estimatedEffort: 5.0, dueDate: '2026-10-20' },
    ], // Total 15h needed in 12h window -> at least one must be delayed
  },

  // 8. Missing & Overdue Deadlines
  missing_and_overdue_deadlines: {
    id: 'missing_and_overdue_deadlines',
    name: 'Overdue & Undated Task Recovery',
    description: 'Mixture of tasks overdue before start, upcoming tasks, and undated backlog tasks.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    tasks: [
      { id: 'mod-overdue', title: 'Past Due Compliance Audit', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-15' },
      { id: 'mod-current', title: 'Active Sprint Item', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-20' },
      { id: 'mod-undated', title: 'Flexible Backlog Research', priority: 'low', estimatedEffort: 4.0, dueDate: null },
    ],
  },

  // 9. Non-Working-Day Deadline (Sunday Due Date)
  non_working_day_deadline: {
    id: 'non_working_day_deadline',
    name: 'Non-Working-Day Deadline (Weekend)',
    description: 'Task due on Sunday (2026-10-25). Satisfied if completed on preceding Friday (2026-10-23).',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    tasks: [
      { id: 'nwd-1', title: 'Sunday Midnight Report Submission', priority: 'high', estimatedEffort: 4.0, dueDate: '2026-10-25' },
      { id: 'nwd-2', title: 'Standard Weekday Task', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-21' },
    ],
  },

  // 10. Planning Horizon Exhaustion
  horizon_exhaustion: {
    id: 'horizon_exhaustion',
    name: 'Planning Horizon Exhaustion',
    description: 'Workload exceeds total capacity of the planning horizon (e.g. 7-day horizon with 5 working days = 30h).',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 7, // 5 working days = 30h total capacity
    tasks: [
      { id: 'he-1', title: 'Task Batch 1', priority: 'high', estimatedEffort: 6.0, dueDate: '2026-10-21' },
      { id: 'he-2', title: 'Task Batch 2', priority: 'high', estimatedEffort: 6.0, dueDate: '2026-10-22' },
      { id: 'he-3', title: 'Task Batch 3', priority: 'medium', estimatedEffort: 6.0, dueDate: '2026-10-23' },
      { id: 'he-4', title: 'Task Batch 4', priority: 'medium', estimatedEffort: 6.0, dueDate: '2026-10-26' },
      { id: 'he-5', title: 'Task Batch 5', priority: 'low', estimatedEffort: 6.0, dueDate: '2026-10-26' },
      { id: 'he-6', title: 'Task Batch 6 (Overflow)', priority: 'low', estimatedEffort: 6.0, dueDate: '2026-10-27' },
    ], // Total 36h needed > 30h available -> task 6 must be unscheduled
  },

  // 11. Sparse vs Cold-Start Personal Duration Model
  sparse_vs_coldstart_personal_model: {
    id: 'sparse_vs_coldstart_personal_model',
    name: 'Personal Model Duration Adjustment',
    description: 'Tests scheduling with personalized estimation ratio vs raw user estimate.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    personalDurationModel: {
      is_supported: true,
      personalization_status: 'developing',
      sample_size: 4,
      effective_sample_weight: 4.0,
      global_bias_ratio: 1.5, // 50% underestimation observed historically
      category_models: {},
    },
    tasks: [
      { id: 'pm-1', title: 'Database Optimization', priority: 'high', estimatedEffort: 4.0, dueDate: '2026-10-20' }, // adjusts to ~5.0h
      { id: 'pm-2', title: 'API Integration', priority: 'medium', estimatedEffort: 3.0, dueDate: '2026-10-21' },
    ],
  },

  // 12. Heuristic Delay-Risk Signal
  heuristic_risk_signal: {
    id: 'heuristic_risk_signal',
    name: 'Heuristic Delay-Risk Urgency Boost',
    description: 'Task with high delay-risk prediction (+60 pts) compared with standard priority ranking.',
    startDate: '2026-10-19', // Monday
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    predictionsMap: {
      'hrs-1': { risk: 'HIGH', delay_probability: 0.82 },
    },
    tasks: [
      { id: 'hrs-1', title: 'Complex Legacy Refactor', priority: 'medium', estimatedEffort: 4.0, dueDate: '2026-10-23' },
      { id: 'hrs-2', title: 'New Onboarding Flow', priority: 'medium', estimatedEffort: 4.0, dueDate: '2026-10-23' },
    ],
  },
};

/**
 * Perturbation Suite for Schedule Stability & Churn Analysis
 */
export const STABILITY_BENCHMARK = {
  base: {
    startDate: '2026-10-19',
    dailyCapacityHours: 6.0,
    horizonDays: 14,
    tasks: [
      { id: 'st-1', title: 'Database Migration', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-20' },
      { id: 'st-2', title: 'API Authentication', priority: 'high', estimatedEffort: 3.0, dueDate: '2026-10-21' },
      { id: 'st-3', title: 'Frontend Dashboard', priority: 'medium', estimatedEffort: 4.0, dueDate: '2026-10-22' },
      { id: 'st-4', title: 'Unit Test Coverage', priority: 'medium', estimatedEffort: 4.0, dueDate: '2026-10-23' },
      { id: 'st-5', title: 'Documentation Polish', priority: 'low', estimatedEffort: 2.0, dueDate: '2026-10-26' },
    ],
  },
  perturbations: {
    add_low_priority_task: {
      name: 'Add 1 Low-Priority Task',
      mutate: (tasks) => [
        ...tasks,
        { id: 'st-new', title: 'Minor Icon Alignment', priority: 'low', estimatedEffort: 1.0, dueDate: '2026-10-28' },
      ],
    },
    change_task_priority: {
      name: 'Change Task Priority (st-3 Medium -> High)',
      mutate: (tasks) =>
        tasks.map((t) => (t.id === 'st-3' ? { ...t, priority: 'high' } : t)),
    },
    shift_deadline_by_one_day: {
      name: 'Move Deadline by +1 Day (st-2)',
      mutate: (tasks) =>
        tasks.map((t) => (t.id === 'st-2' ? { ...t, dueDate: '2026-10-22' } : t)),
    },
    adjust_duration_estimate: {
      name: 'Slightly Change Duration Estimate (st-1 3.0h -> 3.5h)',
      mutate: (tasks) =>
        tasks.map((t) => (t.id === 'st-1' ? { ...t, estimatedEffort: 3.5 } : t)),
    },
    add_valid_dependency: {
      name: 'Add Valid Dependency (st-3 depends on st-2)',
      mutate: (tasks) =>
        tasks.map((t) => (t.id === 'st-3' ? { ...t, dependencies: ['st-2'] } : t)),
    },
  },
};

/**
 * Runs a complete stability benchmark evaluating churn rate across small input perturbations.
 *
 * @param {string} [strategy='adaptive']
 * @returns {object} Stability benchmark results
 */
export function runStabilityBenchmark(strategy = 'adaptive') {
  const baseConfig = STABILITY_BENCHMARK.base;
  const baseSchedule = generateAdaptiveSchedule(baseConfig.tasks, {
    startDate: baseConfig.startDate,
    dailyCapacityHours: baseConfig.dailyCapacityHours,
    horizonDays: baseConfig.horizonDays,
    strategy,
  });

  const perturbationResults = [];

  for (const [key, pert] of Object.entries(STABILITY_BENCHMARK.perturbations)) {
    const mutatedTasks = pert.mutate(baseConfig.tasks);
    const perturbedSchedule = generateAdaptiveSchedule(mutatedTasks, {
      startDate: baseConfig.startDate,
      dailyCapacityHours: baseConfig.dailyCapacityHours,
      horizonDays: baseConfig.horizonDays,
      strategy,
    });

    const stability = evaluateScheduleStability(baseSchedule, perturbedSchedule);

    perturbationResults.push({
      key,
      name: pert.name,
      commonCount: stability.commonCount,
      shiftedCount: stability.shiftedCount,
      churnRate: stability.churnRate,
      dateDifferences: stability.dateDifferences,
    });
  }

  const averageChurnRate =
    perturbationResults.reduce((acc, r) => acc + r.churnRate, 0) /
    Math.max(1, perturbationResults.length);

  return {
    strategy,
    perturbationResults,
    averageChurnRate: Math.round(averageChurnRate * 1000) / 1000,
  };
}

/**
 * Runs all benchmark scenarios through strategy comparison.
 *
 * @param {object} [options={}]
 * @returns {object[]} Array of comparative benchmark reports
 */
export function runAllBenchmarks(options = {}) {
  const reports = [];

  for (const [key, scenario] of Object.entries(BENCHMARK_SCENARIOS)) {
    const result = compareScheduleStrategies(scenario.tasks, {
      startDate: scenario.startDate,
      dailyCapacityHours: scenario.dailyCapacityHours,
      horizonDays: scenario.horizonDays,
      personalDurationModel: scenario.personalDurationModel || null,
      predictionsMap: scenario.predictionsMap || {},
      scenarioName: scenario.name,
      ...options,
    });

    reports.push({
      scenarioKey: key,
      scenarioId: scenario.id,
      name: scenario.name,
      description: scenario.description,
      ...result,
    });
  }

  return reports;
}
