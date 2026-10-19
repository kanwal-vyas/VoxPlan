/**
 * VoxPlan Schedule Simulation & Shadow-Only Candidate Evaluation (Phase 7.4).
 *
 * Implements a pure, deterministic, isolated simulation engine that allows
 * comparing candidate scheduler configurations against the factory baseline
 * without mutating live production state or modifying scheduler weights.
 *
 * Core Guarantees:
 * 1. Read-Only & Isolated: Candidate schedules and weights exist only in memory during simulation.
 *    They never write to localStorage, IndexedDB, or active task due dates.
 * 2. Immutable Factory Baseline: Baseline evaluation always uses FACTORY_SCHEDULER_WEIGHTS.
 * 3. Bounded Candidate Parameters: Candidate weights are validated against strict bounds (±20% of baseline).
 *    Non-finite, negative, or unsupported parameters are strictly rejected.
 * 4. Hard-Constraint Verification: Both baseline and candidate runs verify topological DAG ordering,
 *    cycle absence, and capacity feasibility. Infeasible candidates cannot be promoted as improvements.
 * 5. Deterministic & Reproducible: Identical inputs and configurations produce identical schedules.
 */

import {
  generateAdaptiveSchedule,
  FACTORY_SCHEDULER_WEIGHTS,
  parseDateISO,
} from './adaptiveScheduler.js';

/**
 * Supported candidate weight bounds: strictly bounded to ±20% of factory defaults.
 */
export const SIMULATION_WEIGHT_BOUNDS = Object.freeze({
  urgencyWeight: Object.freeze({
    key: 'urgencyWeight',
    label: 'Urgency Weight',
    description: 'Deadline proximity multiplier (pts/day remaining to deadline)',
    factory: FACTORY_SCHEDULER_WEIGHTS.urgencyWeight,
    min: 40.0,
    max: 60.0,
    step: 1.0,
  }),
  priorityWeight: Object.freeze({
    key: 'priorityWeight',
    label: 'Priority Weight',
    description: 'Inter-tier priority spacing (Low: 1x, Med: 2x, High: 3x)',
    factory: FACTORY_SCHEDULER_WEIGHTS.priorityWeight,
    min: 80.0,
    max: 120.0,
    step: 5.0,
  }),
  unblockWeight: Object.freeze({
    key: 'unblockWeight',
    label: 'Unblock Weight',
    description: 'Critical path bonus per downstream dependent task',
    factory: FACTORY_SCHEDULER_WEIGHTS.unblockWeight,
    min: 12.0,
    max: 18.0,
    step: 0.5,
  }),
  riskWeight: Object.freeze({
    key: 'riskWeight',
    label: 'Risk Weight',
    description: 'Guarded machine-learning delay risk nudge',
    factory: FACTORY_SCHEDULER_WEIGHTS.riskWeight,
    min: 20.0,
    max: 30.0,
    step: 1.0,
  }),
});

/**
 * Validates candidate heuristic scheduler weights against documented bounds.
 *
 * @param {Object} rawWeights - Candidate weights object.
 * @returns {{
 *   isValid: boolean,
 *   errors: string[],
 *   validatedWeights: Object|null,
 *   isIdenticalToBaseline: boolean,
 *   deltas: Object|null
 * }}
 */
export function validateCandidateWeights(rawWeights) {
  if (!rawWeights || typeof rawWeights !== 'object' || Array.isArray(rawWeights)) {
    return {
      isValid: false,
      errors: ['Candidate weights must be a valid configuration object.'],
      validatedWeights: null,
      isIdenticalToBaseline: false,
      deltas: null,
    };
  }

  const errors = [];
  const supportedKeys = Object.keys(SIMULATION_WEIGHT_BOUNDS);
  const inputKeys = Object.keys(rawWeights);

  // Check for unsupported keys
  for (const k of inputKeys) {
    if (!supportedKeys.includes(k)) {
      errors.push(`Unsupported configuration parameter: "${k}". Only [${supportedKeys.join(', ')}] are supported.`);
    }
  }

  const validatedWeights = {};
  const deltas = {};
  let isIdenticalToBaseline = true;

  for (const key of supportedKeys) {
    const spec = SIMULATION_WEIGHT_BOUNDS[key];
    const val = rawWeights[key] !== undefined ? rawWeights[key] : spec.factory;

    // Check numeric validity
    const num = typeof val === 'number'
      ? val
      : (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val)) ? Number(val) : NaN);

    if (isNaN(num) || !isFinite(num)) {
      errors.push(`${spec.label} (${key}) must be a finite number. Received: ${String(val)}.`);
      continue;
    }

    if (num < spec.min || num > spec.max) {
      errors.push(
        `${spec.label} (${num}) is outside allowed bounds [${spec.min.toFixed(1)}, ${spec.max.toFixed(1)}] (±20% of factory default ${spec.factory.toFixed(1)}).`
      );
      continue;
    }

    const rounded = Math.round(num * 10) / 10;
    validatedWeights[key] = rounded;

    const deltaPct = Math.round(((rounded - spec.factory) / spec.factory) * 1000) / 10;
    deltas[key] = deltaPct;

    if (Math.abs(rounded - spec.factory) > 0.001) {
      isIdenticalToBaseline = false;
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      validatedWeights: null,
      isIdenticalToBaseline: false,
      deltas: null,
    };
  }

  return {
    isValid: true,
    errors: [],
    validatedWeights,
    isIdenticalToBaseline,
    deltas,
  };
}

/**
 * Standard deterministic simulation scenarios.
 */
export const SIMULATION_SCENARIOS = Object.freeze({
  active_backlog: Object.freeze({
    id: 'active_backlog',
    name: 'Current Active Task Backlog',
    description: 'Simulates your current active tasks without modifying dates or production schedule.',
    useCurrentTasks: true,
    tasks: [],
  }),
  deadline_vs_priority: Object.freeze({
    id: 'deadline_vs_priority',
    name: 'Deadline vs. Priority Contention',
    description: 'Tests trade-offs between urgent low-priority tasks and high-priority tasks with later deadlines.',
    useCurrentTasks: false,
    tasks: Object.freeze([
      { id: 'sim_dp_1', title: 'Emergency Server SSL Patch', estimatedEffort: 2.0, dueDate: '2026-10-19', priority: 'low', completed: false },
      { id: 'sim_dp_2', title: 'Executive Strategic Review Deck', estimatedEffort: 3.5, dueDate: '2026-10-21', priority: 'high', completed: false },
      { id: 'sim_dp_3', title: 'Fix P2 UI Alignment Defect', estimatedEffort: 1.5, dueDate: '2026-10-19', priority: 'medium', completed: false },
      { id: 'sim_dp_4', title: 'Annual Security Compliance Audit', estimatedEffort: 4.0, dueDate: '2026-10-22', priority: 'high', completed: false },
      { id: 'sim_dp_5', title: 'Routine Dependency Upgrade', estimatedEffort: 2.0, dueDate: '2026-10-20', priority: 'low', completed: false },
    ]),
  }),
  dependency_chain: Object.freeze({
    id: 'dependency_chain',
    name: 'Critical Path Dependency Chain',
    description: 'Tests how unblockWeight prioritizes prerequisite work blocking multiple downstream tasks.',
    useCurrentTasks: false,
    tasks: Object.freeze([
      { id: 'sim_dep_1', title: 'Core Schema Migration (Root)', estimatedEffort: 2.5, dueDate: '2026-10-20', priority: 'medium', dependencies: [], completed: false },
      { id: 'sim_dep_2', title: 'Backend API Service (Dependent on Root)', estimatedEffort: 3.0, dueDate: '2026-10-21', priority: 'high', dependencies: ['sim_dep_1'], completed: false },
      { id: 'sim_dep_3', title: 'Frontend Dashboard Integration', estimatedEffort: 2.0, dueDate: '2026-10-22', priority: 'high', dependencies: ['sim_dep_2'], completed: false },
      { id: 'sim_dep_4', title: 'Independent Customer Survey Review', estimatedEffort: 2.0, dueDate: '2026-10-19', priority: 'low', dependencies: [], completed: false },
      { id: 'sim_dep_5', title: 'End-to-End System Smoke Tests', estimatedEffort: 1.5, dueDate: '2026-10-23', priority: 'medium', dependencies: ['sim_dep_3'], completed: false },
    ]),
  }),
  capacity_bottleneck: Object.freeze({
    id: 'capacity_bottleneck',
    name: 'Daily Capacity Bottleneck & Bin-Packing',
    description: 'Tests tight schedule bin-packing when total effort approaches or exceeds daily capacity.',
    useCurrentTasks: false,
    tasks: Object.freeze([
      { id: 'sim_cap_1', title: 'Comprehensive Client Workshop', estimatedEffort: 5.0, dueDate: '2026-10-19', priority: 'high', completed: false },
      { id: 'sim_cap_2', title: 'Database Optimization', estimatedEffort: 4.0, dueDate: '2026-10-19', priority: 'medium', completed: false },
      { id: 'sim_cap_3', title: 'Architecture Review Session', estimatedEffort: 3.0, dueDate: '2026-10-20', priority: 'high', completed: false },
      { id: 'sim_cap_4', title: 'Draft Vendor Agreement', estimatedEffort: 3.0, dueDate: '2026-10-20', priority: 'low', completed: false },
      { id: 'sim_cap_5', title: 'Customer Interview Synthesis', estimatedEffort: 3.5, dueDate: '2026-10-21', priority: 'medium', completed: false },
    ]),
  }),
});

/**
 * Calculates calendar day difference (dateB - dateA) in integer days.
 */
function dayDiff(dateStrA, dateStrB) {
  const a = parseDateISO(dateStrA);
  const b = parseDateISO(dateStrB);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / (1000 * 3600 * 24));
}

/**
 * Extracts schedule performance metrics from a raw scheduler output.
 */
function extractMetricsFromSchedule(scheduleResult) {
  const placements = scheduleResult?.placements || [];
  const summary = scheduleResult?.summary || {};
  const dayAllocations = scheduleResult?.dayAllocations || [];

  let onTimeTasksCount = 0;
  let delayedTasksCount = 0;
  let totalDelayDays = 0;
  let infeasiblePlacementsCount = 0;
  let unscheduledPlacementsCount = 0;

  for (const pl of placements) {
    if (
      pl.status === 'blocked_by_dependency' ||
      pl.status === 'oversized_exceeds_capacity' ||
      pl.status === 'unscheduled' ||
      !pl.proposedDate
    ) {
      infeasiblePlacementsCount++;
      if (pl.status === 'unscheduled' || !pl.proposedDate) {
        unscheduledPlacementsCount++;
      }
      continue;
    }

    if (pl.proposedDate && pl.originalDueDate) {
      const diff = dayDiff(pl.originalDueDate, pl.proposedDate);
      if (diff > 0) {
        delayedTasksCount++;
        totalDelayDays += diff;
      } else {
        onTimeTasksCount++;
      }
    } else if (pl.proposedDate) {
      onTimeTasksCount++;
    }
  }

  let totalCapacity = 0;
  let totalAllocated = 0;
  for (const day of dayAllocations) {
    if (day.isWorkingDay && day.capacityHours > 0) {
      totalCapacity += day.capacityHours;
      totalAllocated += (day.capacityHours - (day.remainingHours || 0));
    }
  }
  const capacityUtilizationPct = totalCapacity > 0
    ? Math.round((totalAllocated / totalCapacity) * 1000) / 10
    : 0.0;

  const totalTasks = placements.length;
  const scheduledTasks = summary.scheduledTasksCount ?? summary.scheduledCount ?? (totalTasks - unscheduledPlacementsCount);
  const onTimeRatePct = scheduledTasks > 0
    ? Math.round((onTimeTasksCount / scheduledTasks) * 1000) / 10
    : 0.0;

  const placementsMap = new Map();
  for (const p of placements) {
    const key = p.placementId || `${p.taskId}_${p.chunkIndex ?? 0}`;
    placementsMap.set(key, {
      taskId: p.taskId,
      title: p.taskTitle || p.title || p.taskId,
      proposedDate: p.proposedDate || null,
      status: p.status,
    });
  }

  return {
    totalTasks,
    scheduledTasks,
    unscheduledPlacementsCount,
    cycleDetected: Boolean(scheduleResult?.cycleDetected),
    infeasiblePlacementsCount,
    onTimeTasksCount,
    delayedTasksCount,
    totalDelayDays,
    onTimeRatePct,
    capacityUtilizationPct,
    placementsMap,
  };
}

/**
 * Runs an isolated shadow schedule simulation comparing factory baseline vs candidate configuration.
 *
 * @param {Object} params
 * @param {string} [params.scenarioKey='deadline_vs_priority'] - Scenario identifier.
 * @param {Array<Object>} [params.tasks=[]] - Current active tasks (used when scenarioKey is 'active_backlog').
 * @param {Object} [params.candidateWeights=FACTORY_SCHEDULER_WEIGHTS] - Candidate parameters to simulate.
 * @param {Object} [params.options={}] - Standard scheduler options (startDate, dailyCapacityHours, etc.).
 * @returns {Object} Comprehensive simulation report.
 */
export function runScheduleSimulation({
  scenarioKey = 'deadline_vs_priority',
  tasks = [],
  candidateWeights = FACTORY_SCHEDULER_WEIGHTS,
  options = {},
} = {}) {
  const simulationTimestamp = new Date().toISOString();

  // 1. Validate Candidate Weights
  const validation = validateCandidateWeights(candidateWeights);
  if (!validation.isValid) {
    return {
      simulationTimestamp,
      scenarioKey,
      scenarioName: SIMULATION_SCENARIOS[scenarioKey]?.name || scenarioKey,
      isShadowOnly: true,
      productionApplied: false,
      status: 'invalid_parameters',
      errors: validation.errors,
      isFeasible: false,
      baselineMetrics: null,
      candidateMetrics: null,
      comparison: null,
      tradeOffAnalysis: null,
    };
  }

  // 2. Resolve Scenario Tasks
  let scenarioDef = SIMULATION_SCENARIOS[scenarioKey];
  if (!scenarioDef) {
    scenarioDef = SIMULATION_SCENARIOS.deadline_vs_priority;
  }

  let rawTasks = [];
  if (scenarioDef.useCurrentTasks) {
    rawTasks = Array.isArray(tasks) ? tasks.filter((t) => !t.completed) : [];
    if (rawTasks.length === 0) {
      return {
        simulationTimestamp,
        scenarioKey: scenarioDef.id,
        scenarioName: scenarioDef.name,
        isShadowOnly: true,
        productionApplied: false,
        status: 'empty_backlog',
        message: 'Your active task backlog has no uncompleted tasks to simulate. Select a preset scenario above to test candidate parameters.',
        isFeasible: true,
        baselineMetrics: null,
        candidateMetrics: null,
        comparison: null,
        tradeOffAnalysis: null,
      };
    }
  } else {
    rawTasks = scenarioDef.tasks;
  }

  // Deep clone tasks to guarantee paired-input isolation
  const baselineTasks = rawTasks.map((t) => ({
    ...t,
    dependencies: Array.isArray(t.dependencies) ? [...t.dependencies] : [],
  }));
  const candidateTasks = rawTasks.map((t) => ({
    ...t,
    dependencies: Array.isArray(t.dependencies) ? [...t.dependencies] : [],
  }));

  const standardOptions = {
    startDate: options.startDate || '2026-10-19',
    dailyCapacityHours: options.dailyCapacityHours || 6.0,
    horizonDays: options.horizonDays || 14,
    ...options,
  };

  // 3. Generate Baseline Schedule (Immutable Factory Defaults)
  const baselineSchedule = generateAdaptiveSchedule(baselineTasks, {
    ...standardOptions,
    weights: FACTORY_SCHEDULER_WEIGHTS,
  });
  const baselineMetrics = extractMetricsFromSchedule(baselineSchedule);

  // 4. Generate Candidate Schedule (Isolated Shadow Weights)
  const candidateSchedule = generateAdaptiveSchedule(candidateTasks, {
    ...standardOptions,
    weights: validation.validatedWeights,
  });
  const candidateMetrics = extractMetricsFromSchedule(candidateSchedule);

  // 5. Evaluate Schedule Churn & Placement Shifts
  let churnCount = 0;
  const shiftedPlacements = [];

  for (const [key, baseItem] of baselineMetrics.placementsMap.entries()) {
    const candItem = candidateMetrics.placementsMap.get(key);
    if (!candItem || baseItem.proposedDate !== candItem.proposedDate) {
      churnCount++;
      shiftedPlacements.push({
        placementKey: key,
        taskId: baseItem.taskId,
        title: baseItem.title,
        baselineDate: baseItem.proposedDate,
        candidateDate: candItem?.proposedDate || null,
        baselineStatus: baseItem.status,
        candidateStatus: candItem?.status || 'unscheduled',
      });
    }
  }

  // 6. Hard-Constraint Feasibility Verification
  const violations = [];
  if (candidateMetrics.cycleDetected && !baselineMetrics.cycleDetected) {
    violations.push('regression_cycle_detected: Candidate weights triggered a dependency cycle violation.');
  }
  if (candidateMetrics.infeasiblePlacementsCount > baselineMetrics.infeasiblePlacementsCount) {
    violations.push(
      `regression_infeasible_placements: Infeasible placements increased from ${baselineMetrics.infeasiblePlacementsCount} to ${candidateMetrics.infeasiblePlacementsCount}.`
    );
  }
  if (candidateMetrics.scheduledTasks < baselineMetrics.scheduledTasks) {
    violations.push(
      `regression_lost_coverage: Scheduled task throughput decreased from ${baselineMetrics.scheduledTasks} to ${candidateMetrics.scheduledTasks}.`
    );
  }

  const isFeasible = violations.length === 0 && !candidateMetrics.cycleDetected && candidateMetrics.infeasiblePlacementsCount === 0;

  // 7. Plain-Language Trade-Off Analysis
  const onTimeDelta = candidateMetrics.onTimeTasksCount - baselineMetrics.onTimeTasksCount;
  const delayedDelta = candidateMetrics.delayedTasksCount - baselineMetrics.delayedTasksCount;
  const delayDaysDelta = candidateMetrics.totalDelayDays - baselineMetrics.totalDelayDays;
  const utilDeltaPct = Math.round((candidateMetrics.capacityUtilizationPct - baselineMetrics.capacityUtilizationPct) * 10) / 10;

  let tradeOffSummary = '';
  if (validation.isIdenticalToBaseline) {
    tradeOffSummary = 'Candidate configuration is identical to factory baseline. Both schedules produce 100% equivalent placements and metrics (0 churn).';
  } else if (!isFeasible) {
    tradeOffSummary = `WARNING: Candidate schedule produced hard constraint violations (${violations.join('; ')}). Infeasible schedules cannot be considered an improvement.`;
  } else {
    const points = [];
    if (onTimeDelta > 0) {
      points.push(`schedules ${onTimeDelta} more task(s) on-time`);
    } else if (onTimeDelta < 0) {
      points.push(`schedules ${Math.abs(onTimeDelta)} fewer task(s) on-time`);
    }

    if (delayDaysDelta < 0) {
      points.push(`reduces cumulative delay by ${Math.abs(delayDaysDelta)} day(s)`);
    } else if (delayDaysDelta > 0) {
      points.push(`increases cumulative delay by ${delayDaysDelta} day(s)`);
    }

    if (Math.abs(utilDeltaPct) >= 0.5) {
      points.push(`shifts daily capacity utilization by ${utilDeltaPct > 0 ? `+${utilDeltaPct}%` : `${utilDeltaPct}%`}`);
    }

    if (churnCount > 0) {
      points.push(`reorders ${churnCount} placement(s)`);
    } else {
      points.push('preserves identical calendar dates');
    }

    tradeOffSummary = `Candidate configuration ${points.join(', ')} while maintaining 100% hard constraint compliance.`;
  }

  return {
    simulationTimestamp,
    scenarioKey: scenarioDef.id,
    scenarioName: scenarioDef.name,
    scenarioDescription: scenarioDef.description,
    isShadowOnly: true,
    productionApplied: false,
    productionScheduleUnchanged: true,
    status: 'success',
    isFeasible,
    violations,
    isIdenticalToBaseline: validation.isIdenticalToBaseline,
    candidateWeights: validation.validatedWeights,
    weightDeltas: validation.deltas,
    baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
    baselineMetrics: {
      totalTasks: baselineMetrics.totalTasks,
      scheduledTasks: baselineMetrics.scheduledTasks,
      unscheduledTasks: baselineMetrics.unscheduledPlacementsCount,
      onTimeTasks: baselineMetrics.onTimeTasksCount,
      onTimeRatePct: baselineMetrics.onTimeRatePct,
      delayedTasks: baselineMetrics.delayedTasksCount,
      totalDelayDays: baselineMetrics.totalDelayDays,
      capacityUtilizationPct: baselineMetrics.capacityUtilizationPct,
      cycleDetected: baselineMetrics.cycleDetected,
      infeasiblePlacementsCount: baselineMetrics.infeasiblePlacementsCount,
    },
    candidateMetrics: {
      totalTasks: candidateMetrics.totalTasks,
      scheduledTasks: candidateMetrics.scheduledTasks,
      unscheduledTasks: candidateMetrics.unscheduledPlacementsCount,
      onTimeTasks: candidateMetrics.onTimeTasksCount,
      onTimeRatePct: candidateMetrics.onTimeRatePct,
      delayedTasks: candidateMetrics.delayedTasksCount,
      totalDelayDays: candidateMetrics.totalDelayDays,
      capacityUtilizationPct: candidateMetrics.capacityUtilizationPct,
      cycleDetected: candidateMetrics.cycleDetected,
      infeasiblePlacementsCount: candidateMetrics.infeasiblePlacementsCount,
    },
    comparison: {
      onTimeDelta,
      delayedDelta,
      delayDaysDelta,
      utilizationDeltaPct: utilDeltaPct,
      churnCount,
      shiftedPlacements,
    },
    tradeOffAnalysis: {
      summary: tradeOffSummary,
      isFeasible,
      hasViolations: violations.length > 0,
    },
  };
}
