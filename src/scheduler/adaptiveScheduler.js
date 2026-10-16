/**
 * VoxPlan Deterministic Adaptive Scheduling Engine.
 *
 * Implements local-first, deterministic task scheduling that balances:
 * 1. Hard deadlines (Earliest Deadline First with overdue prioritization).
 * 2. Supported task dependencies (DAG topological chain resolution).
 * 3. Personal adjusted duration estimates (from personalModel.js) with cold-start fallback.
 * 4. User-configurable working hours and daily focused capacity.
 * 5. Guarded completion-risk estimates as a secondary heuristic signal.
 *
 * Guarantees:
 * - 100% Deterministic: identical inputs produce identical schedules.
 * - Pure Function: input task objects and collections are never mutated.
 * - Zero Silent Discards: impossible deadlines or un-schedulable tasks are explicitly flagged.
 * - Non-Destructive: generates proposals only; does not alter saved task state without user consent.
 */

import { estimateTaskDuration } from '../telemetry/personalModel.js';

export const DEFAULT_DAILY_CAPACITY_HOURS = 6.0;
export const DEFAULT_HORIZON_DAYS = 14;
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]; // Mon - Fri (0 = Sun, 6 = Sat)
export const DEFAULT_TASK_FALLBACK_HOURS = 1.0;

/**
 * Normalizes a date into YYYY-MM-DD string.
 * @param {string|Date|number} dateInput
 * @returns {string}
 */
export function formatDateISO(dateInput) {
  if (!dateInput) return '';
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses YYYY-MM-DD safely into a local Date without UTC offset shifts.
 * @param {string} isoStr
 * @returns {Date|null}
 */
export function parseDateISO(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return null;
  const parts = isoStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Adds calendar days to an ISO date string.
 * @param {string} dateStr
 * @param {number} numDays
 * @returns {string}
 */
export function addDaysISO(dateStr, numDays) {
  const parsed = parseDateISO(dateStr);
  if (!parsed) return dateStr;
  parsed.setDate(parsed.getDate() + numDays);
  return formatDateISO(parsed);
}

/**
 * Checks whether a given ISO date falls on a configured working day.
 * @param {string} dateStr
 * @param {number[]} workingDays
 * @returns {boolean}
 */
export function isWorkingDay(dateStr, workingDays = DEFAULT_WORKING_DAYS) {
  const parsed = parseDateISO(dateStr);
  if (!parsed) return false;
  return workingDays.includes(parsed.getDay());
}

/**
 * Analyzes dependency relations among tasks and detects cycles.
 *
 * @param {object[]} tasks Array of task objects
 * @returns {{
 *   validDependencies: Map<string, string[]>,
 *   cycles: string[][],
 *   taskDepths: Map<string, number>,
 *   missingDependencies: Map<string, string[]>,
 * }}
 */
export function analyzeTaskDependencies(tasks = []) {
  const taskMap = new Map();
  for (const t of tasks) {
    if (t && t.id) taskMap.set(t.id, t);
  }

  const validDependencies = new Map();
  const missingDependencies = new Map();

  for (const t of tasks) {
    if (!t || !t.id) continue;
    const rawDeps = Array.isArray(t.dependencies) ? t.dependencies : [];
    const valid = [];
    const missing = [];

    for (const depId of rawDeps) {
      if (typeof depId === 'string' && depId !== t.id) {
        if (taskMap.has(depId)) {
          // If prerequisite is already completed, it does not constrain future scheduling
          const depTask = taskMap.get(depId);
          if (!depTask.completed) {
            valid.push(depId);
          }
        } else {
          missing.push(depId);
        }
      }
    }

    validDependencies.set(t.id, valid);
    if (missing.length > 0) {
      missingDependencies.set(t.id, missing);
    }
  }

  // Cycle detection via Depth-First Search with recursion stack (3-color coloring)
  // 0 = unvisited, 1 = visiting, 2 = visited
  const visitState = new Map();
  const cycles = [];
  const parentTrace = new Map();

  function dfs(taskId, path = []) {
    visitState.set(taskId, 1);
    const deps = validDependencies.get(taskId) || [];

    for (const depId of deps) {
      const state = visitState.get(depId) || 0;
      if (state === 1) {
        // Cycle detected
        const cycleStartIndex = path.indexOf(depId);
        const cycle = cycleStartIndex >= 0 ? path.slice(cycleStartIndex) : [depId, taskId];
        cycles.push([...cycle, depId]);
      } else if (state === 0) {
        parentTrace.set(depId, taskId);
        dfs(depId, [...path, depId]);
      }
    }

    visitState.set(taskId, 2);
  }

  for (const t of tasks) {
    if (t && t.id && (visitState.get(t.id) || 0) === 0) {
      dfs(t.id, [t.id]);
    }
  }

  // Compute dependency depth (topological chain length)
  const taskDepths = new Map();

  function getDepth(taskId, visited = new Set()) {
    if (taskDepths.has(taskId)) return taskDepths.get(taskId);
    if (visited.has(taskId)) return 0; // Break cycle loop
    visited.add(taskId);

    const deps = validDependencies.get(taskId) || [];
    if (deps.length === 0) {
      taskDepths.set(taskId, 0);
      return 0;
    }

    let maxDepth = 0;
    for (const depId of deps) {
      maxDepth = Math.max(maxDepth, getDepth(depId, new Set(visited)) + 1);
    }

    taskDepths.set(taskId, maxDepth);
    return maxDepth;
  }

  for (const t of tasks) {
    if (t && t.id) {
      getDepth(t.id);
    }
  }

  return {
    validDependencies,
    cycles,
    taskDepths,
    missingDependencies,
  };
}

/**
 * Builds candidate calendar working day slots for a given horizon.
 *
 * @param {string} startDateStr Start date ISO
 * @param {number} horizonDays Total calendar days
 * @param {number} dailyCapacityHours Daily working capacity
 * @param {number[]} workingDays List of active weekdays (0=Sun, 6=Sat)
 * @returns {Array<{
 *   date: string,
 *   dayOfWeek: number,
 *   dayName: string,
 *   isWorkingDay: boolean,
 *   capacityHours: number,
 *   remainingHours: number,
 *   assignedTasks: Array<{ taskId: string, hours: number }>,
 * }>}
 */
export function buildCalendarSlots(
  startDateStr,
  horizonDays = DEFAULT_HORIZON_DAYS,
  dailyCapacityHours = DEFAULT_DAILY_CAPACITY_HOURS,
  workingDays = DEFAULT_WORKING_DAYS
) {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const slots = [];
  const baseDate = parseDateISO(startDateStr) || new Date();

  for (let i = 0; i < horizonDays; i++) {
    const cur = new Date(baseDate);
    cur.setDate(cur.getDate() + i);
    const dateStr = formatDateISO(cur);
    const dayOfWeek = cur.getDay();
    const active = workingDays.includes(dayOfWeek);

    slots.push({
      date: dateStr,
      dayIndex: i,
      dayOfWeek,
      dayName: dayNames[dayOfWeek],
      isWorkingDay: active,
      capacityHours: active ? dailyCapacityHours : 0.0,
      remainingHours: active ? dailyCapacityHours : 0.0,
      assignedTasks: [],
    });
  }

  return slots;
}

/**
 * Computes deterministic prioritization score for task ordering.
 * Higher score = higher placement priority.
 *
 * Ordering Rules:
 * 1. Prerequisite Chain: Tasks that block other tasks must be scheduled first.
 * 2. Overdue Deadlines: Tasks with deadlines already in the past have highest urgency.
 * 3. Earliest Deadline First (EDF): Shorter remaining calendar windows take precedence.
 * 4. Task Priority: High (300) > Medium (200) > Low (100).
 * 5. Guarded Delay Risk: High-risk tasks receive urgency boost to avoid late sprint crunches.
 * 6. Deterministic Tie-Breaker: Alphabetical sorting on taskId.
 */
export function calculateTaskPriorityScore(
  task,
  asOfDateStr,
  dependencyDepths,
  predictionsMap = {}
) {
  let score = 0;

  // 1. Dependency depth penalty: Prerequisite tasks have lower depth and MUST be scheduled earlier
  // Tasks with depth 0 have no prerequisites; tasks with depth 2 depend on depth 1 and 0.
  // We prioritize tasks that are prerequisites of others by giving higher score to depth 0
  const depth = dependencyDepths.get(task.id) || 0;
  score -= depth * 1000;

  // 2. Deadline Urgency (EDF)
  if (task.dueDate) {
    const startParsed = parseDateISO(asOfDateStr);
    const dueParsed = parseDateISO(task.dueDate);

    if (startParsed && dueParsed) {
      const daysDiff = Math.round((dueParsed.getTime() - startParsed.getTime()) / (1000 * 3600 * 24));
      if (daysDiff < 0) {
        // Overdue task: highest urgency boost (e.g. 5000 + abs(daysDiff)*100)
        score += 5000 + Math.min(1000, Math.abs(daysDiff) * 100);
      } else {
        // Upcoming deadline: fewer days remaining -> higher score (clamped up to 30 days)
        const urgency = Math.max(0, 30 - daysDiff) * 50;
        score += urgency;
      }
    }
  } else {
    // Tasks without deadlines have lowest urgency
    score -= 500;
  }

  // 3. Task Priority Weight
  const priority = String(task.priority || '').toLowerCase();
  if (priority === 'high') {
    score += 300;
  } else if (priority === 'low') {
    score += 100;
  } else {
    score += 200; // Medium
  }

  // 4. Secondary Guarded Risk Urgency Boost
  const riskPred = predictionsMap[task.id];
  if (riskPred) {
    if (riskPred.risk === 'HIGH') {
      score += 60;
    } else if (riskPred.risk === 'MEDIUM') {
      score += 25;
    }
  }

  return score;
}

/**
 * Main Deterministic Adaptive Scheduling Engine.
 *
 * @param {object[]} tasks Input task collection
 * @param {object} [options={}] Scheduling options and constraints
 * @param {string} [options.startDate] Calendar start date YYYY-MM-DD (defaults to today)
 * @param {number} [options.horizonDays=14] Planning window in calendar days
 * @param {number} [options.dailyCapacityHours=6.0] Available focused work hours per day
 * @param {number[]} [options.workingDays=[1,2,3,4,5]] Working weekdays
 * @param {object|null} [options.personalDurationModel=null] Duration model for personalized effort estimates
 * @param {object} [options.predictionsMap={}] Risk predictions mapping (taskId -> pred)
 * @param {boolean} [options.allowOverdueScheduling=true] Whether to schedule overdue tasks
 * @returns {{
 *   proposedPlacements: Array<object>,
 *   dayAllocations: Array<object>,
 *   summary: object,
 * }}
 */
export function generateAdaptiveSchedule(tasks = [], options = {}) {
  const startDateStr = options.startDate
    ? formatDateISO(options.startDate)
    : formatDateISO(new Date());

  const horizonDays = typeof options.horizonDays === 'number' && options.horizonDays > 0
    ? Math.min(60, options.horizonDays)
    : DEFAULT_HORIZON_DAYS;

  const dailyCapacityHours = typeof options.dailyCapacityHours === 'number' && options.dailyCapacityHours > 0
    ? Math.min(24, options.dailyCapacityHours)
    : DEFAULT_DAILY_CAPACITY_HOURS;

  const workingDays = Array.isArray(options.workingDays) && options.workingDays.length > 0
    ? options.workingDays
    : DEFAULT_WORKING_DAYS;

  const personalDurationModel = options.personalDurationModel || null;
  const predictionsMap = options.predictionsMap || {};

  // Step 1: Filter eligible tasks (open, uncompleted tasks)
  const eligibleTasks = [];
  for (const t of tasks) {
    if (t && typeof t === 'object' && t.id && !t.completed) {
      eligibleTasks.push({ ...t });
    }
  }

  const warnings = [];

  // Step 2: Build Calendar Slots
  const calendarSlots = buildCalendarSlots(
    startDateStr,
    horizonDays,
    dailyCapacityHours,
    workingDays
  );

  // Step 3: Analyze dependencies and detect cycles
  const dependencyInfo = analyzeTaskDependencies(eligibleTasks);
  const { validDependencies, cycles, taskDepths, missingDependencies } = dependencyInfo;

  if (cycles.length > 0) {
    warnings.push(`Detected ${cycles.length} circular dependency cycle(s). Prerequisite ordering adjusted to prevent infinite loops.`);
  }

  // Record missing dependency warnings
  for (const [taskId, missingList] of missingDependencies.entries()) {
    warnings.push(`Task "${taskId}" references missing or completed prerequisite ID(s): ${missingList.join(', ')}.`);
  }

  // Step 4: Extract Effective Durations and Duration Sources
  const taskMeta = new Map();

  for (const t of eligibleTasks) {
    let effectiveHours = DEFAULT_TASK_FALLBACK_HOURS;
    let durationSource = 'default_fallback';
    let appliedRatio = 1.0;
    const rawEffort = t.estimatedEffort ?? t.estimated_effort;

    if (personalDurationModel) {
      const durEst = estimateTaskDuration(personalDurationModel, t);
      if (
        durEst &&
        durEst.predicted_duration_hours !== null &&
        durEst.predicted_duration_hours > 0 &&
        (durEst.personalization_status === 'sparse' ||
          durEst.personalization_status === 'developing' ||
          durEst.personalization_status === 'supported')
      ) {
        effectiveHours = durEst.predicted_duration_hours;
        durationSource = 'personalized';
        appliedRatio = durEst.estimation_bias_ratio;
      } else if (typeof rawEffort === 'number' && rawEffort > 0) {
        effectiveHours = rawEffort;
        durationSource = 'original_estimate';
      } else {
        warnings.push(`Task "${t.title}" (${t.id}) has no estimated effort; scheduled using default ${DEFAULT_TASK_FALLBACK_HOURS}h.`);
      }
    } else if (typeof rawEffort === 'number' && rawEffort > 0) {
      effectiveHours = rawEffort;
      durationSource = 'original_estimate';
    } else {
      warnings.push(`Task "${t.title}" (${t.id}) has no estimated effort; scheduled using default ${DEFAULT_TASK_FALLBACK_HOURS}h.`);
    }

    const priorityScore = calculateTaskPriorityScore(
      t,
      startDateStr,
      taskDepths,
      predictionsMap
    );

    taskMeta.set(t.id, {
      task: t,
      effectiveHours,
      durationSource,
      appliedRatio,
      priorityScore,
    });
  }

  // Step 5: Deterministic Task Sorting
  // Sort by priorityScore descending, with deterministic tie-breaker on task.id ascending
  const sortedTasks = [...eligibleTasks].sort((a, b) => {
    const scoreA = taskMeta.get(a.id)?.priorityScore ?? 0;
    const scoreB = taskMeta.get(b.id)?.priorityScore ?? 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    return String(a.id).localeCompare(String(b.id));
  });

  // Step 6: Day-by-Day Allocation
  const proposedPlacements = [];
  const taskAssignedSlotIndex = new Map();

  for (const t of sortedTasks) {
    const meta = taskMeta.get(t.id);
    const requiredHours = meta.effectiveHours;
    const taskConflicts = [];
    const directPrereqs = validDependencies.get(t.id) || [];

    // Determine earliest allowable calendar slot index based on prerequisites
    let minSlotIndex = 0;
    for (const prereqId of directPrereqs) {
      if (taskAssignedSlotIndex.has(prereqId)) {
        const prereqSlotIdx = taskAssignedSlotIndex.get(prereqId);
        minSlotIndex = Math.max(minSlotIndex, prereqSlotIdx);
      }
    }

    // Find the first working slot on or after minSlotIndex that can accommodate requiredHours
    let placedSlot = null;
    let placedSlotIdx = -1;

    for (let sIdx = minSlotIndex; sIdx < calendarSlots.length; sIdx++) {
      const slot = calendarSlots[sIdx];
      if (!slot.isWorkingDay) continue;

      // If slot has capacity or is empty
      if (slot.remainingHours >= requiredHours || slot.assignedTasks.length === 0) {
        placedSlot = slot;
        placedSlotIdx = sIdx;
        break;
      }
    }

    if (placedSlot) {
      // Allocate task to slot
      placedSlot.assignedTasks.push({
        taskId: t.id,
        taskTitle: t.title,
        hours: requiredHours,
      });
      placedSlot.remainingHours = Math.max(0, placedSlot.remainingHours - requiredHours);
      taskAssignedSlotIndex.set(t.id, placedSlotIdx);

      // Analyze deadline feasibility
      const proposedDate = placedSlot.date;
      const originalDueDate = t.dueDate ? formatDateISO(t.dueDate) : null;
      let status = 'on_time';
      let placementReason = `Scheduled on ${placedSlot.dayName} ${placedSlot.date} (${requiredHours.toFixed(1)}h via ${meta.durationSource})`;

      if (originalDueDate) {
        const dueParsed = parseDateISO(originalDueDate);
        const propParsed = parseDateISO(proposedDate);
        const startParsed = parseDateISO(startDateStr);

        if (dueParsed && propParsed && startParsed) {
          if (dueParsed.getTime() < startParsed.getTime()) {
            status = 'overdue_at_start';
            const overdueDays = Math.round((startParsed.getTime() - dueParsed.getTime()) / (1000 * 3600 * 24));
            taskConflicts.push(`Deadline was already overdue by ${overdueDays} day(s) at start of schedule.`);
            placementReason += ` [Overdue recovery placement]`;
          } else if (propParsed.getTime() > dueParsed.getTime()) {
            status = 'deadline_missed';
            const delayDays = Math.round((propParsed.getTime() - dueParsed.getTime()) / (1000 * 3600 * 24));
            taskConflicts.push(`Proposed date (${proposedDate}) is ${delayDays} day(s) after deadline (${originalDueDate}) due to capacity constraints.`);
            placementReason += ` [Pushed ${delayDays}d past deadline by workload volume]`;
          }
        }
      }

      if (requiredHours > dailyCapacityHours) {
        taskConflicts.push(`Task requires ${requiredHours.toFixed(1)}h, exceeding single-day focus capacity (${dailyCapacityHours}h).`);
      }

      const isDateChanged = originalDueDate !== proposedDate;

      proposedPlacements.push({
        taskId: t.id,
        taskTitle: t.title,
        originalDueDate,
        proposedDate,
        assignedDayIndex: placedSlotIdx,
        effectiveHours: requiredHours,
        durationSource: meta.durationSource,
        appliedRatio: meta.appliedRatio,
        isDateChanged,
        status,
        placementReason,
        conflicts: taskConflicts,
      });
    } else {
      // Unscheduled task: horizon capacity exhausted
      const originalDueDate = t.dueDate ? formatDateISO(t.dueDate) : null;
      taskConflicts.push(`Cannot fit within ${horizonDays}-day horizon under configured working hours (${dailyCapacityHours}h/day).`);
      warnings.push(`Task "${t.title}" (${t.id}) could not be scheduled within the ${horizonDays}-day calendar window.`);

      proposedPlacements.push({
        taskId: t.id,
        taskTitle: t.title,
        originalDueDate,
        proposedDate: null,
        assignedDayIndex: -1,
        effectiveHours: requiredHours,
        durationSource: meta.durationSource,
        appliedRatio: meta.appliedRatio,
        isDateChanged: false,
        status: 'unscheduled',
        placementReason: 'Capacity exhausted: requires additional calendar days or reduced task scope',
        conflicts: taskConflicts,
      });
    }
  }

  // Step 7: Calculate Day Allocations & Utilization
  const dayAllocations = calendarSlots.map((slot) => {
    const totalHours = slot.assignedTasks.reduce((acc, at) => acc + at.hours, 0);
    const roundedHours = Math.round(totalHours * 10) / 10;
    const utilizationPercent = slot.capacityHours > 0
      ? Math.round((roundedHours / slot.capacityHours) * 100)
      : 0;

    return {
      date: slot.date,
      dayIndex: slot.dayIndex,
      dayOfWeek: slot.dayOfWeek,
      dayName: slot.dayName,
      isWorkingDay: slot.isWorkingDay,
      totalHours: roundedHours,
      capacityHours: slot.capacityHours,
      utilizationPercent,
      tasks: [...slot.assignedTasks],
    };
  });

  // Step 8: Build Summary & Feasibility Status
  const totalEligibleTasks = eligibleTasks.length;
  const scheduledCount = proposedPlacements.filter((p) => p.status !== 'unscheduled').length;
  const unscheduledCount = proposedPlacements.filter((p) => p.status === 'unscheduled').length;
  const onTimeCount = proposedPlacements.filter((p) => p.status === 'on_time').length;
  const missedDeadlineCount = proposedPlacements.filter((p) => p.status === 'deadline_missed' || p.status === 'overdue_at_start').length;
  const dateChangesCount = proposedPlacements.filter((p) => p.isDateChanged && p.status !== 'unscheduled').length;
  const totalHours = Math.round(proposedPlacements.reduce((sum, p) => sum + p.effectiveHours, 0) * 10) / 10;

  const workingDaysList = dayAllocations.filter((d) => d.isWorkingDay);
  const averageUtilizationPercent = workingDaysList.length > 0
    ? Math.round(workingDaysList.reduce((acc, d) => acc + d.utilizationPercent, 0) / workingDaysList.length)
    : 0;

  let feasibilityStatus = 'feasible';
  if (cycles.length > 0) {
    feasibilityStatus = 'dependency_cycle';
  } else if (unscheduledCount > 0) {
    feasibilityStatus = 'capacity_exceeded';
  } else if (missedDeadlineCount > 0) {
    feasibilityStatus = 'infeasible_deadlines';
  }

  return {
    proposedPlacements,
    dayAllocations,
    summary: {
      totalEligibleTasks,
      scheduledCount,
      unscheduledCount,
      onTimeCount,
      missedDeadlineCount,
      dateChangesCount,
      totalHours,
      averageUtilizationPercent,
      feasibilityStatus,
      warnings,
    },
  };
}
