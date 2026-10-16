/**
 * VoxPlan Behavioral Statistics Layer.
 * Derives transparent, evidence-based metrics from raw behavioral event logs.
 * Strictly respects sparse data: never claims a habit or personal pattern from 1-2 samples.
 */

const MIN_SAMPLES_FOR_OVERALL_PATTERN = 3;
const MIN_SAMPLES_FOR_CATEGORY_PATTERN = 2;

/**
 * Computes the median of an array of numbers.
 * @param {number[]} numbers
 * @returns {number|null}
 */
export function calculateMedian(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Derives behavioral statistics from an immutable event log.
 * @param {object[]} events Array of validated behavioral events
 * @param {object[]} [currentTasks=[]] Current task state (optional, for metadata matching)
 * @returns {object} Behavioral statistics report
 */
export function computeBehavioralStats(events = [], currentTasks = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return createEmptyStats();
  }

  // Map tasks to their category / estimated effort for easy lookup
  const taskMetaMap = new Map();
  for (const t of currentTasks) {
    if (t && t.id) {
      taskMetaMap.set(t.id, {
        category: t.category || 'General',
        estimatedEffort: t.estimatedEffort ?? t.estimated_effort ?? null,
      });
    }
  }

  // Also extract task creation metadata from task_created events
  for (const ev of events) {
    if (ev.event_type === 'task_created' && ev.task_id) {
      const existing = taskMetaMap.get(ev.task_id) || {};
      taskMetaMap.set(ev.task_id, {
        category: ev.payload?.category || existing.category || 'General',
        estimatedEffort: ev.payload?.estimated_effort ?? existing.estimatedEffort ?? null,
      });
    }
  }

  // Track task lifecycle status
  const taskStatus = new Map(); // taskId -> { completed: bool, completedEvent, reopenedEvent, trackedSeconds, selfReportedSeconds, source }
  const rescheduleEvents = [];
  const priorityEvents = [];
  const effortRevisedEvents = [];
  const weekdayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (const ev of events) {
    const taskId = ev.task_id;

    switch (ev.event_type) {
      case 'task_completed': {
        const payload = ev.payload || {};
        const trackedSec = typeof payload.tracked_duration_seconds === 'number' ? payload.tracked_duration_seconds : 0;
        const selfReportedSec = typeof payload.self_reported_duration_seconds === 'number' ? payload.self_reported_duration_seconds : null;
        const source = payload.duration_source || (trackedSec > 0 ? 'tracked' : selfReportedSec ? 'self_reported' : 'unknown');

        taskStatus.set(taskId, {
          completed: true,
          completedAt: ev.timestamp,
          trackedSeconds: trackedSec,
          selfReportedSeconds: selfReportedSec,
          source,
        });

        // Tally day of week
        try {
          const dayIndex = new Date(ev.timestamp).getDay();
          const dayName = weekdayNames[dayIndex];
          if (weekdayCounts[dayName] !== undefined) {
            weekdayCounts[dayName] += 1;
          }
        } catch {}
        break;
      }

      case 'task_reopened':
        if (taskStatus.has(taskId)) {
          taskStatus.set(taskId, {
            ...taskStatus.get(taskId),
            completed: false,
          });
        }
        break;

      case 'task_rescheduled':
        rescheduleEvents.push(ev);
        break;

      case 'task_priority_changed':
        priorityEvents.push(ev);
        break;

      case 'task_effort_revised':
        effortRevisedEvents.push(ev);
        break;

      default:
        break;
    }
  }

  // Filter completed tasks that remain completed
  const completedTaskRecords = [];
  for (const [taskId, record] of taskStatus.entries()) {
    if (record.completed) {
      const meta = taskMetaMap.get(taskId) || { category: 'General', estimatedEffort: null };
      completedTaskRecords.push({
        taskId,
        ...record,
        category: meta.category,
        estimatedEffort: meta.estimatedEffort,
      });
    }
  }

  const totalCompleted = completedTaskRecords.length;
  const trackedRecords = completedTaskRecords.filter((r) => r.source === 'tracked' && r.trackedSeconds > 0);
  const selfReportedRecords = completedTaskRecords.filter((r) => r.source === 'self_reported' && r.selfReportedSeconds != null);
  const unknownDurationRecords = completedTaskRecords.filter((r) => r.source === 'unknown' || (!r.trackedSeconds && !r.selfReportedSeconds));

  const totalTrackedSeconds = trackedRecords.reduce((acc, r) => acc + r.trackedSeconds, 0);

  // Median observed duration in minutes
  const trackedMinutesList = trackedRecords.map((r) => r.trackedSeconds / 60);
  const hasSufficientTracked = trackedMinutesList.length >= MIN_SAMPLES_FOR_OVERALL_PATTERN;
  const medianTrackedMinutes = hasSufficientTracked ? calculateMedian(trackedMinutesList) : null;

  // Category breakdown
  const categoryMap = new Map();
  for (const r of completedTaskRecords) {
    const cat = r.category || 'General';
    if (!categoryMap.has(cat)) {
      categoryMap.set(cat, { durations: [], total: 0 });
    }
    const catData = categoryMap.get(cat);
    catData.total += 1;
    const durSec = r.trackedSeconds > 0 ? r.trackedSeconds : r.selfReportedSeconds;
    if (durSec) {
      catData.durations.push(durSec / 60);
    }
  }

  const categoryStats = [];
  for (const [category, data] of categoryMap.entries()) {
    const hasEnough = data.durations.length >= MIN_SAMPLES_FOR_CATEGORY_PATTERN;
    categoryStats.push({
      category,
      completedCount: data.total,
      measuredCount: data.durations.length,
      medianMinutes: hasEnough ? Math.round(calculateMedian(data.durations)) : null,
      status: hasEnough ? 'sufficient' : 'sparse_data',
    });
  }

  // Estimation accuracy (paired estimated effort vs observed duration)
  const pairedEstimationDiffs = [];
  const estimationRatios = [];

  for (const r of completedTaskRecords) {
    if (typeof r.estimatedEffort === 'number' && r.estimatedEffort > 0) {
      const estimatedSec = r.estimatedEffort * 3600;
      const actualSec = r.trackedSeconds > 0 ? r.trackedSeconds : r.selfReportedSeconds;

      if (typeof actualSec === 'number' && actualSec > 0) {
        const diffHours = (actualSec - estimatedSec) / 3600;
        const ratio = actualSec / estimatedSec;
        pairedEstimationDiffs.push(diffHours);
        estimationRatios.push(ratio);
      }
    }
  }

  const hasSufficientEstimationData = estimationRatios.length >= MIN_SAMPLES_FOR_OVERALL_PATTERN;
  let estimationInsight = {
    pairedCount: estimationRatios.length,
    sufficientData: hasSufficientEstimationData,
    averageRatio: null,
    percentageVariance: null,
    biasSummary: 'Awaiting 3+ completed tasks with both estimated and tracked duration.',
  };

  if (hasSufficientEstimationData) {
    const avgRatio = estimationRatios.reduce((a, b) => a + b, 0) / estimationRatios.length;
    const pctDiff = Math.round((avgRatio - 1) * 100);
    let summary = '';
    if (Math.abs(pctDiff) <= 10) {
      summary = 'High estimation accuracy: tasks finish within ±10% of your estimates.';
    } else if (pctDiff > 10) {
      summary = `Underestimation bias: tasks take on average ~${pctDiff}% longer than estimated.`;
    } else {
      summary = `Conservative bias: tasks finish ~${Math.abs(pctDiff)}% faster than estimated.`;
    }

    estimationInsight = {
      pairedCount: estimationRatios.length,
      sufficientData: true,
      averageRatio: Math.round(avgRatio * 100) / 100,
      percentageVariance: pctDiff,
      biasSummary: summary,
    };
  }

  // Count postponements (rescheduled to a later date)
  let postponementsCount = 0;
  for (const ev of rescheduleEvents) {
    const p = ev.payload || {};
    if (p.previous_due_date && p.new_due_date && p.new_due_date > p.previous_due_date) {
      postponementsCount++;
    }
  }

  return {
    isSufficientData: totalCompleted >= MIN_SAMPLES_FOR_OVERALL_PATTERN,
    totalCompletedCount: totalCompleted,
    trackedDurationCount: trackedRecords.length,
    selfReportedDurationCount: selfReportedRecords.length,
    unknownDurationCount: unknownDurationRecords.length,
    totalTrackedSeconds: Math.round(totalTrackedSeconds),
    medianTrackedMinutes: medianTrackedMinutes != null ? Math.round(medianTrackedMinutes) : null,
    categoryStats,
    estimationInsight,
    rescheduleCount: rescheduleEvents.length,
    postponementsCount,
    priorityChangeCount: priorityEvents.length,
    weekdayCompletions: [
      { day: 'Mon', count: weekdayCounts.Mon },
      { day: 'Tue', count: weekdayCounts.Tue },
      { day: 'Wed', count: weekdayCounts.Wed },
      { day: 'Thu', count: weekdayCounts.Thu },
      { day: 'Fri', count: weekdayCounts.Fri },
      { day: 'Sat', count: weekdayCounts.Sat },
      { day: 'Sun', count: weekdayCounts.Sun },
    ],
    sampleCounts: {
      total_events: events.length,
      completed_tasks: totalCompleted,
      tracked_tasks: trackedRecords.length,
      paired_estimates: estimationRatios.length,
    },
  };
}

function createEmptyStats() {
  return {
    isSufficientData: false,
    totalCompletedCount: 0,
    trackedDurationCount: 0,
    selfReportedDurationCount: 0,
    unknownDurationCount: 0,
    totalTrackedSeconds: 0,
    medianTrackedMinutes: null,
    categoryStats: [],
    estimationInsight: {
      pairedCount: 0,
      sufficientData: false,
      averageRatio: null,
      percentageVariance: null,
      biasSummary: 'No behavioral data recorded yet.',
    },
    rescheduleCount: 0,
    postponementsCount: 0,
    priorityChangeCount: 0,
    weekdayCompletions: [
      { day: 'Mon', count: 0 },
      { day: 'Tue', count: 0 },
      { day: 'Wed', count: 0 },
      { day: 'Thu', count: 0 },
      { day: 'Fri', count: 0 },
      { day: 'Sat', count: 0 },
      { day: 'Sun', count: 0 },
    ],
    sampleCounts: {
      total_events: 0,
      completed_tasks: 0,
      tracked_tasks: 0,
      paired_estimates: 0,
    },
  };
}
