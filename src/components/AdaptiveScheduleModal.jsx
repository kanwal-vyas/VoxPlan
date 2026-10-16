import React, { useState, useMemo } from 'react';
import { generateAdaptiveSchedule, formatDateISO } from '../scheduler/adaptiveScheduler';

export default function AdaptiveScheduleModal({
  tasks = [],
  personalDurationModel = null,
  guardedPredictionsMap = {},
  isOpen = false,
  onClose,
  onApplySchedule,
}) {
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

  if (!isOpen || !proposal) return null;

  const summary = proposal.summary || {};
  const placements = proposal.proposedPlacements || proposal.placements || [];
  const cycles = summary.cycles || [];
  const cycleDetected = summary.cycleDetected || cycles.length > 0;

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
              Adaptive Sprint <span className="hl hl-butter">Proposal</span>
            </h2>
            <p style={styles.subtitle}>{badge.desc}</p>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Close modal">
            ✕
          </button>
        </div>

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
                style={styles.numberInput}
              />
              <span style={styles.inputUnit}>hrs</span>
            </div>
          </div>

          <div style={styles.configItem}>
            <label style={styles.configLabel} htmlFor="horizon-select">
              Planning Horizon:
            </label>
            <select
              id="horizon-select"
              value={horizonDays}
              onChange={(e) => setHorizonDays(parseInt(e.target.value, 10) || 14)}
              style={styles.selectInput}
            >
              <option value="7">7 Days (1 Week)</option>
              <option value="14">14 Days (2 Weeks)</option>
              <option value="21">21 Days (3 Weeks)</option>
              <option value="30">30 Days (1 Month)</option>
            </select>
          </div>

          <div style={styles.configItem}>
            <label style={styles.configLabel} htmlFor="personal-model-check">
              Duration Basis:
            </label>
            <button
              id="personal-model-check"
              type="button"
              onClick={() => setUsePersonalModel((prev) => !prev)}
              style={{
                ...styles.toggleBtn,
                ...(usePersonalModel ? styles.toggleBtnActive : styles.toggleBtnInactive),
              }}
            >
              {usePersonalModel ? 'Personal Duration (Learned)' : 'Original Cold-Start'}
            </button>
          </div>
        </div>

        {/* Metrics Overview Ribbon */}
        <div style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <span style={styles.metricVal}>{summary.scheduledCount || 0} / {summary.totalEligibleTasks || 0}</span>
            <span style={styles.metricLabel}>Tasks Scheduled</span>
          </div>
          <div style={styles.metricCard}>
            <span style={{ ...styles.metricVal, color: changesCount > 0 ? '#B45309' : '#27754E' }}>
              {changesCount}
            </span>
            <span style={styles.metricLabel}>Proposed Date Shifts</span>
          </div>
          <div style={styles.metricCard}>
            <span style={{ ...styles.metricVal, color: (summary.missedDeadlineCount || 0) > 0 ? '#D9483B' : '#27754E' }}>
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

        {/* Cycle Alert Banner if present */}
        {cycleDetected && (
          <div style={styles.cycleAlert}>
            ⚠️ <strong>Circular Dependency Detected:</strong>
            {cycles.length > 0 ? (
              <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '11px' }}>
                {cycles.map((c, i) => (
                  <div key={i}>• Cycle {i + 1}: {c.join(' ➔ ')}</div>
                ))}
              </div>
            ) : null}
            <div style={{ marginTop: '4px' }}>
              Affected tasks are isolated and marked as <em>Blocked</em> rather than given a fabricated schedule.
            </div>
          </div>
        )}

        {/* Schedule Placements List */}
        <div style={styles.listContainer}>
          <div style={styles.listHeaderRow}>
            <span style={{ flex: 3 }}>Task & Explanation</span>
            <span style={{ flex: 1.5, textAlign: 'center' }}>Original Due</span>
            <span style={{ flex: 1.5, textAlign: 'center' }}>Proposed Due</span>
            <span style={{ flex: 1.2, textAlign: 'center' }}>Effort</span>
            <span style={{ flex: 1.3, textAlign: 'right' }}>Status</span>
          </div>

          <div style={styles.scrollList}>
            {placements.map((p) => {
              const isShifted = p.isDateChanged && p.proposedDate !== null;
              let statusPillStyle = { backgroundColor: '#D4F0E2', color: '#1B5E3C' };
              let statusLabel = 'On Time';

              if (p.status === 'deadline_missed') {
                statusPillStyle = { backgroundColor: '#FFE5E0', color: '#9E2A2B' };
                statusLabel = 'Late';
              } else if (p.status === 'overdue_at_start') {
                statusPillStyle = { backgroundColor: '#FFF3C4', color: '#92400E' };
                statusLabel = 'Was Overdue';
              } else if (p.status === 'blocked_by_dependency') {
                statusPillStyle = { backgroundColor: '#F3EEFF', color: '#5B44BA' };
                statusLabel = 'Blocked';
              } else if (p.status === 'oversized_exceeds_capacity') {
                statusPillStyle = { backgroundColor: '#FEF3C7', color: '#B45309' };
                statusLabel = 'Manual Resolution';
              } else if (p.status === 'unscheduled') {
                statusPillStyle = { backgroundColor: '#F1F5F9', color: '#64748B' };
                statusLabel = 'Unscheduled';
              }

              return (
                <div key={p.taskId} style={{ ...styles.taskRow, ...(isShifted ? styles.taskRowShifted : {}) }}>
                  <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={styles.taskTitleRow}>
                      <span style={styles.priorityIndicator(p.taskPriority)} />
                      <span style={styles.taskTitle}>{p.taskTitle}</span>
                      {p.taskCategory && (
                        <span style={styles.categoryTag}>{p.taskCategory}</span>
                      )}
                    </div>
                    <span style={styles.explanationText}>
                      {p.explanation || p.placementReason}
                    </span>
                    {p.conflicts && p.conflicts.length > 0 && (
                      <div style={styles.conflictText}>
                        ⚠️ {p.conflicts[0]}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1.5, textAlign: 'center', fontSize: '12px', color: '#6B7280' }}>
                    {p.originalDueDate || 'None'}
                  </div>

                  <div style={{ flex: 1.5, textAlign: 'center', fontSize: '13px', fontWeight: '600', color: isShifted ? '#B45309' : '#25242A' }}>
                    {p.proposedDate ? (
                      <span style={isShifted ? styles.shiftedDateBadge : {}}>
                        {p.proposedDate}
                      </span>
                    ) : (
                      <span style={{ color: '#94A3B8' }}>—</span>
                    )}
                  </div>

                  <div style={{ flex: 1.2, textAlign: 'center', fontSize: '12px' }}>
                    <span style={styles.effortBadge(p.durationSource)}>
                      {p.effectiveHours}h
                    </span>
                    <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                      {p.durationSource === 'personalized' ? 'Learned' : 'Original'}
                    </div>
                  </div>

                  <div style={{ flex: 1.3, textAlign: 'right' }}>
                    <span style={{ ...styles.statusPill, ...statusPillStyle }}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              );
            })}
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
    maxWidth: '860px',
    width: '100%',
    maxHeight: '90vh',
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
    padding: '22px 28px 16px',
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
    color: '#52525B',
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid #25242A',
    borderRadius: '6px',
    padding: '2px 6px',
  },
  numberInput: {
    width: '48px',
    border: 'none',
    outline: 'none',
    fontSize: '13px',
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
};
