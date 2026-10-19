import React, { useState, useMemo, useEffect, useRef } from 'react';
import { generateAdaptiveSchedule, formatDateISO } from '../scheduler/adaptiveScheduler';
import { compareScheduleStrategies } from '../scheduler/scheduleEvaluator';
import { BENCHMARK_SCENARIOS, runStabilityBenchmark } from '../scheduler/scheduleBenchmarks';
import { computeScheduleFeedback } from '../scheduler/scheduleFeedback';
import { loadTimeBlockSettings, saveTimeBlockSettings } from '../scheduler/timeBlockScheduler';
import {
  ensurePlacementIds,
  applyPlacementEdit,
  validateFullProposal,
} from '../scheduler/proposalEditor';
import {
  generateIcsCalendar,
  downloadIcsFile,
  extractExportableSessions,
} from '../scheduler/icalExporter';
import { telemetry } from '../telemetry/telemetryManager';

export default function AdaptiveScheduleModal({
  tasks = [],
  events = [],
  personalDurationModel = null,
  guardedPredictionsMap = {},
  acceptedSchedule = null,
  _onExportSchedule = null,
  isOpen = false,
  onClose,
  onApplySchedule,
  onProposalGenerated,
  onDiscardSchedule,
}) {
  const [activeTab, setActiveTab] = useState('proposal'); // 'proposal' | 'benchmark' | 'feedback' | 'export'
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('current');
  const [dailyCapacityHours, setDailyCapacityHours] = useState(6.0);
  const [horizonDays, setHorizonDays] = useState(14);
  const [usePersonalModel, setUsePersonalModel] = useState(true);
  const [enableChunking, setEnableChunking] = useState(true);
  const [todayStr] = useState(() => formatDateISO(new Date()));
  const [preferenceFeedback, setPreferenceFeedback] = useState(null);

  // Phase 6.2: Intraday focus windows and working hours state
  const [timeBlockConfig] = useState(() => loadTimeBlockSettings());
  const [enableIntraday, setEnableIntraday] = useState(() => timeBlockConfig.enableIntraday ?? true);
  const [workStart, setWorkStart] = useState(() => timeBlockConfig.workingHours?.start || '09:00');
  const [workEnd, setWorkEnd] = useState(() => timeBlockConfig.workingHours?.end || '17:00');

  const handleToggleIntraday = () => {
    const nextVal = !enableIntraday;
    setEnableIntraday(nextVal);
    saveTimeBlockSettings({
      ...timeBlockConfig,
      enableIntraday: nextVal,
      workingHours: { start: workStart, end: workEnd },
    });
  };

  const handleWorkStartChange = (val) => {
    setWorkStart(val);
    saveTimeBlockSettings({
      ...timeBlockConfig,
      enableIntraday,
      workingHours: { start: val, end: workEnd },
    });
  };

  const handleWorkEndChange = (val) => {
    setWorkEnd(val);
    saveTimeBlockSettings({
      ...timeBlockConfig,
      enableIntraday,
      workingHours: { start: workStart, end: val },
    });
  };

  const hasAppliedRef = useRef(false);
  const recordedProposalIdRef = useRef(null);

  // Compute local schedule feedback and outcomes from durable telemetry
  const feedbackReport = useMemo(() => {
    return computeScheduleFeedback(events, tasks);
  }, [events, tasks]);

  const currentTasksHash = useMemo(() => {
    return JSON.stringify(
      (tasks || []).map((t) => [t.id, t.dueDate, t.completed, t.estimatedEffort, t.dependencies])
    );
  }, [tasks]);

  const [cachedSnapshotHash, setCachedSnapshotHash] = useState(currentTasksHash);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [sessionCount, setSessionCount] = useState(1);

  // Synchronize snapshot hash and session count whenever modal opens
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCachedSnapshotHash(currentTasksHash);
      setSessionCount((c) => c + 1);
    }
  }

  // Detect if tasks were modified while the proposal modal was open
  const isStale = Boolean(isOpen && cachedSnapshotHash && currentTasksHash !== cachedSnapshotHash);

  // Compute deterministic schedule proposal based on current inputs
  const proposal = useMemo(() => {
    if (!isOpen) return null;
    const modelToUse = usePersonalModel ? personalDurationModel : null;
    const scheduleId = `sched_${todayStr}_s${sessionCount}_${dailyCapacityHours}h_${horizonDays}d_${usePersonalModel ? 'pers' : 'raw'}`;
    return generateAdaptiveSchedule(tasks, {
      scheduleId,
      dailyCapacityHours: Number(dailyCapacityHours) || 6.0,
      horizonDays: Number(horizonDays) || 14,
      personalDurationModel: modelToUse,
      guardedPredictionsMap,
      startDate: todayStr,
      strategy: 'adaptive',
      enableChunking,
      enableIntraday,
      workingHours: { start: workStart, end: workEnd },
      blackouts: timeBlockConfig.blackouts || [],
      focusWindows: timeBlockConfig.focusWindows || [],
    });
  }, [
    tasks,
    personalDurationModel,
    guardedPredictionsMap,
    isOpen,
    sessionCount,
    dailyCapacityHours,
    horizonDays,
    usePersonalModel,
    enableChunking,
    enableIntraday,
    workStart,
    workEnd,
    timeBlockConfig,
    todayStr,
  ]);

  // Compute multi-strategy benchmark comparison
  const benchmarkComparison = useMemo(() => {
    if (!isOpen || activeTab !== 'benchmark') return null;

    if (selectedScenarioKey === 'current') {
      const modelToUse = usePersonalModel ? personalDurationModel : null;
      return compareScheduleStrategies(tasks, {
        dailyCapacityHours: Number(dailyCapacityHours) || 6.0,
        horizonDays: Number(horizonDays) || 14,
        personalDurationModel: modelToUse,
        guardedPredictionsMap,
        startDate: todayStr,
        scenarioName: 'Current Active Backlog',
      });
    }

    const scenario = BENCHMARK_SCENARIOS[selectedScenarioKey];
    if (!scenario) return null;

    return compareScheduleStrategies(scenario.tasks, {
      dailyCapacityHours: scenario.dailyCapacityHours || 6.0,
      horizonDays: scenario.horizonDays || 14,
      personalDurationModel: scenario.personalDurationModel || null,
      predictionsMap: scenario.predictionsMap || {},
      startDate: scenario.startDate || todayStr,
      scenarioName: scenario.name,
    });
  }, [
    isOpen,
    activeTab,
    selectedScenarioKey,
    tasks,
    dailyCapacityHours,
    horizonDays,
    usePersonalModel,
    personalDurationModel,
    guardedPredictionsMap,
    todayStr,
  ]);

  const handleRecordPreference = async (prefStratKey, altStratKey, label) => {
    if (typeof telemetry.isPreferenceCollectionEnabled === 'function' && !telemetry.isPreferenceCollectionEnabled()) {
      setPreferenceFeedback({
        type: 'info',
        text: `ℹ Explicit preference collection is disabled in Personal Settings. Strategy choices are not being recorded.`,
      });
      return;
    }

    const stratPref = benchmarkComparison?.strategies?.[prefStratKey];
    const stratAlt = benchmarkComparison?.strategies?.[altStratKey];
    if (!stratPref || !stratAlt) return;
    const scenarioKey = selectedScenarioKey || 'current';
    const comparisonId = `cmp_${scenarioKey}_${[prefStratKey, altStratKey].sort().join('_vs_')}`;

    try {
      const isPrefA = prefStratKey === 'adaptive' || (prefStratKey === 'edf' && altStratKey === 'priority_first');
      const altAKey = isPrefA ? prefStratKey : altStratKey;
      const altBKey = isPrefA ? altStratKey : prefStratKey;
      const stratA = benchmarkComparison.strategies[altAKey];
      const stratB = benchmarkComparison.strategies[altBKey];
      const selected = prefStratKey === altAKey ? 'alternative_a' : 'alternative_b';

      const recorded = await telemetry.recordSchedulePreference({
        comparisonId,
        alternativeA: {
          id: altAKey,
          strategy: altAKey,
          metrics: stratA,
          isConstraintCompliant: (stratA.infeasiblePlacementsCount ?? 0) === 0 && !stratA.cycleDetected,
        },
        alternativeB: {
          id: altBKey,
          strategy: altBKey,
          metrics: stratB,
          isConstraintCompliant: (stratB.infeasiblePlacementsCount ?? 0) === 0 && !stratB.cycleDetected,
        },
        selected,
        comparisonContext: {
          scenario_name: benchmarkComparison.scenario,
          scenario_key: scenarioKey,
          task_count: benchmarkComparison.inputTaskCount,
          daily_capacity_hours: Number(dailyCapacityHours) || 6.0,
          horizon_days: Number(horizonDays) || 14,
          is_constraint_compliant:
            (stratA.infeasiblePlacementsCount ?? 0) === 0 &&
            (stratB.infeasiblePlacementsCount ?? 0) === 0 &&
            !stratA.cycleDetected &&
            !stratB.cycleDetected,
        },
        source: 'explicit_user_choice',
      });

      if (recorded) {
        setPreferenceFeedback({
          type: 'success',
          text: `✓ Explicit preference recorded: ${label} for "${benchmarkComparison.scenario}".`,
        });
      } else {
        setPreferenceFeedback({
          type: 'info',
          text: `ℹ Preference already recorded: ${label} for "${benchmarkComparison.scenario}" (deduplicated).`,
        });
      }
    } catch (err) {
      setPreferenceFeedback({
        type: 'error',
        text: `⚠️ Failed to record preference for "${benchmarkComparison.scenario}": ${err?.message || 'storage error'}`,
      });
    }
  };


  // Compute perturbation stability metrics
  const stabilityReport = useMemo(() => {
    if (!isOpen || activeTab !== 'benchmark') return null;
    return runStabilityBenchmark('adaptive');
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (isOpen) {
      hasAppliedRef.current = false;
    }
  }, [isOpen]);

  // Phase 6.3: Interactive proposal draft editing state
  const [draftProposal, setDraftProposal] = useState(null);
  const [initialProposalSnapshot, setInitialProposalSnapshot] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [editingPlacementId, setEditingPlacementId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [validationError, setValidationError] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState(null);

  // Synchronize draft proposal whenever generated proposal changes or modal opens
  useEffect(() => {
    if (isOpen && proposal) {
      const ensured = ensurePlacementIds(JSON.parse(JSON.stringify(proposal)));
      setDraftProposal(ensured);
      setInitialProposalSnapshot(JSON.parse(JSON.stringify(ensured)));
      setUndoStack([]);
      setEditingPlacementId(null);
      setValidationError(null);
      setFeedbackMessage(null);
    } else if (!isOpen) {
      setDraftProposal(null);
      setInitialProposalSnapshot(null);
      setUndoStack([]);
      setEditingPlacementId(null);
      setValidationError(null);
      setFeedbackMessage(null);
    }
  }, [isOpen, proposal]);

  useEffect(() => {
    if (isOpen && proposal && proposal.summary?.scheduleId && onProposalGenerated) {
      if (recordedProposalIdRef.current !== proposal.summary.scheduleId) {
        recordedProposalIdRef.current = proposal.summary.scheduleId;
        onProposalGenerated(proposal);
      }
    }
  }, [isOpen, proposal, onProposalGenerated]);

  // Phase 6.4: RFC 5545 Calendar Export State
  const [exportFeedback, setExportFeedback] = useState(null);
  const [includeTzid, setIncludeTzid] = useState(false);

  const acceptedExportInfo = useMemo(() => {
    if (!acceptedSchedule) return null;
    return extractExportableSessions(acceptedSchedule, tasks);
  }, [acceptedSchedule, tasks]);

  const handleDownloadIcs = () => {
    if (!acceptedSchedule) {
      setExportFeedback({
        type: 'error',
        message: 'No accepted schedule to export. Please review and apply an adaptive schedule first.',
      });
      return;
    }

    try {
      const detectedTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
      const options = {
        tasks,
        tzid: includeTzid && detectedTz ? detectedTz : undefined,
      };
      const result = generateIcsCalendar(acceptedSchedule, options);
      if (result.sessionCount === 0) {
        setExportFeedback({
          type: 'warning',
          message: 'The accepted schedule contains 0 timed sessions to export.',
        });
        return;
      }

      const downloadResult = downloadIcsFile(result.ics);
      setExportFeedback({
        type: 'success',
        message: `Successfully exported ${result.sessionCount} focus session(s) to ${downloadResult.filename}.${result.omittedCount > 0 ? ` (${result.omittedCount} unscheduled/blocked items omitted)` : ''}`,
      });
    } catch (err) {
      setExportFeedback({
        type: 'error',
        message: `Calendar export failed: ${err.message}`,
      });
    }
  };

  const handleStartEdit = (p) => {
    setEditingPlacementId(p.placementId);
    setEditDate(p.proposedDate || todayStr);
    setEditStartTime(p.startTime || workStart || '09:00');
    setEditEndTime(p.endTime || workEnd || '10:00');
    setValidationError(null);
    setFeedbackMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingPlacementId(null);
    setValidationError(null);
  };

  const handleSaveEdit = (p) => {
    const editContext = {
      tasks,
      dailyCapacityHours: Number(dailyCapacityHours) || 6.0,
      enableIntraday,
      workingHours: { start: workStart, end: workEnd },
      blackouts: timeBlockConfig.blackouts || [],
      focusWindows: timeBlockConfig.focusWindows || [],
    };

    const currentDraft = draftProposal || proposal;
    const result = applyPlacementEdit(
      currentDraft,
      p.placementId,
      {
        proposedDate: editDate,
        startTime: editStartTime,
        endTime: editEndTime,
      },
      editContext
    );

    if (!result.success) {
      setValidationError(result.error?.message || 'Placement edit rejected.');
      return;
    }

    setUndoStack((prev) => [...prev, currentDraft]);
    setDraftProposal(result.proposal);
    setEditingPlacementId(null);
    setValidationError(null);
    setFeedbackMessage(`Updated placement for "${p.taskTitle}".`);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prevDraft = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setDraftProposal(prevDraft);
    setEditingPlacementId(null);
    setValidationError(null);
    setFeedbackMessage('Reverted last schedule edit.');
  };

  const handleRevert = () => {
    if (!initialProposalSnapshot) return;
    setDraftProposal(JSON.parse(JSON.stringify(initialProposalSnapshot)));
    setUndoStack([]);
    setEditingPlacementId(null);
    setValidationError(null);
    setFeedbackMessage('Restored originally generated schedule proposal.');
  };

  const handleDiscard = (reason = 'user_discard') => {
    if (!hasAppliedRef.current && (draftProposal || proposal) && onDiscardSchedule) {
      onDiscardSchedule(draftProposal || proposal, reason);
    }
    setDraftProposal(null);
    setInitialProposalSnapshot(null);
    setUndoStack([]);
    setEditingPlacementId(null);
    setValidationError(null);
    setFeedbackMessage(null);
    onClose();
  };

  const handleApply = () => {
    if (isStale) return;
    if (hasAppliedRef.current) return;

    const currentDraft = draftProposal || proposal;
    const editContext = {
      tasks,
      dailyCapacityHours: Number(dailyCapacityHours) || 6.0,
      enableIntraday,
      workingHours: { start: workStart, end: workEnd },
      blackouts: timeBlockConfig.blackouts || [],
      focusWindows: timeBlockConfig.focusWindows || [],
    };

    const fullCheck = validateFullProposal(currentDraft, editContext);
    if (!fullCheck.valid) {
      setValidationError(
        fullCheck.errors[0]?.message || 'Cannot apply schedule with hard constraint violations.'
      );
      return;
    }

    hasAppliedRef.current = true;
    if (onApplySchedule) {
      onApplySchedule(currentDraft);
    }
    onClose();
  };

  const handleRegenerate = () => {
    setCachedSnapshotHash(currentTasksHash);
    setSessionCount((c) => c + 1);
  };

  const activeProposal = draftProposal || proposal;
  if (!isOpen || !activeProposal) return null;

  const summary = activeProposal.summary || {};
  const placements = activeProposal.proposedPlacements || activeProposal.placements || [];
  const cycles = summary.cycles || [];

  // Filter valid actionable date shifts
  const validShifts = placements.filter(
    (p) =>
      p.status !== 'unscheduled' &&
      p.status !== 'blocked_by_dependency' &&
      p.status !== 'oversized_exceeds_capacity' &&
      p.isDateChanged &&
      p.proposedDate !== null
  );

  const changesCount = validShifts.length;

  const getFeasibilityBadge = () => {
    const status = summary.feasibilityStatus || summary.feasibility;
    switch (status) {
      case 'feasible':
        return {
          label: 'Feasible Plan',
          style: { backgroundColor: '#D4F0E2', color: '#1B5E3C', borderColor: '#27754E' },
          desc: 'All scheduled tasks fit within daily hours and meet their deadlines.',
        };
      case 'infeasible_deadlines':
        return {
          label: 'Deadline Conflicts',
          style: { backgroundColor: '#FFE5E0', color: '#9E2A2B', borderColor: '#FF8F82' },
          desc: `${summary.missedDeadlineCount || 0} task(s) cannot meet their deadline given capacity & dependencies.`,
        };
      case 'capacity_exceeded':
        return {
          label: 'Capacity Pressure',
          style: { backgroundColor: '#FFF3C4', color: '#92400E', borderColor: '#F59E0B' },
          desc: `${summary.oversizedCount ? `${summary.oversizedCount} oversized task(s) or ` : ''}capacity is strained.`,
        };
      case 'dependency_cycle':
        return {
          label: 'Circular / Unresolved Dependencies',
          style: { backgroundColor: '#F3EEFF', color: '#5B44BA', borderColor: '#C9B6FF' },
          desc: `${summary.blockedCount || cycles.length} task(s) are blocked by circular prerequisites or missing tasks.`,
        };
      default:
        return {
          label: 'Draft Proposal',
          style: { backgroundColor: '#E2E8F0', color: '#334155', borderColor: '#94A3B8' },
          desc: 'Review proposed allocations below.',
        };
    }
  };

  const badge = getFeasibilityBadge();

  return (
    <div style={styles.backdrop} onClick={() => handleDiscard('user_closed')} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerTitleGroup}>
            <div style={styles.tagRow}>
              <span style={styles.superBadge}>PHASE 4 ENGINE</span>
              <span style={{ ...styles.feasibilityBadge, ...badge.style }}>
                {badge.label}
              </span>
              {personalDurationModel?.hasSufficientData && usePersonalModel && (
                <span style={styles.mlActiveBadge}>
                  ✦ Learned Pace Active
                </span>
              )}
            </div>
            <h2 id="modal-title" style={styles.title}>
              Adaptive Sprint <span className="hl hl-butter">Planner</span>
            </h2>
            <p style={styles.subtitle}>{badge.desc}</p>
          </div>
          <button type="button" onClick={() => handleDiscard('user_closed')} style={styles.closeBtn} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={styles.navTabBar}>
          <button
            type="button"
            onClick={() => setActiveTab('proposal')}
            style={{
              ...styles.navTabBtn,
              ...(activeTab === 'proposal' ? styles.navTabBtnActive : styles.navTabBtnInactive),
            }}
          >
            ✦ Schedule Proposal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('benchmark')}
            style={{
              ...styles.navTabBtn,
              ...(activeTab === 'benchmark' ? styles.navTabBtnActive : styles.navTabBtnInactive),
            }}
          >
            ⚖ Strategy Benchmark & Quality
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('feedback')}
            style={{
              ...styles.navTabBtn,
              ...(activeTab === 'feedback' ? styles.navTabBtnActive : styles.navTabBtnInactive),
            }}
          >
            📈 Schedule Feedback & Outcomes
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('export');
              setExportFeedback(null);
            }}
            style={{
              ...styles.navTabBtn,
              ...(activeTab === 'export' ? styles.navTabBtnActive : styles.navTabBtnInactive),
            }}
          >
            📅 Export Calendar (.ics)
          </button>
        </div>

        {/* TAB 1: SCHEDULE PROPOSAL */}
        {activeTab === 'proposal' && (
          <>
            {/* Stale Proposal Alert Banner */}
            {isStale && (
              <div style={styles.staleBanner}>
                <div style={styles.staleText}>
                  ⚠️ <strong>Task Data Changed:</strong> Your task backlog was modified while this proposal was open.
                  Regenerate the proposal to reflect your current tasks before applying.
                </div>
                <button type="button" onClick={handleRegenerate} style={styles.regenerateBtn}>
                  ↻ Regenerate Proposal
                </button>
              </div>
            )}

            {/* Configuration Bar */}
            <div style={styles.configBar}>
              <div style={styles.configItem}>
                <label style={styles.configLabel} htmlFor="capacity-input">
                  Working Hours / Day:
                </label>
                <div style={styles.inputWrap}>
                  <input
                    id="capacity-input"
                    type="number"
                    min="1"
                    max="16"
                    step="0.5"
                    value={dailyCapacityHours}
                    onChange={(e) => setDailyCapacityHours(parseFloat(e.target.value) || 6.0)}
                    style={styles.numInput}
                  />
                  <span style={styles.inputUnit}>hrs</span>
                </div>
              </div>

              <div style={styles.configItem}>
                <label style={styles.configLabel} htmlFor="horizon-select">
                  Planning Window:
                </label>
                <select
                  id="horizon-select"
                  value={horizonDays}
                  onChange={(e) => setHorizonDays(parseInt(e.target.value, 10) || 14)}
                  style={styles.selectInput}
                >
                  <option value={7}>7 Days (1 Sprint)</option>
                  <option value={14}>14 Days (2 Sprints)</option>
                  <option value={21}>21 Days (3 Sprints)</option>
                  <option value={30}>30 Days (1 Month)</option>
                </select>
              </div>

              <div style={styles.configItem}>
                <button
                  type="button"
                  onClick={() => setUsePersonalModel(!usePersonalModel)}
                  style={{
                    ...styles.toggleBtn,
                    ...(usePersonalModel ? styles.toggleBtnActive : styles.toggleBtnInactive),
                  }}
                  title={
                    personalDurationModel?.hasSufficientData
                      ? 'Toggle between learned historical duration ratio and cold-start estimates'
                      : 'Personal model still in cold start (insufficient data)'
                  }
                >
                  {usePersonalModel ? '✓ Learned Personal Duration' : '○ Original Estimates'}
                </button>
              </div>

              <div style={styles.configItem}>
                <button
                  type="button"
                  onClick={() => setEnableChunking(!enableChunking)}
                  style={{
                    ...styles.toggleBtn,
                    ...(enableChunking ? styles.toggleBtnActive : styles.toggleBtnInactive),
                  }}
                  title="Partition tasks exceeding daily capacity across multiple scheduled work sessions"
                >
                  {enableChunking ? '✓ Multi-Day Chunking' : '○ Single Session Only'}
                </button>
              </div>

              <div style={styles.configItem}>
                <button
                  type="button"
                  onClick={handleToggleIntraday}
                  style={{
                    ...styles.toggleBtn,
                    ...(enableIntraday ? styles.toggleBtnActive : styles.toggleBtnInactive),
                  }}
                  title="Schedule sessions within intraday available windows and respect meeting blackouts"
                >
                  {enableIntraday ? '✓ Intraday Windows' : '○ Daily Block Only'}
                </button>
              </div>

              {enableIntraday && (
                <div style={{ ...styles.configItem, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ ...styles.configLabel, marginBottom: 0 }}>Hours:</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input
                      type="time"
                      value={workStart}
                      onChange={(e) => handleWorkStartChange(e.target.value)}
                      style={{ ...styles.numInput, width: '70px', padding: '3px 4px', fontSize: '12px' }}
                      title="Working hours start"
                    />
                    <span style={{ fontSize: '11px', color: '#71717A' }}>–</span>
                    <input
                      type="time"
                      value={workEnd}
                      onChange={(e) => handleWorkEndChange(e.target.value)}
                      style={{ ...styles.numInput, width: '70px', padding: '3px 4px', fontSize: '12px' }}
                      title="Working hours end"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Metrics Ribbon */}
            <div style={styles.metricsGrid}>
              <div style={styles.metricCard}>
                <span style={styles.metricVal}>
                  {summary.scheduledCount || summary.scheduledTasksCount || 0} / {summary.totalEligibleTasks || 0}
                </span>
                <span style={styles.metricLabel}>Tasks Scheduled</span>
              </div>
              <div style={styles.metricCard}>
                <span style={{ ...styles.metricVal, color: changesCount > 0 ? '#B45309' : '#1B5E3C' }}>
                  {changesCount}
                </span>
                <span style={styles.metricLabel}>Date Shifts</span>
              </div>
              <div style={styles.metricCard}>
                <span style={{ ...styles.metricVal, color: summary.missedDeadlineCount > 0 ? '#9E2A2B' : '#1B5E3C' }}>
                  {summary.missedDeadlineCount || 0}
                </span>
                <span style={styles.metricLabel}>Deadline Warnings</span>
              </div>
              <div style={styles.metricCard}>
                <span style={styles.metricVal}>
                  {summary.averageUtilizationPercent || 0}%
                </span>
                <span style={styles.metricLabel}>Capacity Utilization</span>
              </div>
            </div>

            {/* Circular Dependency Warning Callout */}
            {cycles.length > 0 && (
              <div style={styles.cycleAlert}>
                <strong>⚠️ Circular Dependency Detected:</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: '20px' }}>
                  {cycles.map((cycle, idx) => (
                    <li key={idx} style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                      Cycle {idx + 1}: {cycle.join(' ➔ ')}
                    </li>
                  ))}
                </ul>
                <div style={{ marginTop: '4px', fontSize: '11px', opacity: 0.9 }}>
                  Affected tasks and their downstream dependents have been blocked with <code>null</code> proposed dates. They will not be updated.
                </div>
              </div>
            )}

            {/* Draft Editing Ribbon */}
            <div style={styles.draftEditBar}>
              <div style={styles.draftEditLeft}>
                {undoStack.length > 0 ? (
                  <span style={styles.draftActiveBadge}>
                    ✏️ <strong>Draft Modified:</strong> {undoStack.length} manual edit{undoStack.length === 1 ? '' : 's'} applied (pending acceptance)
                  </span>
                ) : (
                  <span style={styles.draftHint}>
                    💡 Click <strong>"✏️ Edit"</strong> on any task to adjust its date or time window before accepting.
                  </span>
                )}
              </div>
              <div style={styles.draftEditActions}>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  style={{
                    ...styles.undoBtn,
                    ...(undoStack.length === 0 ? styles.undoBtnDisabled : {}),
                  }}
                  aria-label="Undo last edit"
                  title="Undo most recent schedule edit"
                >
                  ↶ Undo Edit
                </button>
                <button
                  type="button"
                  onClick={handleRevert}
                  disabled={undoStack.length === 0}
                  style={{
                    ...styles.revertBtn,
                    ...(undoStack.length === 0 ? styles.revertBtnDisabled : {}),
                  }}
                  aria-label="Revert to original proposal"
                  title="Revert all edits to originally generated proposal"
                >
                  ↺ Revert Proposal
                </button>
              </div>
            </div>
            {feedbackMessage && (
              <div style={styles.feedbackAlert} role="status" aria-live="polite">
                {feedbackMessage}
              </div>
            )}
            {validationError && !editingPlacementId && (
              <div style={{ margin: '8px 28px 0', ...styles.inlineErrorBox }} role="alert" aria-live="assertive">
                ⚠️ <strong>Blocking Constraint:</strong> {validationError}
              </div>
            )}

            {/* Placements List */}
            <div style={styles.listContainer}>
              <div style={styles.listHeaderRow}>
                <span style={{ flex: 2.8 }}>Task & Priority</span>
                <span style={{ flex: 1.2 }}>Original Due</span>
                <span style={{ flex: 1.6 }}>Proposed Date</span>
                <span style={{ flex: 1.0 }}>Effort</span>
                <span style={{ flex: 1.0, textAlign: 'right' }}>Status</span>
                <span style={{ flex: 0.8, textAlign: 'right' }}>Action</span>
              </div>

              <div style={styles.scrollList}>
                {placements.length === 0 ? (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#71717A', fontSize: '13px' }}>
                    No uncompleted tasks available to schedule.
                  </div>
                ) : (
                  placements.map((p) => {
                    const isShifted = p.isDateChanged && p.proposedDate !== null;
                    const isBlocked = p.status === 'blocked_by_dependency';
                    const isOversized = p.status === 'oversized_exceeds_capacity';
                    const isOverdueAtStart = p.status === 'overdue_at_start';

                    let statusLabel = 'On Time';
                    let statusPillStyle = { backgroundColor: '#D4F0E2', color: '#1B5E3C' };

                    if (isBlocked) {
                      statusLabel = 'Blocked';
                      statusPillStyle = { backgroundColor: '#F3EEFF', color: '#5B44BA' };
                    } else if (isOversized) {
                      statusLabel = 'Manual Resolution';
                      statusPillStyle = { backgroundColor: '#FFE5E0', color: '#9E2A2B' };
                    } else if (p.status === 'deadline_missed') {
                      statusLabel = 'Late';
                      statusPillStyle = { backgroundColor: '#FFE5E0', color: '#9E2A2B' };
                    } else if (isOverdueAtStart) {
                      statusLabel = 'Was Overdue';
                      statusPillStyle = { backgroundColor: '#FFF3C4', color: '#92400E' };
                    } else if (p.allocationStatus === 'partially_allocated') {
                      statusLabel = 'Partial Session';
                      statusPillStyle = { backgroundColor: '#FFF3C4', color: '#92400E' };
                    } else if (p.status === 'unscheduled') {
                      statusLabel = 'Unscheduled';
                      statusPillStyle = { backgroundColor: '#F4F4F5', color: '#71717A' };
                    }

                    const rowKey = p.placementId || (p.isChunk ? `${p.taskId}_seg_${p.chunkIndex}` : p.taskId);

                    return (
                      <div key={rowKey} style={{ display: 'flex', flexDirection: 'column' }}>
                        <div
                          style={{
                            ...styles.taskRow,
                            ...(isShifted ? styles.taskRowShifted : {}),
                            ...(isBlocked || isOversized ? { opacity: 0.85, borderStyle: 'dashed' } : {}),
                          }}
                        >
                          <div style={{ flex: 2.8, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={styles.taskTitleRow}>
                              <span style={styles.priorityIndicator(p.taskPriority)} />
                              <span style={styles.taskTitle}>{p.taskTitle}</span>
                              {p.isChunk && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    backgroundColor: '#EEF2FF',
                                    color: '#4338CA',
                                    border: '1px solid #C7D2FE',
                                    borderRadius: '4px',
                                    padding: '1px 6px',
                                    marginLeft: '4px',
                                  }}
                                >
                                  Session {p.chunkIndex + 1} of {p.totalChunks}
                                </span>
                              )}
                              {p.inFocusWindow && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    backgroundColor: '#FEF3C7',
                                    color: '#92400E',
                                    border: '1px solid #FCD34D',
                                    borderRadius: '4px',
                                    padding: '1px 6px',
                                    marginLeft: '4px',
                                  }}
                                  title={`Scheduled in ${p.focusWindowLabel || 'Focus Window'}`}
                                >
                                  🎯 {p.focusWindowLabel || 'Focus'}
                                </span>
                              )}
                              {p.taskCategory && (
                                <span style={styles.categoryTag}>{p.taskCategory}</span>
                              )}
                            </div>
                            {p.explanation && (
                              <span style={styles.explanationText}>{p.explanation}</span>
                            )}
                            {p.conflicts && p.conflicts.length > 0 && (
                              <span style={styles.conflictText}>⚠️ {p.conflicts[0]}</span>
                            )}
                          </div>

                          <div style={{ flex: 1.2, fontSize: '12px', color: '#71717A' }}>
                            {p.originalDueDate || '—'}
                          </div>

                          <div style={{ flex: 1.6, fontSize: '12px', fontWeight: '700' }}>
                            {p.proposedDate ? (
                              <div>
                                {isShifted ? (
                                  <span style={styles.shiftedDateBadge}>{p.proposedDate}</span>
                                ) : (
                                  <span>{p.proposedDate}</span>
                                )}
                                {p.startTime && p.endTime && (
                                  <div style={{ fontSize: '11px', color: '#4F46E5', fontWeight: '600', marginTop: '2px' }}>
                                    🕒 {p.startTime} – {p.endTime}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#9E2A2B', fontStyle: 'italic' }}>Unscheduled</span>
                            )}
                          </div>

                          <div style={{ flex: 1.0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              <span style={styles.effortBadge(p.durationSource)}>
                                {p.effectiveHours.toFixed(1)}h
                              </span>
                              {p.isChunk && typeof p.parentTotalEffort === 'number' && (
                                <span style={{ fontSize: '10px', color: '#71717A' }} title={`Parent total effort: ${p.parentTotalEffort}h`}>
                                  ({p.parentTotalEffort.toFixed(1)}h total)
                                </span>
                              )}
                              {p.appliedRatio !== 1.0 && p.durationSource === 'personalized' && (
                                <span style={{ fontSize: '10px', color: '#5B44BA', fontWeight: '700' }}>
                                  ({(p.appliedRatio).toFixed(2)}x)
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ flex: 1.0, textAlign: 'right' }}>
                            <span style={{ ...styles.statusPill, ...statusPillStyle }}>
                              {statusLabel}
                            </span>
                          </div>

                          <div style={{ flex: 0.8, textAlign: 'right' }}>
                            {p.status !== 'blocked_by_dependency' && p.status !== 'oversized_exceeds_capacity' && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(p)}
                                style={styles.editRowBtn}
                                aria-label={`Adjust date and time for ${p.taskTitle}${p.isChunk ? ` session ${p.chunkIndex + 1}` : ''}`}
                              >
                                ✏️ Edit
                              </button>
                            )}
                          </div>
                        </div>

                        {editingPlacementId === p.placementId && (
                          <div style={styles.inlineEditPanel} role="region" aria-label={`Edit schedule for ${p.taskTitle}`}>
                            <div style={styles.inlineEditRow}>
                              <div style={styles.inlineField}>
                                <label htmlFor={`edit-date-${p.placementId}`} style={styles.inlineLabel}>
                                  Date:
                                </label>
                                <input
                                  id={`edit-date-${p.placementId}`}
                                  type="date"
                                  value={editDate}
                                  onChange={(e) => setEditDate(e.target.value)}
                                  style={styles.inlineInput}
                                  aria-label="Proposed Date"
                                />
                              </div>

                              {enableIntraday && (
                                <>
                                  <div style={styles.inlineField}>
                                    <label htmlFor={`edit-start-${p.placementId}`} style={styles.inlineLabel}>
                                      Start:
                                    </label>
                                    <input
                                      id={`edit-start-${p.placementId}`}
                                      type="time"
                                      value={editStartTime}
                                      onChange={(e) => setEditStartTime(e.target.value)}
                                      style={styles.inlineInput}
                                      aria-label="Session Start Time"
                                    />
                                  </div>

                                  <div style={styles.inlineField}>
                                    <label htmlFor={`edit-end-${p.placementId}`} style={styles.inlineLabel}>
                                      End:
                                    </label>
                                    <input
                                      id={`edit-end-${p.placementId}`}
                                      type="time"
                                      value={editEndTime}
                                      onChange={(e) => setEditEndTime(e.target.value)}
                                      style={styles.inlineInput}
                                      aria-label="Session End Time"
                                    />
                                  </div>
                                </>
                              )}

                              <div style={styles.inlineBtnRow}>
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(p)}
                                  style={styles.inlineSaveBtn}
                                  aria-label="Save placement edit"
                                >
                                  ✓ Save
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  style={styles.inlineCancelBtn}
                                  aria-label="Cancel editing"
                                >
                                  ✕ Cancel
                                </button>
                              </div>
                            </div>

                            {validationError && (
                              <div style={styles.inlineErrorBox} role="alert" aria-live="assertive">
                                ⚠️ <strong>Constraint Issue:</strong> {validationError}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div style={styles.footer}>
              <div style={styles.footerNote}>
                🔒 <strong>Safe Proposal:</strong> VoxPlan will not alter any saved task until you click "Apply Schedule".
              </div>
              <div style={styles.btnRow}>
                {acceptedSchedule && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('export');
                      setExportFeedback(null);
                    }}
                    style={styles.exportQuickBtn}
                    title="Export accepted schedule to .ics calendar file"
                  >
                    📅 Export Calendar (.ics)
                  </button>
                )}
                <button type="button" onClick={() => handleDiscard('user_discard')} style={styles.discardBtn}>
                  Discard Proposal
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={isStale || changesCount === 0}
                  style={{
                    ...styles.applyBtn,
                    ...((isStale || changesCount === 0) ? styles.applyBtnDisabled : {}),
                  }}
                  title={isStale ? 'Regenerate proposal before applying' : ''}
                >
                  {isStale
                    ? 'Proposal Stale (Regenerate)'
                    : changesCount > 0
                    ? `Apply Schedule (${changesCount} shift${changesCount === 1 ? '' : 's'})`
                    : 'No Applicable Changes'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: STRATEGY BENCHMARK & QUALITY EVALUATION */}
        {activeTab === 'benchmark' && benchmarkComparison && (
          <div style={styles.benchmarkContainer}>
            {/* Scenario Selector Ribbon */}
            <div style={styles.scenarioBar}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={styles.configLabel} htmlFor="scenario-select">
                  Benchmark Scenario:
                </label>
                <select
                  id="scenario-select"
                  value={selectedScenarioKey}
                  onChange={(e) => setSelectedScenarioKey(e.target.value)}
                  style={styles.scenarioSelect}
                >
                  <option value="current">Current Active Tasks ({tasks.length} tasks)</option>
                  <optgroup label="Standard Benchmarks">
                    <option value="normal_mixed_backlog">1. Normal Backlog (Mixed Priorities & Deadlines)</option>
                    <option value="shared_deadline">2. Shared Deadline Contention</option>
                    <option value="priority_vs_deadline">3. Priority vs. Deadline Tension</option>
                    <option value="linear_dependency_chain">4. Dependency Chain & Completed Prerequisite</option>
                    <option value="dependency_cycle_blocked">5. Dependency Cycle & Downstream Isolation</option>
                    <option value="oversized_task">6. Oversized Task (&gt; Daily Capacity)</option>
                    <option value="insufficient_capacity">7. Insufficient Capacity Before Deadlines</option>
                    <option value="missing_and_overdue_deadlines">8. Overdue & Undated Task Recovery</option>
                    <option value="non_working_day_deadline">9. Non-Working-Day Deadline (Weekend)</option>
                    <option value="horizon_exhaustion">10. Planning Horizon Exhaustion</option>
                    <option value="sparse_vs_coldstart_personal_model">11. Personal Model Duration Adjustment</option>
                    <option value="heuristic_risk_signal">12. Heuristic Delay-Risk Urgency Boost</option>
                  </optgroup>
                </select>
              </div>
              <div style={styles.scenarioMetaBadge}>
                {benchmarkComparison.scenario} • {benchmarkComparison.inputTaskCount} Tasks
              </div>
            </div>

            {/* 3-Strategy Side-by-Side Comparison Grid */}
            <div style={styles.strategyCardsGrid}>
              {/* Strategy 1: Adaptive */}
              <div style={{ ...styles.stratCard, borderColor: '#27754E' }}>
                <div style={{ ...styles.stratCardHeader, backgroundColor: '#E8F5E9', borderBottomColor: '#A5D6A7' }}>
                  <div style={styles.stratBadgeWrap}>
                    <span style={styles.recommendedBadge}>✦ RECOMMENDED</span>
                  </div>
                  <h4 style={styles.stratTitle}>Adaptive Engine</h4>
                  <span style={styles.stratSubtitle}>Multi-objective balancing</span>
                </div>
                <div style={styles.stratBody}>
                  {renderStrategyMetrics(benchmarkComparison.strategies.adaptive)}
                </div>
              </div>

              {/* Strategy 2: Earliest Deadline First (EDF) */}
              <div style={{ ...styles.stratCard, borderColor: '#1565C0' }}>
                <div style={{ ...styles.stratCardHeader, backgroundColor: '#E3F2FD', borderBottomColor: '#90CAF9' }}>
                  <div style={styles.stratBadgeWrap}>
                    <span style={{ ...styles.baselineBadge, backgroundColor: '#BBDEFB', color: '#0D47A1' }}>BASELINE</span>
                  </div>
                  <h4 style={styles.stratTitle}>Earliest Deadline (EDF)</h4>
                  <span style={styles.stratSubtitle}>Deadline urgency only</span>
                </div>
                <div style={styles.stratBody}>
                  {renderStrategyMetrics(benchmarkComparison.strategies.edf)}
                </div>
              </div>

              {/* Strategy 3: Priority-First */}
              <div style={{ ...styles.stratCard, borderColor: '#6A1B9A' }}>
                <div style={{ ...styles.stratCardHeader, backgroundColor: '#F3E5F5', borderBottomColor: '#CE93D8' }}>
                  <div style={styles.stratBadgeWrap}>
                    <span style={{ ...styles.baselineBadge, backgroundColor: '#E1BEE7', color: '#4A148C' }}>BASELINE</span>
                  </div>
                  <h4 style={styles.stratTitle}>Priority-First</h4>
                  <span style={styles.stratSubtitle}>Priority tiers only</span>
                </div>
                <div style={styles.stratBody}>
                  {renderStrategyMetrics(benchmarkComparison.strategies.priority_first)}
                </div>
              </div>
            </div>

            {/* Explicit Strategy Preference Comparison Section */}
            <div style={styles.pairwisePreferenceBox}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: '800', fontSize: '13px', color: '#1E293B' }}>
                  🎯 Explicit Schedule Preference (Offline Ranking Evidence)
                </span>
                <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>
                  Local Evidence Collection Only
                </span>
              </div>
              <p style={{ margin: '0 0 6px 0', fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
                Which schedule balance better fits your real-world workflow for <strong>{benchmarkComparison.scenario}</strong>? Explicit choices are recorded locally to evaluate ranking models offline.
              </p>
              <div style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.4, marginBottom: '10px', fontStyle: 'italic' }}>
                Scope notice: Your selection represents preference for this specific backlog scenario only. It does not imply a general preference across all contexts, does not endorse individual task placements, and does not alter production schedule generation.
              </div>
              {typeof telemetry.isPreferenceCollectionEnabled === 'function' && !telemetry.isPreferenceCollectionEnabled() && (
                <div style={styles.preferencePausedBanner} role="status">
                  ⏸️ <strong>Preference Collection Paused:</strong> Explicit preference collection is disabled in Personal Settings. You can compare schedules freely, but choices will not be recorded to local telemetry.
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    handleRecordPreference(
                      'adaptive',
                      'edf',
                      'Adaptive Engine preferred over Earliest Deadline (EDF)'
                    );
                  }}
                  style={styles.preferenceBtn}
                  aria-label="Prefer Adaptive Engine over Earliest Deadline First"
                >
                  Prefer Adaptive over EDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleRecordPreference(
                      'adaptive',
                      'priority_first',
                      'Adaptive Engine preferred over Priority-First'
                    );
                  }}
                  style={styles.preferenceBtn}
                  aria-label="Prefer Adaptive Engine over Priority-First"
                >
                  Prefer Adaptive over Priority-First
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleRecordPreference(
                      'edf',
                      'adaptive',
                      'Earliest Deadline (EDF) preferred over Adaptive Engine'
                    );
                  }}
                  style={styles.preferenceBtn}
                  aria-label="Prefer Earliest Deadline First over Adaptive Engine"
                >
                  Prefer EDF over Adaptive
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleRecordPreference(
                      'priority_first',
                      'adaptive',
                      'Priority-First preferred over Adaptive Engine'
                    );
                  }}
                  style={styles.preferenceBtn}
                  aria-label="Prefer Priority-First over Adaptive Engine"
                >
                  Prefer Priority-First over Adaptive
                </button>
              </div>
              {preferenceFeedback && (
                <div
                  style={{
                    ...styles.preferenceFeedbackBanner,
                    backgroundColor:
                      preferenceFeedback.type === 'error' ? '#FEE2E2' :
                      preferenceFeedback.type === 'info' ? '#EFF6FF' : '#DCFCE7',
                    borderColor:
                      preferenceFeedback.type === 'error' ? '#FCA5A5' :
                      preferenceFeedback.type === 'info' ? '#BFDBFE' : '#86EFAC',
                    color:
                      preferenceFeedback.type === 'error' ? '#991B1B' :
                      preferenceFeedback.type === 'info' ? '#1E40AF' : '#166534',
                  }}
                  role="status"
                  aria-live="polite"
                >
                  {typeof preferenceFeedback === 'string' ? preferenceFeedback : preferenceFeedback.text}
                </div>
              )}
            </div>

            {/* Trade-Off & Algorithmic Divergence Analysis */}
            <div style={styles.tradeoffBox}>
              <div style={{ fontWeight: '800', marginBottom: '6px', fontSize: '13px' }}>
                🔍 Trade-Off & Algorithmic Analysis:
              </div>
              {benchmarkComparison.tradeoffs && benchmarkComparison.tradeoffs.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', lineHeight: 1.5 }}>
                  {benchmarkComparison.tradeoffs.map((item, idx) => (
                    <li key={idx} style={{ marginBottom: '4px' }}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontSize: '12px', color: '#52525B' }}>
                  In this scenario, all 3 strategies produced identical constraint-compliant placements with no significant divergence.
                </div>
              )}
            </div>

            {/* Schedule Stability (Perturbation Churn) Card */}
            {stabilityReport && (
              <div style={styles.stabilityBox}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontWeight: '800', fontSize: '13px' }}>
                    📊 Schedule Stability (Perturbation Churn Analysis):
                  </span>
                  <span style={styles.churnScoreBadge}>
                    Avg Churn: {(stabilityReport.averageChurnRate * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={styles.perturbationGrid}>
                  {stabilityReport.perturbationResults.map((p) => (
                    <div key={p.key} style={styles.perturbationItem}>
                      <span style={{ fontWeight: '600' }}>{p.name}:</span>
                      <span style={{ fontWeight: '700', color: p.churnRate === 0 ? '#1B5E3C' : '#92400E' }}>
                        {(p.churnRate * 100).toFixed(1)}% churn ({p.shiftedCount}/{p.commonCount} shifted)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scientific Notice / Disclosure */}
            <div style={styles.disclosureBox}>
              ℹ️ <strong>Benchmark Transparency:</strong> Benchmark results run against fixed fixtures and evaluate mathematical constraint compliance. They do not constitute real-world user validation or claim superiority in all contexts. Heuristic risk scores provide secondary urgency guidance, not calibrated probabilities.
            </div>

            {/* Benchmark Footer */}
            <div style={styles.footer}>
              <button
                type="button"
                onClick={() => setActiveTab('proposal')}
                style={styles.discardBtn}
              >
                ← Return to Schedule Proposal
              </button>
              <button type="button" onClick={onClose} style={styles.discardBtn}>
                Close Modal
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: SCHEDULE FEEDBACK & OUTCOME TRACKING */}
        {activeTab === 'feedback' && feedbackReport && (
          <div style={styles.feedbackContainer}>
            {/* Sufficiency Alert */}
            {!feedbackReport.summary.isSufficientData ? (
              <div style={styles.feedbackSufficiencyBanner}>
                <span style={{ fontSize: '16px' }}>ℹ️</span>
                <div>
                  <strong>Insufficient Feedback Data (&lt; 3 observations):</strong> VoxPlan requires at least 3 decided proposals and completed task outcomes to evaluate scheduling usefulness reliably. Preliminary early observations are shown below without extrapolation.
                </div>
              </div>
            ) : (
              <div style={styles.feedbackSufficiencyBannerPositive}>
                <span style={{ fontSize: '16px' }}>✓</span>
                <div>
                  <strong>Feedback Dataset Active:</strong> {feedbackReport.summary.decidedCount} decided proposals ({feedbackReport.summary.acceptedCount} accepted, {feedbackReport.summary.discardedCount} discarded) and {feedbackReport.summary.eligibleCompletedCount} unaltered task completion observations recorded locally.
                </div>
              </div>
            )}

            {/* Metric KPI Cards */}
            <div style={styles.feedbackCardsGrid}>
              {/* Card 1: Decided Proposals */}
              <div style={styles.feedbackCard}>
                <div style={styles.feedbackCardHeader}>
                  <span style={styles.feedbackCardSuper}>LIFECYCLE</span>
                  <span style={styles.feedbackCardTitle}>Proposal Decisions</span>
                </div>
                <div style={styles.feedbackCardValue}>
                  {feedbackReport.summary.decidedCount}
                </div>
                <div style={styles.feedbackCardSubtext}>
                  {feedbackReport.summary.acceptedCount} accepted • {feedbackReport.summary.discardedCount} discarded ({feedbackReport.summary.generatedCount} generated total)
                </div>
              </div>

              {/* Card 2: Acceptance Rate */}
              <div style={styles.feedbackCard}>
                <div style={styles.feedbackCardHeader}>
                  <span style={styles.feedbackCardSuper}>ADOPTION</span>
                  <span style={styles.feedbackCardTitle}>Acceptance Rate</span>
                </div>
                <div style={styles.feedbackCardValue}>
                  {feedbackReport.summary.acceptanceRate !== null
                    ? `${(feedbackReport.summary.acceptanceRate * 100).toFixed(0)}%`
                    : 'N/A'}
                </div>
                <div style={styles.feedbackCardSubtext}>
                  Denominator: {feedbackReport.summary.acceptedCount}/{feedbackReport.summary.decidedCount} decided proposals
                </div>
                <div style={styles.feedbackCardFootnote}>
                  * Reflects initial agreement, not execution quality.
                </div>
              </div>

              {/* Card 3: Subsequent Overrides */}
              <div style={styles.feedbackCard}>
                <div style={styles.feedbackCardHeader}>
                  <span style={styles.feedbackCardSuper}>MANUAL ADJUSTMENTS</span>
                  <span style={styles.feedbackCardTitle}>Override Rate</span>
                </div>
                <div style={styles.feedbackCardValue}>
                  {feedbackReport.summary.proposalOverrideRate !== null
                    ? `${(feedbackReport.summary.proposalOverrideRate * 100).toFixed(0)}%`
                    : 'N/A'}
                </div>
                <div style={styles.feedbackCardSubtext}>
                  {feedbackReport.summary.taskOverrideRate !== null
                    ? `${(feedbackReport.summary.taskOverrideRate * 100).toFixed(0)}% tasks overridden (${feedbackReport.summary.uniqueOverriddenTasksCount}/${feedbackReport.summary.totalPlacedTasksCount})`
                    : '0 tasks placed'}
                </div>
                <div style={styles.feedbackCardFootnote}>
                  {feedbackReport.summary.postponedOverridesCount} postponed • {feedbackReport.summary.advancedOverridesCount} advanced
                </div>
              </div>

              {/* Card 4: On-Time Timeliness */}
              <div style={styles.feedbackCard}>
                <div style={styles.feedbackCardHeader}>
                  <span style={styles.feedbackCardSuper}>EXECUTION</span>
                  <span style={styles.feedbackCardTitle}>Unaltered On-Time Rate</span>
                </div>
                <div style={styles.feedbackCardValue}>
                  {feedbackReport.summary.onTimeCompletionRate !== null
                    ? `${(feedbackReport.summary.onTimeCompletionRate * 100).toFixed(0)}%`
                    : 'N/A'}
                </div>
                <div style={styles.feedbackCardSubtext}>
                  Denominator: {feedbackReport.summary.completedOnTimeCount}/{feedbackReport.summary.eligibleCompletedCount} unaltered tasks
                </div>
                <div style={styles.feedbackCardFootnote}>
                  {feedbackReport.summary.excludedAmbiguousCount} excluded (rescheduled before finish)
                </div>
              </div>
            </div>

            {/* Overrides & Completion Details Grid */}
            <div style={styles.feedbackDetailsGrid}>
              {/* Box 1: Manual Overrides Log */}
              <div style={styles.feedbackDetailBox}>
                <div style={styles.feedbackDetailBoxTitle}>
                  📋 Subsequent Date Overrides ({feedbackReport.overrides.totalOverrideEvents})
                </div>
                {feedbackReport.overrides.details.length === 0 ? (
                  <div style={styles.feedbackEmptyNotice}>
                    No manual date changes recorded after accepting a schedule proposal.
                  </div>
                ) : (
                  <div style={styles.feedbackScrollList}>
                    {feedbackReport.overrides.details.slice(-5).reverse().map((o, idx) => (
                      <div key={idx} style={styles.feedbackListItem}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700', fontSize: '11px' }}>Task #{o.taskId.slice(-6)}</span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '700',
                            color: o.shiftDirection === 'postponed' ? '#92400E' : '#1B5E3C',
                          }}>
                            {o.shiftDays > 0 ? `+${o.shiftDays}d postponed` : o.shiftDays < 0 ? `${o.shiftDays}d advanced` : 'same day'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#71717A' }}>
                          Proposed: <code>{o.proposedDate}</code> → Overridden: <code>{o.overriddenDate}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Box 2: Verified Task Outcomes */}
              <div style={styles.feedbackDetailBox}>
                <div style={styles.feedbackDetailBoxTitle}>
                  🎯 Completion Outcomes ({feedbackReport.completionOutcomes.reliableObservations.length} eligible)
                </div>
                {feedbackReport.completionOutcomes.reliableObservations.length === 0 ? (
                  <div style={styles.feedbackEmptyNotice}>
                    No tasks from accepted schedules have completed without subsequent manual rescheduling yet.
                  </div>
                ) : (
                  <div style={styles.feedbackScrollList}>
                    {feedbackReport.completionOutcomes.reliableObservations.slice(-5).reverse().map((c, idx) => (
                      <div key={idx} style={styles.feedbackListItem}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700', fontSize: '11px' }}>Task #{c.taskId.slice(-6)}</span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '700',
                            color: c.isOnTime ? '#1B5E3C' : '#9E2A2B',
                          }}>
                            {c.isOnTime ? '✓ On Time' : '⚠️ Past Deadline'}
                          </span>
                        </div>
                        <div style={{ fontSize: '10px', color: '#71717A' }}>
                          Proposed Deadline: <code>{c.proposedDate}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Attribution Diagnostics & Exclusions Breakdown */}
            {feedbackReport.diagnostics && feedbackReport.diagnostics.totalExcludedObservations > 0 && (
              <div style={styles.diagnosticsBox}>
                <div style={{ fontWeight: '800', fontSize: '11px', color: '#52525B', marginBottom: '4px' }}>
                  🔍 Attribution Diagnostics ({feedbackReport.diagnostics.totalExcludedObservations} observation(s) excluded from scheduler timeliness):
                </div>
                <div style={styles.diagnosticsPillsRow}>
                  {feedbackReport.diagnostics.exclusionsByReason.overridden_prior_to_completion > 0 && (
                    <span style={styles.diagnosticPill} title="User manually altered task deadline prior to completion">
                      Overridden before finish: {feedbackReport.diagnostics.exclusionsByReason.overridden_prior_to_completion}
                    </span>
                  )}
                  {feedbackReport.diagnostics.exclusionsByReason.reopened_incomplete_lifecycle > 0 && (
                    <span style={styles.diagnosticPill} title="Task was reopened after completion and is incomplete">
                      Reopened / Incomplete: {feedbackReport.diagnostics.exclusionsByReason.reopened_incomplete_lifecycle}
                    </span>
                  )}
                  {feedbackReport.diagnostics.exclusionsByReason.task_currently_open > 0 && (
                    <span style={styles.diagnosticPill} title="Task is active in backlog">
                      Currently open: {feedbackReport.diagnostics.exclusionsByReason.task_currently_open}
                    </span>
                  )}
                  {feedbackReport.diagnostics.exclusionsByReason.missing_applicable_deadline > 0 && (
                    <span style={styles.diagnosticPill} title="No applicable deadline to measure timeliness">
                      Missing deadline: {feedbackReport.diagnostics.exclusionsByReason.missing_applicable_deadline}
                    </span>
                  )}
                  {feedbackReport.diagnostics.exclusionsByReason.conflicting_proposal_decision > 0 && (
                    <span style={styles.diagnosticPill} title="Proposal had conflicting accept and discard records">
                      Conflicting decision: {feedbackReport.diagnostics.exclusionsByReason.conflicting_proposal_decision}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Cautious Learning Boundary Box */}
            <div style={styles.cautiousBoundaryBox}>
              <div style={{ fontWeight: '800', fontSize: '12px', marginBottom: '4px', color: '#1B5E3C' }}>
                🛡️ Cautious Learning Boundary & Governance Notice
              </div>
              <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.45, marginBottom: '8px' }}>
                {feedbackReport.cautiousLearningBoundary.reason}
              </div>
              <div style={styles.conceptGrid}>
                <div style={styles.conceptItem}>
                  <strong>1. Acceptance Rate:</strong> {feedbackReport.conceptDistinctions.acceptanceRateNote}
                </div>
                <div style={styles.conceptItem}>
                  <strong>2. Override Rate:</strong> {feedbackReport.conceptDistinctions.overrideRateNote}
                </div>
                <div style={styles.conceptItem}>
                  <strong>3. On-Time Timeliness:</strong> {feedbackReport.conceptDistinctions.completionRateNote}
                </div>
              </div>
            </div>

            {/* Feedback Footer */}
            <div style={styles.footer}>
              <button
                type="button"
                onClick={() => setActiveTab('proposal')}
                style={styles.discardBtn}
              >
                ← Return to Schedule Proposal
              </button>
              <button type="button" onClick={onClose} style={styles.discardBtn}>
                Close Modal
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: CALENDAR EXPORT (RFC 5545 .ICS) */}
        {activeTab === 'export' && (
          <div style={styles.exportContainer}>
            <div style={styles.exportHeaderCard}>
              <div style={styles.exportTitleRow}>
                <div>
                  <div style={styles.exportTag}>PHASE 6.4 EXPORTER</div>
                  <h3 style={styles.exportTitle}>Export Accepted Schedule (.ics)</h3>
                </div>
                {acceptedSchedule && (
                  <span style={styles.exportStatusBadge}>
                    ✓ Ready to Export ({acceptedExportInfo?.validSessions?.length || 0} sessions)
                  </span>
                )}
              </div>
              <p style={styles.exportDescription}>
                Download a standards-compliant RFC 5545 iCalendar (<code>.ics</code>) file of your accepted sprint schedule.
                Compatible with Google Calendar, Apple Calendar, Microsoft Outlook, and any standard calendar software.
              </p>
            </div>

            {/* Disclaimer & Constraints Callout */}
            <div style={styles.exportNoticeGrid}>
              <div style={styles.exportNoticeBox}>
                <div style={styles.exportNoticeTitle}>🔒 One-Time Snapshot Notice</div>
                <div style={styles.exportNoticeText}>
                  This export generates a static calendar snapshot at the moment of download.
                  VoxPlan is local-first and does <strong>not</strong> establish continuous background synchronization or request access to external calendar accounts.
                </div>
              </div>
              <div style={styles.exportNoticeBox}>
                <div style={styles.exportNoticeTitle}>🕒 Local Time-Blocking (Floating Time)</div>
                <div style={styles.exportNoticeText}>
                  Sessions are exported in RFC 5545 local wall-clock floating time (<code>FORM #1</code>), preserving your exact local work hours and avoiding timezone offset drift.
                </div>
              </div>
            </div>

            {/* Unapplied Draft Alert */}
            {isDraftModified && (
              <div style={styles.exportDraftWarning}>
                ⚠️ <strong>Unapplied Draft in Progress:</strong> You have edited a draft in the Schedule Proposal tab. Calendar export strictly exports your previously accepted schedule snapshot. To export your new edits, return to the Proposal tab and click <strong>Apply Schedule</strong> first.
              </div>
            )}

            {acceptedSchedule ? (
              <div style={styles.acceptedScheduleBox}>
                {/* Metrics ribbon */}
                <div style={styles.acceptedMetricsRow}>
                  <div style={styles.acceptedMetricItem}>
                    <span style={styles.acceptedMetricLabel}>Accepted Schedule ID:</span>
                    <span style={styles.acceptedMetricVal}><code>{acceptedSchedule.summary?.scheduleId || 'accepted'}</code></span>
                  </div>
                  <div style={styles.acceptedMetricItem}>
                    <span style={styles.acceptedMetricLabel}>Accepted Timestamp:</span>
                    <span style={styles.acceptedMetricVal}>
                      {acceptedSchedule.acceptedAt ? new Date(acceptedSchedule.acceptedAt).toLocaleString() : 'Recent Session'}
                    </span>
                  </div>
                  <div style={styles.acceptedMetricItem}>
                    <span style={styles.acceptedMetricLabel}>Valid Sessions:</span>
                    <span style={{ ...styles.acceptedMetricVal, color: '#1B5E3C', fontWeight: '800' }}>
                      {acceptedExportInfo?.validSessions?.length || 0}
                    </span>
                  </div>
                  {acceptedExportInfo && acceptedExportInfo.omittedSessions.length > 0 && (
                    <div style={styles.acceptedMetricItem}>
                      <span style={styles.acceptedMetricLabel}>Omitted Items:</span>
                      <span style={{ ...styles.acceptedMetricVal, color: '#92400E', fontWeight: '800' }}>
                        {acceptedExportInfo.omittedSessions.length} (unscheduled/blocked)
                      </span>
                    </div>
                  )}
                </div>

                {/* Optional Timezone Control */}
                <div style={styles.tzOptionRow}>
                  <label style={styles.tzOptionLabel}>
                    <input
                      type="checkbox"
                      checked={includeTzid}
                      onChange={(e) => setIncludeTzid(e.target.checked)}
                      style={{ marginRight: '8px', cursor: 'pointer' }}
                    />
                    <span>
                      Attach local timezone parameter (<code>TZID={typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'local'}</code>)
                    </span>
                  </label>
                  <span style={styles.tzOptionHint}>
                    {includeTzid
                      ? 'Exports events with explicit TZID parameters.'
                      : 'Exports floating wall-clock time (safest for most calendar clients).'}
                  </span>
                </div>

                {/* Feedback Banner */}
                {exportFeedback && (
                  <div
                    style={{
                      ...styles.exportAlert,
                      ...(exportFeedback.type === 'success'
                        ? styles.exportAlertSuccess
                        : exportFeedback.type === 'warning'
                        ? styles.exportAlertWarning
                        : styles.exportAlertError),
                    }}
                    role="alert"
                    aria-live="polite"
                  >
                    {exportFeedback.type === 'success' ? '✓ ' : exportFeedback.type === 'warning' ? '⚠️ ' : '✕ '}
                    {exportFeedback.message}
                  </div>
                )}

                {/* Download Button */}
                <div style={styles.exportActionRow}>
                  <button
                    type="button"
                    onClick={handleDownloadIcs}
                    style={styles.downloadIcsBtn}
                    aria-label="Download accepted schedule as .ics file"
                  >
                    <span>📅</span>
                    <span>Download Calendar (.ics)</span>
                  </button>
                  <span style={{ fontSize: '11px', color: '#71717A' }}>
                    File: <code>voxplan-schedule-{todayStr}.ics</code> (text/calendar)
                  </span>
                </div>

                {/* Sessions Preview Table */}
                <div style={styles.previewSection}>
                  <div style={styles.previewTitle}>
                    Exportable Focus Sessions ({acceptedExportInfo?.validSessions?.length || 0})
                  </div>
                  <div style={styles.previewTableWrapper}>
                    <table style={styles.previewTable}>
                      <thead>
                        <tr>
                          <th style={styles.previewTh}>Date</th>
                          <th style={styles.previewTh}>Time Slot</th>
                          <th style={styles.previewTh}>Session / Task</th>
                          <th style={styles.previewTh}>Category</th>
                          <th style={styles.previewTh}>Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acceptedExportInfo?.validSessions?.map((s, sIdx) => (
                          <tr key={s.uid || sIdx} style={styles.previewTr}>
                            <td style={styles.previewTdDate}><code>{s.date}</code></td>
                            <td style={styles.previewTdTime}>
                              <span style={styles.timePill}>🕒 {s.startTime} – {s.endTime}</span>
                            </td>
                            <td style={styles.previewTdTitle}>
                              <strong>{s.summary}</strong>
                            </td>
                            <td style={styles.previewTdCat}>
                              <span style={styles.catPill}>{s.category || 'General'}</span>
                            </td>
                            <td style={styles.previewTdHours}>
                              {s.hours ? `${s.hours}h` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div style={styles.noAcceptedBox}>
                <div style={styles.noAcceptedIcon}>📅</div>
                <div style={styles.noAcceptedTitle}>No Accepted Schedule Available</div>
                <div style={styles.noAcceptedText}>
                  Calendar export generates files strictly from an <strong>accepted</strong> schedule.
                  Unaccepted proposals or in-progress draft edits cannot be exported.
                </div>
                <div style={styles.noAcceptedStepList}>
                  <div>1. Review proposed sprint allocations on the <strong>Schedule Proposal</strong> tab.</div>
                  <div>2. Make any adjustments needed or accept as proposed.</div>
                  <div>3. Click <strong>Apply Schedule</strong> to accept.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('proposal')}
                  style={styles.reviewProposalBtn}
                >
                  ← Return to Schedule Proposal
                </button>
              </div>
            )}

            {/* Footer */}
            <div style={styles.footer}>
              <button
                type="button"
                onClick={() => setActiveTab('proposal')}
                style={styles.discardBtn}
              >
                ← Return to Schedule Proposal
              </button>
              <button type="button" onClick={onClose} style={styles.discardBtn}>
                Close Modal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderStrategyMetrics(evalReport) {
  if (!evalReport) return <div>No data available</div>;

  const df = evalReport.deadlineFeasibility || {};
  const dep = evalReport.dependencyCorrectness || {};
  const cap = evalReport.capacityCompliance || {};
  const wb = evalReport.workloadBalance || {};
  const tc = evalReport.taskCoverage || {};

  const onTimeDisplay = df.schedulableOnTimeRate !== null && df.schedulableOnTimeRate !== undefined
    ? `${(df.schedulableOnTimeRate * 100).toFixed(0)}% (${df.onTimeCount}/${df.schedulableDeadlinesCount}${df.impossibleDeadlinesCount > 0 ? ` + ${df.impossibleDeadlinesCount} blocked` : ''})`
    : df.onTimeRate !== null
      ? `${(df.onTimeRate * 100).toFixed(0)}% (${df.onTimeCount}/${df.tasksWithDeadline})`
      : 'N/A (No Deadlines)';

  const delayDisplay = df.averageSchedulerDaysDelayed !== undefined && df.wasOverdueCount > 0
    ? `${df.averageSchedulerDaysDelayed}d sched (${df.averageDaysDelayed}d raw)`
    : df.averageDaysDelayed > 0
      ? `${df.averageDaysDelayed}d`
      : '0d (None)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
      <div style={styles.metricRow}>
        <span style={styles.metricRowLabel}>Deadline On-Time:</span>
        <span style={{ fontWeight: '700', color: (df.schedulableOnTimeRate === 1.0 || df.onTimeRate === 1.0) ? '#1B5E3C' : '#9E2A2B' }}>
          {onTimeDisplay}
        </span>
      </div>
      <div style={styles.metricRow}>
        <span style={styles.metricRowLabel}>Avg Delay:</span>
        <span style={{ fontWeight: '700' }}>
          {delayDisplay}
        </span>
      </div>
      <div style={styles.metricRow}>
        <span style={styles.metricRowLabel}>Dependency Integrity:</span>
        <span style={{ fontWeight: '700', color: dep.violatedCount === 0 ? '#1B5E3C' : '#9E2A2B' }}>
          {dep.violatedCount === 0 ? '✓ 100% Satisfied' : `⚠️ ${dep.violatedCount} Violated`}
        </span>
      </div>
      <div style={styles.metricRow}>
        <span style={styles.metricRowLabel}>Capacity Utilization:</span>
        <span style={{ fontWeight: '700' }}>
          {cap.capacityUtilizationPercent}% ({cap.totalWorkloadHours}h / {cap.totalCapacityHours}h)
        </span>
      </div>
      <div style={styles.metricRow}>
        <span style={styles.metricRowLabel}>Overrun Violations:</span>
        <span style={{ fontWeight: '700', color: cap.overrunDaysCount === 0 ? '#1B5E3C' : '#9E2A2B' }}>
          {cap.overrunDaysCount === 0 ? '✓ 0 Days Over' : `⚠️ ${cap.overrunDaysCount} Days Over`}
        </span>
      </div>
      <div style={styles.metricRow}>
        <span style={styles.metricRowLabel}>Daily Imbalance (CV):</span>
        <span style={{ fontWeight: '700' }}>
          {wb.imbalanceCV ? wb.imbalanceCV.toFixed(3) : '0.000'} (μ: {wb.meanDailyHours || 0}h)
        </span>
      </div>
      <div style={styles.metricRow}>
        <span style={styles.metricRowLabel}>Task Breakdown:</span>
        <span style={{ fontWeight: '600', color: '#52525B' }}>
          {tc.scheduledCount} Sched, {tc.blockedCount} Block, {tc.oversizedCount} Over
        </span>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(37, 36, 42, 0.5)',
    backdropFilter: 'blur(3px)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  modal: {
    backgroundColor: '#FFF8EF',
    border: '2px solid #25242A',
    boxShadow: '6px 6px 0px #25242A',
    borderRadius: '16px',
    maxWidth: '920px',
    width: '100%',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    color: '#25242A',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '20px 28px 14px',
    borderBottom: '2px solid rgba(37, 36, 42, 0.08)',
    backgroundColor: '#FFFFFF',
  },
  headerTitleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  tagRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '2px',
  },
  superBadge: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#71717A',
    backgroundColor: '#F4F4F5',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #E4E4E7',
  },
  feasibilityBadge: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '2px 8px',
    borderRadius: '6px',
    border: '1.5px solid',
  },
  mlActiveBadge: {
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#F3EEFF',
    color: '#5B44BA',
    border: '1px solid #C9B6FF',
    padding: '2px 8px',
    borderRadius: '6px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '800',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '13px',
    color: '#52525B',
    margin: 0,
  },
  closeBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#71717A',
    padding: '4px 8px',
    borderRadius: '6px',
  },
  navTabBar: {
    display: 'flex',
    gap: '8px',
    padding: '10px 28px',
    backgroundColor: '#FFFFFF',
    borderBottom: '2px solid #25242A',
  },
  navTabBtn: {
    padding: '6px 14px',
    borderRadius: '8px',
    border: '1.5px solid #25242A',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  navTabBtnActive: {
    backgroundColor: '#25242A',
    color: '#FFF8EF',
    boxShadow: '2px 2px 0px rgba(37, 36, 42, 0.4)',
  },
  navTabBtnInactive: {
    backgroundColor: '#FFFDF9',
    color: '#52525B',
  },
  staleBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 28px',
    backgroundColor: '#FFF9DB',
    borderBottom: '1.5px solid #F59E0B',
    gap: '12px',
    fontSize: '12px',
    color: '#92400E',
  },
  staleText: {
    flex: 1,
  },
  regenerateBtn: {
    backgroundColor: '#FFFFFF',
    color: '#92400E',
    border: '1.5px solid #F59E0B',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  configBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 28px',
    backgroundColor: '#FFFDF9',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
    flexWrap: 'wrap',
  },
  configItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  configLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#25242A',
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  numInput: {
    width: '56px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #25242A',
    borderRadius: '6px',
    padding: '4px 6px',
    fontSize: '12px',
    fontWeight: '700',
    fontFamily: 'inherit',
    textAlign: 'center',
  },
  inputUnit: {
    fontSize: '11px',
    color: '#71717A',
    fontWeight: '600',
  },
  selectInput: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #25242A',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'inherit',
    outline: 'none',
  },
  toggleBtn: {
    border: '1.5px solid #25242A',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  toggleBtnActive: {
    backgroundColor: '#D4F0E2',
    color: '#1B5E3C',
  },
  toggleBtnInactive: {
    backgroundColor: '#F4F4F5',
    color: '#71717A',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '10px',
    padding: '14px 28px',
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
  },
  metricCard: {
    backgroundColor: '#FFFDF9',
    border: '1px solid rgba(37, 36, 42, 0.12)',
    borderRadius: '8px',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  metricVal: {
    fontSize: '18px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
  },
  metricLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#71717A',
    marginTop: '2px',
  },
  cycleAlert: {
    margin: '12px 28px 0',
    padding: '10px 14px',
    backgroundColor: '#F3EEFF',
    border: '1.5px solid #C9B6FF',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#5B44BA',
  },
  listContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '14px 28px',
  },
  listHeaderRow: {
    display: 'flex',
    fontSize: '11px',
    fontWeight: '800',
    color: '#71717A',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    paddingBottom: '8px',
    borderBottom: '1.5px solid rgba(37, 36, 42, 0.1)',
  },
  scrollList: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '8px',
    paddingRight: '4px',
  },
  taskRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid rgba(37, 36, 42, 0.1)',
    borderRadius: '8px',
    transition: 'background-color 0.15s ease',
  },
  taskRowShifted: {
    backgroundColor: '#FFFDF0',
    border: '1.5px solid #FCD34D',
  },
  taskTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  priorityIndicator: (priority) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor:
      priority === 'high' ? '#FF8F82' : priority === 'medium' ? '#F59E0B' : '#94A3B8',
  }),
  taskTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#25242A',
  },
  categoryTag: {
    fontSize: '10px',
    fontWeight: '600',
    backgroundColor: '#F4F4F5',
    color: '#52525B',
    padding: '1px 5px',
    borderRadius: '4px',
  },
  explanationText: {
    fontSize: '11px',
    color: '#71717A',
    lineHeight: 1.3,
  },
  conflictText: {
    fontSize: '11px',
    color: '#D9483B',
    fontWeight: '600',
    marginTop: '2px',
  },
  shiftedDateBadge: {
    backgroundColor: '#FEF3C7',
    color: '#B45309',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #FCD34D',
  },
  effortBadge: (source) => ({
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: source === 'personalized' ? '#F3EEFF' : '#F4F4F5',
    color: source === 'personalized' ? '#5B44BA' : '#52525B',
    padding: '2px 6px',
    borderRadius: '4px',
    border: source === 'personalized' ? '1px solid #C9B6FF' : '1px solid #E4E4E7',
  }),
  statusPill: {
    fontSize: '11px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '6px',
    display: 'inline-block',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 28px',
    backgroundColor: '#FFFFFF',
    borderTop: '2px solid rgba(37, 36, 42, 0.08)',
  },
  footerNote: {
    fontSize: '12px',
    color: '#52525B',
  },
  btnRow: {
    display: 'flex',
    gap: '12px',
  },
  discardBtn: {
    backgroundColor: '#F4F4F5',
    color: '#52525B',
    border: '1.5px solid #D4D4D8',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  applyBtn: {
    backgroundColor: '#FFE58A',
    color: '#25242A',
    border: '2px solid #25242A',
    boxShadow: '2px 2px 0px #25242A',
    borderRadius: '8px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: '800',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'transform 0.1s ease',
  },
  applyBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },

  // BENCHMARK STYLES
  benchmarkContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    padding: '16px 28px',
    gap: '14px',
  },
  scenarioBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #25242A',
    borderRadius: '8px',
    boxShadow: '2px 2px 0px #25242A',
    flexWrap: 'wrap',
    gap: '10px',
  },
  scenarioSelect: {
    backgroundColor: '#FFFDF9',
    border: '1.5px solid #25242A',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    fontWeight: '700',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  scenarioMetaBadge: {
    fontSize: '11px',
    fontWeight: '800',
    backgroundColor: '#FFF3C4',
    color: '#92400E',
    border: '1px solid #F59E0B',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  strategyCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  stratCard: {
    backgroundColor: '#FFFFFF',
    border: '2px solid',
    borderRadius: '10px',
    boxShadow: '3px 3px 0px #25242A',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  stratCardHeader: {
    padding: '10px 14px',
    borderBottom: '1.5px solid',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  stratBadgeWrap: {
    display: 'flex',
    marginBottom: '2px',
  },
  recommendedBadge: {
    fontSize: '9px',
    fontWeight: '800',
    backgroundColor: '#1B5E3C',
    color: '#FFFFFF',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.04em',
  },
  baselineBadge: {
    fontSize: '9px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.04em',
  },
  stratTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '800',
    color: '#25242A',
  },
  stratSubtitle: {
    fontSize: '11px',
    color: '#71717A',
  },
  stratBody: {
    padding: '12px 14px',
    flex: 1,
    backgroundColor: '#FFFDF9',
  },
  metricRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '3px 0',
    borderBottom: '1px dashed rgba(37, 36, 42, 0.08)',
  },
  metricRowLabel: {
    color: '#71717A',
    fontWeight: '600',
  },
  tradeoffBox: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #25242A',
    borderRadius: '8px',
    boxShadow: '2px 2px 0px #25242A',
    padding: '12px 16px',
  },
  stabilityBox: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #25242A',
    borderRadius: '8px',
    boxShadow: '2px 2px 0px #25242A',
    padding: '12px 16px',
  },
  churnScoreBadge: {
    fontSize: '11px',
    fontWeight: '800',
    backgroundColor: '#F3EEFF',
    color: '#5B44BA',
    border: '1px solid #C9B6FF',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  perturbationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    fontSize: '11px',
  },
  perturbationItem: {
    backgroundColor: '#FFFDF9',
    border: '1px solid #E4E4E7',
    borderRadius: '6px',
    padding: '6px 10px',
    display: 'flex',
    justifyContent: 'space-between',
  },
  disclosureBox: {
    fontSize: '11px',
    color: '#71717A',
    lineHeight: 1.4,
    backgroundColor: '#F4F4F5',
    border: '1px solid #E4E4E7',
    borderRadius: '6px',
    padding: '8px 12px',
  },
  feedbackContainer: {
    padding: '20px 28px',
    overflowY: 'auto',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    backgroundColor: '#FFFDF9',
  },
  feedbackSufficiencyBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 16px',
    backgroundColor: '#FEF3C7',
    border: '1.5px solid #F59E0B',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#92400E',
    lineHeight: 1.45,
  },
  feedbackSufficiencyBannerPositive: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 16px',
    backgroundColor: '#DCFCE7',
    border: '1.5px solid #22C55E',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#166534',
    lineHeight: 1.45,
  },
  feedbackCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '12px',
  },
  feedbackCard: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #25242A',
    boxShadow: '2px 2px 0px #25242A',
    borderRadius: '8px',
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  feedbackCardHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  feedbackCardSuper: {
    fontSize: '9px',
    fontWeight: '800',
    color: '#71717A',
    letterSpacing: '0.05em',
  },
  feedbackCardTitle: {
    fontSize: '12px',
    fontWeight: '800',
    color: '#25242A',
  },
  feedbackCardValue: {
    fontSize: '22px',
    fontWeight: '900',
    color: '#25242A',
    margin: '4px 0 2px',
    letterSpacing: '-0.02em',
  },
  feedbackCardSubtext: {
    fontSize: '11px',
    color: '#52525B',
    lineHeight: 1.3,
  },
  feedbackCardFootnote: {
    fontSize: '10px',
    color: '#71717A',
    marginTop: '4px',
    fontStyle: 'italic',
  },
  feedbackDetailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  feedbackDetailBox: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #25242A',
    boxShadow: '2px 2px 0px #25242A',
    borderRadius: '8px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '220px',
  },
  feedbackDetailBoxTitle: {
    fontWeight: '800',
    fontSize: '12px',
    color: '#25242A',
    borderBottom: '1px solid #E4E4E7',
    paddingBottom: '6px',
  },
  feedbackEmptyNotice: {
    fontSize: '11px',
    color: '#71717A',
    fontStyle: 'italic',
    padding: '12px 0',
    textAlign: 'center',
  },
  feedbackScrollList: {
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  feedbackListItem: {
    backgroundColor: '#FFFDF9',
    border: '1px solid #E4E4E7',
    borderRadius: '6px',
    padding: '6px 10px',
  },
  cautiousBoundaryBox: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #1B5E3C',
    boxShadow: '2px 2px 0px #1B5E3C',
    borderRadius: '8px',
    padding: '12px 16px',
  },
  conceptGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    borderTop: '1px dashed #A5D6A7',
    paddingTop: '8px',
  },
  conceptItem: {
    fontSize: '10px',
    color: '#52525B',
    lineHeight: 1.35,
  },
  diagnosticsBox: {
    backgroundColor: '#F9FAFB',
    border: '1.5px solid #E5E7EB',
    borderRadius: '8px',
    padding: '10px 14px',
  },
  diagnosticsPillsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px',
  },
  diagnosticPill: {
    fontSize: '10px',
    fontWeight: '700',
    backgroundColor: '#FFFFFF',
    border: '1px solid #D1D5DB',
    color: '#4B5563',
    padding: '2px 8px',
    borderRadius: '4px',
  },

  // Phase 6.3: Interactive Proposal Editing Styles
  draftEditBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 28px',
    backgroundColor: '#FFFDF9',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
    flexWrap: 'wrap',
    gap: '8px',
  },
  draftEditLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  draftActiveBadge: {
    fontSize: '12px',
    color: '#1E40AF',
    backgroundColor: '#EFF6FF',
    border: '1px solid #BFDBFE',
    padding: '3px 8px',
    borderRadius: '6px',
    fontWeight: '600',
  },
  draftHint: {
    fontSize: '12px',
    color: '#71717A',
  },
  draftEditActions: {
    display: 'flex',
    gap: '8px',
  },
  undoBtn: {
    backgroundColor: '#FFFFFF',
    color: '#25242A',
    border: '1.5px solid #25242A',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  undoBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
    borderColor: '#D4D4D8',
    color: '#A1A1AA',
  },
  revertBtn: {
    backgroundColor: '#FFFFFF',
    color: '#9E2A2B',
    border: '1.5px solid #9E2A2B',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  revertBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
    borderColor: '#D4D4D8',
    color: '#A1A1AA',
  },
  feedbackAlert: {
    margin: '8px 28px 0',
    padding: '6px 14px',
    backgroundColor: '#ECFDF5',
    border: '1px solid #A7F3D0',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#065F46',
    fontWeight: '600',
  },
  editRowBtn: {
    backgroundColor: '#FFFDF9',
    color: '#25242A',
    border: '1.5px solid rgba(37, 36, 42, 0.2)',
    borderRadius: '6px',
    padding: '3px 8px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  inlineEditPanel: {
    marginTop: '6px',
    marginBottom: '6px',
    padding: '10px 14px',
    backgroundColor: '#FFFDF5',
    border: '1.5px solid #F59E0B',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    boxSizing: 'border-box',
  },
  inlineEditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  inlineField: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  inlineLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#25242A',
  },
  inlineInput: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #25242A',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'inherit',
  },
  inlineBtnRow: {
    display: 'flex',
    gap: '6px',
    marginLeft: 'auto',
  },
  inlineSaveBtn: {
    backgroundColor: '#D4F0E2',
    color: '#1B5E3C',
    border: '1.5px solid #27754E',
    borderRadius: '6px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  inlineCancelBtn: {
    backgroundColor: '#F4F4F5',
    color: '#52525B',
    border: '1.5px solid #D4D4D8',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  inlineErrorBox: {
    padding: '6px 10px',
    backgroundColor: '#FFE5E0',
    border: '1px solid #FF8F82',
    borderRadius: '6px',
    fontSize: '11px',
    color: '#9E2A2B',
  },
  exportContainer: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  exportHeaderCard: {
    backgroundColor: '#FFFDF9',
    border: '2px solid #25242A',
    borderRadius: '12px',
    padding: '18px 20px',
    boxShadow: '3px 3px 0px #25242A',
  },
  exportTitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '8px',
  },
  exportTag: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.08em',
    color: '#8B5CF6',
    textTransform: 'uppercase',
  },
  exportTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#25242A',
    margin: '2px 0 0 0',
  },
  exportStatusBadge: {
    backgroundColor: '#D4F0E2',
    color: '#1B5E3C',
    border: '1.5px solid #27754E',
    borderRadius: '20px',
    padding: '4px 10px',
    fontSize: '11px',
    fontWeight: '700',
  },
  exportDescription: {
    fontSize: '12px',
    color: '#52525B',
    lineHeight: 1.5,
    margin: 0,
  },
  exportNoticeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  exportNoticeBox: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #E4E4E7',
    borderRadius: '10px',
    padding: '12px 14px',
    boxShadow: '2px 2px 0px rgba(37,36,42,0.06)',
  },
  exportNoticeTitle: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#25242A',
    marginBottom: '4px',
  },
  exportNoticeText: {
    fontSize: '11px',
    color: '#52525B',
    lineHeight: 1.4,
  },
  acceptedScheduleBox: {
    backgroundColor: '#FFFFFF',
    border: '2px solid #25242A',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '4px 4px 0px #25242A',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  acceptedMetricsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    backgroundColor: '#FBFBFD',
    border: '1px solid #E4E4E7',
    borderRadius: '8px',
    padding: '10px 14px',
  },
  acceptedMetricItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  acceptedMetricLabel: {
    fontSize: '10px',
    color: '#71717A',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  acceptedMetricVal: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#25242A',
  },
  tzOptionRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '11px',
    color: '#3F3F46',
  },
  tzOptionLabel: {
    display: 'flex',
    alignItems: 'center',
    fontWeight: '600',
    cursor: 'pointer',
  },
  tzOptionHint: {
    fontSize: '10px',
    color: '#71717A',
    marginLeft: '24px',
  },
  exportAlert: {
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: 1.4,
  },
  exportAlertSuccess: {
    backgroundColor: '#D4F0E2',
    color: '#1B5E3C',
    border: '1.5px solid #27754E',
  },
  exportAlertWarning: {
    backgroundColor: '#FFF3C4',
    color: '#92400E',
    border: '1.5px solid #F59E0B',
  },
  exportAlertError: {
    backgroundColor: '#FFE5E0',
    color: '#9E2A2B',
    border: '1.5px solid #FF8F82',
  },
  exportActionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  downloadIcsBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: '2px solid #25242A',
    borderRadius: '10px',
    padding: '10px 20px',
    fontSize: '13px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '3px 3px 0px #FF8F82',
    fontFamily: 'inherit',
    transition: 'transform 0.1s ease',
  },
  previewSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  previewTitle: {
    fontSize: '12px',
    fontWeight: '800',
    color: '#25242A',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  previewTableWrapper: {
    maxHeight: '260px',
    overflowY: 'auto',
    border: '1.5px solid #E4E4E7',
    borderRadius: '8px',
  },
  previewTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '11px',
    textAlign: 'left',
  },
  previewTh: {
    backgroundColor: '#F4F4F5',
    padding: '8px 10px',
    fontWeight: '800',
    color: '#3F3F46',
    borderBottom: '1.5px solid #E4E4E7',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  previewTr: {
    borderBottom: '1px solid #F4F4F5',
  },
  previewTdDate: {
    padding: '6px 10px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  previewTdTime: {
    padding: '6px 10px',
    whiteSpace: 'nowrap',
  },
  previewTdTitle: {
    padding: '6px 10px',
    color: '#25242A',
  },
  previewTdCat: {
    padding: '6px 10px',
  },
  previewTdHours: {
    padding: '6px 10px',
    fontWeight: '700',
    color: '#52525B',
  },
  catPill: {
    display: 'inline-block',
    padding: '2px 6px',
    backgroundColor: '#F3EEFF',
    color: '#5B44BA',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '700',
  },
  noAcceptedBox: {
    backgroundColor: '#FFFDF9',
    border: '2px dashed #D4D4D8',
    borderRadius: '12px',
    padding: '36px 24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  noAcceptedIcon: {
    fontSize: '36px',
  },
  noAcceptedTitle: {
    fontSize: '16px',
    fontWeight: '800',
    color: '#25242A',
  },
  noAcceptedText: {
    fontSize: '12px',
    color: '#52525B',
    maxWidth: '460px',
    lineHeight: 1.5,
  },
  noAcceptedStepList: {
    fontSize: '11px',
    color: '#71717A',
    textAlign: 'left',
    lineHeight: 1.6,
    margin: '6px 0',
  },
  reviewProposalBtn: {
    backgroundColor: '#25242A',
    color: '#FFFFFF',
    border: '2px solid #25242A',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '2px 2px 0px #FFE58A',
  },
  exportQuickBtn: {
    backgroundColor: '#FFFDF9',
    color: '#25242A',
    border: '2px solid #25242A',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '2px 2px 0px #C9B6FF',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  exportDraftWarning: {
    backgroundColor: '#FEF3C7',
    border: '2px solid #F59E0B',
    borderRadius: '10px',
    padding: '12px 16px',
    marginBottom: '16px',
    fontSize: '12px',
    color: '#92400E',
    lineHeight: 1.5,
  },
  pairwisePreferenceBox: {
    backgroundColor: '#F8FAFC',
    border: '2px solid #CBD5E1',
    borderRadius: '10px',
    padding: '12px 16px',
    marginTop: '12px',
    marginBottom: '12px',
  },
  preferenceBtn: {
    backgroundColor: '#FFFFFF',
    color: '#1E293B',
    border: '1.5px solid #94A3B8',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '11px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },
  preferenceFeedbackBanner: {
    marginTop: '8px',
    padding: '6px 10px',
    backgroundColor: '#E0F2FE',
    border: '1px solid #7DD3FC',
    borderRadius: '6px',
    fontSize: '11px',
    color: '#0369A1',
    fontWeight: '600',
  },
  preferencePausedBanner: {
    marginBottom: '10px',
    padding: '8px 12px',
    backgroundColor: '#FFFBEB',
    border: '1.5px solid #FCD34D',
    borderRadius: '6px',
    fontSize: '11px',
    color: '#92400E',
    lineHeight: 1.4,
  },
};
