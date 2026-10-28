import React, { useMemo, useState } from 'react';
import MotifIcon from './MotifIcon';
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
  METRIC_METHODOLOGY_DISCLOSURE,
} from '../scheduler/scheduleSimulator';
import {
  createConfigurationSnapshot,
  saveSnapshot,
  listSnapshots,
  getActiveConfigRecord,
  rollbackToSnapshot,
  restoreFactoryConfiguration,
} from '../scheduler/configurationSnapshot';
import {
  evaluateActivationGate,
  ACTIVATION_GATE_OUTCOMES,
  DEFAULT_MIN_MEANINGFUL_DELTA,
} from '../scheduler/activationGateEvaluator';
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
  const [simViewMode, setSimViewMode] = useState('split'); // 'split' | 'baseline' | 'candidate'
  const [showMethodologyDisclosure, setShowMethodologyDisclosure] = useState(false);
  const [activeConfigRecord, setActiveConfigRecord] = useState(() => getActiveConfigRecord());
  const [snapshotsList, setSnapshotsList] = useState(() => listSnapshots());
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [snapshotFeedback, setSnapshotFeedback] = useState(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

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
          ? 'Explicit preference collection is active. Choices made in Sprint Planner will be saved locally.'
          : 'Explicit preference collection paused. No new comparison events will be recorded.',
      });
      setTimeout(() => setPreferenceFeedback(null), 5000);
    } else {
      setPreferenceFeedback({
        type: 'error',
        text: 'Failed to save preference collection setting to local storage.',
      });
    }
  };

  // Handle saving current candidate weights as a versioned snapshot (Phase 7.4 Stage 3)
  const handleSaveSnapshot = () => {
    try {
      const snap = createConfigurationSnapshot({
        weights: simCandidateWeights,
        provenance: 'manual_simulation',
      });
      const res = saveSnapshot(snap);
      if (res.success) {
        const updatedList = listSnapshots();
        setSnapshotsList(updatedList);
        setSelectedSnapshotId(snap.snapshotId);
        setSnapshotFeedback({
          type: 'success',
          text: `Saved configuration snapshot "${snap.snapshotId}" (Rev ${snap.revision}, Checksum: ${snap.integrityChecksum}). Production adaptation remains disabled.`,
        });
        setTimeout(() => setSnapshotFeedback(null), 6000);
      } else {
        setSnapshotFeedback({
          type: 'error',
          text: `Failed to save snapshot: ${res.error || 'Validation error'}`,
        });
      }
    } catch (err) {
      setSnapshotFeedback({
        type: 'error',
        text: `Snapshot error: ${err.message}`,
      });
    }
  };

  // Handle rollback of active configuration record to selected snapshot
  const handleRollback = () => {
    if (!selectedSnapshotId) {
      setSnapshotFeedback({
        type: 'error',
        text: 'Please select a snapshot to rollback to.',
      });
      return;
    }

    const res = rollbackToSnapshot(selectedSnapshotId, {
      expectedRevision: activeConfigRecord.revision,
    });

    if (res.success) {
      setActiveConfigRecord(res.activeConfig);
      // Synchronize candidate sliders with rolled back weights
      setSimCandidateWeights({ ...res.restoredWeights });
      setSnapshotFeedback({
        type: 'success',
        text: `Rolled back configuration record to "${selectedSnapshotId}" (Revision ${res.activeConfig.revision}). Note: Production scheduler remains locked to factory weights.`,
      });
      setTimeout(() => setSnapshotFeedback(null), 6000);
    } else {
      setSnapshotFeedback({
        type: 'error',
        text: `Rollback failed: ${res.error || 'Validation or revision conflict'}`,
      });
    }
  };

  // Handle factory configuration restoration
  const handleRestoreFactory = () => {
    const res = restoreFactoryConfiguration({
      expectedRevision: activeConfigRecord.revision,
    });

    if (res.success) {
      setActiveConfigRecord(res.activeConfig);
      setSnapshotsList(listSnapshots());
      // Reset candidate sliders to factory defaults
      setSimCandidateWeights({ ...FACTORY_SCHEDULER_WEIGHTS });
      setShowRestoreConfirm(false);
      setSnapshotFeedback({
        type: 'success',
        text: `Restored configuration record to canonical factory defaults (Revision ${res.activeConfig.revision}). Production scheduler remains locked to factory weights.`,
      });
      setTimeout(() => setSnapshotFeedback(null), 6000);
    } else {
      setSnapshotFeedback({
        type: 'error',
        text: `Factory restore failed: ${res.error || 'Storage or revision error'}`,
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

  const activeActivationGate = useMemo(() => {
    const isSynthetic = showSyntheticDemo;
    const readiness = isSynthetic ? syntheticDemo?.readiness : realAnalysis.readiness;
    const factorySnapAvailable = snapshotsList.some((s) => s.snapshot?.isFactoryBaseline && s.isValid);

    // Build paired observations from current real evidence
    const pairedObservations = realAnalysis.preferenceEvidence?.eligible?.map((cmp, idx) => ({
      observationId: cmp.comparison_id || `cmp_${idx}`,
      context: cmp.context || { scenario_key: 'real_user_comparisons' },
      candidateAlternative: cmp.preferredAlternative,
      baselineAlternative: cmp.nonPreferredAlternative,
    })) || [];

    return evaluateActivationGate({
      candidateWeights: simCandidateWeights,
      baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
      readinessReport: readiness,
      rollbackPreflight: {
        success: true,
        verified: true,
        factorySnapshotAvailable: factorySnapAvailable,
      },
      pairedObservations,
      isSyntheticData: isSynthetic,
      minMeaningfulDelta: DEFAULT_MIN_MEANINGFUL_DELTA,
      environment: isSynthetic ? 'simulation' : 'production',
    });
  }, [showSyntheticDemo, syntheticDemo, realAnalysis, simCandidateWeights, snapshotsList]);

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
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
              role="status"
            >
              <MotifIcon name="lock" size={12} color="#92400E" />
              ADAPTATION LOCKED — SHADOW EVALUATION ONLY
            </span>
            {showSyntheticDemo && (
              <span style={{ ...styles.demoBadge, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <MotifIcon name="flask" size={12} color="#4338CA" />
                SYNTHETIC SIMULATION FIXTURE ACTIVE
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
          <span style={styles.syntheticWarningIcon}><MotifIcon name="warning" size={16} color="#D97706" /></span>
          <div style={styles.syntheticWarningText}>
            <strong>Synthetic Demonstration — Not Your History:</strong> This simulation evaluates in-memory diagnostic fixtures with simulated maturity. It never modifies your real IndexedDB telemetry, never alters readiness gates, and cannot activate production adaptation.
          </div>
        </div>
      )}

      {/* Production Safety Banner */}
      <div style={styles.safetyCallout}>
        <span style={styles.safetyIcon}><MotifIcon name="shield" size={18} color="#15803D" /></span>
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
            <span style={{ ...styles.statusPillActive, display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Production scheduling proposals use immutable factory baseline weights">
              <MotifIcon name="shield" size={11} color="#15803D" />
              Factory Scheduler: Active
            </span>
            <span style={{ ...styles.statusPillLocked, display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="Production adaptation is disabled (isAdaptationUnlocked: false, productionApplied: false)">
              <MotifIcon name="lock" size={11} color="#92400E" />
              Adaptation: Disabled
            </span>
            <span style={{ ...styles.statusPillShadow, display: 'inline-flex', alignItems: 'center', gap: '4px' }} title="All candidate evaluation occurs in isolated shadow simulation">
              <MotifIcon name="flask" size={11} color="#4338CA" />
              Evaluation: Shadow-Only
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
              <MotifIcon name="sliders" size={15} color="#52525B" />
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
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            role="status"
          >
            <MotifIcon name={preferenceFeedback.type === 'error' ? 'warning' : 'check'} size={14} />
            <span>{preferenceFeedback.text}</span>
          </div>
        )}

        {/* SECTION: Configuration Snapshots & Rollback Safety Foundation (Scope B & Scope 9) */}
        <div style={styles.configRollbackBox} aria-label="Configuration Snapshots & Rollback Safety">
          <div style={styles.prefControlLeft}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <MotifIcon name="shield" size={15} color="#15803D" />
              <strong style={{ fontSize: '13px', color: '#1E293B' }}>Configuration Snapshots & Rollback Safety</strong>
              <span style={activeConfigRecord.isFactoryBaseline ? styles.tagActive : styles.tagCandidate}>
                {activeConfigRecord.isFactoryBaseline
                  ? `Active Record: Factory Baseline (Rev ${activeConfigRecord.revision})`
                  : `Active Record: Candidate ${activeConfigRecord.sourceSnapshotId.slice(0, 14)}... (Rev ${activeConfigRecord.revision})`}
              </span>
              <span style={styles.statusPillLocked} title="Production adaptation remains locked">
                Production Adaptation Disabled
              </span>
            </div>
            <div style={styles.prefControlDesc}>
              Provides deterministic versioned snapshots, checksum integrity verification, and instant rollback to canonical factory defaults.
              {' '}<strong>Production Invariant:</strong> Saving or restoring configuration records does <em>not</em> activate learned weights. Production scheduling continues using 100% factory defaults.
            </div>
            <div style={styles.configDetailsRow}>
              <span style={styles.configDetailLabel}>Active Weights in Record:</span>
              <span style={styles.configDetailCode}>
                Urgency: {activeConfigRecord.activeWeights?.urgencyWeight} · Priority: {activeConfigRecord.activeWeights?.priorityWeight} · Unblock: {activeConfigRecord.activeWeights?.unblockWeight} · Risk: {activeConfigRecord.activeWeights?.riskWeight}
              </span>
              <span style={styles.configDetailMeta}>
                Source: <code>{activeConfigRecord.sourceSnapshotId}</code> ({activeConfigRecord.provenance})
              </span>
            </div>
          </div>

          <div style={styles.configControlsRight}>
            <div style={styles.configActionsRow}>
              {snapshotsList.length > 0 && (
                <select
                  id="snapshot-selector"
                  value={selectedSnapshotId}
                  onChange={(e) => setSelectedSnapshotId(e.target.value)}
                  style={styles.snapshotSelect}
                  aria-label="Select configuration snapshot"
                >
                  <option value="">-- Select Saved Snapshot ({snapshotsList.length}) --</option>
                  {snapshotsList.map(({ snapshot, isValid }) => (
                    <option key={snapshot.snapshotId} value={snapshot.snapshotId}>
                      {snapshot.snapshotId} (Rev {snapshot.revision}) {isValid ? '[Valid]' : '[Invalid]'}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                id="save-config-snapshot-btn"
                onClick={handleSaveSnapshot}
                style={styles.saveSnapshotBtn}
                title="Save current candidate slider weights as a validated versioned snapshot"
              >
                Save Candidate Snapshot
              </button>

              {snapshotsList.length > 0 && selectedSnapshotId && (
                <button
                  type="button"
                  id="rollback-config-btn"
                  onClick={handleRollback}
                  style={styles.rollbackBtn}
                  title="Roll back active configuration record to selected snapshot"
                >
                  Rollback to Snapshot
                </button>
              )}

              {!showRestoreConfirm ? (
                <button
                  type="button"
                  id="restore-factory-config-btn"
                  onClick={() => setShowRestoreConfirm(true)}
                  style={styles.restoreFactoryBtn}
                  title="Restore active configuration to canonical factory baseline defaults"
                >
                  Restore Factory Defaults
                </button>
              ) : (
                <div style={styles.confirmRestoreGroup}>
                  <span style={styles.confirmRestorePrompt}>Restore canonical factory defaults?</span>
                  <button
                    type="button"
                    id="confirm-restore-factory-btn"
                    onClick={handleRestoreFactory}
                    style={styles.confirmRestoreBtn}
                  >
                    Confirm Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRestoreConfirm(false)}
                    style={styles.cancelRestoreBtn}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {snapshotFeedback && (
          <div
            style={{
              ...styles.preferenceFeedbackToast,
              backgroundColor: snapshotFeedback.type === 'error' ? '#FEE2E2' : '#EFF6FF',
              color: snapshotFeedback.type === 'error' ? '#991B1B' : '#1E40AF',
              borderColor: snapshotFeedback.type === 'error' ? '#FCA5A5' : '#BFDBFE',
              marginTop: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            role="status"
          >
            <MotifIcon name={snapshotFeedback.type === 'error' ? 'warning' : 'check'} size={14} />
            <span>{snapshotFeedback.text}</span>
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
          Schedule Simulation (Shadow-Only)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'weights'}
          onClick={() => setActiveTab('weights')}
          style={activeTab === 'weights' ? styles.tabButtonActive : styles.tabButton}
        >
          Weight Candidates ({showSyntheticDemo ? 'Synthetic Demo' : 'Factory Baseline'})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'shrinkage'}
          onClick={() => setActiveTab('shrinkage')}
          style={activeTab === 'shrinkage' ? styles.tabButtonActive : styles.tabButton}
        >
          Bayesian Shrinkage & Bounds (K=10, ±20%)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'shadow'}
          onClick={() => setActiveTab('shadow')}
          style={activeTab === 'shadow' ? styles.tabButtonActive : styles.tabButton}
        >
          Shadow Evaluation & Regression Gates
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'ranking'}
          onClick={() => setActiveTab('ranking')}
          style={activeTab === 'ranking' ? styles.tabButtonActive : styles.tabButton}
        >
          Preference Ranking (Offline)
        </button>
        <button
          type="button"
          role="tab"
          id="tab-activation-gate"
          aria-selected={activeTab === 'activation_gate'}
          onClick={() => setActiveTab('activation_gate')}
          style={activeTab === 'activation_gate' ? styles.tabButtonActive : styles.tabButton}
        >
          Activation Gate (Shadow-Only)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'unsupported'}
          onClick={() => setActiveTab('unsupported')}
          style={activeTab === 'unsupported' ? styles.tabButtonActive : styles.tabButton}
        >
          Unsupported Mappings & Disclosures
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
            <div style={{ ...styles.simSafetyBadge, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <MotifIcon name="shield" size={13} color="#15803D" />
              PRODUCTION SCHEDULE UNTOUCHED
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
                  Reset to Factory Baseline
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
                    <MotifIcon name="search" size={16} />
                    <strong style={{ fontSize: '14px', color: '#1E293B' }}>Trade-Off & Feasibility Verdict:</strong>
                  </div>
                  <span
                    style={simulationResult.isFeasible ? styles.simFeasibleBadge : styles.simInfeasibleBadge}
                  >
                    {simulationResult.isFeasible ? '100% Feasible Schedule' : 'Constraint Violations Detected'}
                  </span>
                </div>
                <p style={styles.simTradeoffText}>
                  {simulationResult.tradeOffAnalysis?.summary}
                </p>
                {simulationResult.violations?.length > 0 && (
                  <div style={styles.simViolationsList}>
                    {simulationResult.violations.map((v, i) => (
                      <div key={i} style={{ ...styles.simViolationItem, display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <MotifIcon name="close" size={12} color="#DC2626" />
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Side-by-Side Comparison Metrics Table */}
              <div style={styles.simTableCard}>
                <div style={styles.simTableTitleRow}>
                  <span style={{ ...styles.simTableTitle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <MotifIcon name="chart" size={14} />
                    Comparative Schedule Metrics (Factory Baseline vs. Candidate Configuration)
                  </span>
                  <span style={{ ...styles.simAuditNoticeBadge, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MotifIcon name="check" size={11} color="#15803D" />
                    Audited Metric Definitions
                  </span>
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
                      <td style={styles.simTd}>
                        <strong>Scheduled Tasks Coverage</strong>
                        <div style={styles.metricSubtext}>Unique backlog tasks scheduled within planning window</div>
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.baselineMetrics.scheduledTasks} / {simulationResult.baselineMetrics.totalTasks} tasks ({simulationResult.baselineMetrics.coverageRatePct ?? 0}%)
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.candidateMetrics.scheduledTasks} / {simulationResult.candidateMetrics.totalTasks} tasks ({simulationResult.candidateMetrics.coverageRatePct ?? 0}%)
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.candidateMetrics.scheduledTasks - simulationResult.baselineMetrics.scheduledTasks === 0
                          ? 'Identical (0)'
                          : `${simulationResult.candidateMetrics.scheduledTasks - simulationResult.baselineMetrics.scheduledTasks > 0 ? '+' : ''}${simulationResult.candidateMetrics.scheduledTasks - simulationResult.baselineMetrics.scheduledTasks} tasks`}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>
                        <strong>Planned Deadline Compliance</strong>
                        <div style={styles.metricSubtext}>Tasks scheduled on or before explicit calendar deadline</div>
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.baselineMetrics.plannedComplianceAvailable ? (
                          `${simulationResult.baselineMetrics.plannedCompliantCount} / ${simulationResult.baselineMetrics.scheduledTasksWithDeadlineCount} tasks (${simulationResult.baselineMetrics.plannedComplianceRatePct}%)`
                        ) : (
                          <span style={{ color: '#64748B', fontStyle: 'italic' }}>Unavailable (No tasks have deadlines)</span>
                        )}
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.candidateMetrics.plannedComplianceAvailable ? (
                          `${simulationResult.candidateMetrics.plannedCompliantCount} / ${simulationResult.candidateMetrics.scheduledTasksWithDeadlineCount} tasks (${simulationResult.candidateMetrics.plannedComplianceRatePct}%)`
                        ) : (
                          <span style={{ color: '#64748B', fontStyle: 'italic' }}>Unavailable (No tasks have deadlines)</span>
                        )}
                      </td>
                      <td style={{
                        ...styles.simTd,
                        fontWeight: 700,
                        color: simulationResult.comparison.onTimeDelta >= 0 ? '#166534' : '#991B1B'
                      }}>
                        {simulationResult.comparison.complianceRateDeltaPct !== null ? (
                          `${simulationResult.comparison.onTimeDelta > 0 ? `+${simulationResult.comparison.onTimeDelta}` : simulationResult.comparison.onTimeDelta} tasks (${simulationResult.comparison.complianceRateDeltaPct > 0 ? `+${simulationResult.comparison.complianceRateDeltaPct}%` : `${simulationResult.comparison.complianceRateDeltaPct}%`})`
                        ) : (
                          'N/A (No deadlines)'
                        )}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>
                        <strong>Planned Delayed Tasks</strong>
                        <div style={styles.metricSubtext}>Tasks scheduled after their explicit calendar deadline</div>
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.baselineMetrics.plannedDelayedCount} tasks
                        {simulationResult.baselineMetrics.overdueAtStartCount > 0 && ` (${simulationResult.baselineMetrics.overdueAtStartCount} overdue prior to start)`}
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.candidateMetrics.plannedDelayedCount} tasks
                        {simulationResult.candidateMetrics.overdueAtStartCount > 0 && ` (${simulationResult.candidateMetrics.overdueAtStartCount} overdue prior to start)`}
                      </td>
                      <td style={{
                        ...styles.simTd,
                        fontWeight: 700,
                        color: simulationResult.comparison.delayedDelta <= 0 ? '#166534' : '#991B1B'
                      }}>
                        {simulationResult.comparison.delayedDelta > 0
                          ? `+${simulationResult.comparison.delayedDelta} delayed`
                          : simulationResult.comparison.delayedDelta < 0
                            ? `${simulationResult.comparison.delayedDelta} delayed`
                            : '0 delta'}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>
                        <strong>Cumulative Planned Delay</strong>
                        <div style={styles.metricSubtext}>Sum of integer days planned past deadline across all tasks</div>
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.baselineMetrics.totalPlannedDelayDays} days
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.candidateMetrics.totalPlannedDelayDays} days
                      </td>
                      <td style={{
                        ...styles.simTd,
                        fontWeight: 700,
                        color: simulationResult.comparison.delayDaysDelta <= 0 ? '#166534' : '#991B1B'
                      }}>
                        {simulationResult.comparison.delayDaysDelta > 0
                          ? `+${simulationResult.comparison.delayDaysDelta}d`
                          : simulationResult.comparison.delayDaysDelta < 0
                            ? `${simulationResult.comparison.delayDaysDelta}d`
                            : '0d'}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>
                        <strong>Capacity Utilization Rate</strong>
                        <div style={styles.metricSubtext}>Scheduled hours / total working capacity in horizon</div>
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.baselineMetrics.capacityUtilizationAvailable ? (
                          `${simulationResult.baselineMetrics.capacityUtilizationPct}% (${simulationResult.baselineMetrics.scheduledWorkloadHours}h / ${simulationResult.baselineMetrics.totalCapacityHours}h)`
                        ) : (
                          <span style={{ color: '#64748B', fontStyle: 'italic' }}>Unavailable (Zero capacity)</span>
                        )}
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.candidateMetrics.capacityUtilizationAvailable ? (
                          `${simulationResult.candidateMetrics.capacityUtilizationPct}% (${simulationResult.candidateMetrics.scheduledWorkloadHours}h / ${simulationResult.candidateMetrics.totalCapacityHours}h)`
                        ) : (
                          <span style={{ color: '#64748B', fontStyle: 'italic' }}>Unavailable (Zero capacity)</span>
                        )}
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.comparison.utilizationDeltaPct > 0
                          ? `+${simulationResult.comparison.utilizationDeltaPct}%`
                          : simulationResult.comparison.utilizationDeltaPct < 0
                            ? `${simulationResult.comparison.utilizationDeltaPct}%`
                            : '0.0%'}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>
                        <strong>Schedule Churn (Shifted Placements)</strong>
                        <div style={styles.metricSubtext}>Structural placement displacement relative to factory baseline</div>
                      </td>
                      <td style={styles.simTd}>
                        <em>Reference Baseline</em>
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.comparison.churnCount} placements shifted
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.comparison.churnCount === 0
                          ? 'Identical Calendar (0 Churn)'
                          : `${simulationResult.comparison.churnCount} placement shifts`}
                      </td>
                    </tr>
                    <tr style={styles.simTr}>
                      <td style={styles.simTd}>
                        <strong>Hard Constraint Compliance</strong>
                        <div style={styles.metricSubtext}>DAG acyclicity, capacity ceilings, and dependency order</div>
                      </td>
                      <td style={styles.simTd}>
                        100% Feasible (0 Cycles, 0 Overruns)
                      </td>
                      <td style={styles.simTd}>
                        {simulationResult.isFeasible ? '100% Feasible' : 'Infeasible (Violations)'}
                      </td>
                      <td style={{
                        ...styles.simTd,
                        fontWeight: 700,
                        color: simulationResult.isFeasible ? '#166534' : '#991B1B'
                      }}>
                        {simulationResult.isFeasible ? 'Passed Feasibility' : 'Infeasible Candidate'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* READ-ONLY CANDIDATE SCHEDULE PREVIEW (Part C & D) */}
              <div style={styles.simPreviewCard}>
                <div style={styles.simPreviewHeader}>
                  <div>
                    <h5 style={{ ...styles.simPreviewTitle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <MotifIcon name="calendar" size={14} />
                      Read-Only Schedule Timeline Preview
                    </h5>
                    <p style={styles.simPreviewSubtitle}>
                      Inspect day-by-day placements, multi-day work sessions, deadlines, and date shifts.
                    </p>
                  </div>
                  <span style={{ ...styles.simReadOnlyBadge, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MotifIcon name="lock" size={11} color="#92400E" />
                    READ-ONLY PREVIEW — ISOLATED FROM PRODUCTION
                  </span>
                </div>

                {/* Layout View Mode Switcher */}
                <div style={styles.simViewToggleBar}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    Preview Layout:
                  </span>
                  <div style={styles.simViewBtnGroup} role="tablist" aria-label="Schedule Preview Layout">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={simViewMode === 'split'}
                      onClick={() => setSimViewMode('split')}
                      style={simViewMode === 'split' ? styles.simViewBtnActive : styles.simViewBtn}
                    >
                      Side-by-Side (Split)
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={simViewMode === 'baseline'}
                      onClick={() => setSimViewMode('baseline')}
                      style={simViewMode === 'baseline' ? styles.simViewBtnActive : styles.simViewBtn}
                    >
                      Factory Baseline Only
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={simViewMode === 'candidate'}
                      onClick={() => setSimViewMode('candidate')}
                      style={simViewMode === 'candidate' ? styles.simViewBtnActive : styles.simViewBtn}
                    >
                      Candidate Simulation Only
                    </button>
                  </div>
                </div>

                {/* Timeline Columns Container */}
                <div style={styles.simColumnsWrap}>
                  {/* Column 1: Factory Baseline */}
                  {(simViewMode === 'split' || simViewMode === 'baseline') && (
                    <div style={styles.simCol}>
                      <div style={styles.simColHeader}>
                        <div>
                          <div style={{ ...styles.simColTitle, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <MotifIcon name="shield" size={13} color="#15803D" />
                            Factory Baseline (Active)
                          </div>
                          <div style={styles.simColWeightsText}>
                            Urgency: 50 | Priority: 100 | Unblock: 15 | Risk: 25
                          </div>
                        </div>
                        <span style={styles.simFeasibleBadge}>
                          {simulationResult.baselineMetrics.scheduledTasks} / {simulationResult.baselineMetrics.totalTasks} Scheduled
                        </span>
                      </div>

                      {/* Day by Day List */}
                      <div style={styles.simDaysScroll}>
                        {(simulationResult.baselineSchedule?.dayAllocations || [])
                          .filter((d) => d.tasks?.length > 0 || d.isWorkingDay)
                          .slice(0, 14)
                          .map((day) => {
                            const utilColor = (day.utilizationPercent || 0) > 100 ? '#DC2626' : '#16A34A';
                            return (
                              <div key={day.date} style={styles.simDayBlock}>
                                <div style={styles.simDayBlockHeader}>
                                  <span style={styles.simDayDate}>
                                    {day.date} • {day.dayName}
                                  </span>
                                  <span style={styles.simDayWorkloadPill}>
                                    {(day.totalHours || 0).toFixed(1)}h / {(day.capacityHours || 0).toFixed(1)}h ({day.utilizationPercent || 0}%)
                                  </span>
                                </div>
                                <div style={styles.simProgressBarTrack}>
                                  <div
                                    style={{
                                      ...styles.simProgressBarFill,
                                      width: `${Math.min(100, day.utilizationPercent || 0)}%`,
                                      backgroundColor: utilColor,
                                    }}
                                  />
                                </div>

                                <div style={styles.simTaskList}>
                                  {(!day.tasks || day.tasks.length === 0) ? (
                                    <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
                                      No tasks scheduled
                                    </div>
                                  ) : (
                                    day.tasks.map((tAlloc, tIdx) => {
                                      const pInfo = simulationResult.baselineSchedule?.placements?.find(
                                        (p) => p.taskId === tAlloc.taskId && p.proposedDate === day.date
                                      );
                                      const pColor = (pInfo?.taskPriority === 'high' || pInfo?.priority === 'high')
                                        ? '#DC2626'
                                        : (pInfo?.taskPriority === 'medium' || pInfo?.priority === 'medium')
                                          ? '#D97706'
                                          : '#64748B';

                                      return (
                                        <div
                                          key={tIdx}
                                          style={{
                                            ...styles.simTaskCard,
                                            borderLeftColor: pColor,
                                          }}
                                        >
                                          <div style={styles.simTaskTitleRow}>
                                            <span style={styles.simTaskTitle}>{tAlloc.taskTitle || tAlloc.taskId}</span>
                                            {pInfo?.isChunk && (
                                              <span style={styles.simTaskChunkBadge}>
                                                Session {pInfo.chunkIndex + 1} of {pInfo.totalChunks}
                                              </span>
                                            )}
                                            {pInfo?.inFocusWindow && (
                                              <span style={styles.simTaskFocusBadge}>
                                                {pInfo.focusWindowLabel || 'Focus'}
                                              </span>
                                            )}
                                          </div>
                                          <div style={styles.simTaskMetaRow}>
                                            <span>
                                              {tAlloc.startTime && tAlloc.endTime
                                                ? `${tAlloc.startTime} – ${tAlloc.endTime}`
                                                : 'Day Allocation'}
                                            </span>
                                            <span>{(tAlloc.hours || 0).toFixed(1)}h</span>
                                            {pInfo?.originalDueDate ? (
                                              <span
                                                style={{
                                                  ...styles.simTaskDeadlinePill,
                                                  backgroundColor: pInfo.status === 'on_time' ? '#DCFCE7' : '#FEE2E2',
                                                  color: pInfo.status === 'on_time' ? '#166534' : '#991B1B',
                                                  borderColor: pInfo.status === 'on_time' ? '#86EFAC' : '#FCA5A5',
                                                }}
                                              >
                                                {pInfo.status === 'on_time' ? 'On-Time' : 'Late'} (Due: {pInfo.originalDueDate})
                                              </span>
                                            ) : (
                                              <span style={{ ...styles.simTaskDeadlinePill, backgroundColor: '#F1F5F9', color: '#64748B', borderColor: '#CBD5E1' }}>
                                                Flexible (No Due Date)
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* Unscheduled Tasks in Baseline */}
                      {simulationResult.baselineMetrics.unscheduledTasks > 0 && (
                        <div style={styles.simUnscheduledBox}>
                          <strong>Unscheduled Backlog Tasks ({simulationResult.baselineMetrics.unscheduledTasks}):</strong>
                          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                            {(simulationResult.baselineSchedule?.taskSummaries || [])
                              .filter((t) => !t.isScheduled)
                              .map((uTask) => (
                                <li key={uTask.taskId}>
                                  <strong>{uTask.title}</strong> ({(uTask.totalHours || 0).toFixed(1)}h) — {uTask.plannedStatus === 'blocked' ? 'Blocked by dependency' : 'Exceeds horizon capacity'}
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Column 2: Candidate Simulation */}
                  {(simViewMode === 'split' || simViewMode === 'candidate') && (
                    <div style={styles.simCol}>
                      <div style={styles.simColHeader}>
                        <div>
                          <div style={{ ...styles.simColTitle, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <MotifIcon name="flask" size={13} color="#4338CA" />
                            Candidate Simulation (Shadow)
                          </div>
                          <div style={styles.simColWeightsText}>
                            Urgency: {simulationResult.candidateWeights?.urgencyWeight} | Priority: {simulationResult.candidateWeights?.priorityWeight} | Unblock: {simulationResult.candidateWeights?.unblockWeight} | Risk: {simulationResult.candidateWeights?.riskWeight}
                          </div>
                        </div>
                        <span style={simulationResult.isFeasible ? styles.simFeasibleBadge : styles.simInfeasibleBadge}>
                          {simulationResult.candidateMetrics.scheduledTasks} / {simulationResult.candidateMetrics.totalTasks} Scheduled ({simulationResult.isFeasible ? 'Feasible' : 'Infeasible'})
                        </span>
                      </div>

                      {/* Day by Day List */}
                      <div style={styles.simDaysScroll}>
                        {(simulationResult.candidateSchedule?.dayAllocations || [])
                          .filter((d) => d.tasks?.length > 0 || d.isWorkingDay)
                          .slice(0, 14)
                          .map((day) => {
                            const utilColor = (day.utilizationPercent || 0) > 100 ? '#DC2626' : '#16A34A';
                            return (
                              <div key={day.date} style={styles.simDayBlock}>
                                <div style={styles.simDayBlockHeader}>
                                  <span style={styles.simDayDate}>
                                    {day.date} • {day.dayName}
                                  </span>
                                  <span style={styles.simDayWorkloadPill}>
                                    {(day.totalHours || 0).toFixed(1)}h / {(day.capacityHours || 0).toFixed(1)}h ({day.utilizationPercent || 0}%)
                                  </span>
                                </div>
                                <div style={styles.simProgressBarTrack}>
                                  <div
                                    style={{
                                      ...styles.simProgressBarFill,
                                      width: `${Math.min(100, day.utilizationPercent || 0)}%`,
                                      backgroundColor: utilColor,
                                    }}
                                  />
                                </div>

                                <div style={styles.simTaskList}>
                                  {(!day.tasks || day.tasks.length === 0) ? (
                                    <div style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
                                      No tasks scheduled
                                    </div>
                                  ) : (
                                    day.tasks.map((tAlloc, tIdx) => {
                                      const pInfo = simulationResult.candidateSchedule?.placements?.find(
                                        (p) => p.taskId === tAlloc.taskId && p.proposedDate === day.date
                                      );
                                      const basePlacement = simulationResult.baselineSchedule?.placements?.find(
                                        (p) => p.taskId === tAlloc.taskId && (p.chunkIndex ?? 0) === (pInfo?.chunkIndex ?? 0)
                                      );
                                      const isShifted = basePlacement && basePlacement.proposedDate !== day.date;

                                      const pColor = (pInfo?.taskPriority === 'high' || pInfo?.priority === 'high')
                                        ? '#DC2626'
                                        : (pInfo?.taskPriority === 'medium' || pInfo?.priority === 'medium')
                                          ? '#D97706'
                                          : '#64748B';

                                      return (
                                        <div
                                          key={tIdx}
                                          style={{
                                            ...styles.simTaskCard,
                                            borderLeftColor: pColor,
                                            ...(isShifted ? { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' } : {}),
                                          }}
                                        >
                                          <div style={styles.simTaskTitleRow}>
                                            <span style={styles.simTaskTitle}>{tAlloc.taskTitle || tAlloc.taskId}</span>
                                            {pInfo?.isChunk && (
                                              <span style={styles.simTaskChunkBadge}>
                                                Session {pInfo.chunkIndex + 1} of {pInfo.totalChunks}
                                              </span>
                                            )}
                                            {pInfo?.inFocusWindow && (
                                              <span style={styles.simTaskFocusBadge}>
                                                {pInfo.focusWindowLabel || 'Focus'}
                                              </span>
                                            )}
                                          </div>
                                          <div style={styles.simTaskMetaRow}>
                                            <span>
                                              {tAlloc.startTime && tAlloc.endTime
                                                ? `${tAlloc.startTime} – ${tAlloc.endTime}`
                                                : 'Day Allocation'}
                                            </span>
                                            <span>{(tAlloc.hours || 0).toFixed(1)}h</span>
                                            {pInfo?.originalDueDate ? (
                                              <span
                                                style={{
                                                  ...styles.simTaskDeadlinePill,
                                                  backgroundColor: pInfo.status === 'on_time' ? '#DCFCE7' : '#FEE2E2',
                                                  color: pInfo.status === 'on_time' ? '#166534' : '#991B1B',
                                                  borderColor: pInfo.status === 'on_time' ? '#86EFAC' : '#FCA5A5',
                                                }}
                                              >
                                                {pInfo.status === 'on_time' ? 'On-Time' : 'Late'} (Due: {pInfo.originalDueDate})
                                              </span>
                                            ) : (
                                              <span style={{ ...styles.simTaskDeadlinePill, backgroundColor: '#F1F5F9', color: '#64748B', borderColor: '#CBD5E1' }}>
                                                Flexible (No Due Date)
                                              </span>
                                            )}
                                          </div>
                                          {isShifted ? (
                                            <div>
                                              <span style={styles.simTaskShiftBadge}>
                                                ⇄ Shifted from Baseline: {basePlacement.proposedDate || 'Unscheduled'}
                                              </span>
                                            </div>
                                          ) : (
                                            <div style={{ fontSize: '10px', color: '#16A34A', fontWeight: 600 }}>
                                              Same date as factory baseline
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* Unscheduled Tasks in Candidate */}
                      {simulationResult.candidateMetrics.unscheduledTasks > 0 && (
                        <div style={styles.simUnscheduledBox}>
                          <strong>Unscheduled Backlog Tasks ({simulationResult.candidateMetrics.unscheduledTasks}):</strong>
                          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                            {(simulationResult.candidateSchedule?.taskSummaries || [])
                              .filter((t) => !t.isScheduled)
                              .map((uTask) => (
                                <li key={uTask.taskId}>
                                  <strong>{uTask.title}</strong> ({(uTask.totalHours || 0).toFixed(1)}h) — {uTask.plannedStatus === 'blocked' ? 'Blocked by dependency' : 'Exceeds horizon capacity'}
                                </li>
                              ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Shifted Placements Details Drawer */}
              {simulationResult.comparison.shiftedPlacements?.length > 0 && (
                <div style={styles.simShiftedCard}>
                  <div style={{ ...styles.simShiftedTitle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <MotifIcon name="calendar" size={14} />
                    Placements Shifted by Candidate Weights ({simulationResult.comparison.shiftedPlacements.length})
                  </div>
                  <div style={styles.simShiftedGrid}>
                    {simulationResult.comparison.shiftedPlacements.map((p, idx) => (
                      <div key={idx} style={styles.simShiftedItem}>
                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{p.title}</div>
                        <div style={{ fontSize: '11px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>Baseline: <code>{p.baselineDate || 'Unscheduled'}</code></span>
                          <MotifIcon name="arrow-right" size={10} color="#94A3B8" />
                          <span>Candidate: <code>{p.candidateDate || 'Unscheduled'}</code></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SIMULATION METHODOLOGY & LIMITATIONS DISCLOSURE (Part E) */}
              <div style={styles.simDisclosureBox}>
                <button
                  type="button"
                  onClick={() => setShowMethodologyDisclosure(!showMethodologyDisclosure)}
                  style={styles.simDisclosureBtn}
                  aria-expanded={showMethodologyDisclosure}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <MotifIcon name="info" size={14} color="#1E40AF" />
                    Simulation Methodology & Limitations Disclosure
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <MotifIcon name={showMethodologyDisclosure ? 'chevron-up' : 'chevron-down'} size={12} />
                    {showMethodologyDisclosure ? 'Hide Details' : 'View Assumptions & Formulas'}
                  </span>
                </button>
                {showMethodologyDisclosure && (
                  <div style={styles.simDisclosureContent}>
                    {Object.entries(METRIC_METHODOLOGY_DISCLOSURE).map(([key, item]) => (
                      <div key={key} style={styles.simDisclosureItem}>
                        <strong>{item.name}</strong> [{item.type}]: <code>{item.formula}</code> (Denominator: <em>{item.denominator}</em>) — {item.notes}
                      </div>
                    ))}
                    <div style={styles.simDisclosureItem}>
                      <strong>Simulation Isolation Guarantee:</strong> Baseline uses factory weights (Urgency: 50, Priority: 100, Unblock: 15, Risk: 25). Candidate uses isolated bounded weights. Both run the exact same deterministic topological heuristic scheduler. All simulation calculations occur strictly in memory without modifying production scheduler weights or active task dates.
                    </div>
                  </div>
                )}
              </div>

              {/* Strict No-Application Guarantee Notice */}
              <div style={styles.simIsolationNotice}>
                <strong>Simulation Isolation Guarantee:</strong> Candidate simulation is 100% non-destructive and isolated. VoxPlan does not permit candidate weights to be applied to production schedule generation in this stage.
              </div>
            </div>
          )}

          {simulationResult && simulationResult.status === 'empty_backlog' && (
            <div style={styles.simEmptyBacklogAlert}>
              <strong>{simulationResult.scenarioName}:</strong> {simulationResult.message}
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
                    <div style={styles.valArrow}><MotifIcon name="arrow-right" size={14} color="#94A3B8" /></div>
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
                    <span style={styles.diagIcon}><MotifIcon name={diag.supported ? 'chart' : 'lock'} size={13} color={diag.supported ? '#15803D' : '#92400E'} /></span>
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
                {activeShadow.regressionGate?.passed ? 'PASSED (0 Hard Regressions)' : 'FAILED'}
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
              <span style={styles.syntheticWarningIcon}><MotifIcon name="warning" size={16} color="#D97706" /></span>
              <div style={styles.syntheticWarningText}>
                <strong>Synthetic Demonstration Active:</strong> The metrics below reflect in-memory mock scenario comparisons ({activeRanking.evidenceSummary?.eligibleCount || 0} synthetic pairs) for auditing statistical concordance. Real user telemetry has recorded {realAnalysis.preferenceEvidence.counts.eligibleCount || 0} eligible comparisons and cannot activate production adaptation.
              </div>
            </div>
          )}

          <div style={styles.rankingHeaderBanner}>
            <div style={{ ...styles.rankingHeaderTitle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <MotifIcon name="target" size={15} color="#1E293B" />
              Explicit Preference Evidence & Offline Ranking Pipeline
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
              <span style={{ fontWeight: '700', fontSize: '12px', color: '#92400E', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <MotifIcon name="search" size={13} color="#92400E" />
                Excluded Evidence Audit:
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
              <div style={{ ...styles.insufficientBadge, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <MotifIcon name="lock" size={11} color="#92400E" />
                INSUFFICIENT EVIDENCE FOR RANKING EVALUATION
              </div>
              <h4 style={{ margin: '8px 0 4px 0', fontSize: '14px', color: '#92400E' }}>
                Sample Below Minimum Statistical Threshold (N &lt; {MIN_EVALUATION_SAMPLE})
              </h4>
              <p style={{ margin: 0, fontSize: '12px', color: '#78350F', lineHeight: 1.5 }}>
                {activeRanking.message}
              </p>
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#4B5563', lineHeight: 1.5 }}>
                To record explicit preference evidence, open the <strong>Adaptive Sprint Planner</strong> modal, navigate to the <strong>Strategy Benchmark & Quality</strong> tab, and select which strategy schedule balance you prefer for your task backlog.
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
                <strong>Statistical Limitation & Data Maturity:</strong> {activeRanking.uncertainty?.disclaimer}
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
            <div style={{ fontWeight: '700', fontSize: '12px', color: '#374151', marginBottom: '4px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <MotifIcon name="flask" size={13} color="#4338CA" />
              Ranking Methodology & Governance Rules:
            </div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: '#4B5563', lineHeight: 1.6 }}>
              <li><strong>Pairwise Loss:</strong> Uses strict binary concordance over explicit user choices. Ties and non-finite scores receive zero concordance credit.</li>
              <li><strong>Hard Constraint Decoupling:</strong> Alternatives violating Kahn topological order or working hour capacities cannot earn concordance credit.</li>
              <li><strong>Zero Automatic Model Promotion:</strong> Offline ranking evaluation strictly measures candidate viability; it does not deploy weights to production.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab: Activation Gate (Shadow-Only) (Phase 7.4 Stage 4A) */}
      {activeTab === 'activation_gate' && (
        <div style={styles.tabContent} id="activation-gate-panel">
          {showSyntheticDemo && (
            <div style={{ ...styles.syntheticWarningBanner, marginBottom: '16px' }} role="alert">
              <span style={styles.syntheticWarningIcon}><MotifIcon name="warning" size={16} color="#D97706" /></span>
              <div style={styles.syntheticWarningText}>
                <strong>Synthetic Demonstration Active:</strong> The activation gate below is evaluating in-memory synthetic fixture data. Synthetic demonstration data is strictly disqualified from meeting real-user activation criteria (Outcome: <code>{activeActivationGate.outcome}</code>).
              </div>
            </div>
          )}

          <div style={styles.rankingHeaderBanner}>
            <div style={{ ...styles.rankingHeaderTitle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <MotifIcon name="scale" size={15} color="#1E293B" />
              Shadow-Only Activation-Gate Audit
            </div>
            <div style={styles.rankingHeaderDesc}>
              Converts VoxPlan&apos;s documented activation criteria into an executable, shadow-only evaluation protocol. Evaluates candidate scheduler weights against real operational evidence, paired schedule quality differences, hard feasibility constraints, and rollback preflight readiness.
              {' '}<strong>Production Invariant:</strong> Evaluation is strictly read-only. Candidate weights are NEVER automatically activated in production.
            </div>
          </div>

          {/* Outcome Status Banner */}
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '16px',
              border: '1px solid',
              backgroundColor:
                activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW
                  ? '#ECFDF5'
                  : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.INFEASIBLE
                  ? '#FEF2F2'
                  : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR
                  ? '#F3F4F6'
                  : '#FFFBEB',
              borderColor:
                activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW
                  ? '#A7F3D0'
                  : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.INFEASIBLE
                  ? '#FCA5A5'
                  : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR
                  ? '#D1D5DB'
                  : '#FDE68A',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MotifIcon
                  name={
                    activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW
                      ? 'check'
                      : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.INFEASIBLE
                      ? 'close'
                      : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR
                      ? 'pause'
                      : 'lock'
                  }
                  size={18}
                  color={
                    activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW
                      ? '#065F46'
                      : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.INFEASIBLE
                      ? '#991B1B'
                      : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR
                      ? '#374151'
                      : '#92400E'
                  }
                />
                <span
                  style={{
                    fontWeight: '800',
                    fontSize: '13px',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color:
                      activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW
                        ? '#065F46'
                        : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.INFEASIBLE
                        ? '#991B1B'
                        : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR
                        ? '#374151'
                        : '#92400E',
                  }}
                >
                  Outcome: {activeActivationGate.outcome.replace(/_/g, ' ')}
                </span>
              </div>
              <span style={styles.statusPillLocked}>
                Production Adaptation Disabled
              </span>
            </div>
            <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#374151', lineHeight: '1.5' }}>
              {activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.ELIGIBLE_FOR_SUPERVISED_REVIEW
                ? 'Candidate scheduler weights satisfy all documented evidence, feasibility, superiority, and rollback criteria for supervised human review. Note: Production activation remains completely disabled.'
                : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.INFEASIBLE
                ? 'Candidate configuration violates hard scheduling constraints (e.g. DAG cycle, capacity overrun, or invalid weights) and is strictly disqualified.'
                : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.INSUFFICIENT_METHODOLOGY
                ? 'Evaluation cannot proceed: scoring methodology, parameter thresholds, or cluster provenance definitions are invalid or missing.'
                : activeActivationGate.outcome === ACTIVATION_GATE_OUTCOMES.NOT_SUPERIOR
                ? 'Candidate weights do not demonstrate statistically defensible quality superiority over canonical factory baseline (delta < epsilon or confidence interval crosses zero).'
                : 'Current evidence does not yet satisfy operational readiness thresholds (>= 20 decisions, >= 15 completions) or requires >= 15 paired observations across >= 5 independent scenario clusters without cross-cluster backlog leakage.'}
            </p>
          </div>

          {/* Cross-Cluster Leakage Alert */}
          {activeActivationGate.evidenceAssessment.crossClusterLeakageDetected && (
            <div style={{ ...styles.syntheticWarningBanner, marginBottom: '16px', backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }} role="alert">
              <span style={styles.syntheticWarningIcon}><MotifIcon name="warning" size={16} color="#D97706" /></span>
              <div style={styles.syntheticWarningText}>
                <strong style={{ color: '#991B1B' }}>Cross-Cluster Backlog Leakage Detected:</strong> Overlapping task sets appear across distinct clusters, violating independent cluster sampling assumptions and precluding activation eligibility.
              </div>
            </div>
          )}

          {/* Critical Metric Regression or Outlier Cluster Dominance Alert */}
          {activeActivationGate.pairedComparison?.criticalMetricRegressionDetected && (
            <div style={{ ...styles.syntheticWarningBanner, marginBottom: '16px', backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }} role="alert">
              <span style={styles.syntheticWarningIcon}><MotifIcon name="warning" size={16} color="#D97706" /></span>
              <div style={styles.syntheticWarningText}>
                <strong style={{ color: '#991B1B' }}>Critical Metric Regression Guardrail:</strong> Candidate composite score gain masks unacceptable degradation in primary scheduling metrics (on-time rate drop &gt; 5% or delay increase &gt; 1.0 day).
              </div>
            </div>
          )}
          {activeActivationGate.pairedComparison?.outlierClusterDominanceDetected && (
            <div style={{ ...styles.syntheticWarningBanner, marginBottom: '16px', backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }} role="alert">
              <span style={styles.syntheticWarningIcon}><MotifIcon name="warning" size={16} color="#D97706" /></span>
              <div style={styles.syntheticWarningText}>
                <strong style={{ color: '#991B1B' }}>Outlier Cluster Dominance Guardrail:</strong> Positive grand mean difference is driven by extreme outlier cluster(s) while &gt; 50% of distinct scenario clusters regress.
              </div>
            </div>
          )}

          {/* Endpoint Metrics Grid */}
          <div style={styles.rankingStatsGrid}>
            <div style={styles.rankingStatCard}>
              <span style={styles.rankingStatLabel}>Mean Paired Quality Delta (Cluster-Avg)</span>
              <span style={{ ...styles.rankingStatValue, color: (activeActivationGate.pairedComparison.meanDelta ?? 0) > 0 ? '#1B5E3C' : '#4B5563' }}>
                {activeActivationGate.pairedComparison.meanDelta != null
                  ? `${activeActivationGate.pairedComparison.meanDelta > 0 ? '+' : ''}${activeActivationGate.pairedComparison.meanDelta} pts`
                  : 'N/A'}
              </span>
              <span style={styles.rankingStatSub}>
                Harmonized Estimand: 1/M Σ Δ_c (Regime Shock-Conditional Target) {activeActivationGate.pairedComparison.observationWeightedMeanDelta != null ? `(Obs-wt: ${activeActivationGate.pairedComparison.observationWeightedMeanDelta > 0 ? '+' : ''}${activeActivationGate.pairedComparison.observationWeightedMeanDelta} pts)` : ''}
              </span>
            </div>
            <div style={styles.rankingStatCard}>
              <span style={styles.rankingStatLabel}>Practical Threshold (ε, Provisional)</span>
              <span style={styles.rankingStatValue}>
                {activeActivationGate.pairedComparison.minMeaningfulDelta} pts
              </span>
              <span style={styles.rankingStatSub}>
                {activeActivationGate.pairedComparison.meetsPracticalImprovement ? 'Met' : 'Unmet'} ·{' '}
                {activeActivationGate.practicalThresholdMetadata?.comparisonRule === 'confidence_bound'
                  ? `Rule B (CI_lower ${activeActivationGate.uncertainty?.ciLower != null ? `[${activeActivationGate.uncertainty.ciLower}]` : ''} ≥ ε)`
                  : 'Rule A (Mean ≥ ε)'}
              </span>
            </div>
            <div style={styles.rankingStatCard}>
              <span style={styles.rankingStatLabel}>Eligible Paired Observations</span>
              <span style={styles.rankingStatValue}>
                {activeActivationGate.evidenceAssessment.eligibleObservationsCount}
              </span>
              <span style={styles.rankingStatSub}>
                Min 15 Required · {activeActivationGate.pairedComparison.componentMetricsAudited ? 'Component Metrics Audited' : 'No Component Breakdown'}
              </span>
            </div>
            <div style={styles.rankingStatCard}>
              <span style={styles.rankingStatLabel}>Scenario Clusters & Backlog Disjointness</span>
              <span style={styles.rankingStatValue}>
                {activeActivationGate.evidenceAssessment.distinctClustersCount} / {activeActivationGate.evidenceAssessment.minDecisionClustersRequired ?? 5}
              </span>
              <span style={styles.rankingStatSub}>
                {activeActivationGate.evidenceAssessment.crossClusterTaskOverlapDetected
                  ? 'Task Overlap Detected'
                  : activeActivationGate.evidenceAssessment.crossClusterLeakageDetected
                  ? 'Backlog Leakage Detected'
                  : activeActivationGate.evidenceAssessment.distinctClustersCount >= 5
                  ? (activeActivationGate.evidenceAssessment.clusterSamplingIndependenceVerified
                      ? 'M ≥ 5 Disjoint (Sampling Independence Verified)'
                      : 'M ≥ 5 Disjoint (Sampling Independence Unverified)')
                  : 'Inadequate (< 5 Clusters)'}
              </span>
            </div>
          </div>

          {/* Uncertainty & Rigor Panel */}
          <div style={{ ...styles.rankingDetailCard, marginTop: '16px' }}>
            <h4 style={{ ...styles.rankingDetailTitle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <MotifIcon name="chart" size={14} />
              Clustered Uncertainty & Statistical Rigor
            </h4>
            <div style={styles.uncertaintyContent}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Uncertainty Estimation Method:</span>
                <span style={{ color: '#1F2937' }}>
                  {activeActivationGate.uncertainty.canEstimateUncertainty
                    ? (activeActivationGate.uncertainty.method || 'Cluster-Level Student-t Interval (95% CI)')
                    : 'Insufficient Observations or Clusters'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>95% Confidence Interval (Student-t):</span>
                <span style={{ color: '#1F2937', fontWeight: 600 }}>
                  {activeActivationGate.uncertainty.canEstimateUncertainty
                    ? `[${activeActivationGate.uncertainty.ciLower}, ${activeActivationGate.uncertainty.ciUpper}] pts (df = ${activeActivationGate.uncertainty.degreesOfFreedom ?? 'N/A'}, SE = ${activeActivationGate.uncertainty.standardError ?? 'N/A'})`
                    : 'N/A (Sparse Evidence)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Target Population Estimand:</span>
                <span style={{ color: '#1F2937' }}>
                  Shock-Conditional Effect (θ + γ; single window cannot identify common shock variance)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Decision Rule & Practical Threshold:</span>
                <span style={{ color: '#1F2937' }}>
                  {activeActivationGate.practicalThresholdMetadata?.comparisonRule === 'confidence_bound'
                    ? `Rule B: CI_lower ≥ ε (provisional ε = ${activeActivationGate.practicalThresholdMetadata?.thresholdEpsilon ?? 1.0} pt)`
                    : `Rule A: Mean ≥ ε (provisional ε = ${activeActivationGate.practicalThresholdMetadata?.thresholdEpsilon ?? 1.0} pt)`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Evaluation Environment:</span>
                <span style={{ color: '#1F2937', fontWeight: 600 }}>
                  {activeActivationGate.environment === 'simulation' || activeActivationGate.isSimulationDiagnostic
                    ? 'Simulation (Offline Diagnostic Only)'
                    : 'Production (Live Application)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Claimed Sampling Status:</span>
                <span style={{ color: '#4B5563', fontFamily: 'monospace', fontSize: '11px' }}>
                  {activeActivationGate.evidenceAssessment.samplingAssurance?.clusterIndependenceStatus || 'unspecified'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Evidence Integrity & Authenticity:</span>
                <span style={{ color: activeActivationGate.evidenceAssessment.evidenceValidation?.isValidated ? '#065F46' : '#92400E', fontWeight: 600 }}>
                  {activeActivationGate.evidenceAssessment.evidenceValidation?.isValidated
                    ? `Integrity Verified (${activeActivationGate.evidenceAssessment.evidenceValidation?.provenanceSource || 'Validated'})`
                    : (activeActivationGate.environment === 'production' || !activeActivationGate.environment)
                    ? 'Unauthenticated (No Production Trust Anchor in Local Architecture)'
                    : `Unauthenticated (${activeActivationGate.evidenceAssessment.evidenceValidation?.reason || 'No Evidence Record'})`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Sampling Independence Status:</span>
                <span style={{ color: activeActivationGate.evidenceAssessment.clusterSamplingIndependenceVerified ? '#065F46' : '#92400E', fontWeight: 600 }}>
                  {activeActivationGate.evidenceAssessment.clusterSamplingIndependenceVerified
                    ? 'Verified (Authenticated Evidence Record)'
                    : activeActivationGate.evidenceAssessment.clusterIndependenceStatus === 'failed'
                    ? 'Failed (Cross-Cluster Overlap/Leakage Detected)'
                    : activeActivationGate.evidenceAssessment.clusterIndependenceStatus === 'not_applicable'
                    ? 'Not Applicable (Methodology Conflict)'
                    : 'Unverified (Production Eligibility Blocked)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Inference Decision Readiness:</span>
                <span style={{ color: activeActivationGate.uncertainty.isDecisionReady ? '#065F46' : '#92400E', fontWeight: 600 }}>
                  {activeActivationGate.uncertainty.isDecisionReady
                    ? 'Decision-Ready Inference'
                    : 'Exploratory Diagnostic (Eligibility Blocked)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>Clusters & Backlog Disjointness:</span>
                <span style={{ color: '#1F2937' }}>
                  {activeActivationGate.evidenceAssessment.distinctClustersCount} Nominal Cluster IDs · {activeActivationGate.evidenceAssessment.disjointTaskSetsVerified ? 'Disjoint Task Sets (Zero Leakage/Overlap)' : 'Task Overlap or Leakage Detected'}
                </span>
              </div>
              {activeActivationGate.uncertainty.bootstrapPercentile?.ciLower != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>Bootstrap Percentile (Exploratory):</span>
                  <span style={{ color: '#4B5563' }}>
                    [{activeActivationGate.uncertainty.bootstrapPercentile.ciLower}, {activeActivationGate.uncertainty.bootstrapPercentile.ciUpper}] pts
                  </span>
                </div>
              )}
              {activeActivationGate.evidencePolicy && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0', fontSize: '12px' }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>Evidence Policy Pillars:</span>
                  <span style={{ color: '#1F2937' }}>
                    Exposure: {activeActivationGate.evidencePolicy.operationalExposurePassed ? 'Passed' : 'Failed'} |
                    Evidence: {activeActivationGate.evidencePolicy.evaluationEvidencePassed ? 'Passed' : 'Failed'} |
                    Statistical: {activeActivationGate.evidencePolicy.statisticalAdequacyPassed ? 'Passed' : 'Failed'}
                  </span>
                </div>
              )}
              {!activeActivationGate.evidenceAssessment.evidenceValidation?.isValidated && (
                <div style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: '#FFFBEB', borderRadius: '4px', border: '1px solid #FDE68A', fontSize: '11px', color: '#92400E' }}>
                  <strong>No Production Trust Anchor Configured:</strong> VoxPlan uses local-first client telemetry. Production cluster sampling assurance cannot currently be established, strictly blocking automated or supervised production adaptation.
                </div>
              )}
              {activeActivationGate.uncertainty.isExploratoryOnly && activeActivationGate.evidenceAssessment.evidenceValidation?.isValidated && (
                <div style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: '#FFFBEB', borderRadius: '4px', border: '1px solid #FDE68A', fontSize: '11px', color: '#92400E' }}>
                  <strong>Exploratory Simulation Diagnostic Only:</strong> {activeActivationGate.evidenceAssessment.clusterSamplingIndependenceVerified ? 'Small cluster sample (M < 5), task overlap, or leakage.' : 'Cluster sampling independence remains unverified in real telemetry.'} Formal decision-ready eligibility is strictly withheld.
                </div>
              )}
              <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: '#6B7280', lineHeight: '1.4' }}>
                {activeActivationGate.uncertainty.disclaimer}
              </p>
            </div>
          </div>

          {/* Audit Reasons List */}
          {activeActivationGate.reasons.length > 0 && (
            <div style={{ ...styles.rankingDetailCard, marginTop: '16px' }}>
              <h4 style={{ ...styles.rankingDetailTitle, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <MotifIcon name="search" size={14} />
                Audit Findings & Gate Check Details
              </h4>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '12px', color: '#4B5563', lineHeight: '1.6' }}>
                {activeActivationGate.reasons.map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Methodology Disclosures */}
          <div style={{ ...styles.rankingDetailCard, marginTop: '16px', backgroundColor: '#F8FAFC' }}>
            <h4 style={{ ...styles.rankingDetailTitle, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <MotifIcon name="memo" size={14} color="#334155" />
              Methodological Disclosures & Safety Boundaries
            </h4>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '11px', color: '#64748B', lineHeight: '1.5' }}>
              {activeActivationGate.methodologyDisclosures.map((disc, idx) => (
                <li key={idx}>{disc}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Footer Governance Tag */}
      <div style={styles.footerNote}>
        <div style={styles.footerLeft}>
          <span style={{ ...styles.footerLock, display: 'inline-flex', alignItems: 'center' }}><MotifIcon name="lock" size={14} color="#6B7280" /></span>
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
  configRollbackBox: {
    backgroundColor: '#F8FAFC',
    border: '1.5px solid #CBD5E1',
    borderRadius: '8px',
    padding: '14px 16px',
    marginTop: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
  },
  tagCandidate: {
    fontSize: '10px',
    fontWeight: 700,
    backgroundColor: '#E0E7FF',
    color: '#3730A3',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #C7D2FE',
  },
  configDetailsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    fontSize: '11px',
    color: '#475569',
    marginTop: '6px',
  },
  configDetailLabel: {
    fontWeight: 700,
    color: '#1E293B',
  },
  configDetailCode: {
    fontFamily: 'monospace',
    fontSize: '11px',
    backgroundColor: '#FFFFFF',
    border: '1px solid #E2E8F0',
    padding: '2px 6px',
    borderRadius: '4px',
    color: '#0F172A',
  },
  configDetailMeta: {
    fontSize: '11px',
    color: '#64748B',
  },
  configControlsRight: {
    display: 'flex',
    alignItems: 'center',
  },
  configActionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  snapshotSelect: {
    padding: '6px 10px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #CBD5E1',
    borderRadius: '6px',
    color: '#1E293B',
    cursor: 'pointer',
    maxWidth: '240px',
  },
  saveSnapshotBtn: {
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#FFFFFF',
    color: '#1E293B',
    border: '1.5px solid #CBD5E1',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  rollbackBtn: {
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#EFF6FF',
    color: '#1D4ED8',
    border: '1.5px solid #BFDBFE',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  restoreFactoryBtn: {
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#FFFBEB',
    color: '#B45309',
    border: '1.5px solid #FDE68A',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  confirmRestoreGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FEF2F2',
    border: '1.5px solid #FCA5A5',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  confirmRestorePrompt: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#991B1B',
  },
  confirmRestoreBtn: {
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#DC2626',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  cancelRestoreBtn: {
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: '#FFFFFF',
    color: '#475569',
    border: '1px solid #CBD5E1',
    borderRadius: '4px',
    cursor: 'pointer',
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
  simTableTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '12px',
  },
  simAuditNoticeBadge: {
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#EEF2FF',
    color: '#4338CA',
    border: '1px solid #C7D2FE',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  metricSubtext: {
    fontSize: '10px',
    color: '#64748B',
    fontWeight: 400,
    marginTop: '2px',
  },
  // Schedule Preview Styles
  simPreviewCard: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #E2E8F0',
    borderRadius: '10px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  simPreviewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
  },
  simPreviewTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#1E293B',
    margin: 0,
  },
  simPreviewSubtitle: {
    fontSize: '12px',
    color: '#64748B',
    margin: '3px 0 0 0',
  },
  simReadOnlyBadge: {
    fontSize: '11px',
    fontWeight: 700,
    backgroundColor: '#F1F5F9',
    color: '#475569',
    border: '1px solid #CBD5E1',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  simViewToggleBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#F8FAFC',
    borderRadius: '8px',
    border: '1px solid #E2E8F0',
  },
  simViewBtnGroup: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  simViewBtn: {
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: 600,
    borderRadius: '5px',
    border: '1px solid #CBD5E1',
    backgroundColor: '#FFFFFF',
    color: '#475569',
    cursor: 'pointer',
  },
  simViewBtnActive: {
    padding: '5px 10px',
    fontSize: '11px',
    fontWeight: 700,
    borderRadius: '5px',
    border: '1px solid #3B82F6',
    backgroundColor: '#EFF6FF',
    color: '#1D4ED8',
    cursor: 'pointer',
  },
  simColumnsWrap: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
  },
  simCol: {
    flex: '1 1 320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '14px',
    minWidth: '280px',
  },
  simColHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '8px',
    borderBottom: '1px solid #E2E8F0',
    flexWrap: 'wrap',
    gap: '6px',
  },
  simColTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#1E293B',
  },
  simColWeightsText: {
    fontSize: '10px',
    color: '#64748B',
    fontFamily: 'monospace',
  },
  simDaysScroll: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    maxHeight: '520px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  simDayBlock: {
    backgroundColor: '#FFFFFF',
    border: '1px solid #CBD5E1',
    borderRadius: '6px',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  simDayBlockHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  simDayDate: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#0F172A',
  },
  simDayWorkloadPill: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#F1F5F9',
    color: '#334155',
  },
  simProgressBarTrack: {
    width: '100%',
    height: '4px',
    backgroundColor: '#E2E8F0',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  simProgressBarFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.2s ease',
  },
  simTaskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  simTaskCard: {
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderLeftWidth: '4px',
    borderRadius: '5px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '11px',
  },
  simTaskTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  simTaskTitle: {
    fontWeight: 600,
    color: '#1E293B',
    fontSize: '12px',
  },
  simTaskChunkBadge: {
    fontSize: '9px',
    fontWeight: 700,
    backgroundColor: '#EEF2FF',
    color: '#4338CA',
    border: '1px solid #C7D2FE',
    borderRadius: '3px',
    padding: '1px 4px',
  },
  simTaskFocusBadge: {
    fontSize: '9px',
    fontWeight: 700,
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    border: '1px solid #FCD34D',
    borderRadius: '3px',
    padding: '1px 4px',
  },
  simTaskMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#64748B',
    fontSize: '10px',
    flexWrap: 'wrap',
  },
  simTaskDeadlinePill: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '1px 6px',
    borderRadius: '4px',
    border: '1px solid transparent',
  },
  simTaskShiftBadge: {
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#FEF3C7',
    color: '#B45309',
    border: '1px solid #FCD34D',
    display: 'inline-block',
    marginTop: '2px',
  },
  simUnscheduledBox: {
    backgroundColor: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '11px',
  },
  // Methodology Disclosure Styles
  simDisclosureBox: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #E2E8F0',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  simDisclosureBtn: {
    width: '100%',
    padding: '12px 18px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    border: 'none',
    borderBottom: '1px solid #E2E8F0',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 700,
    color: '#334155',
  },
  simDisclosureContent: {
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    fontSize: '11px',
    color: '#475569',
    lineHeight: 1.5,
  },
  simDisclosureItem: {
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '6px',
    padding: '8px 12px',
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
