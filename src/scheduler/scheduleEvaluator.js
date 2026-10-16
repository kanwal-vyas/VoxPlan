/**
 * VoxPlan Schedule Quality Evaluation & Benchmarking Module (Phase 4, Stage 3).
 *
 * Implements deterministic, mathematically sound quality evaluation separate from
 * React UI components and separate from the production scheduling engine.
 *
 * Evaluates schedule quality across 7 core dimensions:
 * 1. Task Coverage: Account for 100% of input tasks (scheduled, blocked, manual, unscheduled).
 * 2. Deadline Feasibility: On-time proportion, overdue recovery, average days delayed, impossible deadlines.
 * 3. Dependency Correctness: Satisfied, violated, blocked, and cyclic dependencies.
 * 4. Capacity Compliance: Total workload vs available capacity, zero daily overruns.
 * 5. Workload Balance: Daily workload distribution, standard deviation, and Coefficient of Variation (CV).
 * 6. Planning Horizon: Within-horizon coverage vs horizon-exhausted tasks.
 * 7. Schedule Stability: Churn rate and date shifts under small input perturbations.
 *
 * Comparative Strategies:
 * - Adaptive (Multi-objective: DAG depth, overdue recovery, EDF curve, priority tiers, guarded risk).
 * - Earliest Deadline First (EDF) (Ranks purely by deadline urgency).
 * - Priority-First (Ranks purely by task priority: High > Medium > Low).
 *
 * All strategies execute against identical hard constraints (Kahn's DAG ready-queue, working hours,
 * daily capacity limits, oversized task isolation, weekend rollover) ensuring fair, apples-to-apples comparison.
 */

import {
  generateAdaptiveSchedule,
  parseDateISO,
  formatDateISO,
  isWorkingDay,
  DEFAULT_WORKING_DAYS,
} from './adaptiveScheduler.js';

/**
 * Calculates calendar day difference between two ISO date strings (d2 - d1 in days).
 * @param {string} d1 YYYY-MM-DD
 * @param {string} d2 YYYY-MM-DD
 * @returns {number|null}
 */
export function getCalendarDaysDiff(d1, d2) {
  const p1 = parseDateISO(d1);
  const p2 = parseDateISO(d2);
  if (!p1 || !p2) return null;
  return Math.round((p2.getTime() - p1.getTime()) / (1000 * 3600 * 24));
}

/**
 * Checks whether a proposed date satisfies a task's deadline,
 * taking into account non-working days (e.g. Sunday deadline satisfied on Friday).
 *
 * @param {string} proposedDate YYYY-MM-DD
 * @param {string} dueDate YYYY-MM-DD
 * @param {number[]} workingDays
 * @returns {boolean}
 */
export function isDeadlineSatisfied(proposedDate, dueDate, workingDays = DEFAULT_WORKING_DAYS) {
  if (!proposedDate || !dueDate) return false;
  if (proposedDate <= dueDate) return true;

  // If dueDate falls on a non-working day, check if proposedDate is the immediately preceding working day
  if (!isWorkingDay(dueDate, workingDays)) {
    const dueParsed = parseDateISO(dueDate);
    if (!dueParsed) return false;
    let prevWorkingDateStr = null;
    for (let back = 1; back <= 3; back++) {
      const candidate = new Date(dueParsed);
      candidate.setDate(candidate.getDate() - back);
      const candStr = formatDateISO(candidate);
      if (isWorkingDay(candStr, workingDays)) {
        prevWorkingDateStr = candStr;
        break;
      }
    }
    if (prevWorkingDateStr && proposedDate <= prevWorkingDateStr) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates the quality of a generated schedule against the original input tasks.
 *
 * @param {object} schedule Output object from generateAdaptiveSchedule
 * @param {object[]} inputTasks Raw input tasks collection
 * @param {object} [options={}]
 * @returns {object} Comprehensive evaluation report
 */
export function evaluateSchedule(schedule, inputTasks = [], options = {}) {
  const workingDays = options.workingDays || DEFAULT_WORKING_DAYS;

  // Filter eligible tasks (open, uncompleted tasks with valid id)
  const eligibleTasks = (inputTasks || []).filter(
    (t) => t && typeof t === 'object' && t.id && !t.completed
  );
  const totalTasks = eligibleTasks.length;

  if (!schedule || !Array.isArray(schedule.proposedPlacements)) {
    return {
      isValid: false,
      error: 'Invalid or missing schedule object',
      taskCoverage: { totalTasks, scheduledCount: 0, invariantHolds: totalTasks === 0 },
    };
  }

  const placements = schedule.proposedPlacements;
  const placementMap = new Map();
  for (const p of placements) {
    if (p && p.taskId) placementMap.set(p.taskId, p);
  }

  // 1. Task Coverage Analysis
  let scheduledCount = 0;
  let blockedCount = 0;
  let oversizedCount = 0;
  let unscheduledCount = 0;

  for (const t of eligibleTasks) {
    const p = placementMap.get(t.id);
    if (!p) {
      unscheduledCount++;
      continue;
    }

    if (p.status === 'blocked_by_dependency') {
      blockedCount++;
    } else if (p.status === 'oversized_exceeds_capacity') {
      oversizedCount++;
    } else if (p.status === 'unscheduled') {
      unscheduledCount++;
    } else if (p.proposedDate !== null) {
      scheduledCount++;
    } else {
      unscheduledCount++;
    }
  }

  const accountedCount = scheduledCount + blockedCount + oversizedCount + unscheduledCount;
  const invariantHolds = accountedCount === totalTasks;

  const taskCoverage = {
    totalTasks,
    scheduledCount,
    scheduledRate: totalTasks > 0 ? Math.round((scheduledCount / totalTasks) * 1000) / 1000 : 0,
    blockedCount,
    blockedRate: totalTasks > 0 ? Math.round((blockedCount / totalTasks) * 1000) / 1000 : 0,
    oversizedCount,
    oversizedRate: totalTasks > 0 ? Math.round((oversizedCount / totalTasks) * 1000) / 1000 : 0,
    unscheduledCount,
    unscheduledRate: totalTasks > 0 ? Math.round((unscheduledCount / totalTasks) * 1000) / 1000 : 0,
    accountedCount,
    invariantHolds,
  };

  // 2. Deadline Feasibility Analysis
  const tasksWithDeadline = eligibleTasks.filter((t) => t.dueDate && formatDateISO(t.dueDate));
  const deadlineCount = tasksWithDeadline.length;

  let onTimeCount = 0;
  let lateCount = 0;
  let wasOverdueCount = 0;
  let impossibleDeadlinesCount = 0;
  let totalDaysDelayed = 0;
  let maxDaysDelayed = 0;

  const startDateStr = schedule.summary?.startDate || formatDateISO(new Date());

  for (const t of tasksWithDeadline) {
    const p = placementMap.get(t.id);
    const dueDateISO = formatDateISO(t.dueDate);

    // Check if task was already overdue before schedule start
    const daysFromStart = getCalendarDaysDiff(startDateStr, dueDateISO);
    const isOverdueAtStart = daysFromStart !== null && daysFromStart < 0;
    if (isOverdueAtStart) {
      wasOverdueCount++;
    }

    if (!p || p.proposedDate === null) {
      impossibleDeadlinesCount++;
      continue;
    }

    const onTime = isDeadlineSatisfied(p.proposedDate, dueDateISO, workingDays);
    if (onTime) {
      onTimeCount++;
    } else {
      lateCount++;
      const daysLate = Math.max(0, getCalendarDaysDiff(dueDateISO, p.proposedDate) || 0);
      totalDaysDelayed += daysLate;
      maxDaysDelayed = Math.max(maxDaysDelayed, daysLate);
    }
  }

  const deadlineFeasibility = {
    tasksWithDeadline: deadlineCount,
    onTimeCount,
    onTimeRate: deadlineCount > 0 ? Math.round((onTimeCount / deadlineCount) * 1000) / 1000 : null,
    lateCount,
    lateRate: deadlineCount > 0 ? Math.round((lateCount / deadlineCount) * 1000) / 1000 : null,
    wasOverdueCount,
    impossibleDeadlinesCount,
    totalDaysDelayed,
    averageDaysDelayed: lateCount > 0 ? Math.round((totalDaysDelayed / lateCount) * 10) / 10 : 0,
    maxDaysDelayed,
  };

  // 3. Dependency Correctness Analysis
  let totalDeclaredDependencies = 0;
  let satisfiedCount = 0;
  let violatedCount = 0;
  let blockedDepsCount = 0;

  const inputTaskMap = new Map();
  for (const t of (inputTasks || [])) {
    if (t && t.id) inputTaskMap.set(t.id, t);
  }

  for (const t of eligibleTasks) {
    const rawDeps = Array.isArray(t.dependencies) ? t.dependencies : [];
    const placement = placementMap.get(t.id);

    for (const pId of rawDeps) {
      totalDeclaredDependencies++;
      const parentTask = inputTaskMap.get(pId);

      // Completed prerequisite is satisfied by definition
      if (parentTask && parentTask.completed) {
        satisfiedCount++;
        continue;
      }

      const parentPlacement = placementMap.get(pId);

      // If child is blocked or parent is blocked/missing/unscheduled
      if (!parentPlacement || parentPlacement.proposedDate === null || !placement || placement.proposedDate === null) {
        blockedDepsCount++;
        continue;
      }

      // Check dates
      if (placement.proposedDate >= parentPlacement.proposedDate) {
        satisfiedCount++;
      } else {
        violatedCount++;
      }
    }
  }

  const cycles = schedule.summary?.cycles || [];
  const dependencyCorrectness = {
    totalDeclaredDependencies,
    satisfiedCount,
    violatedCount,
    blockedDepsCount,
    cyclesCount: cycles.length,
    cycles,
    integrityRate: (satisfiedCount + violatedCount) > 0
      ? Math.round((satisfiedCount / (satisfiedCount + violatedCount)) * 1000) / 1000
      : 1.0,
  };

  // 4. Capacity Compliance & Workload Utilization
  const dayAllocations = Array.isArray(schedule.dayAllocations) ? schedule.dayAllocations : [];
  const workingDaysAllocations = dayAllocations.filter((d) => d.isWorkingDay);

  let totalWorkloadHours = 0;
  let totalCapacityHours = 0;
  let overrunDaysCount = 0;
  let utilizedDaysCount = 0;

  for (const d of workingDaysAllocations) {
    totalWorkloadHours += d.totalHours || 0;
    totalCapacityHours += d.capacityHours || 0;
    if (d.totalHours > 0) utilizedDaysCount++;
    if (d.totalHours > d.capacityHours + 0.001) {
      overrunDaysCount++;
    }
  }

  totalWorkloadHours = Math.round(totalWorkloadHours * 10) / 10;
  totalCapacityHours = Math.round(totalCapacityHours * 10) / 10;

  const capacityUtilizationPercent = totalCapacityHours > 0
    ? Math.round((totalWorkloadHours / totalCapacityHours) * 1000) / 10
    : 0;

  const capacityCompliance = {
    totalWorkloadHours,
    totalCapacityHours,
    capacityUtilizationPercent,
    overrunDaysCount,
    utilizedDaysCount,
    totalWorkingDays: workingDaysAllocations.length,
    hasOverrunViolation: overrunDaysCount > 0,
  };

  // 5. Workload Balance Analysis (Active Days Imbalance Metric)
  const activeDayHours = workingDaysAllocations
    .map((d) => d.totalHours || 0)
    .filter((h) => h > 0);

  let meanDailyHours = 0;
  let stdDevDailyHours = 0;
  let imbalanceCV = 0;
  let peakToAverageRatio = 1.0;
  let maxDailyHours = 0;
  let minDailyHours = 0;

  if (activeDayHours.length > 0) {
    const sum = activeDayHours.reduce((acc, h) => acc + h, 0);
    meanDailyHours = Math.round((sum / activeDayHours.length) * 100) / 100;
    maxDailyHours = Math.max(...activeDayHours);
    minDailyHours = Math.min(...activeDayHours);

    const variance = activeDayHours.reduce((acc, h) => acc + Math.pow(h - meanDailyHours, 2), 0) / activeDayHours.length;
    stdDevDailyHours = Math.round(Math.sqrt(variance) * 100) / 100;

    imbalanceCV = meanDailyHours > 0
      ? Math.round((stdDevDailyHours / meanDailyHours) * 1000) / 1000
      : 0;

    peakToAverageRatio = meanDailyHours > 0
      ? Math.round((maxDailyHours / meanDailyHours) * 100) / 100
      : 1.0;
  }

  const workloadBalance = {
    activeDaysCount: activeDayHours.length,
    meanDailyHours,
    stdDevDailyHours,
    imbalanceCV, // Coefficient of Variation: Lower = more evenly distributed workload
    peakToAverageRatio,
    maxDailyHours,
    minDailyHours,
  };

  // 6. Planning Horizon Compliance
  const horizonDays = schedule.summary?.horizonDays || options.horizonDays || 14;
  const withinHorizonCount = scheduledCount;
  const beyondHorizonCount = unscheduledCount;

  const planningHorizon = {
    horizonDays,
    withinHorizonCount,
    beyondHorizonCount,
    horizonCoverageRate: totalTasks > 0 ? Math.round((withinHorizonCount / totalTasks) * 1000) / 1000 : 0,
  };

  return {
    strategy: schedule.strategy || schedule.summary?.strategy || 'adaptive',
    scheduleId: schedule.summary?.scheduleId || 'unknown',
    taskCoverage,
    deadlineFeasibility,
    dependencyCorrectness,
    capacityCompliance,
    workloadBalance,
    planningHorizon,
    summary: schedule.summary || {},
  };
}

/**
 * Evaluates the stability (churn rate) between two schedules (e.g. baseline vs perturbed).
 *
 * @param {object} scheduleA Original schedule
 * @param {object} scheduleB Perturbed schedule
 * @returns {object} Stability metrics
 */
export function evaluateScheduleStability(scheduleA, scheduleB) {
  if (!scheduleA || !scheduleB) {
    return {
      isValid: false,
      churnRate: 0,
      shiftedCount: 0,
      commonCount: 0,
      dateDifferences: [],
    };
  }

  const placementsA = scheduleA.proposedPlacements || [];
  const placementsB = scheduleB.proposedPlacements || [];

  const mapA = new Map();
  for (const p of placementsA) {
    if (p && p.taskId && p.proposedDate !== null) {
      mapA.set(p.taskId, p.proposedDate);
    }
  }

  const mapB = new Map();
  for (const p of placementsB) {
    if (p && p.taskId && p.proposedDate !== null) {
      mapB.set(p.taskId, p.proposedDate);
    }
  }

  // Common scheduled tasks present in both schedules
  const commonTaskIds = [];
  const dateDifferences = [];

  for (const [taskId, dateA] of mapA.entries()) {
    if (mapB.has(taskId)) {
      commonTaskIds.push(taskId);
      const dateB = mapB.get(taskId);
      if (dateA !== dateB) {
        const daysShift = getCalendarDaysDiff(dateA, dateB);
        dateDifferences.push({
          taskId,
          dateA,
          dateB,
          daysShift,
        });
      }
    }
  }

  const commonCount = commonTaskIds.length;
  const shiftedCount = dateDifferences.length;
  const churnRate = commonCount > 0
    ? Math.round((shiftedCount / commonCount) * 1000) / 1000
    : 0;

  return {
    isValid: true,
    commonCount,
    shiftedCount,
    churnRate, // 0.0 = completely stable, 1.0 = all dates shifted
    dateDifferences,
  };
}

/**
 * Runs a comparative benchmark across the 3 strategies: Adaptive, EDF, Priority-First.
 * Evaluates each schedule with identical inputs and constraint solving.
 *
 * @param {object[]} tasks Input tasks
 * @param {object} [options={}] Scheduling options
 * @returns {object} Comprehensive strategy comparison report
 */
export function compareScheduleStrategies(tasks = [], options = {}) {
  // Strategy 1: Adaptive
  const adaptiveSchedule = generateAdaptiveSchedule(tasks, {
    ...options,
    strategy: 'adaptive',
  });
  const adaptiveEval = evaluateSchedule(adaptiveSchedule, tasks, options);

  // Strategy 2: Earliest Deadline First (EDF)
  const edfSchedule = generateAdaptiveSchedule(tasks, {
    ...options,
    strategy: 'edf',
  });
  const edfEval = evaluateSchedule(edfSchedule, tasks, options);

  // Strategy 3: Priority-First
  const prioritySchedule = generateAdaptiveSchedule(tasks, {
    ...options,
    strategy: 'priority_first',
  });
  const priorityEval = evaluateSchedule(prioritySchedule, tasks, options);

  // Generate explicit trade-off narrative
  const tradeoffs = [];

  // Compare Deadline Feasibility
  const adaptiveOnTime = adaptiveEval.deadlineFeasibility.onTimeRate ?? 0;
  const edfOnTime = edfEval.deadlineFeasibility.onTimeRate ?? 0;
  const priorityOnTime = priorityEval.deadlineFeasibility.onTimeRate ?? 0;

  if (edfOnTime > adaptiveOnTime) {
    tradeoffs.push(
      `EDF achieved higher deadline feasibility (${(edfOnTime * 100).toFixed(1)}% vs ${(adaptiveOnTime * 100).toFixed(1)}% for Adaptive) because it ignores task priority tiers to strictly pull forward earliest dates.`
    );
  } else if (adaptiveOnTime > edfOnTime) {
    tradeoffs.push(
      `Adaptive achieved higher deadline feasibility (${(adaptiveOnTime * 100).toFixed(1)}% vs ${(edfOnTime * 100).toFixed(1)}% for EDF) through multi-objective overdue recovery and topological unblocking.`
    );
  }

  if (priorityOnTime < adaptiveOnTime) {
    tradeoffs.push(
      `Priority-First missed more deadlines (${(priorityOnTime * 100).toFixed(1)}% on-time vs ${(adaptiveOnTime * 100).toFixed(1)}% for Adaptive) because it placed distant-deadline high-priority tasks before near-deadline lower-priority tasks.`
    );
  }

  // Compare Workload Balance
  const adaptiveCV = adaptiveEval.workloadBalance.imbalanceCV;
  const edfCV = edfEval.workloadBalance.imbalanceCV;
  if (adaptiveCV < edfCV) {
    tradeoffs.push(
      `Adaptive demonstrated more balanced daily workload pacing (CV: ${adaptiveCV.toFixed(3)} vs ${edfCV.toFixed(3)} for EDF).`
    );
  }

  // Hard constraints check
  const allHardConstraintsSatisfied =
    adaptiveEval.dependencyCorrectness.violatedCount === 0 &&
    edfEval.dependencyCorrectness.violatedCount === 0 &&
    priorityEval.dependencyCorrectness.violatedCount === 0 &&
    !adaptiveEval.capacityCompliance.hasOverrunViolation &&
    !edfEval.capacityCompliance.hasOverrunViolation &&
    !priorityEval.capacityCompliance.hasOverrunViolation;

  return {
    scenario: options.scenarioName || 'Task Backlog Comparison',
    inputTaskCount: tasks.length,
    allHardConstraintsSatisfied,
    strategies: {
      adaptive: adaptiveEval,
      edf: edfEval,
      priority_first: priorityEval,
    },
    schedules: {
      adaptive: adaptiveSchedule,
      edf: edfSchedule,
      priority_first: prioritySchedule,
    },
    tradeoffs,
  };
}
