import React, { useMemo, useState } from 'react';
import {
  analyzePreferenceSignals,
  EVIDENCE_LEVELS,
} from '../scheduler/preferenceAnalyzer';

/**
 * PreferenceSignalsCard (Phase 7.2)
 *
 * Displays empirical friction profiling and candidate preference signals derived
 * from local telemetry, enforcing strict statistical restraint when Phase 7.1
 * maturity gates are unmet.
 *
 * Scope Boundary: Purely descriptive and diagnostic. Does not modify scheduler weights.
 */
export default function PreferenceSignalsCard({ events = [], tasks = [] }) {
  const [expandedSignalId, setExpandedSignalId] = useState(null);

  const analysis = useMemo(() => {
    return analyzePreferenceSignals({ events, tasks });
  }, [events, tasks]);

  const {
    readiness,
    frictionProfile,
    candidateSignals,
    unavailableSignalFamilies,
    governance,
  } = analysis;

  const isReadinessMet = readiness?.status === 'ready';

  const toggleConfounders = (id) => {
    setExpandedSignalId((prev) => (prev === id ? null : id));
  };

  return (
    <div style={styles.cardContainer} aria-label="Empirical Friction Profiling & Preference Signals">
      {/* Header */}
      <div style={styles.cardHeader}>
        <div style={styles.titleCol}>
          <div style={styles.badgeRow}>
            <span style={styles.sectionTag}>PHASE 7.2 PROFILING</span>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: isReadinessMet ? '#DCFCE7' : '#FEF3C7',
                color: isReadinessMet ? '#166534' : '#92400E',
                borderColor: isReadinessMet ? '#BBF7D0' : '#FDE68A',
              }}
              role="status"
            >
              {isReadinessMet
                ? '● MATURE TELEMETRY — CANDIDATE SIGNALS DERIVED'
                : '🔒 ADAPTATION LOCKED — PRELIMINARY AGGREGATES ONLY'}
            </span>
          </div>
          <h4 style={styles.title}>EMPIRICAL FRICTION PROFILING & PREFERENCE SIGNALS</h4>
          <p style={styles.subtitle}>
            Descriptive analysis of user scheduling friction, postponement tendencies, and category pacing
          </p>
        </div>
      </div>

      {/* Explanatory Banner */}
      <div
        style={{
          ...styles.noticeBox,
          borderLeft: isReadinessMet ? '4px solid #166534' : '4px solid #D97706',
        }}
      >
        <p style={styles.noticeText}>
          {isReadinessMet ? (
            <>
              <strong>Sufficient Evidence Available:</strong> Candidate preference signals have been derived from longitudinal telemetry. These are candidate hypotheses for upcoming Phase 7.3 Bayesian evaluation; they are <strong>not</strong> applied to scheduler weights.
            </>
          ) : (
            <>
              <strong>Statistical Restraint Notice:</strong> Phase 7.1 maturity gates are still developing ({readiness?.gates?.decidedProposals?.current || 0}/{readiness?.gates?.decidedProposals?.required || 20} proposals, {readiness?.gates?.verifiedCompletions?.current || 0}/{readiness?.gates?.verifiedCompletions?.required || 15} completions). To avoid false precision or premature scheduler distortion, personalized preference signals are strictly locked. Raw aggregate metrics below represent exploratory observations only.
            </>
          )}
        </p>
      </div>

      {/* Descriptive Friction Overview Grid */}
      <div style={styles.overviewGrid}>
        {/* Proposal Discard Frequency */}
        <div style={styles.overviewItem}>
          <span style={styles.itemLabel}>Observed Discard Ratio (Exploratory)</span>
          <div style={styles.itemValueRow}>
            <span style={styles.itemValue}>
              {frictionProfile.proposals.discardRate != null
                ? `${Math.round(frictionProfile.proposals.discardRate * 100)}%`
                : '—'}
            </span>
            <span style={styles.itemDenominator}>
              ({frictionProfile.proposals.discardedCount} / {frictionProfile.proposals.decidedCount} decided)
            </span>
          </div>
          <span style={styles.itemCaption}>
            {frictionProfile.proposals.decidedCount >= 3
              ? `${frictionProfile.proposals.discardedCount} of ${frictionProfile.proposals.decidedCount} decided proposals were discards. Small sample; descriptive only.`
              : 'Awaiting 3+ decided proposals'}
          </span>
        </div>

        {/* Override Forward Postponement */}
        <div style={styles.overviewItem}>
          <span style={styles.itemLabel}>Forward Postponement Tendency</span>
          <div style={styles.itemValueRow}>
            <span style={styles.itemValue}>
              {frictionProfile.overrides.postponementRatio != null
                ? `${Math.round(frictionProfile.overrides.postponementRatio * 100)}%`
                : '—'}
            </span>
            <span style={styles.itemDenominator}>
              ({frictionProfile.overrides.postponedCount} / {frictionProfile.overrides.totalOverridesCount} overrides)
            </span>
          </div>
          <span style={styles.itemCaption}>
            {frictionProfile.overrides.totalOverridesCount > 0
              ? `${frictionProfile.overrides.advancedCount} advanced · ${frictionProfile.overrides.sameDayCount} same-day`
              : 'Zero manual date overrides recorded'}
          </span>
        </div>

        {/* Category Effort Accuracy */}
        <div style={styles.overviewItem}>
          <span style={styles.itemLabel}>Paired Effort Overrun</span>
          <div style={styles.itemValueRow}>
            <span style={styles.itemValue}>
              {frictionProfile.effortAccuracy.medianRatio != null
                ? `${frictionProfile.effortAccuracy.medianRatio.toFixed(2)}x`
                : '—'}
            </span>
            <span style={styles.itemDenominator}>
              (n={frictionProfile.effortAccuracy.totalPairedCount} paired tasks)
            </span>
          </div>
          <span style={styles.itemCaption}>
            {frictionProfile.effortAccuracy.totalPairedCount >= 3
              ? `Overall median pace across ${frictionProfile.effortAccuracy.totalPairedCount} timed tasks`
              : 'Requires 3+ tasks with estimates & durations'}
          </span>
        </div>
      </div>

      {/* Candidate Signals List or Inconclusive Callout */}
      <div style={styles.signalsSection}>
        <div style={styles.signalsSectionHeader}>
          <h5 style={styles.sectionHeading}>DERIVED CANDIDATE SIGNALS</h5>
          <span style={styles.signalsCountTag}>
            {candidateSignals.length} candidate(s) identified
          </span>
        </div>

        {candidateSignals.length > 0 ? (
          <div style={styles.signalsGrid}>
            {candidateSignals.map((sig) => {
              const isExpanded = expandedSignalId === sig.id;
              const isEligible = sig.evidenceLevel === EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION;

              return (
                <div key={sig.id} style={styles.signalCard}>
                  <div style={styles.signalCardHead}>
                    <div style={styles.signalTitleWrap}>
                      <span style={styles.signalName}>{sig.name}</span>
                      <span
                        style={{
                          ...styles.signalLevelPill,
                          backgroundColor: isEligible ? '#DCFCE7' : '#FEF3C7',
                          color: isEligible ? '#166534' : '#92400E',
                        }}
                      >
                        {isEligible ? '✦ ELIGIBLE FOR EVALUATION' : '○ PRELIMINARY OBSERVATION'}
                      </span>
                    </div>
                    <span style={styles.signalMetricBadge}>
                      {sig.metricValue}
                    </span>
                  </div>

                  <p style={styles.signalBehaviorText}>{sig.observedBehavior}</p>

                  <div style={styles.signalMetaRow}>
                    <span>
                      Supporting observations: <strong>{sig.supportingEvidenceCount} / {sig.denominator}</strong>
                    </span>
                    <span>·</span>
                    <span>
                      Span: <strong>{sig.relevantTimeRange.earliest ? sig.relevantTimeRange.earliest.split('T')[0] : '—'}</strong> to{' '}
                      <strong>{sig.relevantTimeRange.latest ? sig.relevantTimeRange.latest.split('T')[0] : '—'}</strong>
                    </span>
                  </div>

                  <div style={styles.signalStatusBox}>
                    <span style={styles.statusBoxIcon}>ℹ</span>
                    <span style={styles.statusBoxText}>{sig.statusStatement}</span>
                  </div>

                  {/* Confounders Toggle */}
                  <div style={styles.confoundersWrap}>
                    <button
                      type="button"
                      onClick={() => toggleConfounders(sig.id)}
                      style={styles.confoundersBtn}
                      aria-expanded={isExpanded}
                    >
                      <span>{isExpanded ? '▼ Hide Known Confounders' : '▶ Show Known Confounders & Limitations'}</span>
                    </button>

                    {isExpanded && (
                      <ul style={styles.confoundersList}>
                        {sig.confounders.map((c, idx) => (
                          <li key={idx} style={styles.confounderItem}>
                            {c}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={styles.emptySignalsBox}>
            <span style={styles.emptySignalsIcon}>🔬</span>
            <div style={styles.emptySignalsContent}>
              <strong style={styles.emptySignalsTitle}>No Candidate Preference Signals Confirmed</strong>
              <p style={styles.emptySignalsDesc}>
                VoxPlan enforces strict statistical restraint: candidate signals require at least 3 consistent observations in a specific category or segment, plus a mature Phase 7.1 telemetry dataset. As your natural scheduling and completion history grows, genuine behavioral patterns will appear here.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Explicitly Unavailable Signal Families Callout */}
      {unavailableSignalFamilies?.length > 0 && (
        <div style={styles.unavailableBox}>
          <div style={styles.unavailHeader}>
            <span style={styles.unavailIcon}>📡</span>
            <span style={styles.unavailTitle}>Telemetry Schema Gaps & Unavailable Signals</span>
          </div>
          <div style={styles.unavailList}>
            {unavailableSignalFamilies.map((u) => (
              <div key={u.family} style={styles.unavailItem}>
                <strong style={styles.unavailName}>{u.name}:</strong>
                <p style={styles.unavailDesc}>{u.explanation}</p>
                {u.requiredTelemetry && (
                  <div style={styles.unavailReq}>
                    <strong>Required Telemetry:</strong> <code>{u.requiredTelemetry}</code>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Governance & Safety Note */}
      <div style={styles.governanceNote}>
        <span style={styles.govIcon}>🛡️</span>
        <span style={styles.govText}>{governance.disclosure}</span>
      </div>
    </div>
  );
}

const styles = {
  cardContainer: {
    backgroundColor: '#FAFAF9',
    borderRadius: '16px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    marginTop: '24px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '12px',
  },
  titleCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  sectionTag: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: '0.08em',
  },
  statusBadge: {
    padding: '3px 10px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    border: '1px solid transparent',
  },
  title: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, serif)",
    fontSize: '18px',
    fontWeight: '700',
    color: '#25242A',
    margin: '2px 0 0 0',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    fontSize: '13px',
    color: '#525059',
    margin: 0,
    lineHeight: 1.4,
  },
  noticeBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: '8px',
    padding: '12px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
  },
  noticeText: {
    fontSize: '12px',
    color: '#4B5563',
    margin: 0,
    lineHeight: 1.5,
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  overviewItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
  },
  itemLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#706D73',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  itemValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
  },
  itemValue: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '24px',
    fontWeight: '800',
    color: '#25242A',
  },
  itemDenominator: {
    fontSize: '11px',
    color: '#6B7280',
    fontWeight: '600',
  },
  itemCaption: {
    fontSize: '11px',
    color: '#706D73',
    lineHeight: 1.3,
  },
  signalsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  signalsSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeading: {
    fontFamily: "var(--font-subheading, 'Unica One', cursive, sans-serif)",
    fontSize: '12px',
    fontWeight: '800',
    color: '#25242A',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    margin: 0,
  },
  signalsCountTag: {
    fontSize: '11px',
    color: '#6B7280',
    fontWeight: '600',
  },
  signalsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  signalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  signalCardHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '10px',
    flexWrap: 'wrap',
  },
  signalTitleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  signalName: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '13px',
    fontWeight: '800',
    color: '#25242A',
  },
  signalLevelPill: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    padding: '2px 8px',
    borderRadius: '6px',
  },
  signalMetricBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13px',
    fontWeight: '800',
    color: '#25242A',
    backgroundColor: '#F3F4F6',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  signalBehaviorText: {
    fontSize: '13px',
    color: '#374151',
    lineHeight: 1.5,
    margin: 0,
  },
  signalMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    color: '#6B7280',
  },
  signalStatusBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: '8px',
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusBoxIcon: {
    fontSize: '14px',
    color: '#6B7280',
  },
  statusBoxText: {
    fontSize: '12px',
    color: '#4B5563',
  },
  confoundersWrap: {
    marginTop: '4px',
  },
  confoundersBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: '11px',
    fontWeight: '700',
    color: '#4F46E5',
    cursor: 'pointer',
    textAlign: 'left',
  },
  confoundersList: {
    margin: '8px 0 0 0',
    paddingLeft: '18px',
    fontSize: '11px',
    color: '#4B5563',
    lineHeight: 1.4,
  },
  confounderItem: {
    marginBottom: '2px',
  },
  emptySignalsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    border: '1px dashed rgba(37, 36, 42, 0.15)',
    padding: '20px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
  },
  emptySignalsIcon: {
    fontSize: '24px',
  },
  emptySignalsContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  emptySignalsTitle: {
    fontSize: '13px',
    color: '#25242A',
  },
  emptySignalsDesc: {
    fontSize: '12px',
    color: '#6B7280',
    margin: 0,
    lineHeight: 1.5,
  },
  unavailableBox: {
    backgroundColor: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: '10px',
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  unavailHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  unavailIcon: {
    fontSize: '14px',
  },
  unavailTitle: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  unavailList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  unavailItem: {
    fontSize: '12px',
    color: '#78350F',
    lineHeight: 1.4,
  },
  unavailName: {
    fontWeight: '700',
  },
  unavailDesc: {
    margin: '2px 0 4px 0',
  },
  unavailReq: {
    fontSize: '11px',
    color: '#92400E',
  },
  governanceNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    color: '#6B7280',
    borderTop: '1px solid rgba(37, 36, 42, 0.06)',
    paddingTop: '12px',
  },
  govIcon: {
    fontSize: '14px',
  },
  govText: {
    lineHeight: 1.4,
  },
};
