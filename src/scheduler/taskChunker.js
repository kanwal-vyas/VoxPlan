/**
 * VoxPlan Deterministic Task Chunker & Multi-Day Workload Allocator (Phase 6, Stage 1).
 *
 * Implements local-first, mathematically sound task chunking that allows tasks exceeding
 * daily working capacity to be partitioned into coherent work sessions across multiple days,
 * while preserving parent task identity, deadlines, progress integrity, and capacity limits.
 *
 * Core Invariants:
 * 1. The parent task remains the authoritative task record.
 * 2. Every chunk references its parent task by stable taskId.
 * 3. Chunks never silently create duplicate independent tasks in the user's task list.
 * 4. Sum of proposed chunk durations equals total allocated effort.
 * 5. Minimum session duration (default 1.0h) prevents micro-fragmentation.
 * 6. Daily capacity constraints are strictly respected across every calendar day.
 * 7. Downstream dependencies cannot begin until the FINAL chunk of a multi-day task completes.
 * 8. Pure, deterministic function execution: identical inputs produce identical chunk proposals.
 */

import { formatDateISO, parseDateISO } from './adaptiveScheduler.js';

export const DEFAULT_MIN_CHUNK_HOURS = 1.0;
export const DEFAULT_MAX_CHUNK_HOURS = 24.0;

/**
 * Determines whether a task is eligible for multi-day chunking.
 *
 * @param {object} task Task object
 * @param {object} [options] Scheduling options
 * @returns {boolean}
 */
export function isTaskChunkable(task, options = {}) {
  if (!task || typeof task !== 'object' || !task.id) {
    return false;
  }

  // Explicit task-level opt-outs (atomic tasks that must not be split)
  if (task.chunkable === false || task.atomic === true || task.allowChunking === false || task.isSplittable === false) {
    return false;
  }

  // Task-level explicit opt-in (authoritative task metadata)
  if (task.chunkable === true || task.allowChunking === true || task.isSplittable === true) {
    return true;
  }

  // Explicit scheduler-level override
  if (options.enableChunking === false || options.allowChunking === false) {
    return false;
  }

  // Scheduler-level opt-in
  if (options.enableChunking === true || options.allowChunking === true || options.strategy === 'multi_day_chunking') {
    return true;
  }

  return false;
}

/**
 * Calculates a deterministic, balanced chunk plan for a given effort and capacity.
 *
 * Ensures:
 * 1. Every chunk duration is <= maxChunkHours (typically dailyCapacityHours).
 * 2. Every chunk duration is >= minChunkHours, smoothing tails to prevent awkward micro-sessions.
 * 3. Sum of chunk durations exactly matches totalEffort within 0.1h precision.
 * 4. Deterministic: identical inputs produce identical chunk durations.
 *
 * @param {number} totalEffort Total hours to allocate
 * @param {number} dailyCapacity Maximum hours allowed per work session (daily limit)
 * @param {object} [options]
 * @param {number} [options.minChunkHours] Minimum session duration (default 1.0)
 * @returns {number[]} Array of chunk durations in hours
 */
export function calculateChunkPlan(totalEffort, dailyCapacity, options = {}) {
  if (typeof totalEffort !== 'number' || isNaN(totalEffort) || totalEffort <= 0) {
    return [];
  }
  if (typeof dailyCapacity !== 'number' || isNaN(dailyCapacity) || dailyCapacity <= 0) {
    return [];
  }

  const roundedEffort = Math.round(totalEffort * 10) / 10;
  const minChunk = typeof options.minChunkHours === 'number' && options.minChunkHours > 0
    ? Math.min(options.minChunkHours, dailyCapacity)
    : Math.min(DEFAULT_MIN_CHUNK_HOURS, dailyCapacity);

  // If effort fits within one valid session, return single chunk
  if (roundedEffort <= dailyCapacity) {
    return [roundedEffort];
  }

  const chunks = [];
  let remaining = roundedEffort;

  while (remaining > 0.001) {
    if (remaining <= dailyCapacity) {
      // Final piece: check if it's smaller than minChunk
      if (chunks.length > 0 && remaining < minChunk) {
        const needed = Math.round((minChunk - remaining) * 10) / 10;
        const prevIdx = chunks.length - 1;
        // Borrow from previous chunk if it stays above minChunk
        if (chunks[prevIdx] - needed >= minChunk) {
          chunks[prevIdx] = Math.round((chunks[prevIdx] - needed) * 10) / 10;
          remaining = Math.round((remaining + needed) * 10) / 10;
        }
      }
      chunks.push(Math.round(remaining * 10) / 10);
      remaining = 0;
    } else {
      let allocated = Math.min(dailyCapacity, remaining);
      const tail = Math.round((remaining - allocated) * 10) / 10;

      // Lookahead: if the remaining tail would be smaller than minChunk,
      // adjust current allocation downward to leave a viable session for the tail
      if (tail > 0 && tail < minChunk) {
        const deficit = minChunk - tail;
        const adjusted = Math.round((allocated - deficit) * 10) / 10;
        if (adjusted >= minChunk) {
          allocated = adjusted;
        }
      }

      chunks.push(allocated);
      remaining = Math.round((remaining - allocated) * 10) / 10;
    }
  }

  // Invariant verification: sum of chunks must equal roundedEffort
  const sum = Math.round(chunks.reduce((a, b) => a + b, 0) * 10) / 10;
  if (Math.abs(sum - roundedEffort) > 0.01 && chunks.length > 0) {
    const diff = Math.round((roundedEffort - sum) * 10) / 10;
    chunks[chunks.length - 1] = Math.round((chunks[chunks.length - 1] + diff) * 10) / 10;
  }

  return chunks;
}

/**
 * Schedules a chunkable task across available calendar slots.
 *
 * Guarantees:
 * - Sequential allocation: Chunk k+1 is scheduled on a calendar day strictly after Chunk k.
 * - Daily capacity constraints: slot.remainingHours is never exceeded.
 * - Prerequisite respect: minSlotIndex (from DAG prerequisites) is the lower bound for Chunk 0.
 * - Honest reporting: If deadline or horizon limits allocation, reports partial allocation with
 *   exact allocated and unscheduled hours rather than silently cutting corners.
 *
 * @param {object} task The parent task object
 * @param {number} totalEffort The total effective hours for the parent task
 * @param {object[]} calendarSlots Mutable calendar slots array from adaptiveScheduler
 * @param {number} minSlotIndex Earliest slot index allowed by prerequisites
 * @param {object} options Scheduling options
 * @returns {{
 *   placements: object[],
 *   finalSlotIndex: number,
 *   finalProposedDate: string|null,
 *   isFullyAllocated: boolean,
 *   allocatedHours: number,
 *   unscheduledHours: number,
 *   status: string,
 *   conflicts: string[],
 *   explanation: string,
 * }}
 */
export function scheduleMultiDayTask(task, totalEffort, calendarSlots, minSlotIndex = 0, options = {}) {
  if (!totalEffort || totalEffort <= 0 || !Number.isFinite(totalEffort)) {
    return {
      placements: [],
      chunks: [],
      isChunked: false,
      finalSlotIndex: -1,
      finalProposedDate: null,
      isFullyAllocated: false,
      allocationStatus: 'unscheduled',
      allocatedHours: 0,
      unscheduledHours: 0,
      status: 'unscheduled',
      conflicts: ['Invalid or zero effort'],
      explanation: 'Task has zero or invalid estimated effort',
    };
  }

  const roundedEffort = Math.round(totalEffort * 10) / 10;
  const dailyCapacityHours = options.dailyCapacityHours || calendarSlots[0]?.capacityHours || 6.0;
  const minChunkHours = options.minChunkHours || DEFAULT_MIN_CHUNK_HOURS;
  const originalDueDate = task.dueDate ? formatDateISO(task.dueDate) : null;
  const startDateStr = options.startDateStr || (calendarSlots[0]?.date || formatDateISO(new Date()));

  const placements = [];
  let currentSlotIdx = Math.max(0, minSlotIndex);
  let remainingEffort = roundedEffort;
  let totalAllocatedHours = 0;
  const conflicts = [];
  const maxChunkHours = options.maxChunkHours || dailyCapacityHours;

  // 2. Iterate through slots and allocate chunks dynamically (at most 1 chunk per day)
  while (remainingEffort > 0.05 && currentSlotIdx < calendarSlots.length) {
    const slot = calendarSlots[currentSlotIdx];

    if (slot.isWorkingDay === false) {
      currentSlotIdx++;
      continue;
    }

    // Deadline safety rule: never schedule work beyond the deadline
    if (originalDueDate && slot.date > originalDueDate) {
      break;
    }

    const availableHours = slot.remainingHours;
    if (availableHours >= minChunkHours) {
      let sessionHours = Math.min(availableHours, remainingEffort, maxChunkHours);
      sessionHours = Math.round(sessionHours * 10) / 10;

      // Lookahead tail-smoothing: if what's left after this session would be positive but smaller than minChunkHours,
      // adjust this session so the tail is viable
      const tail = Math.round((remainingEffort - sessionHours) * 10) / 10;
      if (tail > 0 && tail < minChunkHours && (sessionHours - (minChunkHours - tail)) >= minChunkHours) {
        sessionHours = Math.round((sessionHours - (minChunkHours - tail)) * 10) / 10;
      }

      const chunkIdx = placements.length;
      const placementId = `chunk_${task.id}_seg_${chunkIdx}`;
      const proposedDate = slot.date;

      slot.assignedTasks.push({
        taskId: task.id,
        taskTitle: task.title,
        hours: sessionHours,
        chunkIndex: chunkIdx,
        totalChunks: 0, // finalized after loop
        isChunk: true,
      });

      slot.remainingHours = Math.round(Math.max(0, slot.remainingHours - sessionHours) * 10) / 10;
      totalAllocatedHours = Math.round((totalAllocatedHours + sessionHours) * 10) / 10;
      remainingEffort = Math.round(Math.max(0, remainingEffort - sessionHours) * 10) / 10;

      placements.push({
        placementId,
        chunkId: placementId,
        taskId: task.id,
        taskTitle: task.title,
        taskPriority: task.priority || 'medium',
        taskCategory: task.category || '',
        originalDueDate,
        proposedDate,
        assignedDayIndex: currentSlotIdx,
        effectiveHours: sessionHours,
        chunkDuration: sessionHours,
        chunkIndex: chunkIdx,
        totalChunks: 0, // finalized after loop
        parentTotalEffort: roundedEffort,
        isChunk: true,
        allocationStatus: 'in_progress', // updated below
        durationSource: options.durationSource || 'original_estimate',
        appliedRatio: options.appliedRatio || 1.0,
        isDateChanged: originalDueDate !== proposedDate,
        status: 'on_time', // updated below
        placementStatus: 'on_time',
        placementReason: '',
        explanation: '',
        conflicts: [],
      });

      currentSlotIdx++;
    } else {
      currentSlotIdx++;
    }
  }

  // Finalize totalChunks and isChunk across placements
  const totalChunks = placements.length;
  for (let i = 0; i < placements.length; i++) {
    placements[i].chunkIndex = i;
    placements[i].totalChunks = totalChunks;
    placements[i].isChunk = totalChunks > 1;
  }

  // 3. Evaluate Allocation Outcome
  const unscheduledHours = Math.round(Math.max(0, roundedEffort - totalAllocatedHours) * 10) / 10;
  const isFullyAllocated = unscheduledHours < 0.05 && placements.length > 0;
  const finalPlacement = placements.length > 0 ? placements[placements.length - 1] : null;
  const finalSlotIndex = finalPlacement ? finalPlacement.assignedDayIndex : -1;
  const finalProposedDate = finalPlacement ? finalPlacement.proposedDate : null;

  // 4. Determine Status & Deadline Compliance
  let taskStatus = 'on_time';

  if (!isFullyAllocated) {
    if (placements.length === 0) {
      taskStatus = 'unscheduled';
      if (originalDueDate && calendarSlots[0]?.date && calendarSlots[0].date > originalDueDate) {
        conflicts.push(`Deadline (${originalDueDate}) had already passed before earliest schedulable date.`);
      } else {
        conflicts.push(`Capacity exhausted: could not allocate minimum session (${minChunkHours}h) within planning horizon.`);
      }
    } else {
      taskStatus = 'partially_allocated';
      conflicts.push(`Only ${totalAllocatedHours.toFixed(1)}h of ${roundedEffort.toFixed(1)}h could be scheduled before ${originalDueDate || 'planning horizon'}; ${unscheduledHours.toFixed(1)}h remains unscheduled.`);
    }
  } else if (originalDueDate && finalProposedDate) {
    const dueParsed = parseDateISO(originalDueDate);
    const propParsed = parseDateISO(finalProposedDate);
    const startParsed = parseDateISO(startDateStr);

    if (dueParsed && propParsed && startParsed) {
      if (dueParsed.getTime() < startParsed.getTime()) {
        taskStatus = 'overdue_at_start';
        const overdueDays = Math.round((startParsed.getTime() - dueParsed.getTime()) / (1000 * 3600 * 24));
        conflicts.push(`Deadline was already overdue by ${overdueDays} day(s) at start of schedule.`);
      } else if (propParsed.getTime() > dueParsed.getTime()) {
        taskStatus = 'deadline_missed';
        const delayDays = Math.round((propParsed.getTime() - dueParsed.getTime()) / (1000 * 3600 * 24));
        conflicts.push(`Final work session (${finalProposedDate}) is ${delayDays} day(s) after deadline (${originalDueDate}) due to capacity limits.`);
      }
    }
  }

  // 5. Update each placement's status, reason, and explanation
  const allocationStatus = isFullyAllocated
    ? 'fully_allocated'
    : (placements.length > 0 && totalAllocatedHours > 0)
    ? 'partially_allocated'
    : 'unscheduled';

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    p.status = taskStatus;
    p.placementStatus = taskStatus;
    p.allocationStatus = allocationStatus;
    p.allocatedHours = totalAllocatedHours;
    p.unscheduledHours = unscheduledHours;
    p.conflicts = [...conflicts];

    const sessionLabel = totalChunks > 1
      ? `Session ${i + 1} of ${totalChunks} (${p.effectiveHours.toFixed(1)}h)`
      : `${p.effectiveHours.toFixed(1)}h`;

    const explanationParts = [`Scheduled ${sessionLabel} on ${p.proposedDate}`];
    if (totalChunks > 1) {
      explanationParts.push(`Part of ${roundedEffort.toFixed(1)}h multi-day task split across ${placements.length} working days`);
    }
    if (unscheduledHours > 0) {
      explanationParts.push(`Partial allocation: ${unscheduledHours.toFixed(1)}h remains unscheduled`);
    }
    if (taskStatus === 'deadline_missed') {
      explanationParts.push(`Final session finishes past deadline (${originalDueDate}) due to daily capacity volume (${dailyCapacityHours}h/day)`);
    } else if (taskStatus === 'on_time') {
      explanationParts.push(`All sessions completed within capacity on or before deadline`);
    }

    const explanation = explanationParts.join(' • ');
    p.explanation = explanation;
    p.placementReason = explanation;
  }

  // If 0 placements were made, return structured unscheduled placement
  if (placements.length === 0) {
    const reason = `Capacity exhausted: could not allocate minimum session (${minChunkHours}h) within planning horizon`;
    conflicts.push(reason);

    placements.push({
      placementId: `chunk_${task.id}_unscheduled`,
      chunkId: `chunk_${task.id}_unscheduled`,
      taskId: task.id,
      taskTitle: task.title,
      taskPriority: task.priority || 'medium',
      taskCategory: task.category || '',
      originalDueDate,
      proposedDate: null,
      assignedDayIndex: -1,
      effectiveHours: roundedEffort,
      chunkDuration: 0,
      chunkIndex: 0,
      totalChunks: 1,
      parentTotalEffort: roundedEffort,
      isChunk: false,
      allocationStatus: 'infeasible',
      allocatedHours: 0,
      unscheduledHours: roundedEffort,
      durationSource: options.durationSource || 'original_estimate',
      appliedRatio: options.appliedRatio || 1.0,
      isDateChanged: false,
      status: 'unscheduled',
      placementStatus: 'unscheduled',
      placementReason: reason,
      explanation: reason,
      conflicts: [...conflicts],
    });
  }

  const activeScheduledChunks = placements.filter((p) => p.proposedDate !== null);
  const overallExplanation = placements[0]?.explanation || 'No valid schedule allocation found.';

  return {
    placements,
    chunks: activeScheduledChunks,
    isChunked: activeScheduledChunks.length > 1,
    finalSlotIndex,
    finalProposedDate,
    isFullyAllocated,
    allocationStatus,
    allocatedHours: totalAllocatedHours,
    unscheduledHours,
    status: taskStatus,
    conflicts,
    explanation: overallExplanation,
  };
}
