import React, { useMemo } from 'react';
import MotifIcon from './MotifIcon';
import {
  evaluateLearningReadiness,
  READINESS_THRESHOLDS,
  READINESS_STATUS,
} from '../scheduler/learningReadinessGate';
import PreferenceSignalsCard from './PreferenceSignalsCard';
import AdaptationSandboxCard from './AdaptationSandboxCard';

/**
 * LearningReadinessPanel (Phase 7.1)
 *
 * Displays transparent, deterministic maturity gating diagnostics indicating whether
 * VoxPlan has gathered sufficient longitudinal behavioral evidence to begin preference learning.
 *
 * Scope Boundary: Read-only diagnostic panel. Does not alter weights or enable learning.
 */
export default function LearningReadinessPanel({ events = [], tasks = [] }) {
  const readiness = useMemo(() => {
    return evaluateLearningReadiness({ events, tasks });
  }, [events, tasks]);

  const { status, summary, gates, warnings, exclusions, governance, readinessRatio } = readiness;

  // Status badge styling
  const statusConfig = {
    [READINESS_STATUS.READY]: {
      label: 'READY FOR PREFERENCE EVALUATION',
      motifName: 'check',
      badgeBg: '#DCFCE7',
      badgeText: '#166534',
      badgeBorder: '#BBF7D0',
      headline: 'Maturity Thresholds Satisfied',
      subtext: 'VoxPlan has gathered sufficient longitudinal evidence across proposals, completions, categories, and calendar days. Phase 7 preference learning can be safely evaluated in upcoming stages.',
    },
    [READINESS_STATUS.INSUFFICIENT_EVIDENCE]: {
      label: 'NOT YET READY — ADAPTATION LOCKED',
      motifName: 'lock',
      badgeBg: '#FEF3C7',
      badgeText: '#92400E',
      badgeBorder: '#FDE68A',
      headline: 'Longitudinal Evidence Developing',
      subtext: 'Automatic schedule adaptation is strictly locked to prevent premature distortion on sparse data. VoxPlan continues running default factory heuristic weights.',
    },
    [READINESS_STATUS.UNAVAILABLE]: {
      label: 'ASSESSMENT UNAVAILABLE',
      motifName: 'warning',
      badgeBg: '#FEE2E2',
      badgeText: '#991B1B',
      badgeBorder: '#FECACA',
      headline: 'Telemetry Data Unassessable',
      subtext: 'Telemetry event store is unavailable or corrupted. Preference adaptation remains locked.',
    },
  }[status] || {
    label: 'ASSESSMENT PENDING',
    motifName: 'circle',
    badgeBg: '#F3F4F6',
    badgeText: '#4B5563',
    badgeBorder: '#E5E7EB',
    headline: 'Analyzing Evidence',
    subtext: '',
  };

  const passedCount = [
    gates.decidedProposals?.passed,
    gates.verifiedCompletions?.passed,
    gates.taskCategories?.passed,
    gates.activeDuration?.passed,
  ].filter(Boolean).length;

  return (
    <div
      id="adaptation-gate-status"
      style={styles.container}
      className="digital-card"
      aria-label="Schedule Adaptation Readiness Diagnostics"
    >
      {/* Panel Top Header */}
      <div style={styles.panelHeader}>
        <div style={styles.titleGroup}>
          <div style={styles.badgeRow}>
            <span style={styles.sectionTag}>PHASE 7.1 GATING</span>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: statusConfig.badgeBg,
                color: statusConfig.badgeText,
                borderColor: statusConfig.badgeBorder,
              }}
              role="status"
            >
              <MotifIcon name={statusConfig.motifName} size={12} color={statusConfig.badgeText} style={{ marginRight: '5px' }} />
              <span>{statusConfig.label}</span>
            </span>
          </div>
          <h3 style={styles.title}>SCHEDULE ADAPTATION READINESS</h3>
          <p className="readiness-subtitle" style={styles.subtitle}>
            Deterministic evidence maturity evaluation before any personal preference learning is unlocked
          </p>
        </div>

        {/* Overall Readiness Gauge */}
        <div style={styles.gaugeBox}>
          <div style={styles.gaugeHeader}>
            <span style={styles.gaugeTitle}>Maturity Score</span>
            <span style={styles.gaugeScore}>
              {passedCount} / 4 <span style={styles.gaugeTotal}>GATES</span>
            </span>
          </div>
          <div
            style={styles.gaugeTrack}
            role="progressbar"
            aria-valuenow={Math.round(readinessRatio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Maturity gates progress"
          >
            <div
              style={{
                ...styles.gaugeFill,
                width: `${Math.round(readinessRatio * 100)}%`,
                backgroundColor: passedCount === 4 ? '#166534' : '#D97706',
              }}
            />
          </div>
          <span style={styles.gaugeCaption}>
            {passedCount === 4 ? 'All criteria met (100%)' : `${4 - passedCount} more gate(s) needed before evaluation`}
          </span>
        </div>
      </div>

      {/* Narrative Status Box */}
      <div
        style={{
          ...styles.narrativeBox,
          borderLeft: `4px solid ${statusConfig.badgeText}`,
        }}
      >
        <div style={styles.narrativeHead}>
          <strong style={{ color: statusConfig.badgeText }}>{statusConfig.headline}:</strong>{' '}
          <span>{statusConfig.subtext}</span>
        </div>
      </div>

      {/* 4 Maturity Gates Grid */}
      <div style={styles.gatesGrid}>
        {/* Gate 1: Decided Proposals */}
        <div style={styles.gateCard}>
          <div style={styles.gateCardHeader}>
            <span style={styles.gateName}>1. Decided Proposals</span>
            <span
              style={{
                ...styles.gateStatusPill,
                backgroundColor: gates.decidedProposals.passed ? '#DCFCE7' : '#F3F4F6',
                color: gates.decidedProposals.passed ? '#166534' : '#4B5563',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              {gates.decidedProposals.passed ? (
                <>
                  <MotifIcon name="check" size={11} color="#166534" />
                  <span>PASSED</span>
                </>
              ) : (
                <>
                  <MotifIcon name="circle" size={10} color="#4B5563" />
                  <span>UNMET</span>
                </>
              )}
            </span>
          </div>
          <div style={styles.metricRow}>
            <span style={styles.metricBig}>{gates.decidedProposals.current}</span>
            <span style={styles.metricTarget}>/ {READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS} required</span>
          </div>
          <div
            style={styles.progressTrack}
            role="progressbar"
            aria-valuenow={Math.round(gates.decidedProposals.progressRatio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Decided proposals progress"
          >
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.round(gates.decidedProposals.progressRatio * 100)}%`,
                backgroundColor: gates.decidedProposals.passed ? '#166534' : '#3B82F6',
              }}
            />
          </div>
          <p style={styles.gateDesc}>{gates.decidedProposals.explanation}</p>
          <div style={styles.eligibilityNote}>
            <strong>Qualifies:</strong> Explicit accepted or discarded proposals. Generated drafts, views, and conflicts are excluded.
          </div>
        </div>

        {/* Gate 2: Verified Completions */}
        <div style={styles.gateCard}>
          <div style={styles.gateCardHeader}>
            <span style={styles.gateName}>2. Verified Completions</span>
            <span
              style={{
                ...styles.gateStatusPill,
                backgroundColor: gates.verifiedCompletions.passed ? '#DCFCE7' : '#F3F4F6',
                color: gates.verifiedCompletions.passed ? '#166534' : '#4B5563',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              {gates.verifiedCompletions.passed ? (
                <>
                  <MotifIcon name="check" size={11} color="#166534" />
                  <span>PASSED</span>
                </>
              ) : (
                <>
                  <MotifIcon name="circle" size={10} color="#4B5563" />
                  <span>UNMET</span>
                </>
              )}
            </span>
          </div>
          <div style={styles.metricRow}>
            <span style={styles.metricBig}>{gates.verifiedCompletions.current}</span>
            <span style={styles.metricTarget}>/ {READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS} required</span>
          </div>
          <div
            style={styles.progressTrack}
            role="progressbar"
            aria-valuenow={Math.round(gates.verifiedCompletions.progressRatio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Verified completions progress"
          >
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.round(gates.verifiedCompletions.progressRatio * 100)}%`,
                backgroundColor: gates.verifiedCompletions.passed ? '#166534' : '#8B5CF6',
              }}
            />
          </div>
          <p style={styles.gateDesc}>{gates.verifiedCompletions.explanation}</p>
          <div style={styles.eligibilityNote}>
            <strong>Qualifies:</strong> Tasks completed on their accepted scheduled date. Overridden tasks and reopened items are excluded.
          </div>
        </div>

        {/* Gate 3: Task Categories */}
        <div style={styles.gateCard}>
          <div style={styles.gateCardHeader}>
            <span style={styles.gateName}>3. Task Categories</span>
            <span
              style={{
                ...styles.gateStatusPill,
                backgroundColor: gates.taskCategories.passed ? '#DCFCE7' : '#F3F4F6',
                color: gates.taskCategories.passed ? '#166534' : '#4B5563',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              {gates.taskCategories.passed ? (
                <>
                  <MotifIcon name="check" size={11} color="#166534" />
                  <span>PASSED</span>
                </>
              ) : (
                <>
                  <MotifIcon name="circle" size={10} color="#4B5563" />
                  <span>UNMET</span>
                </>
              )}
            </span>
          </div>
          <div style={styles.metricRow}>
            <span style={styles.metricBig}>{gates.taskCategories.current}</span>
            <span style={styles.metricTarget}>/ {READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES} categories</span>
          </div>
          <div
            style={styles.progressTrack}
            role="progressbar"
            aria-valuenow={Math.round(gates.taskCategories.progressRatio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Task categories progress"
          >
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.round(gates.taskCategories.progressRatio * 100)}%`,
                backgroundColor: gates.taskCategories.passed ? '#166534' : '#EC4899',
              }}
            />
          </div>
          <p style={styles.gateDesc}>{gates.taskCategories.explanation}</p>
          <div style={styles.categoryChipsWrap}>
            {gates.taskCategories.categories?.length > 0 ? (
              gates.taskCategories.categories.map((c) => (
                <span key={c} style={{ ...styles.categoryChip, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <MotifIcon name="tag" size={11} />
                  <span>{c}</span>
                </span>
              ))
            ) : (
              <span style={styles.emptyCategoriesText}>No categories observed on verified completions yet</span>
            )}
          </div>
        </div>

        {/* Gate 4: Active Telemetry Days */}
        <div style={styles.gateCard}>
          <div style={styles.gateCardHeader}>
            <span style={styles.gateName}>4. Active Telemetry Days</span>
            <span
              style={{
                ...styles.gateStatusPill,
                backgroundColor: gates.activeDuration.passed ? '#DCFCE7' : '#F3F4F6',
                color: gates.activeDuration.passed ? '#166534' : '#4B5563',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              {gates.activeDuration.passed ? (
                <>
                  <MotifIcon name="check" size={11} color="#166534" />
                  <span>PASSED</span>
                </>
              ) : (
                <>
                  <MotifIcon name="circle" size={10} color="#4B5563" />
                  <span>UNMET</span>
                </>
              )}
            </span>
          </div>
          <div style={styles.metricRow}>
            <span style={styles.metricBig}>{gates.activeDuration.current}</span>
            <span style={styles.metricTarget}>/ {READINESS_THRESHOLDS.MIN_ACTIVE_DAYS} active days</span>
          </div>
          <div
            style={styles.progressTrack}
            role="progressbar"
            aria-valuenow={Math.round(gates.activeDuration.progressRatio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Active days progress"
          >
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.round(gates.activeDuration.progressRatio * 100)}%`,
                backgroundColor: gates.activeDuration.passed ? '#166534' : '#10B981',
              }}
            />
          </div>
          <p style={styles.gateDesc}>{gates.activeDuration.explanation}</p>
          <div style={styles.dateSpanRow}>
            <span>
              Span: <strong>{summary.earliestActiveDate ? summary.earliestActiveDate.split('T')[0] : '—'}</strong> to{' '}
              <strong>{summary.latestActiveDate ? summary.latestActiveDate.split('T')[0] : '—'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Warnings & Exclusions Box (if any) */}
      {(warnings?.length > 0 || exclusions.excludedCompletions > 0 || exclusions.conflictingProposals > 0) && (
        <div style={styles.warningBox}>
          <div style={styles.warningHeader}>
            <span style={styles.warningIcon}>
              <MotifIcon name="shield" size={16} color="#B45309" />
            </span>
            <span style={styles.warningTitle}>Data Integrity & Provenance Diagnostics</span>
          </div>
          <ul style={styles.warningList}>
            {warnings.map((w, idx) => (
              <li key={idx} style={styles.warningItem}>
                {w}
              </li>
            ))}
            {exclusions.excludedCompletions > 0 && (
              <li style={styles.warningItem}>
                {exclusions.excludedCompletions} completion(s) excluded because tasks were manually rescheduled prior to completion or reopened.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Phase 7.2: Empirical Preference Signal Derivation & Friction Profiling */}
      <PreferenceSignalsCard events={events} tasks={tasks} />

      {/* Phase 7.3: Bounded Heuristic Weight Adaptation & Bayesian Shrinkage */}
      <AdaptationSandboxCard events={events} tasks={tasks} />

      {/* Governance & Privacy Disclosure Footer */}
      <div style={styles.governanceFooter}>
        <div style={styles.govRow}>
          <span style={styles.govIcon}>
            <MotifIcon name="lock" size={16} color="#8E5FA8" />
          </span>
          <div style={styles.govText}>
            <strong>Local-Only Read-Only Diagnostics:</strong> {governance.disclosure}
          </div>
        </div>
        <div style={styles.govBadgeRow}>
          <span style={styles.govTag}>Client-Side IndexedDB</span>
          <span style={styles.govTag}>Weights Unmodified</span>
          <span style={styles.govTag}>Zero Cloud Sync</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(37, 36, 42, 0.1)',
    padding: '32px',
    boxShadow: '0 8px 30px rgba(37, 36, 42, 0.05)',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    marginTop: '32px',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '20px',
    paddingBottom: '20px',
    borderBottom: '1px solid rgba(37, 36, 42, 0.08)',
  },
  titleGroup: {
    flex: '1 1 400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
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
    color: '#6366F1',
    letterSpacing: '0.08em',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    border: '1px solid transparent',
  },
  title: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, serif)",
    fontSize: '22px',
    fontWeight: '700',
    color: '#25242A',
    letterSpacing: '-0.01em',
    margin: '4px 0 0 0',
  },
  subtitle: {
    fontSize: '13px',
    color: '#525059',
    margin: 0,
    lineHeight: 1.4,
  },
  gaugeBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: '14px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '16px 20px',
    minWidth: '220px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  gaugeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  gaugeTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#706D73',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  gaugeScore: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '16px',
    fontWeight: '800',
    color: '#25242A',
  },
  gaugeTotal: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#9CA3AF',
  },
  gaugeTrack: {
    height: '8px',
    backgroundColor: 'rgba(37, 36, 42, 0.08)',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    borderRadius: '9999px',
    transition: 'width 0.4s ease',
  },
  gaugeCaption: {
    fontSize: '11px',
    color: '#6B7280',
    fontWeight: '500',
  },
  narrativeBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: '10px',
    padding: '14px 18px',
    fontSize: '13px',
    lineHeight: 1.5,
    color: '#374151',
  },
  narrativeHead: {
    margin: 0,
  },
  gatesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px',
  },
  gateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    border: '1px solid rgba(37, 36, 42, 0.08)',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  },
  gateCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gateName: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '13px',
    fontWeight: '800',
    color: '#25242A',
  },
  gateStatusPill: {
    fontSize: '10px',
    fontWeight: '800',
    letterSpacing: '0.04em',
    padding: '3px 8px',
    borderRadius: '6px',
  },
  metricRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
  },
  metricBig: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '28px',
    fontWeight: '800',
    color: '#25242A',
    lineHeight: 1,
  },
  metricTarget: {
    fontSize: '12px',
    color: '#706D73',
    fontWeight: '600',
  },
  progressTrack: {
    height: '6px',
    backgroundColor: 'rgba(37, 36, 42, 0.06)',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '9999px',
    transition: 'width 0.4s ease',
  },
  gateDesc: {
    fontSize: '12px',
    color: '#4B5563',
    margin: 0,
    lineHeight: 1.4,
  },
  eligibilityNote: {
    fontSize: '11px',
    color: '#6B7280',
    backgroundColor: '#F9FAFB',
    padding: '6px 8px',
    borderRadius: '6px',
    lineHeight: 1.3,
  },
  categoryChipsWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '4px',
  },
  categoryChip: {
    fontSize: '11px',
    fontWeight: '700',
    backgroundColor: '#FDF2F8',
    color: '#9D174D',
    border: '1px solid #FBCFE8',
    padding: '2px 8px',
    borderRadius: '9999px',
  },
  emptyCategoriesText: {
    fontSize: '11px',
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  dateSpanRow: {
    fontSize: '11px',
    color: '#4B5563',
    backgroundColor: '#F9FAFB',
    padding: '6px 8px',
    borderRadius: '6px',
  },
  warningBox: {
    backgroundColor: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: '12px',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  warningHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  warningIcon: {
    fontSize: '16px',
  },
  warningTitle: {
    fontSize: '12px',
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  warningList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '12px',
    color: '#78350F',
    lineHeight: 1.5,
  },
  warningItem: {
    marginBottom: '4px',
  },
  governanceFooter: {
    backgroundColor: '#F3F4F6',
    borderRadius: '12px',
    padding: '14px 18px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    border: '1px solid rgba(37, 36, 42, 0.06)',
  },
  govRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: '1 1 400px',
  },
  govIcon: {
    fontSize: '16px',
  },
  govText: {
    fontSize: '12px',
    color: '#4B5563',
    lineHeight: 1.4,
  },
  govBadgeRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  govTag: {
    fontSize: '10px',
    fontWeight: '700',
    backgroundColor: '#E5E7EB',
    color: '#374151',
    padding: '3px 8px',
    borderRadius: '6px',
    fontFamily: "'JetBrains Mono', monospace",
  },
};
