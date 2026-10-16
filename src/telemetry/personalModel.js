/**
 * VoxPlan Personal Duration Estimator.
 * Client-side personal model that uses genuine historical working duration observations
 * from IndexedDB telemetry to adjust user effort estimates for individual estimation bias.
 *
 * Designed with strict local-first privacy, robust outlier resistance, empirical shrinkage,
 * and transparent cold-start / uncertainty reporting.
 */

// Shrinkage strength: equivalent to 3 pseudo-observations anchored at a neutral ratio of 1.0
export const SHRINKAGE_PRIOR_WEIGHT = 3.0;
export const NEUTRAL_BIAS_RATIO = 1.0;

// Maximum plausible duration (200 hours) to guard against corrupted or stuck timers
export const MAX_PLAUSIBLE_HOURS = 200.0;
export const MIN_PLAUSIBLE_HOURS = 0.01; // ~36 seconds

// Plausible individual ratio boundary to prevent a single extreme task dominating the model
export const MIN_RATIO_BOUND = 0.1;
export const MAX_RATIO_BOUND = 10.0;

// Observation weights
export const WEIGHT_TRACKED = 1.0;
export const WEIGHT_SELF_REPORTED = 0.5;

/**
 * Computes the weighted median of an array of (value, weight) pairs.
 * @param {Array<{ value: number, weight: number }>} items
 * @returns {number|null}
 */
export function calculateWeightedMedian(items) {
  if (!Array.isArray(items) || items.length === 0) return null;

  // Filter invalid entries
  const valid = items.filter(
    (it) =>
      it &&
      typeof it.value === 'number' &&
      Number.isFinite(it.value) &&
      typeof it.weight === 'number' &&
      it.weight > 0 &&
      Number.isFinite(it.weight)
  );

  if (valid.length === 0) return null;

  // Sort ascending by value
  valid.sort((a, b) => a.value - b.value);

  const totalWeight = valid.reduce((sum, it) => sum + it.weight, 0);
  if (totalWeight <= 0) return null;

  const halfWeight = totalWeight / 2.0;
  let accumulated = 0;

  for (let i = 0; i < valid.length; i++) {
    accumulated += valid[i].weight;
    if (accumulated >= halfWeight) {
      // If it lands exactly on halfWeight and there's a next item, average them
      if (accumulated === halfWeight && i + 1 < valid.length) {
        return (valid[i].value + valid[i + 1].value) / 2.0;
      }
      return valid[i].value;
    }
  }

  return valid[valid.length - 1].value;
}

/**
 * Extracts and validates eligible historical observations from events and task metadata.
 *
 * Rules:
 * 1. Only tasks with a recorded completion that are NOT currently reopened are eligible.
 * 2. Join by stable task_id. Intermediate completions of reopened tasks are not counted as separate tasks.
 * 3. Tracked stopwatch duration has weight 1.0; self-reported duration has weight 0.5; unknown duration is excluded.
 * 4. Duration and original effort must be finite, positive, and plausible (<= 200 hours).
 * 5. Deduplicate duplicate events by event_id.
 *
 * @param {object[]} events Raw behavioral events
 * @param {object[]} [currentTasks=[]] Current task objects
 * @returns {Array<{
 *   taskId: string,
 *   observedHours: number,
 *   estimatedHours: number,
 *   ratio: number,
 *   clampedRatio: number,
 *   weight: number,
 *   source: 'tracked'|'self_reported',
 *   category: string
 * }>}
 */
export function extractEligibleObservations(events = [], currentTasks = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  // 1. Deduplicate events by event_id
  const seenEventIds = new Set();
  const dedupedEvents = [];
  for (const ev of events) {
    if (ev && ev.event_id && !seenEventIds.has(ev.event_id)) {
      seenEventIds.add(ev.event_id);
      dedupedEvents.push(ev);
    }
  }

  // 2. Build metadata map for tasks (category & original estimated effort)
  const taskMeta = new Map();
  for (const t of currentTasks) {
    if (t && t.id) {
      const eff = t.estimatedEffort ?? t.estimated_effort;
      taskMeta.set(t.id, {
        category: t.category || 'General',
        estimatedEffort: typeof eff === 'number' && Number.isFinite(eff) && eff > 0 ? eff : null,
        isCurrentlyCompleted: Boolean(t.completed),
      });
    }
  }

  // Supplement metadata from task_created events
  for (const ev of dedupedEvents) {
    if (ev.event_type === 'task_created' && ev.task_id) {
      const existing = taskMeta.get(ev.task_id) || {};
      const payloadEff = ev.payload?.estimated_effort;
      const validEff =
        typeof payloadEff === 'number' && Number.isFinite(payloadEff) && payloadEff > 0
          ? payloadEff
          : existing.estimatedEffort ?? null;

      taskMeta.set(ev.task_id, {
        category: ev.payload?.category || existing.category || 'General',
        estimatedEffort: validEff,
        isCurrentlyCompleted: existing.isCurrentlyCompleted ?? false,
      });
    }
  }

  // 3. Track final task lifecycle state (chronological order)
  const sortedEvents = [...dedupedEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const taskLifecycle = new Map(); // taskId -> { isCompleted: boolean, completionPayload: object, completedAt: string }

  for (const ev of sortedEvents) {
    const taskId = ev.task_id;
    if (!taskId) continue;

    if (ev.event_type === 'task_completed') {
      taskLifecycle.set(taskId, {
        isCompleted: true,
        completionPayload: ev.payload || {},
        completedAt: ev.timestamp || ev.payload?.completed_at || new Date().toISOString(),
      });
    } else if (ev.event_type === 'task_reopened') {
      // Reopening marks task as uncompleted
      if (taskLifecycle.has(taskId)) {
        taskLifecycle.set(taskId, {
          isCompleted: false,
          completionPayload: null,
          completedAt: null,
        });
      }
    }
  }

  // 4. Construct eligible observations
  const observations = [];

  for (const [taskId, lifecycle] of taskLifecycle.entries()) {
    // If reopened and not re-completed, exclude
    if (!lifecycle.isCompleted || !lifecycle.completionPayload) {
      continue;
    }

    const payload = lifecycle.completionPayload;
    const meta = taskMeta.get(taskId) || { estimatedEffort: null, category: 'General' };

    // Resolve duration and weight
    const trackedSec =
      typeof payload.tracked_duration_seconds === 'number' && Number.isFinite(payload.tracked_duration_seconds)
        ? payload.tracked_duration_seconds
        : 0;

    const selfReportedSec =
      typeof payload.self_reported_duration_seconds === 'number' && Number.isFinite(payload.self_reported_duration_seconds)
        ? payload.self_reported_duration_seconds
        : null;

    let source = payload.duration_source;
    let durationSeconds = 0;
    let weight = 0;

    if (source === 'tracked' || (trackedSec > 0 && source !== 'self_reported')) {
      durationSeconds = trackedSec;
      source = 'tracked';
      weight = WEIGHT_TRACKED;
    } else if (source === 'self_reported' || selfReportedSec != null) {
      durationSeconds = selfReportedSec || 0;
      source = 'self_reported';
      weight = WEIGHT_SELF_REPORTED;
    } else {
      // unknown or unmeasured duration: excluded
      continue;
    }

    const observedHours = durationSeconds / 3600.0;

    // Safeguard: Check plausibility of observed duration
    if (!Number.isFinite(observedHours) || observedHours < MIN_PLAUSIBLE_HOURS || observedHours > MAX_PLAUSIBLE_HOURS) {
      continue;
    }

    // Check availability and plausibility of original estimate
    const estimatedHours = meta.estimatedEffort;
    if (
      typeof estimatedHours !== 'number' ||
      !Number.isFinite(estimatedHours) ||
      estimatedHours <= 0 ||
      estimatedHours > MAX_PLAUSIBLE_HOURS
    ) {
      // Task had no estimate: cannot compute observed/estimated ratio
      continue;
    }

    const rawRatio = observedHours / estimatedHours;
    const clampedRatio = Math.max(MIN_RATIO_BOUND, Math.min(MAX_RATIO_BOUND, rawRatio));

    observations.push({
      taskId,
      observedHours,
      estimatedHours,
      ratio: rawRatio,
      clampedRatio,
      weight,
      source,
      category: meta.category || 'General',
      completedAt: lifecycle.completedAt || new Date().toISOString(),
    });
  }

  // Sort eligible observations in strict chronological order of completion
  observations.sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime());

  return observations;
}

/**
 * Builds the personalized duration model parameters from eligible observations.
 *
 * @param {object[]} events
 * @param {object[]} [currentTasks=[]]
 * @returns {object} Model parameters and summary
 */
export function buildPersonalDurationModel(events = [], currentTasks = []) {
  const eligibleObservations = extractEligibleObservations(events, currentTasks);

  const eligibleCount = eligibleObservations.length;
  const trackedCount = eligibleObservations.filter((o) => o.source === 'tracked').length;
  const selfReportedCount = eligibleObservations.filter((o) => o.source === 'self_reported').length;

  const totalEffectiveWeight = eligibleObservations.reduce((acc, o) => acc + o.weight, 0);

  if (eligibleCount === 0 || totalEffectiveWeight <= 0) {
    return {
      status: 'cold_start',
      effectiveWeight: 0,
      eligibleCount: 0,
      trackedCount: 0,
      selfReportedCount: 0,
      rawBiasRatio: NEUTRAL_BIAS_RATIO,
      biasRatio: NEUTRAL_BIAS_RATIO,
      observations: [],
    };
  }

  // Calculate robust weighted median of clamped ratio
  const ratioItems = eligibleObservations.map((o) => ({
    value: o.clampedRatio,
    weight: o.weight,
  }));

  const rawWeightedMedian = calculateWeightedMedian(ratioItems) ?? NEUTRAL_BIAS_RATIO;

  // Apply empirical shrinkage toward 1.0 (neutral estimate)
  // biasRatio = (W / (W + K)) * rawWeightedMedian + (K / (W + K)) * 1.0
  const shrunkBiasRatio =
    (totalEffectiveWeight / (totalEffectiveWeight + SHRINKAGE_PRIOR_WEIGHT)) * rawWeightedMedian +
    (SHRINKAGE_PRIOR_WEIGHT / (totalEffectiveWeight + SHRINKAGE_PRIOR_WEIGHT)) * NEUTRAL_BIAS_RATIO;

  // Determine personalization status tier
  let status = 'sparse';
  if (totalEffectiveWeight >= 8.0) {
    status = 'supported';
  } else if (totalEffectiveWeight >= 3.0) {
    status = 'developing';
  }

  return {
    status,
    effectiveWeight: Math.round(totalEffectiveWeight * 10) / 10,
    eligibleCount,
    trackedCount,
    selfReportedCount,
    rawBiasRatio: Math.round(rawWeightedMedian * 100) / 100,
    biasRatio: Math.round(shrunkBiasRatio * 100) / 100,
    observations: eligibleObservations,
  };
}

/**
 * Predicts focused working duration for a target task or effort estimate.
 *
 * @param {object} model Parameters returned by buildPersonalDurationModel
 * @param {object|number} taskOrEffort Task object or numeric effort hours
 * @returns {{
 *   predicted_duration_hours: number|null,
 *   user_estimate_hours: number|null,
 *   personalization_status: 'unavailable'|'cold_start'|'sparse'|'developing'|'supported',
 *   eligible_observation_count: number,
 *   tracked_observation_count: number,
 *   self_reported_observation_count: number,
 *   estimation_bias_ratio: number,
 *   uncertainty: {
 *     low_hours: number|null,
 *     high_hours: number|null,
 *     range_label: string,
 *     explanation: string
 *   }|null,
 *   explanation: string
 * }}
 */
export function estimateTaskDuration(model, taskOrEffort) {
  // Extract user estimate
  let userEstimateHours = null;
  if (typeof taskOrEffort === 'number') {
    userEstimateHours = taskOrEffort;
  } else if (taskOrEffort && typeof taskOrEffort === 'object') {
    const raw = taskOrEffort.estimatedEffort ?? taskOrEffort.estimated_effort;
    if (typeof raw === 'number') {
      userEstimateHours = raw;
    }
  }

  const modelStatus = model?.status || 'cold_start';
  const eligibleCount = model?.eligibleCount || 0;
  const trackedCount = model?.trackedCount || 0;
  const selfReportedCount = model?.selfReportedCount || 0;
  const biasRatio = model?.biasRatio ?? NEUTRAL_BIAS_RATIO;

  // 1. Missing estimate -> Unavailable state
  if (
    userEstimateHours === null ||
    !Number.isFinite(userEstimateHours) ||
    userEstimateHours <= 0
  ) {
    return {
      predicted_duration_hours: null,
      user_estimate_hours: null,
      personalization_status: 'unavailable',
      eligible_observation_count: eligibleCount,
      tracked_observation_count: trackedCount,
      self_reported_observation_count: selfReportedCount,
      estimation_bias_ratio: biasRatio,
      uncertainty: null,
      explanation: 'No estimated effort provided. Enter an effort estimate (e.g., 2h) to view personalized duration predictions.',
    };
  }

  // 2. Cold-Start (0 observations) -> Return original estimate honestly
  if (modelStatus === 'cold_start' || eligibleCount === 0) {
    return {
      predicted_duration_hours: userEstimateHours,
      user_estimate_hours: userEstimateHours,
      personalization_status: 'cold_start',
      eligible_observation_count: 0,
      tracked_observation_count: 0,
      self_reported_observation_count: 0,
      estimation_bias_ratio: 1.0,
      uncertainty: null,
      explanation: 'No measured completion history yet. Displaying your original estimate.',
    };
  }

  // 3. Calculate predicted duration
  const rawPredicted = userEstimateHours * biasRatio;
  const predictedDurationHours = Math.max(0.1, Math.round(rawPredicted * 10) / 10);

  // 4. Calculate empirical / heuristic uncertainty spread
  // Labeled strictly as heuristic empirical spread, never as a Gaussian confidence interval
  let spreadPercent = 0.3; // Default 30% for sparse
  if (modelStatus === 'supported') {
    spreadPercent = 0.15; // 15% for supported
  } else if (modelStatus === 'developing') {
    spreadPercent = 0.22; // 22% for developing
  }

  const lowHours = Math.max(0.1, Math.round(predictedDurationHours * (1.0 - spreadPercent) * 10) / 10);
  const highHours = Math.round(predictedDurationHours * (1.0 + spreadPercent) * 10) / 10;

  const uncertainty = {
    low_hours: lowHours,
    high_hours: highHours,
    range_label: 'Heuristic range',
    explanation: `Empirical range (±${Math.round(spreadPercent * 100)}%) reflecting observed duration variance across ${eligibleCount} task${eligibleCount > 1 ? 's' : ''}.`,
  };

  // 5. Generate plain-language explanation
  let explanation = '';
  const diffPercent = Math.round((biasRatio - 1.0) * 100);

  if (modelStatus === 'sparse') {
    explanation = `Adjusted by ${diffPercent >= 0 ? '+' : ''}${diffPercent}% using ${eligibleCount} early task observation${eligibleCount > 1 ? 's' : ''} (shrunk toward neutral). Complete more tasks to refine.`;
  } else if (modelStatus === 'developing') {
    explanation = `Adjusted using your observed pace across ${eligibleCount} tasks (${diffPercent >= 0 ? '+' : ''}${diffPercent}% adjustment).`;
  } else {
    explanation = `Well-supported estimate based on ${eligibleCount} measured tasks (${trackedCount} timed, ${selfReportedCount} reported).`;
  }

  return {
    predicted_duration_hours: predictedDurationHours,
    user_estimate_hours: userEstimateHours,
    personalization_status: modelStatus,
    eligible_observation_count: eligibleCount,
    tracked_observation_count: trackedCount,
    self_reported_observation_count: selfReportedCount,
    estimation_bias_ratio: biasRatio,
    uncertainty,
    explanation,
  };
}

/**
 * Minimum distinct completed tasks with estimates and durations needed to report holdout evaluation metrics.
 */
export const MIN_EVALUATION_TASKS = 5;
export const MIN_WALKFORWARD_TRAIN_TASKS = 3;

/**
 * Convenience helper to compute a duration prediction from raw events and tasks.
 */
export function getPersonalDurationEstimate(events, currentTasks, targetTaskOrEffort) {
  const model = buildPersonalDurationModel(events, currentTasks);
  return estimateTaskDuration(model, targetTaskOrEffort);
}

/**
 * Evaluates the personal duration estimator against the user's original effort estimates
 * using a leak-free chronological walk-forward (rolling-origin) validation.
 *
 * Requirements:
 * 1. Uses only genuine eligible completed tasks (joined by task_id, positive estimate, positive duration).
 * 2. Evaluates tasks in strict chronological order of completion.
 * 3. Each prediction uses model parameters fit strictly on tasks completed BEFORE that task.
 * 4. Zero target leakage: test task's observed duration and post-completion fields are NEVER in the training set.
 * 5. Compares personal model MAE/MdAPE against the user's original effort estimate baseline.
 * 6. Returns an explicit 'insufficient_data' state if fewer than MIN_EVALUATION_TASKS exist.
 *
 * @param {object[]} events Raw behavioral events
 * @param {object[]} [currentTasks=[]] Current task objects
 * @param {object} [options={}]
 * @param {number} [options.minTrainTasks=3] Minimum training tasks before walk-forward starts
 * @param {number} [options.minTotalTasks=5] Minimum total tasks required for evaluation
 * @returns {{
 *   status: 'insufficient_data'|'evaluated',
 *   totalEligibleTasks: number,
 *   minRequiredTasks: number,
 *   trainTaskCount: number,
 *   testTaskCount: number,
 *   metrics: {
 *     mae_model: number,
 *     mae_baseline: number,
 *     mdape_model: number,
 *     mdape_baseline: number,
 *     mae_improvement_hours: number,
 *     improvement_percent: number|null,
 *     better_predictions_count: number,
 *     worse_predictions_count: number,
 *     equal_predictions_count: number,
 *     total_test_count: number,
 *   }|null,
 *   testDetails: Array<{
 *     taskId: string,
 *     completedAt: string,
 *     estimatedHours: number,
 *     observedHours: number,
 *     predictedHours: number,
 *     biasRatioUsed: number,
 *     trainSetSize: number,
 *     trainEffectiveWeight: number,
 *     modelAbsError: number,
 *     baselineAbsError: number,
 *     improvementHours: number,
 *   }>,
 *   explanation: string,
 * }}
 */
export function evaluatePersonalDurationModel(events = [], currentTasks = [], options = {}) {
  const minTrain = options.minTrainTasks ?? MIN_WALKFORWARD_TRAIN_TASKS;
  const minTotal = options.minTotalTasks ?? MIN_EVALUATION_TASKS;

  const eligibleObservations = extractEligibleObservations(events, currentTasks);
  const totalEligible = eligibleObservations.length;

  if (totalEligible < minTotal) {
    return {
      status: 'insufficient_data',
      totalEligibleTasks: totalEligible,
      minRequiredTasks: minTotal,
      trainTaskCount: 0,
      testTaskCount: 0,
      metrics: null,
      testDetails: [],
      explanation: `Walk-forward holdout evaluation requires at least ${minTotal} completed tasks with effort estimates and durations (currently ${totalEligible} available). Evaluation activates automatically as you complete more tasks.`,
    };
  }

  // Eligible observations are already sorted chronologically by completedAt
  const testDetails = [];
  const modelAbsErrors = [];
  const baselineAbsErrors = [];
  const modelRelErrors = [];
  const baselineRelErrors = [];

  let betterCount = 0;
  let worseCount = 0;
  let equalCount = 0;

  for (let i = minTrain; i < totalEligible; i++) {
    const testObs = eligibleObservations[i];
    const trainObservations = eligibleObservations.slice(0, i);

    // Compute training parameters strictly from trainObservations
    const trainWeight = trainObservations.reduce((acc, o) => acc + o.weight, 0);
    const ratioItems = trainObservations.map((o) => ({
      value: o.clampedRatio,
      weight: o.weight,
    }));
    const rawWeightedMedian = calculateWeightedMedian(ratioItems) ?? NEUTRAL_BIAS_RATIO;
    const shrunkRatio =
      (trainWeight / (trainWeight + SHRINKAGE_PRIOR_WEIGHT)) * rawWeightedMedian +
      (SHRINKAGE_PRIOR_WEIGHT / (trainWeight + SHRINKAGE_PRIOR_WEIGHT)) * NEUTRAL_BIAS_RATIO;

    const roundedRatio = Math.round(shrunkRatio * 100) / 100;
    const rawPredicted = testObs.estimatedHours * roundedRatio;
    const predictedHours = Math.max(0.1, Math.round(rawPredicted * 10) / 10);
    const baselineHours = testObs.estimatedHours;
    const actualHours = testObs.observedHours;

    const modelError = Math.abs(predictedHours - actualHours);
    const baselineError = Math.abs(baselineHours - actualHours);

    // Relative percentage error: |pred - actual| / actual
    const modelRel = actualHours > 0 ? (modelError / actualHours) * 100 : 0;
    const baselineRel = actualHours > 0 ? (baselineError / actualHours) * 100 : 0;

    modelAbsErrors.push(modelError);
    baselineAbsErrors.push(baselineError);
    modelRelErrors.push(modelRel);
    baselineRelErrors.push(baselineRel);

    if (Math.abs(modelError - baselineError) < 0.05) {
      equalCount++;
    } else if (modelError < baselineError) {
      betterCount++;
    } else {
      worseCount++;
    }

    testDetails.push({
      taskId: testObs.taskId,
      completedAt: testObs.completedAt,
      estimatedHours: testObs.estimatedHours,
      observedHours: Math.round(actualHours * 10) / 10,
      predictedHours,
      biasRatioUsed: roundedRatio,
      trainSetSize: i,
      trainEffectiveWeight: Math.round(trainWeight * 10) / 10,
      modelAbsError: Math.round(modelError * 10) / 10,
      baselineAbsError: Math.round(baselineError * 10) / 10,
      improvementHours: Math.round((baselineError - modelError) * 10) / 10,
    });
  }

  const testCount = testDetails.length;
  if (testCount === 0) {
    return {
      status: 'insufficient_data',
      totalEligibleTasks: totalEligible,
      minRequiredTasks: minTotal,
      trainTaskCount: 0,
      testTaskCount: 0,
      metrics: null,
      testDetails: [],
      explanation: 'Insufficient observations for holdout test split.',
    };
  }

  // Mean Absolute Error
  const sumModelAE = modelAbsErrors.reduce((a, b) => a + b, 0);
  const sumBaselineAE = baselineAbsErrors.reduce((a, b) => a + b, 0);
  const maeModel = Math.round((sumModelAE / testCount) * 100) / 100;
  const maeBaseline = Math.round((sumBaselineAE / testCount) * 100) / 100;

  // Median Absolute Percentage Error (MdAPE)
  const sortedModelRel = [...modelRelErrors].sort((a, b) => a - b);
  const sortedBaselineRel = [...baselineRelErrors].sort((a, b) => a - b);
  const mid = Math.floor(testCount / 2);
  const mdapeModel =
    testCount % 2 !== 0
      ? Math.round(sortedModelRel[mid] * 10) / 10
      : Math.round(((sortedModelRel[mid - 1] + sortedModelRel[mid]) / 2) * 10) / 10;
  const mdapeBaseline =
    testCount % 2 !== 0
      ? Math.round(sortedBaselineRel[mid] * 10) / 10
      : Math.round(((sortedBaselineRel[mid - 1] + sortedBaselineRel[mid]) / 2) * 10) / 10;

  const maeDelta = Math.round((maeBaseline - maeModel) * 100) / 100;
  const improvementPercent =
    maeBaseline > 0 ? Math.round(((maeBaseline - maeModel) / maeBaseline) * 1000) / 10 : 0.0;

  return {
    status: 'evaluated',
    totalEligibleTasks: totalEligible,
    minRequiredTasks: minTotal,
    trainTaskCount: minTrain,
    testTaskCount: testCount,
    metrics: {
      mae_model: maeModel,
      mae_baseline: maeBaseline,
      mdape_model: mdapeModel,
      mdape_baseline: mdapeBaseline,
      mae_improvement_hours: maeDelta,
      improvement_percent: improvementPercent,
      better_predictions_count: betterCount,
      worse_predictions_count: worseCount,
      equal_predictions_count: equalCount,
      total_test_count: testCount,
    },
    testDetails,
    explanation: `Evaluated across ${testCount} holdout task${testCount > 1 ? 's' : ''} using chronological walk-forward splits. Personalized estimator achieved ${maeModel}h MAE vs ${maeBaseline}h baseline (${improvementPercent >= 0 ? '+' : ''}${improvementPercent}% error reduction).`,
  };
}
