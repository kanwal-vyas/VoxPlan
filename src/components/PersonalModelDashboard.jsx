import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  buildPersonalDurationModel,
  evaluatePersonalDurationModel,
  SHRINKAGE_PRIOR_WEIGHT,
  NEUTRAL_BIAS_RATIO,
  MIN_EVALUATION_TASKS,
} from '../telemetry/personalModel';
import LearningReadinessPanel from './LearningReadinessPanel';

export default function PersonalModelDashboard({ events = [], tasks = [] }) {
  const sectionRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [simulatedEffort, setSimulatedEffort] = useState(2.0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Compute model parameters from genuine events and tasks
  const model = useMemo(() => {
    return buildPersonalDurationModel(events, tasks);
  }, [events, tasks]);

  // Compute walk-forward chronological evaluation
  const evaluation = useMemo(() => {
    return evaluatePersonalDurationModel(events, tasks);
  }, [events, tasks]);

  const statusLabel = {
    cold_start: 'Cold Start',
    sparse: 'Sparse History',
    developing: 'Developing Profile',
    supported: 'Well-Supported',
  }[model.status] || 'Cold Start';

  const statusColor = {
    cold_start: { bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' },
    sparse: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
    developing: { bg: '#E0E7FF', text: '#3730A3', border: '#C7D2FE' },
    supported: { bg: '#DCFCE7', text: '#166534', border: '#BBF7D0' },
  }[model.status] || { bg: '#F3F4F6', text: '#6B7280', border: '#E5E7EB' };

  // Calculate live simulated duration for the simulation card
  const simulatedAdjustedHours = useMemo(() => {
    if (!simulatedEffort || simulatedEffort <= 0) return 0;
    if (model.status === 'cold_start') return simulatedEffort;
    const raw = simulatedEffort * model.biasRatio;
    return Math.max(0.1, Math.round(raw * 10) / 10);
  }, [simulatedEffort, model]);

  const biasPercent = Math.round((model.biasRatio - 1.0) * 100);

  return (
    <section
      id="personal-model"
      ref={sectionRef}
      style={styles.section}
      aria-label="Personal Duration Estimator & Evaluation"
    >
      <div style={styles.container}>
        {/* Section Header */}
        <div style={styles.header}>
          <div style={styles.titleGroup}>
            <div style={styles.badgeRow}>
              <span style={styles.sectionNum}>05</span>
              <span style={styles.badge}>PERSONAL ESTIMATION MODEL & EVALUATION</span>
              <span
                style={{
                  ...styles.statusBadge,
                  backgroundColor: statusColor.bg,
                  color: statusColor.text,
                  borderColor: statusColor.border,
                }}
              >
                ● {statusLabel}
              </span>
            </div>
            <h2 style={styles.title}>
              HOW VOXPLAN <span className={`hl hl-mint ${isVisible ? 'hl-sweep' : ''}`}>LEARNS</span> YOUR PACE
            </h2>
            <p style={styles.subtitle}>
              Transparent local effort-bias modeling with Bayesian shrinkage, chronological holdout evaluation, and honest sample accounting
            </p>
          </div>

          <div style={styles.privacyCapsule}>
            <span style={styles.privacyDot}>✦</span>
            <span>100% on-device inference · Zero cloud upload</span>
          </div>
        </div>

        {/* 4 Core Pastel Metric Cards */}
        <div style={styles.metricsGrid}>
          {/* Card 1: Model Maturity Tier */}
          <div style={{ ...styles.metricCard, borderTop: '4px solid #BFE8D0' }} className="digital-card">
            <div style={styles.cardHeaderRow}>
              <span style={styles.metricName}>Maturity Status</span>
              <span
                style={{
                  ...styles.tierPill,
                  backgroundColor: statusColor.bg,
                  color: statusColor.text,
                  borderColor: statusColor.border,
                }}
              >
                {statusLabel}
              </span>
            </div>
            <span style={styles.metricValue}>{model.eligibleCount}</span>
            <span style={styles.metricCaption}>
              {model.status === 'cold_start' && 'No completed task history yet. Using original estimates.'}
              {model.status === 'sparse' && `Sparse data (${model.effectiveWeight} weight / 3.0 required). Anchored to neutral 1.0x.`}
              {model.status === 'developing' && `Developing pattern (${model.effectiveWeight} weight). Applying conservative shrinkage.`}
              {model.status === 'supported' && `Well-supported velocity profile (${model.effectiveWeight} weight across ${model.eligibleCount} tasks).`}
            </span>
          </div>

          {/* Card 2: Sample Weights Breakdown */}
          <div style={{ ...styles.metricCard, borderTop: '4px solid #C9B6FF' }} className="digital-card">
            <span style={styles.metricName}>Effective Sample Weight</span>
            <span style={styles.metricValue}>{model.effectiveWeight}</span>
            <span style={styles.metricCaption}>
              {model.trackedCount} timed (w=1.0) · {model.selfReportedCount} reported (w=0.5)
            </span>
            <div style={styles.subtextRow}>
              <span>Raw observations: <strong>{model.eligibleCount}</strong></span>
              <span>·</span>
              <span>Unmeasured excluded: <strong>0.0w</strong></span>
            </div>
          </div>

          {/* Card 3: Personal Estimation-Bias Ratio */}
          <div style={{ ...styles.metricCard, borderTop: '4px solid #FFE58A' }} className="digital-card">
            <span style={styles.metricName}>Personal Bias Ratio</span>
            <span style={styles.metricValue}>
              {model.status === 'cold_start' ? '1.00x' : `${model.biasRatio.toFixed(2)}x`}
            </span>
            <span style={styles.metricCaption}>
              {model.status === 'cold_start'
                ? 'Neutral baseline pace (no adjustment applied)'
                : `${biasPercent >= 0 ? '+' : ''}${biasPercent}% personal duration adjustment`}
            </span>
            <div style={styles.subtextRow}>
              <span>Raw median: <strong>{model.rawBiasRatio ? `${model.rawBiasRatio.toFixed(2)}x` : '—'}</strong></span>
              <span>·</span>
              <span>Shrinkage prior: <strong>{SHRINKAGE_PRIOR_WEIGHT}.0w</strong></span>
            </div>
          </div>

          {/* Card 4: Interactive Estimate Simulator */}
          <div style={{ ...styles.metricCard, borderTop: '4px solid #C2E2FA' }} className="digital-card">
            <div style={styles.cardHeaderRow}>
              <span style={styles.metricName}>Prediction Preview</span>
              <span style={styles.simLabel}>Interactive</span>
            </div>
            <div style={styles.simulatorRow}>
              <span style={styles.simOriginal}>
                <input
                  type="number"
                  min="0.5"
                  max="40"
                  step="0.5"
                  value={simulatedEffort}
                  onChange={(e) => setSimulatedEffort(Math.max(0.5, parseFloat(e.target.value) || 1))}
                  style={styles.simInput}
                  aria-label="Simulate effort hours"
                />
                h
              </span>
              <span style={styles.simArrow}>→</span>
              <span style={styles.simPredicted}>~{simulatedAdjustedHours}h</span>
            </div>
            <span style={styles.metricCaption}>
              {model.status === 'cold_start'
                ? 'Unadjusted (cold-start baseline matches user estimate)'
                : `Adjusted based on observed pace (${model.biasRatio.toFixed(2)}x multiplier)`}
            </span>
          </div>
        </div>

        {/* Mid Panel: Bayesian Shrinkage Transparency */}
        <div style={styles.formulaPanel} className="digital-card">
          <div style={styles.panelHeader}>
            <span style={styles.panelTitle}>BAYESIAN SHRINKAGE ARCHITECTURE</span>
            <span className="note-tag" style={{ color: '#4338CA' }}>
              Formula & Priors
            </span>
          </div>

          <div style={styles.formulaGrid}>
            <div style={styles.formulaMathBox}>
              <div style={styles.mathEquation}>
                <span>Adjusted Ratio</span>
                <span>=</span>
                <div style={styles.fraction}>
                  <div style={styles.numerator}>
                    (W × r<sub>median</sub>) + (K × 1.0)
                  </div>
                  <div style={styles.denominator}>
                    W + K
                  </div>
                </div>
              </div>
              <div style={styles.mathVariables}>
                <div style={styles.mathVarItem}>
                  <strong>W = {model.effectiveWeight}</strong>: Current effective observation weight
                </div>
                <div style={styles.mathVarItem}>
                  <strong>r<sub>median</sub> = {model.rawBiasRatio ? `${model.rawBiasRatio.toFixed(2)}x` : '1.00x'}</strong>: Weighted median of observed ratios
                </div>
                <div style={styles.mathVarItem}>
                  <strong>K = {SHRINKAGE_PRIOR_WEIGHT}.0</strong>: Shrinkage anchor weight (neutral prior)
                </div>
              </div>
            </div>

            <div style={styles.formulaExplanation}>
              <h4 style={styles.formulaSubhead}>Why Bayesian Shrinkage?</h4>
              <p style={styles.formulaP}>
                Small samples are noisy. If your first completed task took twice as long because of an unexpected interruption, a naive multiplier would double every future task estimate.
              </p>
              <p style={styles.formulaP}>
                VoxPlan anchors early observations to a neutral ratio of <strong>{NEUTRAL_BIAS_RATIO}.0x</strong> with a prior weight of <strong>{SHRINKAGE_PRIOR_WEIGHT}.0</strong>. As you accumulate more timed tasks, your empirical pace smoothly overcomes the prior.
              </p>
            </div>
          </div>
        </div>

        {/* Mid Panel 2: Guarded Completion-Risk Architecture */}
        <div style={styles.formulaPanel} className="digital-card">
          <div style={styles.panelHeader}>
            <div>
              <span style={styles.panelTitle}>GUARDED COMPLETION-RISK ARCHITECTURE</span>
              <span style={styles.panelSub}>
                Local personal layer conservatively adjusting synthetic Random Forest baseline probabilities
              </span>
            </div>
            <span
              className="note-tag"
              style={{
                color: model.effectiveWeight >= 3.0 ? '#166534' : '#6B7280',
                backgroundColor: model.effectiveWeight >= 3.0 ? '#DCFCE7' : '#F3F4F6',
              }}
            >
              {model.effectiveWeight >= 3.0 ? '● Personal Risk Layer Active (W ≥ 3.0)' : '○ Baseline Only (Awaiting 3.0 Weight)'}
            </span>
          </div>

          <div style={styles.riskSignalsGrid}>
            <div style={styles.riskSignalCard}>
              <div style={styles.riskSignalHead}>
                <span style={styles.riskSignalIcon}>📅</span>
                <span style={styles.riskSignalTitle}>Task Postponement Friction</span>
              </div>
              <p style={styles.riskSignalDesc}>
                Tracks repeated <code>task_rescheduled</code> events on active tasks. Tasks postponed 1 time add +5% raw friction; 2+ postponements add +10%.
              </p>
            </div>

            <div style={styles.riskSignalCard}>
              <div style={styles.riskSignalHead}>
                <span style={styles.riskSignalIcon}>⚡</span>
                <span style={styles.riskSignalTitle}>Personal Estimation-Bias Stress</span>
              </div>
              <p style={styles.riskSignalDesc}>
                Scales estimated effort by your empirical pace (<strong>{model.biasRatio.toFixed(2)}x</strong>). If personalized effort exceeds remaining working window, adds +6% stress.
              </p>
            </div>

            <div style={styles.riskSignalCard}>
              <div style={styles.riskSignalHead}>
                <span style={styles.riskSignalIcon}>🔁</span>
                <span style={styles.riskSignalTitle}>Task Reopening Churn</span>
              </div>
              <p style={styles.riskSignalDesc}>
                Detects whether an active task was previously closed and reopened (<code>task_reopened</code>), signaling incomplete criteria (+5% raw friction).
              </p>
            </div>
          </div>

          <div style={styles.riskGuardsBox}>
            <div style={styles.riskGuardItem}>
              <strong>Strict Ceiling:</strong> Raw signal adjustments are clamped to <strong>±15%</strong> maximum probability shift.
            </div>
            <div style={styles.riskGuardItem}>
              <strong>Sample-Confidence Shrinkage:</strong> Shrunk by <code>W / (W + 5.0)</code> ({model.effectiveWeight > 0 ? `${Math.round((model.effectiveWeight / (model.effectiveWeight + 5.0)) * 100)}%` : '0%'} confidence applied).
            </div>
            <div style={styles.riskGuardItem}>
              <strong>Temporal Leakage Protection:</strong> Only events occurring strictly prior to prediction time are analyzed.
            </div>
          </div>
        </div>

        {/* Bottom Panel: Walk-Forward Holdout Evaluation */}
        <div style={styles.evalPanel} className="digital-card">
          <div style={styles.panelHeader}>
            <div>
              <span style={styles.panelTitle}>CHRONOLOGICAL WALK-FORWARD EVALUATION</span>
              <span style={styles.panelSub}>
                Strict out-of-sample holdout validation without target leakage
              </span>
            </div>
            <span
              className="note-tag"
              style={{
                color: evaluation.status === 'evaluated' ? '#166534' : '#92400E',
                backgroundColor: evaluation.status === 'evaluated' ? '#DCFCE7' : '#FEF3C7',
              }}
            >
              {evaluation.status === 'evaluated'
                ? `Evaluated (${evaluation.heldOutPredictionCount || evaluation.testTaskCount} held-out predictions)`
                : `Awaiting Data (${evaluation.heldOutPredictionCount || 0}/5 held-out predictions)`}
            </span>
          </div>

          {evaluation.status !== 'evaluated' ? (
            <div style={styles.coldStartBox}>
              <div style={styles.coldStartIcon}>⏱️</div>
              <div style={styles.coldStartContent}>
                <h4 style={styles.coldStartTitle}>Evaluation Requires at Least 5 Held-Out Predictions (8 Total Tasks)</h4>
                <p style={styles.coldStartText}>
                  {evaluation.explanation}
                </p>
                <div style={styles.progressBarTrack}>
                  <div
                    style={{
                      ...styles.progressBarFill,
                      width: `${Math.min(100, Math.round(((evaluation.heldOutPredictionCount || 0) / 5) * 100))}%`,
                    }}
                  />
                </div>
                <div style={styles.progressLabelRow}>
                  <span>{evaluation.heldOutPredictionCount || 0} / 5 held-out predictions generated</span>
                  <span>{evaluation.eligibleObservationCount || evaluation.totalEligibleTasks || 0} / {MIN_EVALUATION_TASKS} completed tasks</span>
                </div>
                <div style={styles.honestyCallout}>
                  <strong>Defensible Evaluation Standard:</strong> VoxPlan requires at least 3 chronologically earlier tasks to train each split, plus at least 5 genuine held-out test predictions (8 total completed tasks) before reporting evaluable aggregate metrics. This prevents misleading conclusions from small test sample sizes.
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.evalResultsWrap}>
              {/* Metric Cards Row */}
              <div style={styles.evalMetricsGrid}>
                <div style={styles.evalMetricCard}>
                  <span style={styles.evalMetricLabel}>Personal Model MAE</span>
                  <span style={styles.evalMetricValue}>
                    {evaluation.metrics.mae_model}h
                  </span>
                  <span style={styles.evalMetricSub}>Mean Absolute Error</span>
                </div>

                <div style={styles.evalMetricCard}>
                  <span style={styles.evalMetricLabel}>User Estimate MAE</span>
                  <span style={styles.evalMetricValue}>
                    {evaluation.metrics.mae_baseline}h
                  </span>
                  <span style={styles.evalMetricSub}>Original effort baseline</span>
                </div>

                <div style={styles.evalMetricCard}>
                  <span style={styles.evalMetricLabel}>Error Reduction</span>
                  <span
                    style={{
                      ...styles.evalMetricValue,
                      color: evaluation.metrics.mae_improvement_hours >= 0 ? '#166534' : '#DC2626',
                    }}
                  >
                    {evaluation.metrics.mae_improvement_hours >= 0 ? '-' : '+'}
                    {Math.abs(evaluation.metrics.mae_improvement_hours)}h
                  </span>
                  <span style={styles.evalMetricSub}>
                    {evaluation.metrics.improvement_percent >= 0 ? '+' : ''}
                    {evaluation.metrics.improvement_percent}% error improvement
                  </span>
                </div>

                <div style={styles.evalMetricCard}>
                  <span style={styles.evalMetricLabel}>Median Rel Error (MdAPE)</span>
                  <span style={styles.evalMetricValue}>
                    {evaluation.metrics.mdape_model}%
                  </span>
                  <span style={styles.evalMetricSub}>
                    vs {evaluation.metrics.mdape_baseline}% baseline MdAPE
                  </span>
                </div>
              </div>

              {/* Explanatory Banner */}
              <div style={styles.evalSummaryBanner}>
                <span>✓ {evaluation.explanation}</span>
                <span style={styles.winRateBadge}>
                  Win rate: {evaluation.metrics.better_predictions_count}/{evaluation.metrics.total_test_count} tasks closer to actual duration
                </span>
              </div>

              {/* Walk-Forward Test Tasks Table */}
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Task</th>
                      <th style={styles.th}>User Estimate</th>
                      <th style={styles.th}>Personal Prediction</th>
                      <th style={styles.th}>Actual Duration</th>
                      <th style={styles.th}>Model Error</th>
                      <th style={styles.th}>Baseline Error</th>
                      <th style={styles.th}>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluation.testDetails.map((td, idx) => {
                      const isBetter = td.modelAbsError < td.baselineAbsError;
                      const isEqual = Math.abs(td.modelAbsError - td.baselineAbsError) < 0.05;
                      return (
                        <tr key={td.taskId || idx} style={styles.tr}>
                          <td style={styles.td}>
                            <strong>Task #{idx + 1}</strong>
                            <div style={styles.tdSub}>Fit on prior {td.trainSetSize} tasks</div>
                          </td>
                          <td style={styles.td}>{td.estimatedHours}h</td>
                          <td style={styles.td}>
                            <strong>{td.predictedHours}h</strong>
                            <div style={styles.tdSub}>{td.biasRatioUsed.toFixed(2)}x ratio</div>
                          </td>
                          <td style={styles.td}><strong>{td.observedHours}h</strong></td>
                          <td style={styles.td}>{td.modelAbsError}h</td>
                          <td style={styles.td}>{td.baselineAbsError}h</td>
                          <td style={styles.td}>
                            <span
                              style={{
                                ...styles.outcomeBadge,
                                backgroundColor: isBetter ? '#DCFCE7' : isEqual ? '#F3F4F6' : '#FEE2E2',
                                color: isBetter ? '#166534' : isEqual ? '#4B5563' : '#991B1B',
                              }}
                            >
                              {isBetter ? '✓ Improved' : isEqual ? '= Tied' : '△ Baseline Closer'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Phase 7.1: Longitudinal Sample Maturity Gating & Readiness Diagnostics */}
        <LearningReadinessPanel events={events} tasks={tasks} />

        {/* Methodological Honesty Disclosures Card */}
        <div style={styles.honestyGrid}>
          <div style={styles.honestyCard}>
            <div style={styles.honestyHeader}>
              <span style={styles.honestyIcon}>📐</span>
              <h4 style={styles.honestyTitle}>Interpretable Bias Correction</h4>
            </div>
            <p style={styles.honestyDesc}>
              This estimator is an interpretable, Bayesian-shrunk weighted median correction, not a complex neural network or black-box regressor. It avoids overfitting sparse historical data while maintaining complete auditability.
            </p>
          </div>

          <div style={styles.honestyCard}>
            <div style={styles.honestyHeader}>
              <span style={styles.honestyIcon}>🛡️</span>
              <h4 style={styles.honestyTitle}>Baseline Risk Distinction</h4>
            </div>
            <p style={styles.honestyDesc}>
              The Random Forest completion-risk model in Section 03 remains an empirical baseline trained on synthetic data. Only task duration estimation is personalized in this phase; risk predictions are not yet claimed as personalized.
            </p>
          </div>

          <div style={styles.honestyCard}>
            <div style={styles.honestyHeader}>
              <span style={styles.honestyIcon}>🔒</span>
              <h4 style={styles.honestyTitle}>Durable Local Privacy</h4>
            </div>
            <p style={styles.honestyDesc}>
              All calculations run entirely client-side in browser memory from your local IndexedDB store (<code>voxplan_db</code>). Clearing history in Section 04 permanently resets the estimator to cold-start immediately.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    padding: '16px 0',
  },
  container: {
    backgroundColor: '#FAF5ED',
    borderRadius: '20px',
    padding: '32px',
    boxShadow: '0 4px 18px rgba(61, 38, 69, 0.05)',
    border: '1.5px solid rgba(61, 38, 69, 0.10)',
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '24px',
    marginBottom: '40px',
  },
  titleGroup: {
    flex: '1 1 500px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  sectionNum: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '14px',
    fontWeight: '700',
    color: '#3730A3',
    backgroundColor: '#EEF2FF',
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid #C7D2FE',
  },
  badge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    color: 'rgba(37, 36, 42, 0.6)',
  },
  statusBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 10px',
    borderRadius: '12px',
    border: '1px solid',
  },
  title: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: 'clamp(28px, 4vw, 44px)',
    fontWeight: '800',
    color: 'var(--c-ink, #25242A)',
    lineHeight: '1.15',
    margin: '0 0 12px 0',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '16px',
    color: 'rgba(37, 36, 42, 0.7)',
    margin: 0,
    lineHeight: '1.5',
    maxWidth: '680px',
  },
  privacyCapsule: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#F0FDF4',
    border: '1px solid #BBF7D0',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#166534',
  },
  privacyDot: {
    color: '#16A34A',
    fontSize: '14px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '20px',
    marginBottom: '32px',
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  metricName: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '13px',
    fontWeight: '700',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'rgba(37, 36, 42, 0.55)',
  },
  tierPill: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '10px',
    border: '1px solid',
  },
  metricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '36px',
    fontWeight: '800',
    color: 'var(--c-ink, #25242A)',
    margin: '4px 0 8px 0',
    lineHeight: '1.1',
  },
  metricCaption: {
    fontSize: '13px',
    color: 'rgba(37, 36, 42, 0.7)',
    lineHeight: '1.4',
  },
  subtextRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px solid rgba(37, 36, 42, 0.06)',
    fontSize: '11px',
    color: 'rgba(37, 36, 42, 0.55)',
    fontFamily: "'JetBrains Mono', monospace",
  },
  simLabel: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#0284C7',
    backgroundColor: '#E0F2FE',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },
  simulatorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '8px 0 10px 0',
  },
  simOriginal: {
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '22px',
    fontWeight: '700',
    color: 'rgba(37, 36, 42, 0.6)',
  },
  simInput: {
    width: '60px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '22px',
    fontWeight: '800',
    border: '1px dashed #CBD5E1',
    borderRadius: '6px',
    padding: '2px 6px',
    color: '#25242A',
    backgroundColor: '#F8FAFC',
    textAlign: 'center',
  },
  simArrow: {
    fontSize: '18px',
    color: '#6366F1',
    fontWeight: '700',
  },
  simPredicted: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '32px',
    fontWeight: '800',
    color: '#4F46E5',
  },
  formulaPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    padding: '28px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
    marginBottom: '32px',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  panelTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '15px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--c-ink, #25242A)',
  },
  panelSub: {
    display: 'block',
    fontSize: '13px',
    color: 'rgba(37, 36, 42, 0.6)',
    marginTop: '2px',
  },
  formulaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '24px',
    alignItems: 'center',
  },
  formulaMathBox: {
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '20px',
  },
  mathEquation: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '16px',
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  fraction: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  numerator: {
    borderBottom: '2px solid #334155',
    paddingBottom: '2px',
    fontSize: '14px',
  },
  denominator: {
    paddingTop: '2px',
    fontSize: '14px',
  },
  mathVariables: {
    fontSize: '12px',
    color: '#475569',
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: '1.6',
    borderTop: '1px solid #E2E8F0',
    paddingTop: '12px',
  },
  mathVarItem: {
    marginBottom: '4px',
  },
  formulaExplanation: {
    color: 'rgba(37, 36, 42, 0.8)',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  formulaSubhead: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '16px',
    fontWeight: '700',
    margin: '0 0 8px 0',
    color: '#1E293B',
  },
  formulaP: {
    margin: '0 0 10px 0',
  },
  evalPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    padding: '28px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
    marginBottom: '32px',
  },
  coldStartBox: {
    display: 'flex',
    gap: '20px',
    padding: '24px',
    backgroundColor: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: '8px',
    alignItems: 'flex-start',
  },
  coldStartIcon: {
    fontSize: '32px',
  },
  coldStartContent: {
    flex: 1,
  },
  coldStartTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '16px',
    fontWeight: '800',
    color: '#92400E',
    margin: '0 0 8px 0',
  },
  coldStartText: {
    fontSize: '14px',
    color: '#78350F',
    margin: '0 0 16px 0',
    lineHeight: '1.5',
  },
  progressBarTrack: {
    height: '8px',
    backgroundColor: 'rgba(146, 64, 14, 0.15)',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#D97706',
    borderRadius: '4px',
    transition: 'width 0.4s ease',
  },
  progressLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: '600',
    color: '#92400E',
    marginBottom: '16px',
  },
  honestyCallout: {
    fontSize: '12px',
    color: '#78350F',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(146, 64, 14, 0.2)',
    lineHeight: '1.5',
  },
  evalResultsWrap: {
    marginTop: '8px',
  },
  evalMetricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  },
  evalMetricCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #E2E8F0',
  },
  evalMetricLabel: {
    fontSize: '12px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#64748B',
    fontFamily: "'Outfit', sans-serif",
  },
  evalMetricValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '28px',
    fontWeight: '800',
    color: '#0F172A',
    margin: '6px 0',
    display: 'block',
  },
  evalMetricSub: {
    fontSize: '12px',
    color: '#64748B',
  },
  evalSummaryBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    border: '1px solid #BBF7D0',
    borderRadius: '6px',
    padding: '12px 16px',
    fontSize: '13px',
    color: '#166534',
    fontWeight: '600',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '10px',
  },
  winRateBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    backgroundColor: '#DCFCE7',
    padding: '3px 8px',
    borderRadius: '4px',
    color: '#15803D',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '2px solid #E2E8F0',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#64748B',
    fontFamily: "'Outfit', sans-serif",
  },
  tr: {
    borderBottom: '1px solid #F1F5F9',
  },
  td: {
    padding: '12px',
    verticalAlign: 'middle',
    color: '#1E293B',
    fontFamily: "'JetBrains Mono', monospace",
  },
  tdSub: {
    fontSize: '11px',
    color: '#64748B',
    fontWeight: 'normal',
    marginTop: '2px',
  },
  outcomeBadge: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '700',
    fontFamily: "'JetBrains Mono', monospace",
  },
  riskSignalsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '16px',
    marginBottom: '20px',
  },
  riskSignalCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    padding: '16px',
    border: '1px solid #E2E8F0',
  },
  riskSignalHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  riskSignalIcon: {
    fontSize: '18px',
  },
  riskSignalTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '14px',
    fontWeight: '700',
    color: '#1E293B',
  },
  riskSignalDesc: {
    fontSize: '12px',
    color: '#475569',
    lineHeight: '1.5',
    margin: 0,
  },
  riskGuardsBox: {
    backgroundColor: '#EEF2FF',
    border: '1px solid #C7D2FE',
    borderRadius: '8px',
    padding: '14px 16px',
    fontSize: '12px',
    color: '#3730A3',
    lineHeight: '1.6',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  riskGuardItem: {
    fontFamily: "'JetBrains Mono', monospace",
  },
  honestyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  },
  honestyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
  },
  honestyHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  honestyIcon: {
    fontSize: '18px',
  },
  honestyTitle: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '14px',
    fontWeight: '800',
    color: '#1E293B',
    margin: 0,
    letterSpacing: '0.02em',
  },
  honestyDesc: {
    fontSize: '13px',
    color: 'rgba(37, 36, 42, 0.7)',
    lineHeight: '1.5',
    margin: 0,
  },
};
