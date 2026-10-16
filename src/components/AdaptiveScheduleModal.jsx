import React, { useState, useMemo } from 'react';
import { generateAdaptiveSchedule, formatDateISO } from '../scheduler/adaptiveScheduler';
import { compareScheduleStrategies } from '../scheduler/scheduleEvaluator';
import { BENCHMARK_SCENARIOS, runStabilityBenchmark } from '../scheduler/scheduleBenchmarks';

export default function AdaptiveScheduleModal({
  tasks = [],
  personalDurationModel = null,
  guardedPredictionsMap = {},
  isOpen = false,
  onClose,
  onApplySchedule,
}) {
  const [activeTab, setActiveTab] = useState('proposal'); // 'proposal' | 'benchmark'
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('current');
  const [dailyCapacityHours, setDailyCapacityHours] = useState(6.0);
  const [horizonDays, setHorizonDays] = useState(14);
  const [usePersonalModel, setUsePersonalModel] = useState(true);
  const [todayStr] = useState(() => formatDateISO(new Date()));

  const currentTasksHash = useMemo(() => {
    return JSON.stringify(
      (tasks || []).map((t) => [t.id, t.dueDate, t.completed, t.estimatedEffort, t.dependencies])
    );
  }, [tasks]);

  const [cachedSnapshotHash, setCachedSnapshotHash] = useState(currentTasksHash);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  // Synchronize snapshot hash whenever modal opens
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setCachedSnapshotHash(currentTasksHash);
    }
  }

  // Detect if tasks were modified while the proposal modal was open
  const isStale = Boolean(isOpen && cachedSnapshotHash && currentTasksHash !== cachedSnapshotHash);

  // Compute deterministic schedule proposal based on current inputs
  const proposal = useMemo(() => {
    if (!isOpen) return null;
    const modelToUse = usePersonalModel ? personalDurationModel : null;
    return generateAdaptiveSchedule(tasks, {
      dailyCapacityHours: Number(dailyCapacityHours) || 6.0,
      horizonDays: Number(horizonDays) || 14,
      personalDurationModel: modelToUse,
      guardedPredictionsMap,
      startDate: todayStr,
      strategy: 'adaptive',
    });
  }, [
    tasks,
    personalDurationModel,
    guardedPredictionsMap,
    isOpen,
    dailyCapacityHours,
    horizonDays,
    usePersonalModel,
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

  // Compute perturbation stability metrics
  const stabilityReport = useMemo(() => {
    if (!isOpen || activeTab !== 'benchmark') return null;
    return runStabilityBenchmark('adaptive');
  }, [isOpen, activeTab]);

  if (!isOpen || !proposal) return null;

  const summary = proposal.summary || {};
  const placements = proposal.proposedPlacements || proposal.placements || [];
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

  const handleApply = () => {
    if (isStale) return;
    if (onApplySchedule) {
      onApplySchedule(proposal);
    }
    onClose();
  };

  const handleRegenerate = () => {
    setCachedSnapshotHash(currentTasksHash);
  };

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
    <div style={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
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
          <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Close modal">
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

            {/* Placements List */}
            <div style={styles.listContainer}>
              <div style={styles.listHeaderRow}>
                <span style={{ flex: 3 }}>Task & Priority</span>
                <span style={{ flex: 1.5 }}>Original Due</span>
                <span style={{ flex: 1.5 }}>Proposed Date</span>
                <span style={{ flex: 1.2 }}>Effort</span>
                <span style={{ flex: 1.3, textAlign: 'right' }}>Status</span>
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
                    } else if (p.status === 'unscheduled') {
                      statusLabel = 'Unscheduled';
                      statusPillStyle = { backgroundColor: '#F4F4F5', color: '#71717A' };
                    }

                    return (
                      <div
                        key={p.taskId}
                        style={{
                          ...styles.taskRow,
                          ...(isShifted ? styles.taskRowShifted : {}),
                          ...(isBlocked || isOversized ? { opacity: 0.85, borderStyle: 'dashed' } : {}),
                        }}
                      >
                        <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={styles.taskTitleRow}>
                            <span style={styles.priorityIndicator(p.taskPriority)} />
                            <span style={styles.taskTitle}>{p.taskTitle}</span>
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

                        <div style={{ flex: 1.5, fontSize: '12px', color: '#71717A' }}>
                          {p.originalDueDate || '—'}
                        </div>

                        <div style={{ flex: 1.5, fontSize: '12px', fontWeight: '700' }}>
                          {p.proposedDate ? (
                            isShifted ? (
                              <span style={styles.shiftedDateBadge}>{p.proposedDate}</span>
                            ) : (
                              <span>{p.proposedDate}</span>
                            )
                          ) : (
                            <span style={{ color: '#9E2A2B', fontStyle: 'italic' }}>Unscheduled</span>
                          )}
                        </div>

                        <div style={{ flex: 1.2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={styles.effortBadge(p.durationSource)}>
                              {p.effectiveHours.toFixed(1)}h
                            </span>
                            {p.appliedRatio !== 1.0 && p.durationSource === 'personalized' && (
                              <span style={{ fontSize: '10px', color: '#5B44BA', fontWeight: '700' }}>
                                ({(p.appliedRatio).toFixed(2)}x)
                              </span>
                            )}
                          </div>
                        </div>

                        <div style={{ flex: 1.3, textAlign: 'right' }}>
                          <span style={{ ...styles.statusPill, ...statusPillStyle }}>
                            {statusLabel}
                          </span>
                        </div>
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
                <button type="button" onClick={onClose} style={styles.discardBtn}>
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
};
