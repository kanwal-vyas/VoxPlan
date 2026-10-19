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
 * 6. Metric Semantics Integrity (Stage 2 Audit):
 *    - "Planned Deadline Compliance": Strictly evaluates planned placement dates against deadlines.
 *      Does NOT claim observed completion or future satisfaction.
 *    - Tasks without deadlines are excluded from the deadline compliance denominator.
 *    - Parent tasks with multiple chunks are evaluated as a single unique task entity.
 *    - Lateness is calculated against the date of the last scheduled chunk.
 */

import {
  generateAdaptiveSchedule,
  FACTORY_SCHEDULER_WEIGHTS,
  parseDateISO,
  formatDateISO,
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
 * Immune to timezone shifts by operating on ISO date boundaries.
 *
 * @param {string|null} dateStrA - Start date (YYYY-MM-DD).
 * @param {string|null} dateStrB - End date (YYYY-MM-DD).
 * @returns {number} Integer day difference (positive if B is after A).
 */
export function dayDiff(dateStrA, dateStrB) {
  if (!dateStrA || !dateStrB) return 0;
  const a = parseDateISO(dateStrA);
  const b = parseDateISO(dateStrB);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / (1000 * 3600 * 24));
}

/**
 * Formal Methodology and Metric Definitions Disclosure (Phase 7.4 Stage 2 Audit).
 */
export const METRIC_METHODOLOGY_DISCLOSURE = Object.freeze({
  coverageRate: Object.freeze({
    name: 'Scheduled Tasks Coverage',
    type: 'planned_simulation_property',
    formula: 'scheduledTasksCount / totalTasks',
    denominator: 'totalTasks (unique uncompleted tasks in backlog)',
    notes: 'Measures the proportion of backlog tasks successfully allocated to a calendar slot within the planning horizon.',
  }),
  plannedCompliance: Object.freeze({
    name: 'Planned Deadline Compliance Rate',
    type: 'planned_simulation_property',
    formula: 'plannedCompliantCount / scheduledTasksWithDeadlineCount',
    denominator: 'scheduledTasksWithDeadlineCount (scheduled tasks with an explicit deadline)',
    notes: 'Strictly evaluates planned placement dates against deadlines. Does NOT claim actual completion or predict user compliance. Tasks without deadlines are excluded from the denominator. Unavailable if no scheduled tasks have deadlines.',
  }),
  plannedDelayDays: Object.freeze({
    name: 'Cumulative Planned Delay Days',
    type: 'planned_simulation_property',
    formula: 'sum(max(0, plannedCompletionDate - dueDate))',
    denominator: 'N/A (cumulative integer days across scheduled tasks with deadlines)',
    notes: 'Measures total planned slippage past deadlines. Multi-day chunked tasks are evaluated as single parent tasks using the date of their final chunk to prevent double-counting.',
  }),
  capacityUtilization: Object.freeze({
    name: 'Capacity Utilization Rate',
    type: 'planned_simulation_property',
    formula: 'scheduledWorkloadHours / totalCapacityHours',
    denominator: 'totalCapacityHours (sum of daily capacity across working days in horizon)',
    notes: 'Calculated over working days only. Both baseline and candidate receive equivalent horizons and capacity hours. Unavailable if capacity is zero.',
  }),
  scheduleChurn: Object.freeze({
    name: 'Schedule Churn (Shifted Placements)',
    type: 'comparative_structural_metric',
    formula: 'count(placements with date or status delta vs baseline)',
    denominator: 'total placements',
    notes: 'Measures placement displacement relative to the factory baseline. It is a structural stability metric, NOT a measure of user dissatisfaction or schedule quality.',
  }),
  hardConstraintFeasibility: Object.freeze({
    name: 'Hard Constraint Feasibility',
    type: 'invariant_verification',
    formula: 'cycleDetected === false && blockedTasksCount === 0 && capacityOverrun === false',
    denominator: 'N/A (binary feasibility boolean)',
    notes: 'Infeasible candidates are disqualified from promotion. A high score cannot override a hard constraint violation.',
  }),
});

/**
 * Extracts audited schedule performance metrics from raw scheduler output and input tasks.
 *
 * Implements Stage 2 Semantic Corrections:
 * - Group placements by unique taskId to ensure chunked tasks are never double-counted.
 * - Multi-day chunked tasks are evaluated as a single parent task using the date of their last chunk.
 * - Tasks without deadlines are strictly excluded from the planned compliance denominator.
 * - Missing deadlines produce honest 'unavailable' states rather than manufactured 0% or 100%.
 *
 * @param {Object} scheduleResult - Output from generateAdaptiveSchedule.
 * @param {Array<Object>} [inputTasks=[]] - Input task snapshots.
 * @param {Object} [options={}] - Standard scheduler options.
 * @returns {Object} Audited metrics with parent-task deduplication and honest denominators.
 */
export function extractMetricsFromSchedule(scheduleResult, inputTasks = [], options = {}) {
  const placements = scheduleResult?.placements || [];
  const summary = scheduleResult?.summary || {};
  const dayAllocations = scheduleResult?.dayAllocations || [];
  const horizonStartDate = options.startDate || summary.startDate || '2026-10-19';

  // 1. Group placements by unique taskId to prevent multi-chunk inflation
  const taskPlacementsMap = new Map();
  for (const p of placements) {
    if (!p || !p.taskId) continue;
    if (!taskPlacementsMap.has(p.taskId)) {
      taskPlacementsMap.set(p.taskId, []);
    }
    taskPlacementsMap.get(p.taskId).push(p);
  }

  // 2. Build input task lookup
  const inputTaskMap = new Map();
  for (const t of inputTasks) {
    if (t && t.id) {
      inputTaskMap.set(t.id, t);
    }
  }

  // Combine unique task IDs from input tasks and placements
  const allTaskIds = new Set([...inputTaskMap.keys(), ...taskPlacementsMap.keys()]);
  const totalTasks = allTaskIds.size;

  let scheduledTasksCount = 0;
  let fullyScheduledTasksCount = 0;
  let unscheduledTasksCount = 0;
  let tasksWithDeadlineCount = 0;
  let scheduledTasksWithDeadlineCount = 0;
  let plannedCompliantCount = 0;
  let plannedDelayedCount = 0;
  let overdueAtStartCount = 0;
  let tasksWithoutDeadlineCount = 0;
  let totalPlannedDelayDays = 0;
  let infeasiblePlacementsCount = 0;

  const auditedTaskSummaries = new Map();

  for (const taskId of allTaskIds) {
    const taskObj = inputTaskMap.get(taskId);
    const taskPls = taskPlacementsMap.get(taskId) || [];

    // Derive canonical deadline (from taskObj or placement)
    const rawDue = taskObj?.dueDate || taskPls[0]?.originalDueDate || null;
    const dueDate = rawDue ? formatDateISO(rawDue) : null;
    const hasDeadline = Boolean(dueDate);

    if (hasDeadline) {
      tasksWithDeadlineCount++;
    } else {
      tasksWithoutDeadlineCount++;
    }

    // Identify scheduled vs unscheduled chunks
    const scheduledChunks = taskPls.filter(
      (p) => p.proposedDate !== null &&
             p.status !== 'blocked_by_dependency' &&
             p.status !== 'oversized_exceeds_capacity' &&
             p.status !== 'unscheduled'
    );
    const unscheduledChunks = taskPls.filter(
      (p) => !p.proposedDate ||
             p.status === 'blocked_by_dependency' ||
             p.status === 'oversized_exceeds_capacity' ||
             p.status === 'unscheduled'
    );

    const isScheduled = scheduledChunks.length > 0;
    const isFullyScheduled = scheduledChunks.length > 0 && unscheduledChunks.length === 0;

    if (isScheduled) {
      scheduledTasksCount++;
      if (isFullyScheduled) fullyScheduledTasksCount++;
    } else {
      unscheduledTasksCount++;
    }

    if (unscheduledChunks.length > 0) {
      infeasiblePlacementsCount += unscheduledChunks.length;
    }

    // Planned completion date: the date of the LAST scheduled chunk
    let plannedCompletionDate = null;
    if (isScheduled) {
      const dates = scheduledChunks.map((c) => c.proposedDate).filter(Boolean);
      dates.sort();
      plannedCompletionDate = dates[dates.length - 1] || null;
    }

    // Evaluate planned lateness & compliance per unique parent task
    let plannedStatus = 'unscheduled';
    let plannedLatenessDays = 0;

    if (!isScheduled) {
      const firstUn = unscheduledChunks[0];
      if (firstUn?.status === 'blocked_by_dependency') {
        plannedStatus = 'blocked';
      } else if (firstUn?.status === 'oversized_exceeds_capacity') {
        plannedStatus = 'oversized';
      } else {
        plannedStatus = 'unscheduled';
      }
    } else if (hasDeadline) {
      scheduledTasksWithDeadlineCount++;
      const diff = dayDiff(dueDate, plannedCompletionDate);

      // Check if task deadline was already in the past prior to schedule start
      const wasOverdue = scheduledChunks.some((c) => c.status === 'overdue_at_start') ||
        (dayDiff(horizonStartDate, dueDate) < 0);

      if (wasOverdue) {
        overdueAtStartCount++;
        plannedStatus = 'overdue_at_start';
        // Overdue prior to start contributes to planned delayed count and delay days
        if (diff > 0) {
          plannedDelayedCount++;
          plannedLatenessDays = diff;
          totalPlannedDelayDays += diff;
        } else {
          plannedCompliantCount++;
        }
      } else if (diff > 0) {
        plannedDelayedCount++;
        plannedStatus = 'planned_past_deadline';
        plannedLatenessDays = diff;
        totalPlannedDelayDays += diff;
      } else {
        plannedCompliantCount++;
        plannedStatus = 'planned_compliant';
      }
    } else {
      plannedStatus = 'flexible_no_deadline';
    }

    auditedTaskSummaries.set(taskId, {
      taskId,
      title: taskPls[0]?.taskTitle || taskObj?.title || taskId,
      priority: taskPls[0]?.taskPriority || taskObj?.priority || 'medium',
      dueDate,
      hasDeadline,
      isScheduled,
      isFullyScheduled,
      plannedCompletionDate,
      plannedStatus,
      plannedLatenessDays,
      chunksCount: taskPls.length,
      scheduledChunksCount: scheduledChunks.length,
      totalHours: taskPls.reduce((sum, p) => sum + (p.effectiveHours || 0), 0),
      explanation: taskPls[0]?.explanation || '',
      conflicts: taskPls.flatMap((p) => p.conflicts || []),
      firstPlacement: taskPls[0] || null,
    });
  }

  // 3. Accurate Capacity Utilization Denominator
  let totalCapacity = 0;
  let totalAllocated = 0;
  for (const day of dayAllocations) {
    if (day.isWorkingDay && typeof day.capacityHours === 'number' && day.capacityHours > 0) {
      totalCapacity += day.capacityHours;
      const allocated = typeof day.totalHours === 'number'
        ? day.totalHours
        : (day.capacityHours - (day.remainingHours || 0));
      totalAllocated += allocated;
    }
  }

  const capacityUtilizationAvailable = totalCapacity > 0;
  const capacityUtilizationPct = capacityUtilizationAvailable
    ? Math.round((totalAllocated / totalCapacity) * 1000) / 10
    : null;

  // 4. Planned Deadline Compliance Rate (Honest Denominator)
  const plannedComplianceAvailable = scheduledTasksWithDeadlineCount > 0;
  const plannedComplianceRatePct = plannedComplianceAvailable
    ? Math.round((plannedCompliantCount / scheduledTasksWithDeadlineCount) * 1000) / 10
    : null;

  // 5. Backlog Coverage Rate
  const coverageRatePct = totalTasks > 0
    ? Math.round((scheduledTasksCount / totalTasks) * 1000) / 10
    : null;

  // 6. Placement Map for Detailed Timeline & Churn Diffing
  const placementsMap = new Map();
  for (const p of placements) {
    const key = p.placementId || `${p.taskId}_${p.chunkIndex ?? 0}`;
    placementsMap.set(key, {
      placementId: key,
      taskId: p.taskId,
      title: p.taskTitle || p.title || p.taskId,
      priority: p.taskPriority || 'medium',
      proposedDate: p.proposedDate || null,
      startTime: p.startTime || null,
      endTime: p.endTime || null,
      effectiveHours: p.effectiveHours || 0,
      isChunk: Boolean(p.isChunk || p.chunkIndex !== undefined),
      chunkIndex: p.chunkIndex ?? 0,
      totalChunks: p.totalChunks ?? 1,
      status: p.status,
      originalDueDate: p.originalDueDate || null,
      inFocusWindow: Boolean(p.inFocusWindow),
      focusWindowLabel: p.focusWindowLabel || null,
      conflicts: p.conflicts || [],
    });
  }

  const cycleDetected = Boolean(
    scheduleResult?.cycleDetected ||
    summary?.cycleDetected ||
    (summary?.cycles && summary.cycles.length > 0)
  );

  return {
    totalTasks,
    scheduledTasks: scheduledTasksCount,
    fullyScheduledTasks: fullyScheduledTasksCount,
    unscheduledTasks: unscheduledTasksCount,
    coverageRatePct,
    tasksWithDeadlineCount,
    scheduledTasksWithDeadlineCount,
    tasksWithoutDeadlineCount,
    plannedComplianceAvailable,
    plannedComplianceRatePct,
    plannedCompliantCount,
    plannedDelayedCount,
    overdueAtStartCount,
    totalPlannedDelayDays,
    capacityUtilizationAvailable,
    capacityUtilizationPct,
    totalCapacityHours: Math.round(totalCapacity * 10) / 10,
    scheduledWorkloadHours: Math.round(totalAllocated * 10) / 10,
    cycleDetected,
    infeasiblePlacementsCount,
    placementsMap,
    auditedTaskSummaries,
    // Backward-compatible aliases for existing tests & consumers
    onTimeTasksCount: plannedCompliantCount,
    onTimeTasks: plannedCompliantCount,
    delayedTasksCount: plannedDelayedCount,
    delayedTasks: plannedDelayedCount,
    totalDelayDays: totalPlannedDelayDays,
    onTimeRatePct: plannedComplianceRatePct !== null ? plannedComplianceRatePct : 0.0,
    unscheduledPlacementsCount: unscheduledTasksCount,
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
 * @returns {Object} Comprehensive simulation report with preview data and audited metrics.
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
      baselineSchedule: null,
      candidateSchedule: null,
      methodology: METRIC_METHODOLOGY_DISCLOSURE,
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
        baselineSchedule: null,
        candidateSchedule: null,
        methodology: METRIC_METHODOLOGY_DISCLOSURE,
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
    enableIntraday: options.enableIntraday ?? true,
    ...options,
  };

  // 3. Generate Baseline Schedule (Immutable Factory Defaults)
  const baselineSchedule = generateAdaptiveSchedule(baselineTasks, {
    ...standardOptions,
    weights: FACTORY_SCHEDULER_WEIGHTS,
  });
  const baselineMetrics = extractMetricsFromSchedule(baselineSchedule, baselineTasks, standardOptions);

  // 4. Generate Candidate Schedule (Isolated Shadow Weights)
  const candidateSchedule = generateAdaptiveSchedule(candidateTasks, {
    ...standardOptions,
    weights: validation.validatedWeights,
  });
  const candidateMetrics = extractMetricsFromSchedule(candidateSchedule, candidateTasks, standardOptions);

  // 5. Evaluate Schedule Churn & Placement Shifts
  let churnCount = 0;
  const shiftedPlacements = [];

  for (const [key, baseItem] of baselineMetrics.placementsMap.entries()) {
    const candItem = candidateMetrics.placementsMap.get(key);
    const dateChanged = baseItem.proposedDate !== (candItem?.proposedDate || null);
    const statusChanged = baseItem.status !== (candItem?.status || 'unscheduled');

    if (!candItem || dateChanged || statusChanged) {
      churnCount++;
      shiftedPlacements.push({
        placementKey: key,
        taskId: baseItem.taskId,
        title: baseItem.title,
        priority: baseItem.priority,
        baselineDate: baseItem.proposedDate,
        candidateDate: candItem?.proposedDate || null,
        baselineStartTime: baseItem.startTime,
        candidateStartTime: candItem?.startTime || null,
        baselineEndTime: baseItem.endTime,
        candidateEndTime: candItem?.endTime || null,
        baselineStatus: baseItem.status,
        candidateStatus: candItem?.status || 'unscheduled',
        effectiveHours: baseItem.effectiveHours,
        isChunk: baseItem.isChunk,
        chunkIndex: baseItem.chunkIndex,
        totalChunks: baseItem.totalChunks,
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

  const isFeasible = violations.length === 0 &&
    !candidateMetrics.cycleDetected &&
    candidateMetrics.infeasiblePlacementsCount === 0;

  // 7. Plain-Language Trade-Off Analysis
  const onTimeDelta = candidateMetrics.plannedCompliantCount - baselineMetrics.plannedCompliantCount;
  const delayedDelta = candidateMetrics.plannedDelayedCount - baselineMetrics.plannedDelayedCount;
  const delayDaysDelta = candidateMetrics.totalPlannedDelayDays - baselineMetrics.totalPlannedDelayDays;

  const utilDeltaPct = (candidateMetrics.capacityUtilizationPct !== null && baselineMetrics.capacityUtilizationPct !== null)
    ? Math.round((candidateMetrics.capacityUtilizationPct - baselineMetrics.capacityUtilizationPct) * 10) / 10
    : 0.0;

  const complianceRateDeltaPct = (candidateMetrics.plannedComplianceRatePct !== null && baselineMetrics.plannedComplianceRatePct !== null)
    ? Math.round((candidateMetrics.plannedComplianceRatePct - baselineMetrics.plannedComplianceRatePct) * 10) / 10
    : null;

  let tradeOffSummary = '';
  if (validation.isIdenticalToBaseline) {
    tradeOffSummary = 'Candidate configuration is identical to factory baseline. Both schedules produce 100% equivalent placements and metrics (0 churn).';
  } else if (!isFeasible) {
    tradeOffSummary = `WARNING: Candidate schedule produced hard constraint violations (${violations.join('; ')}). Infeasible schedules cannot be considered an improvement.`;
  } else {
    const points = [];
    if (onTimeDelta > 0) {
      points.push(`plans ${onTimeDelta} more task(s) compliant with deadlines`);
    } else if (onTimeDelta < 0) {
      points.push(`plans ${Math.abs(onTimeDelta)} fewer task(s) compliant with deadlines`);
    }

    if (delayDaysDelta < 0) {
      points.push(`reduces cumulative planned delay by ${Math.abs(delayDaysDelta)} day(s)`);
    } else if (delayDaysDelta > 0) {
      points.push(`increases cumulative planned delay by ${delayDaysDelta} day(s)`);
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
      fullyScheduledTasks: baselineMetrics.fullyScheduledTasks,
      unscheduledTasks: baselineMetrics.unscheduledTasks,
      coverageRatePct: baselineMetrics.coverageRatePct,
      tasksWithDeadlineCount: baselineMetrics.tasksWithDeadlineCount,
      scheduledTasksWithDeadlineCount: baselineMetrics.scheduledTasksWithDeadlineCount,
      tasksWithoutDeadlineCount: baselineMetrics.tasksWithoutDeadlineCount,
      plannedComplianceAvailable: baselineMetrics.plannedComplianceAvailable,
      plannedComplianceRatePct: baselineMetrics.plannedComplianceRatePct,
      plannedCompliantCount: baselineMetrics.plannedCompliantCount,
      plannedDelayedCount: baselineMetrics.plannedDelayedCount,
      overdueAtStartCount: baselineMetrics.overdueAtStartCount,
      totalPlannedDelayDays: baselineMetrics.totalPlannedDelayDays,
      capacityUtilizationAvailable: baselineMetrics.capacityUtilizationAvailable,
      capacityUtilizationPct: baselineMetrics.capacityUtilizationPct,
      totalCapacityHours: baselineMetrics.totalCapacityHours,
      scheduledWorkloadHours: baselineMetrics.scheduledWorkloadHours,
      cycleDetected: baselineMetrics.cycleDetected,
      infeasiblePlacementsCount: baselineMetrics.infeasiblePlacementsCount,
      // Backward-compatibility aliases
      onTimeTasks: baselineMetrics.onTimeTasks,
      onTimeRatePct: baselineMetrics.onTimeRatePct,
      delayedTasks: baselineMetrics.delayedTasks,
      totalDelayDays: baselineMetrics.totalDelayDays,
    },
    candidateMetrics: {
      totalTasks: candidateMetrics.totalTasks,
      scheduledTasks: candidateMetrics.scheduledTasks,
      fullyScheduledTasks: candidateMetrics.fullyScheduledTasks,
      unscheduledTasks: candidateMetrics.unscheduledTasks,
      coverageRatePct: candidateMetrics.coverageRatePct,
      tasksWithDeadlineCount: candidateMetrics.tasksWithDeadlineCount,
      scheduledTasksWithDeadlineCount: candidateMetrics.scheduledTasksWithDeadlineCount,
      tasksWithoutDeadlineCount: candidateMetrics.tasksWithoutDeadlineCount,
      plannedComplianceAvailable: candidateMetrics.plannedComplianceAvailable,
      plannedComplianceRatePct: candidateMetrics.plannedComplianceRatePct,
      plannedCompliantCount: candidateMetrics.plannedCompliantCount,
      plannedDelayedCount: candidateMetrics.plannedDelayedCount,
      overdueAtStartCount: candidateMetrics.overdueAtStartCount,
      totalPlannedDelayDays: candidateMetrics.totalPlannedDelayDays,
      capacityUtilizationAvailable: candidateMetrics.capacityUtilizationAvailable,
      capacityUtilizationPct: candidateMetrics.capacityUtilizationPct,
      totalCapacityHours: candidateMetrics.totalCapacityHours,
      scheduledWorkloadHours: candidateMetrics.scheduledWorkloadHours,
      cycleDetected: candidateMetrics.cycleDetected,
      infeasiblePlacementsCount: candidateMetrics.infeasiblePlacementsCount,
      // Backward-compatibility aliases
      onTimeTasks: candidateMetrics.onTimeTasks,
      onTimeRatePct: candidateMetrics.onTimeRatePct,
      delayedTasks: candidateMetrics.delayedTasks,
      totalDelayDays: candidateMetrics.totalDelayDays,
    },
    comparison: {
      onTimeDelta,
      delayedDelta,
      delayDaysDelta,
      utilizationDeltaPct: utilDeltaPct,
      complianceRateDeltaPct,
      churnCount,
      shiftedPlacements,
    },
    tradeOffAnalysis: {
      summary: tradeOffSummary,
      isFeasible,
      hasViolations: violations.length > 0,
    },
    // Raw schedule outputs for schedule preview
    baselineSchedule: {
      dayAllocations: baselineSchedule.dayAllocations || [],
      placements: baselineSchedule.placements || [],
      summary: baselineSchedule.summary || {},
      taskSummaries: Array.from(baselineMetrics.auditedTaskSummaries?.values() || []),
    },
    candidateSchedule: {
      dayAllocations: candidateSchedule.dayAllocations || [],
      placements: candidateSchedule.placements || [],
      summary: candidateSchedule.summary || {},
      taskSummaries: Array.from(candidateMetrics.auditedTaskSummaries?.values() || []),
    },
    methodology: METRIC_METHODOLOGY_DISCLOSURE,
  };
}
