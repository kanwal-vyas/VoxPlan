/**
 * VoxPlan Guarded Personal Completion-Risk Estimator.
 * Client-side personal risk layer that applies conservative, bounded adjustments
 * to the baseline Random Forest delay-risk probabilities using audited local behavioral signals.
 *
 * Preserves strict separation between:
 * - Synthetic baseline model (generic delay risk).
 * - Personal duration estimator (effort-bias correction).
 * - Guarded personal risk layer (evidence-based local adjustments).
 */

export const MIN_PERSONAL_RISK_WEIGHT = 3.0; // Minimum effective personal history weight required
export const RISK_SHRINKAGE_PRIOR = 5.0; // Prior weight for sample-confidence shrinkage: W / (W + 5.0)
export const MAX_RISK_ADJUSTMENT = 0.15; // Hard bound: personal adjustment cannot exceed +/- 15%

export const RISK_LOW_THRESHOLD = 0.35;
export const RISK_HIGH_THRESHOLD = 0.65;

/**
 * Classifies a probability into standard VoxPlan risk categories.
 * @param {number} prob
 * @returns {'LOW'|'MEDIUM'|'HIGH'}
 */
export function getRiskCategory(prob) {
  if (prob < RISK_LOW_THRESHOLD) return 'LOW';
  if (prob < RISK_HIGH_THRESHOLD) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Computes a guarded, conservative personal adjustment to a task's baseline delay risk.
 *
 * Audited Personal Signals:
 * 1. Task Postponements / Reschedules: Repeated due date changes on the active task.
 * 2. Personal Estimation-Bias Stress: Task effort scaled by personal duration multiplier r_adjusted
 *    relative to remaining working calendar window.
 * 3. Task Reopening / Scope Churn: Active tasks that were previously completed and reopened.
 *
 * Safeguards:
 * - Cold-start guard: If user has < 3.0 effective personal weight, baseline risk is returned unmodified.
 * - Temporal leakage protection: Only events recorded strictly BEFORE prediction timestamp are considered.
 * - Target leakage safety: Target task's actual duration, completion status, or future events are NEVER accessed.
 * - Outlier resistance: Raw signal adjustments are clamped to [-0.15, +0.15] and shrunk by W / (W + 5.0).
 * - Uncalibrated disclosure: Explicitly labeled as a heuristic personal adjustment, never as a calibrated probability.
 *
 * @param {object} baselinePrediction Output from backend Random Forest model: { probability, risk, explanation }
 * @param {object} task Target task object { id, dueDate, estimatedEffort, priority, ... }
 * @param {object[]} events Raw behavioral events from IndexedDB
 * @param {object} personalDurationModel Model built by buildPersonalDurationModel(events, currentTasks)
 * @param {number|string} [asOfTime=Date.now()] Prediction timestamp for temporal leakage safety
 * @returns {{
 *   baseline_probability: number,
 *   adjusted_probability: number,
 *   risk: 'LOW'|'MEDIUM'|'HIGH',
 *   baseline_risk: 'LOW'|'MEDIUM'|'HIGH',
 *   personal_adjustment: number,
 *   personalization_status: 'baseline_only'|'personal_guarded_adjustment',
 *   effective_sample_weight: number,
 *   signals_applied: Array<{ signal: string, detail: string, delta: number }>,
 *   explanation: string,
 * }}
 */
export function computeGuardedTaskRisk(
  arg1,
  arg2,
  events = [],
  personalDurationModel = null,
  asOfTime = Date.now()
) {
  // Gracefully handle either (task, baselinePrediction) or (baselinePrediction, task)
  let task = null;
  let baselinePrediction = null;

  if (arg1 && typeof arg1 === 'object' && ('title' in arg1 || 'estimatedEffort' in arg1 || 'dueDate' in arg1)) {
    task = arg1;
    baselinePrediction = arg2;
  } else if (arg2 && typeof arg2 === 'object' && ('title' in arg2 || 'estimatedEffort' in arg2 || 'dueDate' in arg2)) {
    task = arg2;
    baselinePrediction = arg1;
  } else if (arg1 && typeof arg1 === 'object' && ('probability' in arg1 || 'delay_probability' in arg1)) {
    baselinePrediction = arg1;
    task = arg2;
  } else {
    task = arg1;
    baselinePrediction = arg2;
  }

  if (!task) {
    return null;
  }

  // Baseline probability extraction
  const rawBaseProb = baselinePrediction?.delay_probability ?? baselinePrediction?.probability ?? 0.5;
  const baseProb = Math.max(0.0, Math.min(1.0, rawBaseProb));
  const baseRisk = baselinePrediction?.risk || getRiskCategory(baseProb);

  const effectiveWeight = personalDurationModel?.effectiveWeight ?? 0;
  const biasRatio = personalDurationModel?.biasRatio ?? 1.0;
  const modelStatus = personalDurationModel?.status ?? 'cold_start';

  // 1. Cold-Start / Insufficient History Guard
  // Requires at least MIN_PERSONAL_RISK_WEIGHT (3.0) before applying personal probability adjustments
  if (modelStatus === 'cold_start' || effectiveWeight < MIN_PERSONAL_RISK_WEIGHT) {
    return {
      delay_probability: Math.round(baseProb * 1000) / 1000,
      probability: Math.round(baseProb * 1000) / 1000,
      baseline_delay_probability: Math.round(baseProb * 1000) / 1000,
      baseline_probability: Math.round(baseProb * 1000) / 1000,
      adjusted_probability: Math.round(baseProb * 1000) / 1000,
      risk: baseRisk,
      baseline_risk: baseRisk,
      personal_adjustment: 0.0,
      is_personalized: false,
      personalization_status: 'baseline_only',
      effective_sample_weight: effectiveWeight,
      effective_weight: effectiveWeight,
      confidence_multiplier: 0.0,
      signals_applied: [],
      signal_details: [],
      explanation: 'Using baseline delay risk. Personal risk adjustment requires at least 3.0 effective completed task weight.',
      fallback_reason: 'Requires at least 3.0 measured tasks with duration history.',
      recommendation: baselinePrediction?.recommendation || null,
      top_risk_factors: baselinePrediction?.top_risk_factors || [],
    };
  }

  // 2. Filter events for temporal leakage protection
  // Strictly filter events matching task.id that occurred on or before asOfTime
  const predictionEpoch = typeof asOfTime === 'string' ? new Date(asOfTime).getTime() : asOfTime;

  const seenEventIds = new Set();
  const taskEvents = [];
  for (const ev of events) {
    if (ev && ev.task_id === task.id && ev.event_id && !seenEventIds.has(ev.event_id)) {
      seenEventIds.add(ev.event_id);
      const evEpoch = new Date(ev.timestamp).getTime();
      // Temporal leakage safeguard: ignore events recorded after prediction time
      if (Number.isFinite(evEpoch) && evEpoch <= predictionEpoch) {
        taskEvents.push(ev);
      }
    }
  }

  // 3. Compute Personal Signals
  const signalsApplied = [];
  let rawDelta = 0.0;

  // Signal 1: Task Postponements / Reschedules
  const rescheduleEvents = taskEvents.filter((ev) => ev.event_type === 'task_rescheduled');
  const rescheduleCount = rescheduleEvents.length;

  if (rescheduleCount >= 2) {
    const delta = 0.10;
    rawDelta += delta;
    signalsApplied.push({
      signal: 'repeated_postponements',
      detail: `Task postponed ${rescheduleCount} times (${rescheduleCount} postponements) prior to prediction`,
      delta,
    });
  } else if (rescheduleCount === 1) {
    const delta = 0.05;
    rawDelta += delta;
    signalsApplied.push({
      signal: 'single_postponement',
      detail: 'Task deadline rescheduled 1 time (1 postponement)',
      delta,
    });
  }

  // Signal 2: Personal Effort-Density Stress
  // If the user's empirical estimation bias (r_adjusted) indicates tasks take longer than estimated,
  // evaluate whether the personalized duration exceeds available calendar capacity.
  const rawEffort = task.estimatedEffort ?? task.estimated_effort;
  const dueDateStr = task.dueDate ?? task.due_date;

  if (typeof rawEffort === 'number' && rawEffort > 0 && dueDateStr) {
    const dueEpoch = new Date(dueDateStr).getTime();
    if (Number.isFinite(dueEpoch)) {
      const daysRemaining = (dueEpoch - predictionEpoch) / (1000 * 3600 * 24);

      if (daysRemaining > 0) {
        const personalizedEffortHours = rawEffort * biasRatio;
        const availableWorkHours = daysRemaining * 8.0; // 8-hour working day assumption

        if (biasRatio >= 1.25 && personalizedEffortHours > availableWorkHours * 0.5) {
          const delta = 0.06;
          rawDelta += delta;
          signalsApplied.push({
            signal: 'estimation_bias_stress',
            detail: `Observed pace (${biasRatio.toFixed(2)}x) inflates required effort to ~${personalizedEffortHours.toFixed(1)}h in ${daysRemaining.toFixed(1)} remaining days`,
            delta,
          });
        } else if (biasRatio <= 0.85 && daysRemaining >= 3.0) {
          const delta = -0.04;
          rawDelta += delta;
          signalsApplied.push({
            signal: 'favorable_personal_pace',
            detail: `Observed pace (${biasRatio.toFixed(2)}x) provides safety buffer across ${daysRemaining.toFixed(1)} remaining days`,
            delta,
          });
        }
      }
    }
  }

  // Signal 3: Task Reopening / Scope Churn
  const hasReopened = taskEvents.some((ev) => ev.event_type === 'task_reopened');
  if (hasReopened) {
    const delta = 0.05;
    rawDelta += delta;
    signalsApplied.push({
      signal: 'task_reopened',
      detail: 'Task was previously completed and reopened (indicates unmet completion criteria)',
      delta,
    });
  }

  // If no personal signals triggered, return baseline
  if (signalsApplied.length === 0) {
    return {
      delay_probability: Math.round(baseProb * 1000) / 1000,
      probability: Math.round(baseProb * 1000) / 1000,
      baseline_delay_probability: Math.round(baseProb * 1000) / 1000,
      baseline_probability: Math.round(baseProb * 1000) / 1000,
      adjusted_probability: Math.round(baseProb * 1000) / 1000,
      risk: baseRisk,
      baseline_risk: baseRisk,
      personal_adjustment: 0.0,
      is_personalized: false,
      personalization_status: 'baseline_only',
      effective_sample_weight: effectiveWeight,
      effective_weight: effectiveWeight,
      confidence_multiplier: Math.round((effectiveWeight / (effectiveWeight + RISK_SHRINKAGE_PRIOR)) * 1000) / 1000,
      signals_applied: [],
      signal_details: [],
      explanation: `Baseline delay risk (${Math.round(baseProb * 100)}%) confirmed. No active personal risk friction signals detected.`,
      fallback_reason: 'No active personal risk friction signals detected on this task.',
      recommendation: baselinePrediction?.recommendation || null,
      top_risk_factors: baselinePrediction?.top_risk_factors || [],
    };
  }

  // 4. Clamping and Bayesian Sample-Confidence Shrinkage
  // Clamp raw delta to [-MAX_RISK_ADJUSTMENT, +MAX_RISK_ADJUSTMENT]
  const clampedRawDelta = Math.max(-MAX_RISK_ADJUSTMENT, Math.min(MAX_RISK_ADJUSTMENT, rawDelta));

  // Shrinkage confidence: W / (W + 5.0)
  const confidence = effectiveWeight / (effectiveWeight + RISK_SHRINKAGE_PRIOR);
  const appliedDelta = Math.round(clampedRawDelta * confidence * 10000) / 10000;

  // Bounded adjusted probability: [0.05, 0.95]
  const adjustedProb = Math.max(0.05, Math.min(0.95, baseProb + appliedDelta));
  const roundedAdjProb = Math.round(adjustedProb * 10000) / 10000;
  const newRisk = getRiskCategory(roundedAdjProb);

  const deltaPct = Math.round(appliedDelta * 100);
  const deltaSign = deltaPct >= 0 ? '+' : '';

  const explanation = `Baseline risk (${Math.round(baseProb * 100)}%) adjusted by ${deltaSign}${deltaPct}% to ${Math.round(roundedAdjProb * 100)}% based on ${signalsApplied.length} local signal${signalsApplied.length > 1 ? 's' : ''} (shrunk by personal evidence weight ${effectiveWeight.toFixed(1)}).`;

  return {
    delay_probability: roundedAdjProb,
    probability: roundedAdjProb,
    baseline_delay_probability: Math.round(baseProb * 1000) / 1000,
    baseline_probability: Math.round(baseProb * 1000) / 1000,
    adjusted_probability: roundedAdjProb,
    risk: newRisk,
    baseline_risk: baseRisk,
    personal_adjustment: appliedDelta,
    is_personalized: true,
    personalization_status: 'personal_guarded_adjustment',
    effective_sample_weight: effectiveWeight,
    effective_weight: effectiveWeight,
    confidence_multiplier: Math.round(confidence * 1000) / 1000,
    signals_applied: signalsApplied.map((s) => s.detail),
    signal_details: signalsApplied,
    explanation,
    fallback_reason: null,
    recommendation: baselinePrediction?.recommendation || null,
    top_risk_factors: baselinePrediction?.top_risk_factors || [],
  };
}

/**
 * Batch processes an array of tasks and predictions to produce hybrid guarded predictions.
 *
 * @param {object} predictionsMap Map of taskId -> baselinePrediction
 * @param {object[]} tasks Array of task objects
 * @param {object[]} events Raw behavioral events
 * @param {object} personalDurationModel Model from buildPersonalDurationModel
 * @param {number|string} [asOfTime=Date.now()] Prediction timestamp
 * @returns {object} Map of taskId -> guardedPrediction
 */
export function computeBatchGuardedRisk(
  predictionsMap = {},
  tasks = [],
  events = [],
  personalDurationModel = null,
  asOfTime = Date.now()
) {
  const result = {};

  for (const task of tasks) {
    if (!task || !task.id) continue;
    const basePred = predictionsMap[task.id] || null;

    if (!basePred) {
      result[task.id] = null;
      continue;
    }

    const guarded = computeGuardedTaskRisk(
      basePred,
      task,
      events,
      personalDurationModel,
      asOfTime
    );

    result[task.id] = {
      ...basePred,
      ...guarded,
      // Maintain consistent UI keys
      probability: guarded.adjusted_probability,
      percentage: Math.round(guarded.adjusted_probability * 1000) / 10,
      risk: guarded.risk,
    };
  }

  return result;
}
