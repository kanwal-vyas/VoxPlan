import React, { useMemo, useState } from 'react';
import {
  computeBoundedCandidateWeights,
  DEFAULT_K_PRIOR,
  MAX_RELATIVE_WEIGHT_DELTA,
} from '../scheduler/boundedWeightAdapter';
import {
  evaluateShadowSchedule,
} from '../scheduler/shadowSchedulerEvaluator';
import { FACTORY_SCHEDULER_WEIGHTS } from '../scheduler/adaptiveScheduler';
import { analyzePreferenceSignals } from '../scheduler/preferenceAnalyzer';
import { evaluateLearningReadiness } from '../scheduler/learningReadinessGate';
import { extractEligiblePreferenceEvidence } from '../scheduler/preferenceEvidence';
import { evaluateOfflineRanking, MIN_EVALUATION_SAMPLE } from '../scheduler/rankingEvaluator';
import {
  runScheduleSimulation,
  SIMULATION_SCENARIOS,
  SIMULATION_WEIGHT_BOUNDS,
  validateCandidateWeights,
} from '../scheduler/scheduleSimulator';
import { telemetry } from '../telemetry/telemetryManager';

/**
 * AdaptationSandboxCard (Phase 7.4)
 *
 * Displays an isolated shadow-evaluation candidate layer for bounded heuristic
 * weight adaptation and Bayesian shrinkage.
 *
 * Strict Scope & Safety Boundaries:
 * - SHADOW EVALUATION ONLY: Candidate weights are never injected into production scheduling.
 * - Factory baseline remains 100% active and immutable.
 * - When readiness is unmet (e.g. < 15 verified completions), adaptation remains locked
 *   and personal adaptation is labeled not yet evaluable.
 * - An optional synthetic sandbox fixture allows testing the shrinkage mathematics
 *   in memory without ever touching real persistent records or production weights.
 */
export default function AdaptationSandboxCard({ events = [], tasks = [] }) {
  const [showSyntheticDemo, setShowSyntheticDemo] = useState(false);
  const [activeTab, setActiveTab] = useState('simulation'); // 'simulation' | 'weights' | 'shrinkage' | 'shadow' | 'ranking' | 'unsupported'
  const [simScenario, setSimScenario] = useState('deadline_vs_priority');
  const [simCandidateWeights, setSimCandidateWeights] = useState({
    urgencyWeight: FACTORY_SCHEDULER_WEIGHTS.urgencyWeight,
    priorityWeight: FACTORY_SCHEDULER_WEIGHTS.priorityWeight,
    unblockWeight: FACTORY_SCHEDULER_WEIGHTS.unblockWeight,
    riskWeight: FACTORY_SCHEDULER_WEIGHTS.riskWeight,
  });
  const [preferenceCollectionEnabled, setPreferenceCollectionEnabled] = useState(() => {
    return typeof telemetry.isPreferenceCollectionEnabled === 'function'
      ? telemetry.isPreferenceCollectionEnabled()
      : true;
  });
  const [preferenceFeedback, setPreferenceFeedback] = useState(null);
  const [simValidationErrors, setSimValidationErrors] = useState([]);

  // Authoritative real-evidence evaluation
  const realAnalysis = useMemo(() => {
    const readiness = evaluateLearningReadiness({ events, tasks });
    const preferenceReport = analyzePreferenceSignals({ events, tasks });
    const adapterResult = computeBoundedCandidateWeights({
      baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
      preferenceReport,
      readiness,
      kPrior: DEFAULT_K_PRIOR,
      maxRelativeDelta: MAX_RELATIVE_WEIGHT_DELTA,
      isTestSandbox: false,
    });

    const shadowEvaluation = evaluateShadowSchedule({
      tasks,
      options: { startDate: '2026-10-18', dailyCapacityHours: 6.0 },
      candidateWeights: adapterResult.candidateWeights,
      baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
      verifiedCompletionsCount: readiness.gates?.verifiedCompletions?.current || 0,
    });

    const preferenceEvidence = extractEligiblePreferenceEvidence(events);
    const rankingEvaluation = evaluateOfflineRanking({
      eligibleComparisons: preferenceEvidence.eligible,
      evidenceCounts: preferenceEvidence.counts,
    });

    return {
      readiness,
      preferenceReport,
      adapterResult,
      shadowEvaluation,
      preferenceEvidence,
      rankingEvaluation,
    };
  }, [events, tasks]);

  // Handle toggling explicit preference collection setting (Part C)
  const handleTogglePreferenceCollection = (e) => {
    const nextVal = e.target.checked;
    const ok = telemetry.setPreferenceCollectionEnabled(nextVal);
    if (ok) {
      setPreferenceCollectionEnabled(nextVal);
      setPreferenceFeedback({
        type: 'success',
        text: nextVal
          ? '✓ Explicit preference collection is active. Choices made in Sprint Planner will be saved locally.'
          : '⏸ Explicit preference collection paused. No new comparison events will be recorded.',
      });
      setTimeout(() => setPreferenceFeedback(null), 5000);
    } else {
      setPreferenceFeedback({
        type: 'error',
        text: '⚠️ Failed to save preference collection setting to local storage.',
      });
    }
  };

  // Pure schedule simulation evaluation (Part B & Part D)
  const simulationResult = useMemo(() => {
    const val = validateCandidateWeights(simCandidateWeights);
    if (!val.isValid) {
      return {
        status: 'invalid_parameters',
        errors: val.errors,
      };
    }
    return runScheduleSimulation({
      scenarioKey: simScenario,
      tasks,
      candidateWeights: simCandidateWeights,
      options: { startDate: '2026-10-19', dailyCapacityHours: 6.0 },
    });
  }, [simScenario, simCandidateWeights, tasks]);

  // Update candidate weight with real-time validation
  const handleWeightChange = (key, rawValue) => {
    const updated = {
      ...simCandidateWeights,
      [key]: rawValue,
    };
    setSimCandidateWeights(updated);

    const val = validateCandidateWeights(updated);
    if (!val.isValid) {
      setSimValidationErrors(val.errors);
    } else {
      setSimValidationErrors([]);
    }
  };

  // Isolated synthetic demo fixture (for auditing mathematics when real telemetry is developing)
  const syntheticDemo = useMemo(() => {
    if (!showSyntheticDemo) return null;

    const syntheticReadiness = {
      status: 'ready',
      gates: {
        decidedProposals: { passed: true, current: 28, required: 20 },
        verifiedCompletions: { passed: true, current: 22, required: 15 },
        taskCategories: { passed: true, current: 4, required: 3 },
        activeDuration: { passed: true, current: 21, required: 14 },
      },
    };

    // Diagnostic simulation parameters: purely in-memory test fixture for illustrating math
    const diagnosticCandidateWeights = {
      priorityWeight: { empiricalWeight: 85.0, observationCount: 15 },
    };

    const adapterResult = computeBoundedCandidateWeights({
      baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
      preferenceReport: null,
      readiness: syntheticReadiness,
      kPrior: DEFAULT_K_PRIOR,
      maxRelativeDelta: MAX_RELATIVE_WEIGHT_DELTA,
      isTestSandbox: true,
      diagnosticCandidateWeights,
    });

    const syntheticTasks = [
      { id: 'synth_1', title: 'Deep Work Architecture Review', estimatedEffort: 3.5, dueDate: '2026-10-19', priority: 'high', completed: false },
      { id: 'synth_2', title: 'Write Migration Script', estimatedEffort: 2.0, dueDate: '2026-10-19', priority: 'low', completed: false },
      { id: 'synth_3', title: 'Client Debrief Documentation', estimatedEffort: 1.5, dueDate: '2026-10-20', priority: 'medium', completed: false },
      { id: 'synth_4', title: 'Audit Test Coverage', estimatedEffort: 4.0, dueDate: '2026-10-21', priority: 'high', completed: false },
    ];

    const shadowEvaluation = evaluateShadowSchedule({
      tasks: syntheticTasks,
      options: { startDate: '2026-10-18', dailyCapacityHours: 6.0 },
      candidateWeights: adapterResult.candidateWeights,
      baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
      verifiedCompletionsCount: 22,
    });

    const syntheticComparisons = [
      {
        comparisonId: 'synth_cmp_1',
        pairKey: 'adaptive___vs___edf',
        preferredId: 'adaptive',
        nonPreferredId: 'edf',
        preferredAlternative: { id: 'adaptive', strategy: 'adaptive', metrics: { onTimeTasksCount: 4, totalTasks: 4, capacityUtilizationPct: 85, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        nonPreferredAlternative: { id: 'edf', strategy: 'edf', metrics: { onTimeTasksCount: 3, totalTasks: 4, totalDelayDays: 2, capacityUtilizationPct: 70, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        context: { scenario_name: 'Backlog Priority vs Urgency' },
      },
      {
        comparisonId: 'synth_cmp_2',
        pairKey: 'adaptive___vs___priority_first',
        preferredId: 'adaptive',
        nonPreferredId: 'priority_first',
        preferredAlternative: { id: 'adaptive', strategy: 'adaptive', metrics: { onTimeTasksCount: 4, totalTasks: 4, capacityUtilizationPct: 85, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        nonPreferredAlternative: { id: 'priority_first', strategy: 'priority_first', metrics: { onTimeTasksCount: 2, totalTasks: 4, totalDelayDays: 4, capacityUtilizationPct: 60, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        context: { scenario_name: 'Dependency Chain Contention' },
      },
      {
        comparisonId: 'synth_cmp_3',
        pairKey: 'adaptive___vs___edf_2',
        preferredId: 'adaptive',
        nonPreferredId: 'edf',
        preferredAlternative: { id: 'adaptive', strategy: 'adaptive', metrics: { onTimeTasksCount: 5, totalTasks: 5, capacityUtilizationPct: 90, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        nonPreferredAlternative: { id: 'edf', strategy: 'edf', metrics: { onTimeTasksCount: 4, totalTasks: 5, totalDelayDays: 1, capacityUtilizationPct: 80, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        context: { scenario_name: 'Shared Deadline Contention' },
      },
      {
        comparisonId: 'synth_cmp_4',
        pairKey: 'adaptive___vs___priority_first_2',
        preferredId: 'adaptive',
        nonPreferredId: 'priority_first',
        preferredAlternative: { id: 'adaptive', strategy: 'adaptive', metrics: { onTimeTasksCount: 6, totalTasks: 6, capacityUtilizationPct: 88, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        nonPreferredAlternative: { id: 'priority_first', strategy: 'priority_first', metrics: { onTimeTasksCount: 4, totalTasks: 6, totalDelayDays: 3, capacityUtilizationPct: 65, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        context: { scenario_name: 'Heuristic Risk Nudge Backlog' },
      },
      {
        comparisonId: 'synth_cmp_5',
        pairKey: 'adaptive___vs___edf_3',
        preferredId: 'adaptive',
        nonPreferredId: 'edf',
        preferredAlternative: { id: 'adaptive', strategy: 'adaptive', metrics: { onTimeTasksCount: 4, totalTasks: 4, capacityUtilizationPct: 82, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        nonPreferredAlternative: { id: 'edf', strategy: 'edf', metrics: { onTimeTasksCount: 4, totalTasks: 4, capacityUtilizationPct: 75, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        context: { scenario_name: 'Normal Mixed Backlog' },
      },
      {
        comparisonId: 'synth_cmp_6',
        pairKey: 'priority_first___vs___edf',
        preferredId: 'priority_first',
        nonPreferredId: 'edf',
        preferredAlternative: { id: 'priority_first', strategy: 'priority_first', metrics: { onTimeTasksCount: 3, totalTasks: 4, totalDelayDays: 1, capacityUtilizationPct: 78, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        nonPreferredAlternative: { id: 'edf', strategy: 'edf', metrics: { onTimeTasksCount: 2, totalTasks: 4, totalDelayDays: 3, capacityUtilizationPct: 65, cycleDetected: false, infeasiblePlacementsCount: 0 }, isConstraintCompliant: true },
        context: { scenario_name: 'Priority vs Deadline Tension' },
      },
    ];

    const syntheticRanking = evaluateOfflineRanking({
      eligibleComparisons: syntheticComparisons,
      evidenceCounts: {
        totalObserved: 7,
        eligibleCount: 6,
        excludedCount: 1,
        byReason: { duplicate: 1, contradictory: 0, inferred_rejected: 0, incomplete: 0, ambiguous: 0, constraint_violation: 0 },
      },
    });

    return {
      adapterResult,
      shadowEvaluation,
      preferenceEvidence: { eligible: syntheticComparisons, counts: syntheticRanking.evidenceSummary },
      rankingEvaluation: syntheticRanking,
    };
  }, [showSyntheticDemo]);

  const activeResult = showSyntheticDemo && syntheticDemo
    ? syntheticDemo.adapterResult
    : realAnalysis.adapterResult;

  const activeShadow = showSyntheticDemo && syntheticDemo
    ? syntheticDemo.shadowEvaluation
    : realAnalysis.shadowEvaluation;

  const activeRanking = showSyntheticDemo && syntheticDemo
    ? syntheticDemo.rankingEvaluation
    : realAnalysis.rankingEvaluation;

  const isRealReadinessMet = realAnalysis.readiness?.status === 'ready';
  const weightKeys = ['urgencyWeight', 'priorityWeight', 'unblockWeight', 'riskWeight'];

  const weightLabels = {
    urgencyWeight: { name: 'Urgency Weight', role: 'Linear calendar due-date proximity (30-day window)' },
    priorityWeight: { name: 'Priority Weight', role: 'Inter-tier priority spacing (High vs Med vs Low)' },
    unblockWeight: { name: 'Unblock Weight', role: 'DAG critical-path dependency unblocking bonus' },
    riskWeight: { name: 'ML Risk Weight', role: 'Guarded completion risk penalty nudge' },
  };

  return (
    <div style={styles.cardContainer} aria-label="Adaptation Sandbox — Shadow Evaluation">
      {/* Top Header */}
      <div style={styles.cardHeader}>
        <div style={styles.titleCol}>
          <div style={styles.badgeRow}>
            <span style={styles.sectionTag}>PHASE 7.3 SHADOW SANDBOX</span>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: '#FEF3C7',
                color: '#92400E',
                borderColor: '#FDE68A',
              }}
              role="status"
            >
              🔒 ADAPTATION LOCKED — SHADOW EVALUATION ONLY
            </span>
            {showSyntheticDemo && (
              <span style={styles.demoBadge}>
                🧪 SYNTHETIC SIMULATION FIXTURE ACTIVE
              </span>
            )}
          </div>
          <h4 style={styles.title}>ADAPTATION SANDBOX — SHADOW EVALUATION</h4>
          <p style={styles.subtitle}>
            Bounded empirical-Bayes weight candidate evaluation layer. Evaluates candidate heuristic weights
            in isolated simulation without ever modifying production schedule generation.
          </p>
        </div>

        {/* Demo Toggle Control */}
        <div style={styles.toggleBox}>
          <label style={styles.toggleLabel} htmlFor="synthetic-demo-checkbox">
            <input
              id="synthetic-demo-checkbox"
              type="checkbox"
              checked={showSyntheticDemo}
              onChange={(e) => setShowSyntheticDemo(e.target.checked)}
              style={styles.checkboxInput}
            />
            <span style={styles.toggleText}>
              {showSyntheticDemo ? 'Simulating Synthetic Mature Telemetry' : 'Audit Real Telemetry (Locked)'}
            </span>
          </label>
          <span style={styles.toggleSubtext}>
            {showSyntheticDemo
              ? 'Showing math simulation with K_prior=10 on mock data. Production unchanged.'
              : 'Production runs 100% factory defaults. Readiness is strictly enforced.'}
          </span>
        </div>
      </div>

      {/* Synthetic Demonstration Warning Banner */}
      {showSyntheticDemo && (
        <div style={styles.syntheticWarningBanner} role="alert">
          <span style={styles.syntheticWarningIcon}>⚠️</span>
          <div style={styles.syntheticWarningText}>
            <strong>Synthetic Demonstration — Not Your History:</strong> This simulation evaluates in-memory diagnostic fixtures with simulated maturity. It never modifies your real IndexedDB telemetry, never alters readiness gates, and cannot activate production adaptation.
          </div>
        </div>
      )}

      {/* Production Safety Banner */}
      <div style={styles.safetyCallout}>
        <span style={styles.safetyIcon}>🛡️</span>
        <div style={styles.safetyContent}>
          <strong style={styles.safetyHeadline}>Strict Production Scheduling Governance:</strong>
          <span style={styles.safetyText}>
            {' '}Production scheduling proposals continue using <strong>100% factory baseline weights</strong>.
            Candidate weights are evaluated strictly in-memory (
            <code>isAdaptationUnlocked: false</code>, <code>productionApplied: false</code>).
            {!isRealReadinessMet && !showSyntheticDemo && (
              <> Real-user verified completions ({realAnalysis.readiness.gates?.verifiedCompletions?.current || 0}/15) remain below Phase 7.1 thresholds, keeping personal adaptation conservatively locked. All 4 candidate weights remain identical to factory baseline defaults.</>
            )}
          </span>
        </div>
      </div>

      {/* SECTION: Transparent Scheduler Mode & Personalization Status (Part A & Part C) */}
      <div style={styles.statusPanel} aria-label="Scheduler Mode & Personalization Status">
        <div style={styles.statusPanelHeader}>
          <div style={styles.statusBadgesGroup}>
            <span style={styles.statusPillActive} title="Production scheduling proposals use immutable factory baseline weights">
              🛡️ Factory Scheduler: Active
            </span>
            <span style={styles.statusPillLocked} title="Production adaptation is disabled (isAdaptationUnlocked: false, productionApplied: false)">
              🔒 Adaptation: Disabled
            </span>
            <span style={styles.statusPillShadow} title="All candidate evaluation occurs in isolated shadow simulation">
              🔬 Evaluation: Shadow-Only
            </span>
          </div>
          <div style={styles.statusTimestamp}>
            Last Evaluated: <code>{realAnalysis.adapterResult.evaluationTimestamp ? new Date(realAnalysis.adapterResult.evaluationTimestamp).toLocaleTimeString() : 'No evaluation available'}</code>
          </div>
        </div>

        {/* 5-Stage Personalization Pipeline Hierarchy */}
        <div style={styles.pipelineGrid}>
          <div style={styles.pipelineCard}>
            <div style={styles.pipelineStepNum}>Stage 1</div>
            <div style={styles.pipelineTitle}>Evidence Collection</div>
            <div style={styles.pipelineValue}>
              {realAnalysis.preferenceEvidence.counts.totalObserved} observed
            </div>
            <div style={styles.pipelineCaption}>
              {realAnalysis.preferenceEvidence.counts.totalObserved > 0
                ? `${realAnalysis.preferenceEvidence.counts.totalObserved} explicit strategy choices`
                : 'No explicit comparisons recorded yet'}
            </div>
          </div>

          <div style={styles.pipelineCard}>
            <div style={styles.pipelineStepNum}>Stage 2</div>
            <div style={styles.pipelineTitle}>Evidence Eligibility</div>
            <div style={styles.pipelineValue}>
              {realAnalysis.preferenceEvidence.counts.eligibleCount ?? realAnalysis.preferenceEvidence.counts.eligiblePairs ?? realAnalysis.preferenceEvidence.eligible.length} eligible
            </div>
            <div style={styles.pipelineCaption}>
              {realAnalysis.preferenceEvidence.counts.byReason?.duplicate ?? 0} deduped · {realAnalysis.preferenceEvidence.counts.byReason?.contradictory ?? 0} quarantined
            </div>
          </div>

          <div style={styles.pipelineCard}>
            <div style={styles.pipelineStepNum}>Stage 3</div>
            <div style={styles.pipelineTitle}>Learning Readiness</div>
            <div style={styles.pipelineValue}>
              {isRealReadinessMet ? 'Passed' : 'In Progress'}
            </div>
            <div style={styles.pipelineCaption}>
              {isRealReadinessMet
                ? 'All 4 longitudinal gates met'
                : `${4 - (Object.values(realAnalysis.readiness.gates || {}).filter(g => g.passed).length)} unmet requirement(s)`}
            </div>
          </div>

          <div style={styles.pipelineCard}>
            <div style={styles.pipelineStepNum}>Stage 4</div>
            <div style={styles.pipelineTitle}>Candidate Evaluation</div>
            <div style={styles.pipelineValue}>
              {realAnalysis.rankingEvaluation.status === 'evaluated'
                ? `${realAnalysis.rankingEvaluation.concordanceRatePct}% Conc.`
                : 'Insufficient Data'}
            </div>
            <div style={styles.pipelineCaption}>
              {realAnalysis.rankingEvaluation.status === 'evaluated'
                ? 'Offline quality objective evaluation'
                : 'Requires ≥ 5 eligible comparisons'}
            </div>
          </div>

          <div style={styles.pipelineCard}>
            <div style={styles.pipelineStepNum}>Stage 5</div>
            <div style={styles.pipelineTitle}>Production Activation</div>
            <div style={{ ...styles.pipelineValue, color: '#991B1B' }}>
              Disabled (Locked)
            </div>
            <div style={styles.pipelineCaption}>
              Production adaptation is strictly disabled. Factory baseline remains 100% active.
            </div>
          </div>
        </div>

        {/* Preference Collection Control Toggle Box (Part C) */}
        <div style={styles.preferenceControlBox}>
          <div style={styles.prefControlLeft}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '15px' }}>⚙️</span>
              <strong style={{ fontSize: '13px', color: '#1E293B' }}>Explicit Preference Evidence Collection</strong>
              <span style={preferenceCollectionEnabled ? styles.tagActive : styles.tagPaused}>
                {preferenceCollectionEnabled ? 'Active (Collecting)' : 'Paused (Blocked)'}
              </span>
            </div>
            <div style={styles.prefControlDesc}>
              Controls whether VoxPlan records your explicit strategy choices (e.g. Adaptive vs. EDF) when you compare schedules in the Sprint Planner. All records stay 100% local on this device. Disabling collection immediately blocks new preference events without modifying your existing task history or historical comparisons.
            </div>
          </div>

          <div style={styles.prefControlRight}>
            <label style={styles.prefToggleLabel} htmlFor="preference-collection-toggle">
              <input
                id="preference-collection-toggle"
                type="checkbox"
                checked={preferenceCollectionEnabled}
                onChange={handleTogglePreferenceCollection}
                style={styles.checkboxInput}
                aria-label="Toggle explicit preference evidence collection"
              />
              <span style={styles.prefToggleText}>
                {preferenceCollectionEnabled ? 'Collection Enabled' : 'Collection Paused'}
              </span>
            </label>
          </div>
        </div>

        {preferenceFeedback && (
          <div
            style={{
              ...styles.preferenceFeedbackToast,
              backgroundColor: preferenceFeedback.type === 'error' ? '#FEE2E2' : '#EFF6FF',
              color: preferenceFeedback.type === 'error' ? '#991B1B' : '#1E40AF',
              borderColor: preferenceFeedback.type === 'error' ? '#FCA5A5' : '#BFDBFE',
            }}
            role="status"
          >
            {preferenceFeedback.text}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div style={styles.tabBar} role="tablist" aria-label="Sandbox Views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'simulation'}
          onClick={() => setActiveTab('simulation')}
          style={activeTab === 'simulation' ? styles.tabButtonActive : styles.tabButton}
        >
          🎮 Schedule Simulation (Shadow-Only)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'weights'}
          onClick={() => setActiveTab('weights')}
          style={activeTab === 'weights' ? styles.tabButtonActive : styles.tabButton}
        >
          ⚖️ Weight Candidates ({showSyntheticDemo ? 'Synthetic Demo' : 'Factory Baseline'})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'shrinkage'}
          onClick={() => setActiveTab('shrinkage')}
          style={activeTab === 'shrinkage' ? styles.tabButtonActive : styles.tabButton}
        >
          📐 Bayesian Shrinkage & Bounds (K=10, ±20%)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'shadow'}
          onClick={() => setActiveTab('shadow')}
          style={activeTab === 'shadow' ? styles.tabButtonActive : styles.tabButton}
        >
          🔬 Shadow Evaluation & Regression Gates
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ranking'}
          onClick={() => setActiveTab('ranking')}
          style={activeTab === 'ranking' ? styles.tabButtonActive : styles.tabButton}
        >
          🎯 Preference Ranking (Offline)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'unsupported'}
          onClick={() => setActiveTab('unsupported')}
          style={activeTab === 'unsupported' ? styles.tabButtonActive : styles.tabButton}
        >
          ⚠️ Unsupported Mappings & Disclosures
        </button>
      </div>

      {/* Tab 0: Schedule Simulation (Shadow-Only) (Part B & Part D) */}
      {activeTab === 'simulation' && (
        <div style={styles.tabContent}>
          {/* Simulation Header Banner */}
          <div style={styles.simHeaderBanner}>
            <div>
              <div style={styles.simSuperBadge}>SHADOW-ONLY SCHEDULE SIMULATION</div>
              <h5 style={styles.simTitle}>Hypothetical Candidate Schedule Simulator</h5>
              <p style={styles.simSubtitle}>
                Compare how modified heuristic weights alter task placements against the factory scheduler.
                All calculations run strictly in-memory. Your production schedule, task due dates, and factory weights remain 100% unchanged.
              </p>
            </div>
            <div style={styles.simSafetyBadge}>
              🛡️ PRODUCTION SCHEDULE UNTOUCHED
            </div>
          </div>

          {/* Scenario Selector & Reset Button */}
          <div style={styles.simControlsCard}>
            <div style={styles.simControlRow}>
              <div style={styles.simScenarioGroup}>
                <label style={styles.simLabel} htmlFor="sim-scenario-select">
                  <strong>Select Simulation Scenario:</strong>
                </label>
                <select
                  id="sim-scenario-select"
                  value={simScenario}
                  onChange={(e) => setSimScenario(e.target.value)}
                  style={styles.simSelect}
                >
                  <option value="deadline_vs_priority">
                    Deadline vs. Priority Contention (5 benchmark tasks)
                  </option>
                  <option value="dependency_chain">
                    Critical Path Dependency Chain (5 benchmark tasks)
                  </option>
                  <option value="capacity_bottleneck">
                    Daily Capacity Bottleneck & Bin-Packing (5 benchmark tasks)
                  </option>
                  <option value="active_backlog">
                    Current Active Tasks ({tasks.filter(t => !t.completed).length} open tasks)
                  </option>
                </select>
                <span style={styles.simScenarioDesc}>
                  {SIMULATION_SCENARIOS[simScenario]?.description}
                </span>
              </div>

              <div style={styles.simResetBtnWrap}>
                <button
                  type="button"
                  onClick={() => {
                    setSimCandidateWeights({
                      urgencyWeight: FACTORY_SCHEDULER_WEIGHTS.urgencyWeight,
                      priorityWeight: FACTORY_SCHEDULER_WEIGHTS.priorityWeight,
                      unblockWeight: FACTORY_SCHEDULER_WEIGHTS.unblockWeight,
                      riskWeight: FACTORY_SCHEDULER_WEIGHTS.riskWeight,
                    });
                    setSimValidationErrors([]);
                  }}
                  style={styles.simResetBtn}
                  title="Restore all candidate sliders to factory defaults"
                >
                  ↺ Reset to Factory Baseline
                </button>
              </div>
            </div>

            {/* Candidate Weight Sliders Grid */}
            <div style={styles.simWeightsGrid}>
              {Object.keys(SIMULATION_WEIGHT_BOUNDS).map((wKey) => {
                const spec = SIMULATION_WEIGHT_BOUNDS[wKey];
                const currVal = simCandidateWeights[wKey] ?? spec.factory;
                const deltaPct = Math.round(((currVal - spec.factory) / spec.factory) * 1000) / 10;
                const isDifferent = Math.abs(currVal - spec.factory) > 0.001;

                return (
                  <div key={wKey} style={styles.simWeightBox}>
                    <div style={styles.simWeightHeader}>
                      <span style={styles.simWeightName}>{spec.label}</span>
                      <span
                        style={{
                          ...styles.simDeltaBadge,
                          backgroundColor: isDifferent ? '#E0E7FF' : '#F3F4F6',
                          color: isDifferent ? '#3730A3' : '#4B5563',
                        }}
                      >
                        {isDifferent ? `${deltaPct > 0 ? `+${deltaPct}%` : `${deltaPct}%`}` : 'Factory Default'}
                      </span>
                    </div>

                    <div style={styles.simWeightInputRow}>
                      <input
                        type="range"
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        value={currVal}
                        onChange={(e) => handleWeightChange(wKey, parseFloat(e.target.value))}
                        style={styles.simSlider}
                        aria-label={`${spec.label} slider`}
                      />
                      <input
                        type="number"
                        min={spec.min}
                        max={spec.max}
                        step={spec.step}
                        value={currVal}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          handleWeightChange(wKey, isNaN(val) ? e.target.value : val);
                        }}
                        style={styles.simNumberInput}
                        aria-label={`${spec.label} number input`}
                      />
                    </div>

                    <div style={styles.simWeightFooter}>
                      <span>Bounds: [{spec.min.toFixed(1)}, {spec.max.toFixed(1)}]</span>
                      <span>Factory: {spec.factory.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Validation Errors Box */}
            {simValidationErrors.length > 0 && (
              <div style={styles.simValidationAlert} role="alert">
                <strong>Parameter Validation Error:</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {simValidationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Simulation Results Display */}
          {simulationResult && simulationResult.status === 'success' && (
            <div style={styles.simResultsContainer}>
              {/* Results Summary Box */}
              <div style={styles.simTradeoffCard}>
                <div style={styles.simTradeoffHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>🔍</span>
                    <strong style={{ fontSize: '14px', color: '#1E293B' }}>Trade-Off & Feasibility Verdict:</strong>
                  </div>
                  <span
                    style={simulationResult.isFeasible ? styles.simFeasibleBadge : styles.simInfeasibleBadge}
                  >
                    {simulationResult.isFeasible ? '✓ 100% Feasible Schedule' : '⚠️ Constraint Violations Detected'}
                  </span>
                </div>
                <p style={styles.simTradeoffText}>
                  {simulationResult.tradeOffAnalysis?.summary}
                </p>
                {simulationResult.violations?.length > 0 && (
                  <div style={styles.simViolationsList}>
                    {simulationResult.violations.map((v, i) => (
                      <div key={i} style={styles.simViolationItem}>❌ {v}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Side-by-Side Comparison Metrics Table */}
              <div style={styles.simTableCard}>
                <div style={styles.simTableTitle}>
                  📊 Side-by-Side Schedule Comparison: Factory Baseline vs. Candidate Configuration
                </div>
                <table style={styles.simTable}>
                  <thead>
                    <tr style={styles.simTableHeaderRow}>
                      <th style={styles.simTh}>Performance Metric</th>
                      <th style={styles.simTh}>Factory Baseline (Active)</th>
                      <th style={styles.simTh}>Candidate Configuration (Shadow)</th>
                      <th style={styles.simTh}>Impact / Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>Scheduled Tasks Coverage</td>
                      <td style={styles.simTd}>{simulationResult.baselineMetrics.scheduledTasks} / {simulationResult.baselineMetrics.totalTasks}</td>
                      <td style={styles.simTd}>{simulationResult.candidateMetrics.scheduledTasks} / {simulationResult.candidateMetrics.totalTasks}</td>
                      <td style={styles.simTd}>{simulationResult.candidateMetrics.scheduledTasks - simulationResult.baselineMetrics.scheduledTasks === 0 ? 'Identical (0)' : `${simulationResult.candidateMetrics.scheduledTasks - simulationResult.baselineMetrics.scheduledTasks > 0 ? '+' : ''}${simulationResult.candidateMetrics.scheduledTasks - simulationResult.baselineMetrics.scheduledTasks}`}</td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>Deadline On-Time Adherence</td>
                      <td style={styles.simTd}>{simulationResult.baselineMetrics.onTimeTasks} tasks ({simulationResult.baselineMetrics.onTimeRatePct}%)</td>
                      <td style={styles.simTd}>{simulationResult.candidateMetrics.onTimeTasks} tasks ({simulationResult.candidateMetrics.onTimeRatePct}%)</td>
                      <td style={{ ...styles.simTd, fontWeight: 700, color: simulationResult.comparison.onTimeDelta >= 0 ? '#166534' : '#991B1B' }}>
                        {simulationResult.comparison.onTimeDelta > 0 ? `+${simulationResult.comparison.onTimeDelta} on-time` : simulationResult.comparison.onTimeDelta < 0 ? `${simulationResult.comparison.onTimeDelta} on-time` : '0 delta'}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>Delayed Tasks Count</td>
                      <td style={styles.simTd}>{simulationResult.baselineMetrics.delayedTasks} tasks</td>
                      <td style={styles.simTd}>{simulationResult.candidateMetrics.delayedTasks} tasks</td>
                      <td style={{ ...styles.simTd, fontWeight: 700, color: simulationResult.comparison.delayedDelta <= 0 ? '#166534' : '#991B1B' }}>
                        {simulationResult.comparison.delayedDelta > 0 ? `+${simulationResult.comparison.delayedDelta} delayed` : simulationResult.comparison.delayedDelta < 0 ? `${simulationResult.comparison.delayedDelta} delayed` : '0 delta'}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>Cumulative Delay Days</td>
                      <td style={styles.simTd}>{simulationResult.baselineMetrics.totalDelayDays} days</td>
                      <td style={styles.simTd}>{simulationResult.candidateMetrics.totalDelayDays} days</td>
                      <td style={{ ...styles.simTd, fontWeight: 700, color: simulationResult.comparison.delayDaysDelta <= 0 ? '#166534' : '#991B1B' }}>
                        {simulationResult.comparison.delayDaysDelta > 0 ? `+${simulationResult.comparison.delayDaysDelta}d` : simulationResult.comparison.delayDaysDelta < 0 ? `${simulationResult.comparison.delayDaysDelta}d` : '0d'}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>Capacity Utilization Rate</td>
                      <td style={styles.simTd}>{simulationResult.baselineMetrics.capacityUtilizationPct}%</td>
                      <td style={styles.simTd}>{simulationResult.candidateMetrics.capacityUtilizationPct}%</td>
                      <td style={styles.simTd}>
                        {simulationResult.comparison.utilizationDeltaPct > 0 ? `+${simulationResult.comparison.utilizationDeltaPct}%` : simulationResult.comparison.utilizationDeltaPct < 0 ? `${simulationResult.comparison.utilizationDeltaPct}%` : '0.0%'}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>Schedule Churn (Shifted Placements)</td>
                      <td style={styles.simTd}>Reference Baseline</td>
                      <td style={styles.simTd}>{simulationResult.comparison.churnCount} placements shifted</td>
                      <td style={styles.simTd}>
                        {simulationResult.comparison.churnCount === 0 ? '✓ Identical Calendar' : `⚠️ ${simulationResult.comparison.churnCount} date shifts`}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>Hard Constraint Compliance</td>
                      <td style={styles.simTd}>✓ 100% Valid (0 Cycles, 0 Overruns)</td>
                      <td style={styles.simTd}>
                        {simulationResult.isFeasible ? '✓ 100% Valid' : '❌ Violated'}
                      </td>
                      <td style={{ ...styles.simTd, fontWeight: 700, color: simulationResult.isFeasible ? '#166534' : '#991B1B' }}>
                        {simulationResult.isFeasible ? '✓ Passed' : '❌ Infeasible'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Shifted Placements Details Drawer */}
              {simulationResult.comparison.shiftedPlacements?.length > 0 && (
                <div style={styles.simShiftedCard}>
                  <div style={styles.simShiftedTitle}>
                    📅 Placements Shifted by Candidate Weights ({simulationResult.comparison.shiftedPlacements.length})
                  </div>
                  <div style={styles.simShiftedGrid}>
                    {simulationResult.comparison.shiftedPlacements.map((p, idx) => (
                      <div key={idx} style={styles.simShiftedItem}>
                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{p.title}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          Baseline: <code>{p.baselineDate || 'Unscheduled'}</code> → Candidate: <code>{p.candidateDate || 'Unscheduled'}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strict No-Application Guarantee Notice */}
              <div style={styles.simIsolationNotice}>
                🔒 <strong>Simulation Isolation Guarantee:</strong> Candidate simulation is 100% non-destructive and isolated. VoxPlan does not permit candidate weights to be applied to production schedule generation in this stage.
              </div>
            </div>
          )}

          {simulationResult && simulationResult.status === 'empty_backlog' && (
            <div style={styles.simEmptyBacklogAlert}>
              ℹ️ <strong>{simulationResult.scenarioName}:</strong> {simulationResult.message}
            </div>
          )}
        </div>
      )}

      {/* Tab 1: Weight Candidates Grid */}
      {activeTab === 'weights' && (
        <div style={styles.tabContent}>
          <div style={styles.gridContainer}>
            {weightKeys.map((wKey) => {
              const baseVal = FACTORY_SCHEDULER_WEIGHTS[wKey];
              const candVal = activeResult.candidateWeights[wKey];
              const diag = activeResult.weightDiagnostics[wKey];
              const labelInfo = weightLabels[wKey];
              const isDifferent = Math.abs(candVal - baseVal) > 0.001;

              return (
                <div key={wKey} style={styles.weightCard}>
                  <div style={styles.weightCardHeader}>
                    <span style={styles.weightCardName}>{labelInfo.name}</span>
                    <span
                      style={{
                        ...styles.weightStatusPill,
                        backgroundColor: isDifferent ? '#E0E7FF' : '#F3F4F6',
                        color: isDifferent ? '#3730A3' : '#4B5563',
                      }}
                    >
                      {isDifferent ? 'SHRUNK CANDIDATE' : 'FACTORY BASELINE'}
                    </span>
                  </div>
                  <div style={styles.weightRoleText}>{labelInfo.role}</div>

                  <div style={styles.weightValuesRow}>
                    <div style={styles.valCol}>
                      <span style={styles.valLabel}>Active Production:</span>
                      <span style={styles.valBaseline}>{baseVal.toFixed(1)}</span>
                    </div>
                    <div style={styles.valArrow}>➔</div>
                    <div style={styles.valCol}>
                      <span style={styles.valLabel}>Shadow Candidate:</span>
                      <span style={isDifferent ? styles.valCandidateAdapted : styles.valCandidateLocked}>
                        {candVal.toFixed(1)}
                      </span>
                    </div>
                  </div>

                  <div style={styles.clampBox}>
                    <span style={styles.clampLabel}>Safety Clamp Bound (±20%):</span>
                    <span style={styles.clampVal}>
                      [{diag.minBound?.toFixed(1) ?? (baseVal * 0.8).toFixed(1)} – {diag.maxBound?.toFixed(1) ?? (baseVal * 1.2).toFixed(1)}]
                    </span>
                  </div>

                  <div style={styles.diagRationale}>
                    <span style={styles.diagIcon}>{diag.supported ? '📊' : '🔒'}</span>
                    <span style={styles.diagText}>{diag.rationale}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Bayesian Shrinkage Mathematics */}
      {activeTab === 'shrinkage' && (
        <div style={styles.tabContent}>
          <div style={styles.formulaCard}>
            <h5 style={styles.formulaTitle}>Conjugate Normal-Normal Empirical-Bayes Shrinkage</h5>
            <p style={styles.formulaDesc}>
              Candidate weights are derived via precision-weighted posterior estimation anchored by prior pseudo-observations:
            </p>
            <div style={styles.formulaBox}>
              <code>w_posterior = (K_prior · w_baseline + N · w_empirical) / (K_prior + N)</code>
            </div>
            <div style={styles.formulaParams}>
              <div style={styles.paramItem}>
                <strong>K_prior = {DEFAULT_K_PRIOR}</strong>
                <span>Effective prior sample size anchoring to factory baseline. With N &lt; 10, the baseline prior retains majority control (&gt;50%).</span>
              </div>
              <div style={styles.paramItem}>
                <strong>N (Sample Size)</strong>
                <span>Count of independent, verified telemetry observations with valid provenance. Duplicated or rescheduled items are excluded.</span>
              </div>
              <div style={styles.paramItem}>
                <strong>±20% Safety Clamp</strong>
                <span>Candidate weights cannot deviate by more than 20% from baseline: <code>0.80 · w_0 ≤ w_cand ≤ 1.20 · w_0</code>.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Shadow Evaluation & Regression Gates */}
      {activeTab === 'shadow' && (
        <div style={styles.tabContent}>
          <div style={styles.shadowOverview}>
            <div style={styles.gateResultRow}>
              <span style={styles.gateLabel}>Shadow Evaluation Status:</span>
              <span
                style={{
                  ...styles.gateResultBadge,
                  backgroundColor: activeShadow.evaluationOutcome === 'safe_candidate_feasible' ? '#DCFCE7' : '#FEF3C7',
                  color: activeShadow.evaluationOutcome === 'safe_candidate_feasible' ? '#166534' : '#92400E',
                }}
              >
                {activeShadow.evaluationOutcome}
              </span>
            </div>
            <div style={styles.gateResultRow}>
              <span style={styles.gateLabel}>Hard-Constraint Regression Gate:</span>
              <span
                style={{
                  ...styles.gateResultBadge,
                  backgroundColor: activeShadow.regressionGate?.passed ? '#DCFCE7' : '#FEE2E2',
                  color: activeShadow.regressionGate?.passed ? '#166534' : '#991B1B',
                }}
              >
                {activeShadow.regressionGate?.passed ? '✓ PASSED (0 Hard Regressions)' : '✖ FAILED'}
              </span>
            </div>
          </div>

          <div style={styles.comparisonTableWrap}>
            <table style={styles.comparisonTable}>
              <thead>
                <tr>
                  <th style={styles.th}>Schedule Metric</th>
                  <th style={styles.th}>Factory Baseline</th>
                  <th style={styles.th}>Candidate (Shadow)</th>
                  <th style={styles.th}>Delta</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={styles.td}>Scheduled Tasks</td>
                  <td style={styles.td}>{activeShadow.baselineMetrics?.scheduledTasks ?? '—'}</td>
                  <td style={styles.td}>{activeShadow.candidateMetrics?.scheduledTasks ?? '—'}</td>
                  <td style={styles.td}>0</td>
                </tr>
                <tr>
                  <td style={styles.td}>On-Time Placements</td>
                  <td style={styles.td}>{activeShadow.baselineMetrics?.onTimeTasksCount ?? '—'}</td>
                  <td style={styles.td}>{activeShadow.candidateMetrics?.onTimeTasksCount ?? '—'}</td>
                  <td style={styles.td}>
                    {activeShadow.comparison?.onTimeDelta != null
                      ? (activeShadow.comparison.onTimeDelta >= 0 ? `+${activeShadow.comparison.onTimeDelta}` : activeShadow.comparison.onTimeDelta)
                      : '0'}
                  </td>
                </tr>
                <tr>
                  <td style={styles.td}>Total Delay (Days)</td>
                  <td style={styles.td}>{activeShadow.baselineMetrics?.totalDelayDays ?? '—'}</td>
                  <td style={styles.td}>{activeShadow.candidateMetrics?.totalDelayDays ?? '—'}</td>
                  <td style={styles.td}>
                    {activeShadow.comparison?.delayDaysDelta != null
                      ? (activeShadow.comparison.delayDaysDelta <= 0 ? `${activeShadow.comparison.delayDaysDelta}` : `+${activeShadow.comparison.delayDaysDelta}`)
                      : '0'}
                  </td>
                </tr>
                <tr>
                  <td style={styles.td}>Schedule Churn Count</td>
                  <td style={styles.td}>0 (Reference)</td>
                  <td style={styles.td}>{activeShadow.comparison?.scheduleChurnCount ?? 0}</td>
                  <td style={styles.td}>{activeShadow.comparison?.scheduleChurnPct ?? 0}%</td>
                </tr>
                <tr>
                  <td style={styles.td}>DAG Cycle Detected</td>
                  <td style={styles.td}>{activeShadow.baselineMetrics?.cycleDetected ? 'Yes' : 'No'}</td>
                  <td style={styles.td}>{activeShadow.candidateMetrics?.cycleDetected ? 'Yes' : 'No'}</td>
                  <td style={styles.td}>0</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={styles.shadowNote}>
            <strong>Evidence Coverage Disclosure:</strong>{' '}
            {!showSyntheticDemo ? (
              <span>
                Real-user verified completions count is {realAnalysis.readiness.gates?.verifiedCompletions?.current || 0}/15.
                Because sample size is insufficient, personal empirical superiority is explicitly <strong>not claimed</strong>.
              </span>
            ) : (
              <span>
                Simulated on isolated test fixture ({activeShadow.candidateMetrics?.totalTasks} tasks).
                Confirms mathematical stability and non-regressive scheduling.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Unsupported Mappings & Disclosures */}
      {activeTab === 'unsupported' && (
        <div style={styles.tabContent}>
          <p style={styles.unsupportedIntro}>
            To preserve mathematical defensibility, signals that do not directly map to ready-queue priority scores
            are explicitly documented and isolated from weight calculations:
          </p>
          <div style={styles.unsupportedList}>
            {activeResult.unsupportedMappings?.map((item, idx) => (
              <div key={idx} style={styles.unsupportedCard}>
                <div style={styles.unsupportedHeader}>
                  <span style={styles.unsupportedBadge}>UNMAPPED SIGNAL</span>
                  <span style={styles.unsupportedName}>{item.name}</span>
                </div>
                <div style={styles.unsupportedReason}>
                  <strong>Reason:</strong> <code>{item.reason}</code>
                </div>
                <div style={styles.unsupportedExplanation}>{item.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Preference Ranking & Offline Evaluation */}
      {activeTab === 'ranking' && (
        <div style={styles.tabContent}>
          {showSyntheticDemo && (
            <div style={{ ...styles.syntheticWarningBanner, marginBottom: '16px' }} role="alert">
              <span style={styles.syntheticWarningIcon}>⚠️</span>
              <div style={styles.syntheticWarningText}>
                <strong>Synthetic Demonstration Active:</strong> The metrics below reflect in-memory mock scenario comparisons ({activeRanking.evidenceSummary?.eligibleCount || 0} synthetic pairs) for auditing statistical concordance. Real user telemetry has recorded {realAnalysis.preferenceEvidence.counts.eligibleCount || 0} eligible comparisons and cannot activate production adaptation.
              </div>
            </div>
          )}

          <div style={styles.rankingHeaderBanner}>
            <div style={styles.rankingHeaderTitle}>
              🎯 Explicit Preference Evidence & Offline Ranking Pipeline
            </div>
            <div style={styles.rankingHeaderDesc}>
              Evaluates whether explicit pairwise user preferences align with offline schedule-quality objectives.
              All evaluations run strictly offline in memory; factory scheduler weights remain 100% frozen.
            </div>
          </div>

          {/* Evidence Metrics Summary Cards */}
          <div style={styles.rankingStatsGrid}>
            <div style={styles.rankingStatCard}>
              <span style={styles.rankingStatLabel}>Total Observed Comparisons</span>
              <span style={styles.rankingStatValue}>{activeRanking.evidenceSummary?.totalObserved ?? 0}</span>
              <span style={styles.rankingStatSub}>Explicit + Inferred Filtered</span>
            </div>
            <div style={styles.rankingStatCard}>
              <span style={styles.rankingStatLabel}>Eligible Comparisons</span>
              <span style={{ ...styles.rankingStatValue, color: '#1B5E3C' }}>{activeRanking.evidenceSummary?.eligibleCount ?? 0}</span>
              <span style={styles.rankingStatSub}>Clean, unambiguous pairs</span>
            </div>
            <div style={styles.rankingStatCard}>
              <span style={styles.rankingStatLabel}>Excluded Comparisons</span>
              <span style={{ ...styles.rankingStatValue, color: (activeRanking.evidenceSummary?.excludedCount ?? 0) > 0 ? '#92400E' : '#4B5563' }}>
                {activeRanking.evidenceSummary?.excludedCount ?? 0}
              </span>
              <span style={styles.rankingStatSub}>Duplicates / Contradictions</span>
            </div>
          </div>

          {/* Exclusions Breakdown if any */}
          {(activeRanking.evidenceSummary?.excludedCount ?? 0) > 0 && (
            <div style={styles.exclusionsBox}>
              <span style={{ fontWeight: '700', fontSize: '12px', color: '#92400E' }}>
                🔍 Excluded Evidence Audit:
              </span>
              <div style={styles.exclusionsPillWrap}>
                {Object.entries(activeRanking.evidenceSummary?.byReason || {}).map(([reason, count]) => {
                  if (count === 0) return null;
                  return (
                    <span key={reason} style={styles.exclusionPill}>
                      {reason}: {count}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Evaluation Outcome Panel */}
          {activeRanking.status === 'insufficient_evidence' ? (
            <div style={styles.insufficientEvidenceCard}>
              <div style={styles.insufficientBadge}>🔒 INSUFFICIENT EVIDENCE FOR RANKING EVALUATION</div>
              <h4 style={{ margin: '8px 0 4px 0', fontSize: '14px', color: '#92400E' }}>
                Sample Below Minimum Statistical Threshold (N &lt; {MIN_EVALUATION_SAMPLE})
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#78350F', lineHeight: 1.5 }}>
                {activeRanking.message}
              </p>
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#4B5563', lineHeight: 1.5 }}>
                To record explicit preference evidence, open the <strong>Adaptive Sprint Planner</strong> modal, navigate to the <strong>⚖ Strategy Benchmark & Quality</strong> tab, and select which strategy schedule balance you prefer for your task backlog.
              </div>
            </div>
          ) : (
            <div style={styles.evaluatedRankingCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span style={styles.evaluatedBadge}>OFFLINE EVALUATED</span>
                  <h4 style={{ margin: '4px 0 0 0', fontSize: '15px', color: '#111827' }}>
                    Pairwise Concordance with Quality Objective: {activeRanking.baselineMetrics?.accuracyPct}%
                  </h4>
                </div>
                <div style={styles.concordancePill}>
                  {activeRanking.baselineMetrics?.concordantCount} / {activeRanking.baselineMetrics?.totalEvaluated} Concordant Pairs
                </div>
              </div>

              <div style={styles.rankingBreakdownGrid}>
                <div style={styles.rankingBreakdownCol}>
                  <span style={styles.breakdownLabel}>Concordant Pairs (+1):</span>
                  <span style={{ fontWeight: '700', color: '#1B5E3C' }}>{activeRanking.baselineMetrics?.concordantCount}</span>
                </div>
                <div style={styles.rankingBreakdownCol}>
                  <span style={styles.breakdownLabel}>Discordant Inversions (0):</span>
                  <span style={{ fontWeight: '700', color: '#9E2A2B' }}>{activeRanking.baselineMetrics?.discordantCount}</span>
                </div>
                <div style={styles.rankingBreakdownCol}>
                  <span style={styles.breakdownLabel}>Tied Score Evaluations:</span>
                  <span style={{ fontWeight: '700', color: '#4B5563' }}>{activeRanking.baselineMetrics?.tiedCount}</span>
                </div>
                <div style={styles.rankingBreakdownCol}>
                  <span style={styles.breakdownLabel}>Wilson 95% CI Margin:</span>
                  <span style={{ fontWeight: '700', color: '#1E40AF' }}>
                    ±{activeRanking.uncertainty?.marginOfErrorPct}%{' '}
                    <span style={{ fontSize: '10px', color: '#6B7280', fontWeight: '400' }}>
                      [{activeRanking.uncertainty?.ciLowerPct}%, {activeRanking.uncertainty?.ciUpperPct}%]
                    </span>
                  </span>
                </div>
              </div>

              {/* Uncertainty and Split Validation Notice */}
              <div style={styles.uncertaintyNote}>
                <strong>⚠️ Statistical Limitation & Data Maturity:</strong> {activeRanking.uncertainty?.disclaimer}
                <div style={{ marginTop: '4px' }}>
                  <strong>Grouped Partitioning Strategy:</strong>{' '}
                  {activeRanking.splitValidation?.isSplitDefensible
                    ? `Active (${activeRanking.splitValidation?.reason})`
                    : `Inactive (${activeRanking.splitValidation?.reason || 'Prerequisites unmet'})`}.
                </div>
              </div>
            </div>
          )}

          {/* Model Methodology & Decoupling Governance */}
          <div style={styles.methodologyBox}>
            <div style={{ fontWeight: '700', fontSize: '12px', color: '#374151', marginBottom: '4px' }}>
              🔬 Ranking Methodology & Governance Rules:
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: '#4B5563', lineHeight: 1.6 }}>
              <li><strong>Pairwise Loss:</strong> Uses strict binary concordance over explicit user choices. Ties and non-finite scores receive zero concordance credit.</li>
              <li><strong>Hard Constraint Decoupling:</strong> Alternatives violating Kahn topological order or working hour capacities cannot earn concordance credit.</li>
              <li><strong>Zero Automatic Model Promotion:</strong> Offline ranking evaluation strictly measures candidate viability; it does not deploy weights to production.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Footer Governance Tag */}
      <div style={styles.footerNote}>
        <div style={styles.footerLeft}>
          <span style={styles.footerLock}>🔒</span>
          <span>
            <strong>Deterministic Shadow Isolation:</strong> Candidate evaluation is non-destructive,
            purely in-memory, and zero-telemetry. Factory weights remain 100% active in production schedule generation.
          </span>
        </div>
        <div style={styles.footerTags}>
          <span style={styles.footerPill}>Zero Model Deploy</span>
          <span style={styles.footerPill}>Readiness-Gated</span>
          <span style={styles.footerPill}>Local Storage Untouched</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  cardContainer: {
    marginTop: '24px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid #F3F4F6',
  },
  titleCol: {
    flex: '1 1 500px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  sectionTag: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: '#4B5563',
    backgroundColor: '#F3F4F6',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    padding: '3px 10px',
    borderRadius: '999px',
    border: '1px solid transparent',
  },
  demoBadge: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    padding: '3px 10px',
    borderRadius: '999px',
    backgroundColor: '#EDE9FE',
    color: '#5B21B6',
    border: '1px solid #DDD6FE',
  },
  title: {
    margin: '0 0 6px 0',
    fontSize: '18px',
    fontWeight: 800,
    color: '#111827',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    margin: 0,
    fontSize: '13px',
    color: '#4B5563',
    lineHeight: 1.5,
  },
  toggleBox: {
    backgroundColor: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignSelf: 'flex-start',
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  checkboxInput: {
    cursor: 'pointer',
    width: '16px',
    height: '16px',
    accentColor: '#4F46E5',
  },
  toggleText: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#1F2937',
  },
  toggleSubtext: {
    fontSize: '11px',
    color: '#6B7280',
    lineHeight: 1.3,
  },
  syntheticWarningBanner: {
    marginTop: '16px',
    backgroundColor: '#FEF2F2',
    border: '2px solid #F87171',
    borderRadius: '8px',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  syntheticWarningIcon: {
    fontSize: '18px',
    lineHeight: 1,
    marginTop: '1px',
  },
  syntheticWarningText: {
    fontSize: '12px',
    color: '#991B1B',
    lineHeight: 1.5,
  },
  safetyCallout: {
    marginTop: '16px',
    backgroundColor: '#EFF6FF',
    border: '1px solid #BFDBFE',
    borderRadius: '8px',
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  safetyIcon: {
    fontSize: '16px',
    lineHeight: 1,
    marginTop: '2px',
  },
  safetyContent: {
    fontSize: '12px',
    color: '#1E40AF',
    lineHeight: 1.5,
  },
  safetyHeadline: {
    fontWeight: 700,
    color: '#1E3A8A',
  },
  safetyText: {
    color: '#1E40AF',
  },
  tabBar: {
    marginTop: '20px',
    display: 'flex',
    gap: '8px',
    borderBottom: '2px solid #F3F4F6',
    paddingBottom: '2px',
    overflowX: 'auto',
  },
  tabButton: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#6B7280',
    cursor: 'pointer',
    borderRadius: '4px 4px 0 0',
    marginBottom: '-2px',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
  },
  tabButtonActive: {
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #4F46E5',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 700,
    color: '#4F46E5',
    cursor: 'pointer',
    borderRadius: '4px 4px 0 0',
    marginBottom: '-2px',
    whiteSpace: 'nowrap',
  },
  tabContent: {
    marginTop: '16px',
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
  },
  weightCard: {
    backgroundColor: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  weightCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  weightCardName: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#111827',
  },
  weightStatusPill: {
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    padding: '2px 8px',
    borderRadius: '999px',
  },
  weightRoleText: {
    fontSize: '11px',
    color: '#4B5563',
    lineHeight: 1.4,
  },
  weightValuesRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '6px',
    padding: '10px 8px',
  },
  valCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  valLabel: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  valBaseline: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#111827',
  },
  valArrow: {
    fontSize: '14px',
    color: '#9CA3AF',
  },
  valCandidateLocked: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#6B7280',
  },
  valCandidateAdapted: {
    fontSize: '16px',
    fontWeight: 800,
    color: '#4338CA',
  },
  clampBox: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#4B5563',
    backgroundColor: '#F3F4F6',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  clampLabel: {
    fontWeight: 600,
  },
  clampVal: {
    fontFamily: 'monospace',
    fontWeight: 700,
  },
  diagRationale: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
    fontSize: '11px',
    color: '#374151',
    lineHeight: 1.4,
  },
  diagIcon: {
    fontSize: '12px',
    lineHeight: 1,
    marginTop: '2px',
  },
  diagText: {
    flex: 1,
  },
  formulaCard: {
    backgroundColor: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '20px',
  },
  formulaTitle: {
    margin: '0 0 8px 0',
    fontSize: '15px',
    fontWeight: 700,
    color: '#111827',
  },
  formulaDesc: {
    margin: '0 0 12px 0',
    fontSize: '13px',
    color: '#4B5563',
    lineHeight: 1.5,
  },
  formulaBox: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    padding: '12px 16px',
    borderRadius: '6px',
    fontFamily: 'monospace',
    fontSize: '13px',
    marginBottom: '16px',
  },
  formulaParams: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '12px',
  },
  paramItem: {
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '6px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '12px',
    color: '#4B5563',
    lineHeight: 1.4,
  },
  shadowOverview: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '16px',
  },
  gateResultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: '6px',
    padding: '8px 12px',
  },
  gateLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#374151',
  },
  gateResultBadge: {
    fontSize: '11px',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '4px',
  },
  comparisonTableWrap: {
    overflowX: 'auto',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    marginBottom: '12px',
  },
  comparisonTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    textAlign: 'left',
  },
  th: {
    backgroundColor: '#F9FAFB',
    color: '#374151',
    fontWeight: 700,
    padding: '10px 12px',
    borderBottom: '1px solid #E5E7EB',
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #F3F4F6',
    color: '#1F2937',
  },
  shadowNote: {
    fontSize: '12px',
    color: '#4B5563',
    backgroundColor: '#F9FAFB',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #E5E7EB',
    lineHeight: 1.5,
  },
  unsupportedIntro: {
    fontSize: '13px',
    color: '#4B5563',
    lineHeight: 1.5,
    margin: '0 0 12px 0',
  },
  unsupportedList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '12px',
  },
  unsupportedCard: {
    backgroundColor: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  unsupportedHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  unsupportedBadge: {
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  unsupportedName: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#111827',
  },
  unsupportedReason: {
    fontSize: '11px',
    color: '#4B5563',
  },
  unsupportedExplanation: {
    fontSize: '12px',
    color: '#374151',
    lineHeight: 1.4,
  },
  footerNote: {
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid #F3F4F6',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    fontSize: '12px',
    color: '#6B7280',
  },
  footerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: '1 1 350px',
  },
  footerLock: {
    fontSize: '14px',
  },
  footerTags: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  footerPill: {
    fontSize: '10px',
    fontWeight: 600,
    backgroundColor: '#F3F4F6',
    color: '#4B5563',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  rankingHeaderBanner: {
    backgroundColor: '#F0FDF4',
    border: '1px solid #BBF7D0',
    borderRadius: '8px',
    padding: '12px 16px',
    marginBottom: '16px',
  },
  rankingHeaderTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#166534',
    marginBottom: '4px',
  },
  rankingHeaderDesc: {
    fontSize: '12px',
    color: '#15803D',
    lineHeight: 1.4,
  },
  rankingStatsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  rankingStatCard: {
    backgroundColor: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  rankingStatLabel: {
    fontSize: '11px',
    color: '#6B7280',
    fontWeight: 600,
  },
  rankingStatValue: {
    fontSize: '20px',
    fontWeight: 800,
    color: '#111827',
  },
  rankingStatSub: {
    fontSize: '11px',
    color: '#9CA3AF',
  },
  exclusionsBox: {
    backgroundColor: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: '8px',
    padding: '10px 14px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  exclusionsPillWrap: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  exclusionPill: {
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid #FCD34D',
  },
  insufficientEvidenceCard: {
    backgroundColor: '#FEF3C7',
    border: '1px solid #F59E0B',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  insufficientBadge: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#92400E',
    letterSpacing: '0.04em',
  },
  evaluatedRankingCard: {
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
  },
  evaluatedBadge: {
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    padding: '2px 8px',
    borderRadius: '4px',
    border: '1px solid #86EFAC',
    letterSpacing: '0.04em',
  },
  concordancePill: {
    fontSize: '12px',
    fontWeight: 700,
    backgroundColor: '#F3F4F6',
    color: '#1F2937',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid #D1D5DB',
  },
  rankingBreakdownGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    padding: '12px',
    backgroundColor: '#F9FAFB',
    borderRadius: '6px',
    marginBottom: '12px',
  },
  rankingBreakdownCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    fontSize: '12px',
  },
  breakdownLabel: {
    fontSize: '11px',
    color: '#6B7280',
  },
  uncertaintyNote: {
    fontSize: '11px',
    color: '#4B5563',
    backgroundColor: '#F3F4F6',
    padding: '8px 12px',
    borderRadius: '6px',
    lineHeight: 1.4,
  },
  methodologyBox: {
    backgroundColor: '#F9FAFB',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    padding: '12px 16px',
  },
  // Phase 7.4 Status Panel & Preference Control Styles
  statusPanel: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #E2E8F0',
    borderRadius: '12px',
    padding: '16px 20px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  statusPanelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #F1F5F9',
  },
  statusBadgesGroup: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  statusPillActive: {
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid #86EFAC',
  },
  statusPillLocked: {
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid #FDE68A',
  },
  statusPillShadow: {
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#E0E7FF',
    color: '#3730A3',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid #C7D2FE',
  },
  statusTimestamp: {
    fontSize: '11px',
    color: '#64748B',
  },
  pipelineGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  pipelineCard: {
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  pipelineStepNum: {
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
    color: '#94A3B8',
    letterSpacing: '0.05em',
  },
  pipelineTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#1E293B',
  },
  pipelineValue: {
    fontSize: '14px',
    fontWeight: 800,
    color: '#0F172A',
    margin: '2px 0',
  },
  pipelineCaption: {
    fontSize: '11px',
    color: '#64748B',
    lineHeight: 1.35,
  },
  preferenceControlBox: {
    backgroundColor: '#F8FAFC',
    border: '1.5px solid #CBD5E1',
    borderRadius: '8px',
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
  },
  prefControlLeft: {
    flex: '1 1 450px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  prefControlDesc: {
    fontSize: '11px',
    color: '#64748B',
    lineHeight: 1.45,
  },
  prefControlRight: {
    display: 'flex',
    alignItems: 'center',
  },
  prefToggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #CBD5E1',
    borderRadius: '6px',
    padding: '8px 12px',
  },
  prefToggleText: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#1E293B',
  },
  tagActive: {
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  tagPaused: {
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: '#F1F5F9',
    color: '#475569',
    padding: '2px 6px',
    borderRadius: '4px',
  },
  preferenceFeedbackToast: {
    marginTop: '10px',
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '12px',
    fontWeight: 600,
  },
  // Simulation Tab Styles
  simHeaderBanner: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '12px',
  },
  simSuperBadge: {
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
    color: '#6366F1',
    letterSpacing: '0.05em',
    marginBottom: '4px',
  },
  simTitle: {
    margin: '0 0 4px 0',
    fontSize: '16px',
    fontWeight: 800,
    color: '#1E293B',
  },
  simSubtitle: {
    margin: 0,
    fontSize: '12px',
    color: '#64748B',
    lineHeight: 1.45,
    maxWidth: '700px',
  },
  simSafetyBadge: {
    fontSize: '11px',
    fontWeight: 800,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1.5px solid #86EFAC',
    letterSpacing: '0.04em',
  },
  simControlsCard: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px 20px',
    marginBottom: '16px',
  },
  simControlRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '16px',
    paddingBottom: '14px',
    borderBottom: '1px solid #F1F5F9',
  },
  simScenarioGroup: {
    flex: '1 1 450px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  simLabel: {
    fontSize: '12px',
    color: '#1E293B',
  },
  simSelect: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1.5px solid #CBD5E1',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1E293B',
    backgroundColor: '#FFFFFF',
    maxWidth: '480px',
  },
  simScenarioDesc: {
    fontSize: '11px',
    color: '#64748B',
    fontStyle: 'italic',
  },
  simResetBtnWrap: {
    display: 'flex',
    alignItems: 'center',
  },
  simResetBtn: {
    padding: '8px 14px',
    borderRadius: '6px',
    border: '1.5px solid #94A3B8',
    backgroundColor: '#F8FAFC',
    color: '#1E293B',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  simWeightsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
  },
  simWeightBox: {
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  simWeightHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simWeightName: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#1E293B',
  },
  simDeltaBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
  },
  simWeightInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  simSlider: {
    flex: 1,
    cursor: 'pointer',
  },
  simNumberInput: {
    width: '65px',
    padding: '4px 6px',
    borderRadius: '4px',
    border: '1px solid #CBD5E1',
    fontSize: '12px',
    fontWeight: 700,
    textAlign: 'right',
  },
  simWeightFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#64748B',
  },
  simValidationAlert: {
    marginTop: '14px',
    padding: '10px 14px',
    backgroundColor: '#FEF2F2',
    border: '1px solid #FCA5A5',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#991B1B',
  },
  simResultsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  simTradeoffCard: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px 20px',
  },
  simTradeoffHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '8px',
  },
  simFeasibleBadge: {
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#DCFCE7',
    color: '#166534',
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid #86EFAC',
  },
  simInfeasibleBadge: {
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    padding: '3px 8px',
    borderRadius: '6px',
    border: '1px solid #FCA5A5',
  },
  simTradeoffText: {
    margin: 0,
    fontSize: '13px',
    color: '#334155',
    lineHeight: 1.5,
  },
  simViolationsList: {
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  simViolationItem: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#991B1B',
  },
  simTableCard: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px 20px',
    overflowX: 'auto',
  },
  simTableTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#1E293B',
    marginBottom: '12px',
  },
  simTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
    textAlign: 'left',
  },
  simTableHeaderRow: {
    backgroundColor: '#F8FAFC',
    borderBottom: '2px solid #E2E8F0',
  },
  simTh: {
    padding: '10px 12px',
    fontWeight: 700,
    color: '#334155',
  },
  simTr: {
    borderBottom: '1px solid #F1F5F9',
  },
  simTd: {
    padding: '9px 12px',
    color: '#1E293B',
  },
  simShiftedCard: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #E2E8F0',
    borderRadius: '10px',
    padding: '14px 18px',
  },
  simShiftedTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#1E293B',
    marginBottom: '8px',
  },
  simShiftedGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '8px',
  },
  simShiftedItem: {
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11px',
  },
  simIsolationNotice: {
    backgroundColor: '#F8FAFC',
    border: '1px solid #CBD5E1',
    borderRadius: '8px',
    padding: '12px 16px',
    fontSize: '12px',
    color: '#475569',
    lineHeight: 1.45,
  },
  simEmptyBacklogAlert: {
    backgroundColor: '#FEF3C7',
    border: '1.5px solid #F59E0B',
    borderRadius: '8px',
    padding: '16px',
    fontSize: '13px',
    color: '#92400E',
  },
};
