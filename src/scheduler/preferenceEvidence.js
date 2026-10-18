/**
 * VoxPlan Explicit Preference Evidence Foundation (Phase 7.3 Follow-up).
 *
 * Implements a pure, deterministic evidence-collection and validation contract
 * for recording and extracting explicit pairwise schedule preferences.
 *
 * Design & Provenance Invariants:
 * 1. Explicit Choice Only: Only explicit user choices between two valid alternatives
 *    qualify as evidence. Behavioral inferences (proposal accept/discard, task completions)
 *    are explicitly quarantined as `inferred_rejected`.
 * 2. Hard Constraint Decoupling: Alternatives must satisfy all scheduling hard constraints
 *    (DAG dependencies, working hours, daily capacity). Constraint-violating alternatives
 *    cannot earn preference credit and are flagged as `constraint_violation`.
 * 3. Contradiction Quarantine: Conflicting preferences for the same comparison pair
 *    are safely quarantined as `contradictory` without silently favoring the latest event.
 * 4. Idempotency & Provenance Preservation: Duplicate submissions are deduplicated without
 *    erasing or mutating original telemetry history.
 * 5. Pure & Non-Mutating: All extraction and validation operations are strictly read-only.
 */

export const PREFERENCE_SOURCES = Object.freeze({
  EXPLICIT_USER_CHOICE: 'explicit_user_choice',
  INFERRED_BEHAVIOR: 'inferred_behavior',
});

export const EVIDENCE_STATUS = Object.freeze({
  VALID: 'valid',
  INCOMPLETE: 'incomplete',
  AMBIGUOUS: 'ambiguous',
  CONTRADICTORY: 'contradictory',
  INFERRED_REJECTED: 'inferred_rejected',
  CONSTRAINT_VIOLATION: 'constraint_violation',
  DUPLICATE: 'duplicate',
});

export const SELECTION_VALUES = Object.freeze({
  ALTERNATIVE_A: 'alternative_a',
  ALTERNATIVE_B: 'alternative_b',
  NEUTRAL: 'neutral',
  BOTH_UNACCEPTABLE: 'both_unacceptable',
});

/**
 * Generates an order-independent canonical pair key for two alternative identifiers.
 * E.g., ('alt_1', 'alt_2') and ('alt_2', 'alt_1') both return 'alt_1___vs___alt_2'.
 *
 * @param {string} idA
 * @param {string} idB
 * @returns {string}
 */
export function generatePairKey(idA, idB) {
  const strA = String(idA ?? '').trim();
  const strB = String(idB ?? '').trim();
  if (!strA || !strB) return '';
  return [strA, strB].sort().join('___vs___');
}

/**
 * Validates an explicit preference comparison record or event payload.
 *
 * @param {Object} record - The comparison record or telemetry event payload.
 * @returns {{ valid: boolean, status: string, reason: string | null }}
 */
export function validatePreferenceEvidence(record) {
  if (!record || typeof record !== 'object') {
    return {
      valid: false,
      status: EVIDENCE_STATUS.INCOMPLETE,
      reason: 'Record must be a non-null object.',
    };
  }

  // 1. Source verification: reject inferred behavioral telemetry
  const source = record.source || record.payload?.source;
  if (source !== PREFERENCE_SOURCES.EXPLICIT_USER_CHOICE) {
    return {
      valid: false,
      status: EVIDENCE_STATUS.INFERRED_REJECTED,
      reason: `Source "${source || 'unspecified'}" is not an explicit user choice. Inferred behavior cannot be treated as explicit preference evidence.`,
    };
  }

  // 2. Identifier and provenance verification
  const comparisonId = record.comparison_id || record.comparisonId || record.payload?.comparison_id;
  if (typeof comparisonId !== 'string' || !comparisonId.trim()) {
    return {
      valid: false,
      status: EVIDENCE_STATUS.INCOMPLETE,
      reason: 'Missing or empty comparison_id.',
    };
  }

  // 3. Extract alternatives
  const altA = record.alternative_a || record.alternativeA || record.payload?.alternative_a;
  const altB = record.alternative_b || record.alternativeB || record.payload?.alternative_b;

  if (!altA || typeof altA !== 'object' || !altB || typeof altB !== 'object') {
    return {
      valid: false,
      status: EVIDENCE_STATUS.INCOMPLETE,
      reason: 'Both alternative_a and alternative_b must be valid objects.',
    };
  }

  const idA = altA.id || altA.strategy || altA.schedule_id || altA.scheduleId;
  const idB = altB.id || altB.strategy || altB.schedule_id || altB.scheduleId;

  if (!idA || !idB) {
    return {
      valid: false,
      status: EVIDENCE_STATUS.INCOMPLETE,
      reason: 'Both alternatives must have an identifiable id, strategy, or schedule_id.',
    };
  }

  if (String(idA) === String(idB)) {
    return {
      valid: false,
      status: EVIDENCE_STATUS.AMBIGUOUS,
      reason: 'Alternatives are identical. Pairwise comparison requires two distinct alternatives.',
    };
  }

  // 4. Selection validity
  const selected = record.selected || record.payload?.selected;
  if (![SELECTION_VALUES.ALTERNATIVE_A, SELECTION_VALUES.ALTERNATIVE_B].includes(selected)) {
    return {
      valid: false,
      status: EVIDENCE_STATUS.AMBIGUOUS,
      reason: `Selection "${selected || 'none'}" does not establish an unambiguous preference between alternatives.`,
    };
  }

  // 5. Hard constraint compliance
  const isACompliant = altA.isConstraintCompliant !== false && !altA.cycleDetected && (altA.infeasiblePlacementsCount ?? 0) === 0;
  const isBCompliant = altB.isConstraintCompliant !== false && !altB.cycleDetected && (altB.infeasiblePlacementsCount ?? 0) === 0;

  if (!isACompliant || !isBCompliant) {
    return {
      valid: false,
      status: EVIDENCE_STATUS.CONSTRAINT_VIOLATION,
      reason: 'One or both alternatives violate hard scheduling constraints (cycles, capacity overruns, or infeasible placements).',
    };
  }

  return {
    valid: true,
    status: EVIDENCE_STATUS.VALID,
    reason: null,
  };
}

/**
 * Extracts, filters, deduplicates, and contradiction-checks explicit preference
 * evidence from a collection of telemetry events or raw records.
 *
 * @param {Array<Object>} events - Telemetry events or comparison records.
 * @returns {Object} Structured evidence collection with eligible and excluded items.
 */
export function extractEligiblePreferenceEvidence(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      eligible: [],
      excluded: [],
      counts: {
        totalObserved: 0,
        eligibleCount: 0,
        excludedCount: 0,
        byReason: {
          duplicate: 0,
          contradictory: 0,
          inferred_rejected: 0,
          incomplete: 0,
          ambiguous: 0,
          constraint_violation: 0,
        },
      },
    };
  }

  const rawRecords = [];

  // Flatten events and payload records
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;

    if (ev.event_type === 'schedule_preference_expressed') {
      rawRecords.push({
        eventId: ev.event_id || null,
        timestamp: ev.timestamp || null,
        comparison_id: ev.payload?.comparison_id,
        source: ev.payload?.source,
        alternative_a: ev.payload?.alternative_a,
        alternative_b: ev.payload?.alternative_b,
        selected: ev.payload?.selected,
        comparison_context: ev.payload?.comparison_context || {},
      });
    } else if (
      ev.event_type === 'schedule_proposal_accepted' ||
      ev.event_type === 'schedule_proposal_discarded' ||
      ev.event_type === 'task_completed'
    ) {
      // Inferred behavioral events are tracked and strictly excluded
      rawRecords.push({
        eventId: ev.event_id || null,
        timestamp: ev.timestamp || null,
        comparison_id: `inferred_${ev.event_id || Math.random()}`,
        source: PREFERENCE_SOURCES.INFERRED_BEHAVIOR,
        inferredEventType: ev.event_type,
      });
    } else if (ev.comparison_id || ev.comparisonId) {
      // Direct raw record
      rawRecords.push(ev);
    }
  }

  const excluded = [];
  const validObservationsByPair = new Map();

  const byReasonCounts = {
    duplicate: 0,
    contradictory: 0,
    inferred_rejected: 0,
    incomplete: 0,
    ambiguous: 0,
    constraint_violation: 0,
  };

  // Step 1: Validate individual records
  for (const record of rawRecords) {
    const val = validatePreferenceEvidence(record);
    if (!val.valid) {
      excluded.push({
        record,
        reason: val.status,
        details: val.reason,
      });
      if (byReasonCounts[val.status] !== undefined) {
        byReasonCounts[val.status]++;
      }
      continue;
    }

    const altA = record.alternative_a || record.alternativeA || record.payload?.alternative_a;
    const altB = record.alternative_b || record.alternativeB || record.payload?.alternative_b;
    const selected = record.selected || record.payload?.selected;

    const idA = altA.id || altA.strategy || altA.schedule_id || altA.scheduleId;
    const idB = altB.id || altB.strategy || altB.schedule_id || altB.scheduleId;
    const pairKey = generatePairKey(idA, idB);

    const preferredId = selected === SELECTION_VALUES.ALTERNATIVE_A ? idA : idB;
    const nonPreferredId = selected === SELECTION_VALUES.ALTERNATIVE_A ? idB : idA;
    const preferredAlt = selected === SELECTION_VALUES.ALTERNATIVE_A ? altA : altB;
    const nonPreferredAlt = selected === SELECTION_VALUES.ALTERNATIVE_A ? altB : altA;

    const normalizedItem = {
      comparisonId: record.comparison_id || record.comparisonId || record.payload?.comparison_id,
      eventId: record.eventId || record.event_id || null,
      timestamp: record.timestamp || new Date().toISOString(),
      pairKey,
      alternativeA: altA,
      alternativeB: altB,
      selected,
      preferredId,
      nonPreferredId,
      preferredAlternative: preferredAlt,
      nonPreferredAlternative: nonPreferredAlt,
      context: record.comparison_context || record.context || record.payload?.comparison_context || {},
      rawRecord: record,
    };

    if (!validObservationsByPair.has(pairKey)) {
      validObservationsByPair.set(pairKey, []);
    }
    validObservationsByPair.get(pairKey).push(normalizedItem);
  }

  // Step 2: Deduplication and Contradiction Detection per Pair
  const eligible = [];

  for (const [pairKey, pairObservations] of validObservationsByPair.entries()) {
    if (pairObservations.length === 1) {
      eligible.push(pairObservations[0]);
      continue;
    }

    // Check if observations within this pair disagree
    const preferredIds = new Set(pairObservations.map((o) => String(o.preferredId)));

    if (preferredIds.size > 1) {
      // Contradiction detected! Quarantine all records for this pair
      for (const obs of pairObservations) {
        excluded.push({
          record: obs.rawRecord,
          reason: EVIDENCE_STATUS.CONTRADICTORY,
          details: `Contradictory selections observed for pair "${pairKey}". Multiple conflicting preferences detected.`,
        });
        byReasonCounts.contradictory++;
      }
    } else {
      // Consistent repeated selections: keep the first, mark subsequent as duplicate
      eligible.push(pairObservations[0]);
      for (let i = 1; i < pairObservations.length; i++) {
        excluded.push({
          record: pairObservations[i].rawRecord,
          reason: EVIDENCE_STATUS.DUPLICATE,
          details: `Identical repeated selection for pair "${pairKey}". Deduplicated to prevent observation inflation.`,
        });
        byReasonCounts.duplicate++;
      }
    }
  }

  // Sort eligible deterministically by timestamp ascending, then comparisonId
  eligible.sort((a, b) => {
    const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return String(a.comparisonId).localeCompare(String(b.comparisonId));
  });

  return {
    eligible,
    excluded,
    counts: {
      totalObserved: rawRecords.length,
      eligibleCount: eligible.length,
      excludedCount: excluded.length,
      byReason: byReasonCounts,
    },
  };
}
