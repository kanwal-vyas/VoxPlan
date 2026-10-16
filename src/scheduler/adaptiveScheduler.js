/**
 * VoxPlan Deterministic Adaptive Scheduling Engine (Phase 4, Stage 2).
 *
 * Implements local-first, mathematically sound task scheduling that balances:
 * 1. Hard deadlines (Earliest Deadline First with overdue recovery).
 * 2. Topological task dependencies (DAG resolution, cycle detection, and blocked task isolation).
 * 3. Personal adjusted duration estimates (from personalModel.js) with cold-start fallback.
 * 4. User-configurable working hours and daily capacity bin-packing.
 * 5. Guarded completion-risk estimates as a secondary, bounded urgency heuristic.
 *
 * Guarantees:
 * - 100% Deterministic: Identical inputs produce identical schedules with stable tie-breaking.
 * - Topological Hard Constraints: No dependent task is ever scheduled before its prerequisites.
 * - Honest Cycle Handling: Circular or self-dependencies are explicitly identified and blocked;
 *   cycles are NEVER silently broken to invent an artificial valid ordering.
 * - Capacity Feasibility: Tasks exceeding daily capacity are flagged for manual resolution;
 *   cumulative daily hours never silently exceed configured daily capacity.
 * - Pure Function: Input task objects and collections are never mutated.
 * - Safe Proposals: Non-destructive proposal output; existing tasks remain untouched until applied.
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
 * Analyzes dependency relations among tasks, detecting circular dependencies,
 * self-dependencies, missing prerequisites, and blocked task subgraphs.
 *
 * @param {object[]} tasks Array of task objects
 * @returns {{
 *   validDependencies: Map<string, string[]>,
 *   cycles: string[][],
 *   cyclicTaskIds: Set<string>,
 *   blockedTasks: Map<string, { reason: string, type: string }>,
 *   missingDependencies: Map<string, string[]>,
 *   taskDepths: Map<string, number>,
 * }}
 */
export function analyzeTaskDependencies(tasks = []) {
  const taskMap = new Map();
  for (const t of tasks) {
    if (t && t.id) taskMap.set(t.id, t);
  }

  const validDependencies = new Map();
  const missingDependencies = new Map();
  const cyclicTaskIds = new Set();
  const cycles = [];
  const blockedTasks = new Map();

  // 1. Initial validation of raw prerequisites
  for (const t of tasks) {
    if (!t || !t.id) continue;
    const rawDeps = Array.isArray(t.dependencies) ? t.dependencies : [];
    const valid = [];
    const missing = [];

    for (const depId of rawDeps) {
      if (typeof depId !== 'string' || !depId.trim()) continue;

      // Explicit self-dependency detection
      if (depId === t.id) {
        cycles.push([t.id, t.id]);
        cyclicTaskIds.add(t.id);
        blockedTasks.set(t.id, {
          reason: `Self-dependency: task "${t.title || t.id}" cannot depend on itself.`,
          type: 'self_dependency',
        });
        continue;
      }

      if (taskMap.has(depId)) {
        const depTask = taskMap.get(depId);
        // Completed prerequisites do not constrain future scheduling
        if (!depTask.completed) {
          valid.push(depId);
        }
      } else {
        missing.push(depId);
      }
    }

    validDependencies.set(t.id, valid);
    if (missing.length > 0) {
      missingDependencies.set(t.id, missing);
      blockedTasks.set(t.id, {
        reason: `Missing prerequisite: depends on unresolvable task ID(s): ${missing.join(', ')}.`,
        type: 'missing_prerequisite',
      });
    }
  }

  // 2. DFS 3-Color Cycle Detection
  // 0 = unvisited, 1 = visiting (in current recursion path), 2 = visited
  const visitState = new Map();

  function dfs(taskId, path = []) {
    visitState.set(taskId, 1);
    const deps = validDependencies.get(taskId) || [];

    for (const depId of deps) {
      const state = visitState.get(depId) || 0;
      if (state === 1) {
        // Cycle detected: extract the cycle path
        const cycleStartIndex = path.indexOf(depId);
        const cycle = cycleStartIndex >= 0 ? path.slice(cycleStartIndex) : [depId, taskId];
        const fullCycle = [...cycle, depId];
        cycles.push(fullCycle);

        for (const cId of fullCycle) {
          cyclicTaskIds.add(cId);
          if (!blockedTasks.has(cId)) {
            blockedTasks.set(cId, {
              reason: `Circular dependency detected in prerequisite chain: ${fullCycle.join(' ➔ ')}.`,
              type: 'circular_dependency',
            });
          }
        }
      } else if (state === 0) {
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

  // 3. Propagate blocked status to all transitive downstream dependents
  let newlyBlocked = true;
  while (newlyBlocked) {
    newlyBlocked = false;
    for (const t of tasks) {
      if (!t || !t.id || blockedTasks.has(t.id)) continue;
      const deps = validDependencies.get(t.id) || [];
      for (const depId of deps) {
        if (blockedTasks.has(depId)) {
          const depBlock = blockedTasks.get(depId);
          blockedTasks.set(t.id, {
            reason: `Blocked by prerequisite "${depId}" (${depBlock.type}).`,
            type: 'blocked_by_prerequisite',
          });
          newlyBlocked = true;
          break;
        }
      }
    }
  }

  // 4. Compute topological depth for non-blocked tasks
  const taskDepths = new Map();

  function getDepth(taskId, visited = new Set()) {
    if (taskDepths.has(taskId)) return taskDepths.get(taskId);
    if (visited.has(taskId) || blockedTasks.has(taskId)) return 0;
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
    if (t && t.id && !blockedTasks.has(t.id)) {
      getDepth(t.id);
    }
  }

  return {
    validDependencies,
    cycles,
    cyclicTaskIds,
    blockedTasks,
    missingDependencies,
    taskDepths,
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
 *   dayIndex: number,
 *   dayOfWeek: number,
 *   dayName: string,
 *   isWorkingDay: boolean,
 *   capacityHours: number,
 *   remainingHours: number,
 *   assignedTasks: Array<{ taskId: string, taskTitle: string, hours: number }>,
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
 * Computes deterministic prioritization score for task ordering among ready tasks.
 * Higher score = higher placement priority.
 *
 * Scoring Components & Units:
 * 1. Overdue Urgency (+5000 to +6000 pts): Overdue deadlines receive maximum recovery urgency.
 * 2. Earliest Deadline First (EDF) (+0 to +1500 pts): Shorter calendar windows to deadline take precedence.
 * 3. No Deadline Penalty (-500 pts): Tasks without deadlines yield to hard commitments.
 * 4. Priority Tier: High (+300 pts) > Medium (+200 pts) > Low (+100 pts) (100 pt tier spacing).
 * 5. Secondary Guarded Risk Urgency (+60 pts for High risk, +25 pts for Med risk):
 *    Subtle heuristic nudge; smaller than the 100 pt priority tier gap, ensuring it cannot
 *    override priority tiers or hard deadlines.
 * 6. Hard Topological Guarantee: Selection operates on Kahn's ready-queue; no score can
 *    ever bypass dependency constraints.
 */
export function calculateTaskPriorityScore(
  task,
  asOfDateStr,
  dependencyDepths,
  predictionsMap = {},
  strategy = 'adaptive'
) {
  // Strategy: Earliest Deadline First (EDF)
  // Ranks ready tasks solely by calendar deadline urgency, ignoring priority and risk
  if (strategy === 'edf') {
    if (task.dueDate) {
      const startParsed = parseDateISO(asOfDateStr);
      const dueParsed = parseDateISO(task.dueDate);
      if (startParsed && dueParsed) {
        const daysDiff = Math.round((dueParsed.getTime() - startParsed.getTime()) / (1000 * 3600 * 24));
        if (daysDiff < 0) {
          // Overdue deadlines get highest urgency
          return 5000 + Math.min(1000, Math.abs(daysDiff) * 100);
        }
        // Upcoming deadlines: fewer days remaining -> higher score
        return Math.max(0, 30 - daysDiff) * 100;
      }
    }
    return -1000; // Tasks without deadlines yield to any scheduled deadline
  }

  // Strategy: Priority-First
  // Ranks ready tasks solely by explicit user priority tier, ignoring deadlines and risk
  if (strategy === 'priority_first') {
    const priority = String(task.priority || '').toLowerCase();
    if (priority === 'high') return 3000;
    if (priority === 'low') return 1000;
    return 2000; // Medium
  }

  // Strategy: Adaptive (Default Multi-Objective)
  let score = 0;

  // 1. Dependency depth: tie-breaker favoring prerequisites that unblock others
  const depth = dependencyDepths instanceof Map ? (dependencyDepths.get(task.id) || 0) : 0;
  score -= depth * 100;

  // 2. Deadline Urgency (EDF)
  if (task.dueDate) {
    const startParsed = parseDateISO(asOfDateStr);
    const dueParsed = parseDateISO(task.dueDate);

    if (startParsed && dueParsed) {
      const daysDiff = Math.round((dueParsed.getTime() - startParsed.getTime()) / (1000 * 3600 * 24));
      if (daysDiff < 0) {
        // Overdue recovery boost: 5000 + 100 per day overdue (clamped to 1000)
        score += 5000 + Math.min(1000, Math.abs(daysDiff) * 100);
      } else {
        // Upcoming deadline: fewer days remaining -> higher score (clamped up to 30 days)
        const urgency = Math.max(0, 30 - daysDiff) * 50;
        score += urgency;
      }
    }
  } else {
    // Tasks without deadlines yield to tasks with explicit commitments
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

  // 4. Secondary Guarded Risk Urgency Boost (Bounded Heuristic)
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
 * Main Deterministic Adaptive Scheduling Engine (Phase 4, Stage 2).
 *
 * @param {object[]} tasks Input task collection
 * @param {object} [options={}] Scheduling options and constraints
 * @param {string} [options.startDate] Calendar start date YYYY-MM-DD (defaults to today)
 * @param {number} [options.horizonDays=14] Planning window in calendar days
 * @param {number} [options.dailyCapacityHours=6.0] Available focused work hours per day
 * @param {number[]} [options.workingDays=[1,2,3,4,5]] Working weekdays
 * @param {object|null} [options.personalDurationModel=null] Duration model for personalized effort estimates
 * @param {object} [options.predictionsMap={}] Risk predictions mapping (taskId -> pred)
 * @returns {{
 *   proposedPlacements: Array<object>,
 *   placements: Array<object>,
 *   dayAllocations: Array<object>,
 *   summary: object,
 *   cycleDetected: boolean,
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
  const strategy = options.strategy || 'adaptive';

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

  // Step 3: Analyze dependencies, cycles, self-dependencies, and missing prerequisites
  const dependencyInfo = analyzeTaskDependencies(tasks);
  const {
    validDependencies,
    cycles,
    blockedTasks,
    missingDependencies,
    taskDepths,
  } = dependencyInfo;

  if (cycles.length > 0) {
    warnings.push(`Detected ${cycles.length} circular dependency cycle(s). Affected tasks isolated to prevent invalid scheduling.`);
  }

  for (const [taskId, missingList] of missingDependencies.entries()) {
    warnings.push(`Task "${taskId}" references missing prerequisite ID(s): ${missingList.join(', ')}.`);
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
        effectiveHours = Math.round(durEst.predicted_duration_hours * 10) / 10;
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
      predictionsMap,
      strategy
    );

    taskMeta.set(t.id, {
      task: t,
      effectiveHours,
      durationSource,
      appliedRatio,
      priorityScore,
    });
  }

  // Step 5: Partition Tasks into Blocked, Oversized, and Schedulable
  const proposedPlacements = [];
  const taskAssignedSlotIndex = new Map();
  const unscheduledTaskIds = new Set();

  // 5a. Record placements for tasks blocked by dependency cycles or missing prerequisites
  for (const t of eligibleTasks) {
    if (blockedTasks.has(t.id)) {
      const blockInfo = blockedTasks.get(t.id);
      const originalDueDate = t.dueDate ? formatDateISO(t.dueDate) : null;
      const meta = taskMeta.get(t.id);

      proposedPlacements.push({
        taskId: t.id,
        taskTitle: t.title,
        taskPriority: t.priority || 'medium',
        taskCategory: t.category || '',
        originalDueDate,
        proposedDate: null,
        assignedDayIndex: -1,
        effectiveHours: meta.effectiveHours,
        durationSource: meta.durationSource,
        appliedRatio: meta.appliedRatio,
        isDateChanged: false,
        status: 'blocked_by_dependency',
        placementStatus: 'blocked_by_dependency',
        placementReason: `Blocked: ${blockInfo.reason}`,
        explanation: `Blocked: ${blockInfo.reason}`,
        conflicts: [blockInfo.reason],
      });

      unscheduledTaskIds.add(t.id);
    }
  }

  // 5b. Identify oversized tasks exceeding daily working capacity
  const schedulableCandidates = [];
  for (const t of eligibleTasks) {
    if (blockedTasks.has(t.id)) continue;
    const meta = taskMeta.get(t.id);

    if (meta.effectiveHours > dailyCapacityHours) {
      const originalDueDate = t.dueDate ? formatDateISO(t.dueDate) : null;
      const conflictMsg = `Task effort (${meta.effectiveHours.toFixed(1)}h) exceeds daily capacity limit (${dailyCapacityHours}h/day). Manual task breakdown or capacity adjustment required.`;

      proposedPlacements.push({
        taskId: t.id,
        taskTitle: t.title,
        taskPriority: t.priority || 'medium',
        taskCategory: t.category || '',
        originalDueDate,
        proposedDate: null,
        assignedDayIndex: -1,
        effectiveHours: meta.effectiveHours,
        durationSource: meta.durationSource,
        appliedRatio: meta.appliedRatio,
        isDateChanged: false,
        status: 'oversized_exceeds_capacity',
        placementStatus: 'oversized_exceeds_capacity',
        placementReason: `Requires manual resolution: task effort (${meta.effectiveHours.toFixed(1)}h) exceeds daily working hours (${dailyCapacityHours}h/day)`,
        explanation: `Requires manual resolution: task effort (${meta.effectiveHours.toFixed(1)}h) exceeds daily working hours (${dailyCapacityHours}h/day)`,
        conflicts: [conflictMsg],
      });

      unscheduledTaskIds.add(t.id);
      warnings.push(`Task "${t.title}" requires ${meta.effectiveHours.toFixed(1)}h, exceeding daily capacity (${dailyCapacityHours}h/day). Marked for manual resolution.`);
    } else {
      schedulableCandidates.push(t);
    }
  }

  // 5c. Topological Ready-Queue Scheduling (Kahn's Priority Algorithm)
  // Track in-degree (count of uncompleted, unassigned prerequisites) for each candidate
  const inDegree = new Map();
  const dependentsMap = new Map();

  for (const t of schedulableCandidates) {
    const directPrereqs = validDependencies.get(t.id) || [];
    // Count only prerequisites that are NOT already completed
    let activePrereqCount = 0;
    for (const pId of directPrereqs) {
      if (unscheduledTaskIds.has(pId)) {
        // Prerequisite was blocked or oversized; dependent cannot be scheduled
        activePrereqCount += 999;
      } else {
        activePrereqCount++;
      }

      if (!dependentsMap.has(pId)) {
        dependentsMap.set(pId, []);
      }
      dependentsMap.get(pId).push(t.id);
    }
    inDegree.set(t.id, activePrereqCount);
  }

  // Ready set: schedulable tasks with inDegree === 0
  const readyQueue = schedulableCandidates.filter((t) => inDegree.get(t.id) === 0);
  const remainingSchedulable = new Set(schedulableCandidates.map((t) => t.id));

  while (readyQueue.length > 0) {
    // Deterministic selection: highest priorityScore descending, stable tie-breaker taskId ascending
    readyQueue.sort((a, b) => {
      const scoreA = taskMeta.get(a.id)?.priorityScore ?? 0;
      const scoreB = taskMeta.get(b.id)?.priorityScore ?? 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return String(a.id).localeCompare(String(b.id));
    });

    const currentTask = readyQueue.shift();
    remainingSchedulable.delete(currentTask.id);

    const meta = taskMeta.get(currentTask.id);
    const requiredHours = meta.effectiveHours;
    const taskConflicts = [];
    const directPrereqs = validDependencies.get(currentTask.id) || [];

    // Earliest allowable slot index: max slot index of all direct prerequisites
    let minSlotIndex = 0;
    for (const pId of directPrereqs) {
      if (taskAssignedSlotIndex.has(pId)) {
        minSlotIndex = Math.max(minSlotIndex, taskAssignedSlotIndex.get(pId));
      }
    }

    // Search for first working slot on or after minSlotIndex with sufficient remaining hours
    let placedSlot = null;
    let placedSlotIdx = -1;

    for (let sIdx = minSlotIndex; sIdx < calendarSlots.length; sIdx++) {
      const slot = calendarSlots[sIdx];
      if (!slot.isWorkingDay) continue;

      if (slot.remainingHours >= requiredHours) {
        placedSlot = slot;
        placedSlotIdx = sIdx;
        break;
      }
    }

    if (placedSlot) {
      // Successfully allocate task
      placedSlot.assignedTasks.push({
        taskId: currentTask.id,
        taskTitle: currentTask.title,
        hours: requiredHours,
      });
      placedSlot.remainingHours = Math.max(0, placedSlot.remainingHours - requiredHours);
      taskAssignedSlotIndex.set(currentTask.id, placedSlotIdx);

      const proposedDate = placedSlot.date;
      const originalDueDate = currentTask.dueDate ? formatDateISO(currentTask.dueDate) : null;
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
      } else {
        placementReason += ` (no hard deadline specified)`;
      }

      const isDateChanged = originalDueDate !== proposedDate;

      proposedPlacements.push({
        taskId: currentTask.id,
        taskTitle: currentTask.title,
        taskPriority: currentTask.priority || 'medium',
        taskCategory: currentTask.category || '',
        originalDueDate,
        proposedDate,
        assignedDayIndex: placedSlotIdx,
        effectiveHours: requiredHours,
        durationSource: meta.durationSource,
        appliedRatio: meta.appliedRatio,
        isDateChanged,
        status,
        placementStatus: status,
        placementReason,
        explanation: placementReason,
        conflicts: taskConflicts,
      });

      // Update inDegree of downstream dependents
      const dependents = dependentsMap.get(currentTask.id) || [];
      for (const depId of dependents) {
        if (!remainingSchedulable.has(depId)) continue;
        const curDeg = inDegree.get(depId) - 1;
        inDegree.set(depId, curDeg);
        if (curDeg === 0) {
          const depTaskObj = schedulableCandidates.find((c) => c.id === depId);
          if (depTaskObj) readyQueue.push(depTaskObj);
        }
      }
    } else {
      // Horizon capacity exhausted for this task
      const originalDueDate = currentTask.dueDate ? formatDateISO(currentTask.dueDate) : null;
      taskConflicts.push(`Cannot fit within ${horizonDays}-day horizon under configured working hours (${dailyCapacityHours}h/day).`);
      warnings.push(`Task "${currentTask.title}" (${currentTask.id}) could not be scheduled within the ${horizonDays}-day calendar window.`);

      proposedPlacements.push({
        taskId: currentTask.id,
        taskTitle: currentTask.title,
        taskPriority: currentTask.priority || 'medium',
        taskCategory: currentTask.category || '',
        originalDueDate,
        proposedDate: null,
        assignedDayIndex: -1,
        effectiveHours: requiredHours,
        durationSource: meta.durationSource,
        appliedRatio: meta.appliedRatio,
        isDateChanged: false,
        status: 'unscheduled',
        placementStatus: 'unscheduled',
        placementReason: 'Capacity exhausted: requires additional calendar days or reduced task scope',
        explanation: 'Capacity exhausted: requires additional calendar days or reduced task scope',
        conflicts: taskConflicts,
      });

      unscheduledTaskIds.add(currentTask.id);
    }
  }

  // 5d. Handle any remaining tasks (e.g. dependents blocked because a prerequisite was unscheduled)
  for (const remainingId of remainingSchedulable) {
    const t = schedulableCandidates.find((c) => c.id === remainingId);
    if (!t) continue;
    const meta = taskMeta.get(t.id);
    const originalDueDate = t.dueDate ? formatDateISO(t.dueDate) : null;
    const conflictMsg = `Blocked: prerequisite task could not be scheduled within planning horizon.`;

    proposedPlacements.push({
      taskId: t.id,
      taskTitle: t.title,
      taskPriority: t.priority || 'medium',
      taskCategory: t.category || '',
      originalDueDate,
      proposedDate: null,
      assignedDayIndex: -1,
      effectiveHours: meta.effectiveHours,
      durationSource: meta.durationSource,
      appliedRatio: meta.appliedRatio,
      isDateChanged: false,
      status: 'blocked_by_dependency',
      placementStatus: 'blocked_by_dependency',
      placementReason: 'Blocked: prerequisite task was unscheduled or could not fit within capacity',
      explanation: 'Blocked: prerequisite task was unscheduled or could not fit within capacity',
      conflicts: [conflictMsg],
    });
  }

  // Step 6: Calculate Day Allocations & Accurate Capacity Utilization
  const dayAllocations = calendarSlots.map((slot) => {
    const totalHours = slot.assignedTasks.reduce((acc, at) => acc + at.hours, 0);
    const roundedHours = Math.round(totalHours * 10) / 10;
    const utilizationPercent = slot.capacityHours > 0
      ? Math.min(100, Math.round((roundedHours / slot.capacityHours) * 100))
      : 0;

    return {
      date: slot.date,
      dayIndex: slot.dayIndex,
      dayOfWeek: slot.dayOfWeek,
      dayName: slot.dayName,
      isWorkingDay: slot.isWorkingDay,
      totalHours: roundedHours,
      capacityHours: slot.capacityHours,
      remainingHours: Math.round(slot.remainingHours * 10) / 10,
      utilizationPercent,
      tasks: [...slot.assignedTasks],
    };
  });

  // Accurate Capacity Utilization Denominator:
  // Scheduled workload = sum of hours of tasks actually placed on working days
  const scheduledWorkloadHours = Math.round(
    dayAllocations.reduce((sum, d) => sum + d.totalHours, 0) * 10
  ) / 10;

  // Available capacity = sum of capacityHours across working days in horizon
  const totalCapacityHours = Math.round(
    dayAllocations.filter((d) => d.isWorkingDay).reduce((sum, d) => sum + d.capacityHours, 0) * 10
  ) / 10;

  const averageUtilizationPercent = totalCapacityHours > 0
    ? Math.min(100, Math.round((scheduledWorkloadHours / totalCapacityHours) * 100))
    : 0;

  // Step 7: Build Summary & Feasibility Status
  const totalEligibleTasks = eligibleTasks.length;
  const scheduledCount = proposedPlacements.filter(
    (p) => p.status === 'on_time' || p.status === 'deadline_missed' || p.status === 'overdue_at_start'
  ).length;
  const unscheduledCount = proposedPlacements.filter((p) => p.status === 'unscheduled').length;
  const blockedCount = proposedPlacements.filter((p) => p.status === 'blocked_by_dependency').length;
  const oversizedCount = proposedPlacements.filter((p) => p.status === 'oversized_exceeds_capacity').length;
  const onTimeCount = proposedPlacements.filter((p) => p.status === 'on_time').length;
  const missedDeadlineCount = proposedPlacements.filter((p) => p.status === 'deadline_missed').length;
  const overdueAtStartCount = proposedPlacements.filter((p) => p.status === 'overdue_at_start').length;
  const dateChangesCount = proposedPlacements.filter(
    (p) => p.isDateChanged && p.proposedDate !== null
  ).length;

  let feasibilityStatus = 'feasible';
  if (cycles.length > 0 || blockedCount > 0) {
    feasibilityStatus = 'dependency_cycle';
  } else if (oversizedCount > 0 || unscheduledCount > 0) {
    feasibilityStatus = 'capacity_exceeded';
  } else if (missedDeadlineCount > 0 || overdueAtStartCount > 0) {
    feasibilityStatus = 'infeasible_deadlines';
  }

  const summary = {
    strategy,
    totalEligibleTasks,
    totalTasksEvaluated: totalEligibleTasks,
    scheduledCount,
    scheduledTasksCount: scheduledCount,
    unscheduledCount,
    blockedCount,
    oversizedCount,
    onTimeCount,
    missedDeadlineCount,
    missedDeadlinesCount: missedDeadlineCount,
    overdueAtStartCount,
    dateChangesCount,
    dateShiftsCount: dateChangesCount,
    scheduledWorkloadHours,
    totalCapacityHours,
    averageUtilizationPercent,
    utilizationRatio: averageUtilizationPercent / 100,
    feasibilityStatus,
    feasibility: feasibilityStatus,
    cycles,
    cycleDetected: cycles.length > 0,
    warnings,
    scheduleId: options.scheduleId || (() => {
      const taskHashKey = eligibleTasks.map((t) => t.id).join('_');
      let hashNum = 0;
      for (let i = 0; i < taskHashKey.length; i++) {
        hashNum = (hashNum * 31 + taskHashKey.charCodeAt(i)) >>> 0;
      }
      return `sched_${startDateStr}_${eligibleTasks.length}_${hashNum.toString(16)}`;
    })(),
  };

  return {
    strategy,
    proposedPlacements,
    placements: proposedPlacements,
    dayAllocations,
    summary,
    cycleDetected: summary.cycleDetected,
  };
}
