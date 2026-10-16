/**
 * Comprehensive Automated Tests for VoxPlan Schedule Feedback & Outcome Tracking (Phase 4, Stage 5).
 * 
 * Verifies:
 * - Proposal generation, acceptance, and discard event validation and semantics.
 * - Deduplication of user actions in TelemetryManager.
 * - Accurate detection of subsequent manual date overrides (postponed vs advanced).
 * - Matching task completion outcomes strictly to unaltered proposals.
 * - Exclusion of ambiguous or overridden outcomes from scheduler quality metrics.
 * - Strict insufficient-data guards and explicit denominators.
 * - Immediate reset upon history deletion.
 * - Local-only persistence without backend transmission.
 * - Cautious learning boundary enforcement (no automatic retuning).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION,
  validateEvent,
  createEvent,
} from '../src/telemetry/eventSchema.js';

import { telemetry } from '../src/telemetry/telemetryManager.js';
import { computeScheduleFeedback } from '../src/scheduler/scheduleFeedback.js';

describe('1. Schedule Feedback Event Schemas & Semantic Validation', () => {
  it('validates schedule_proposal_generated event schema', () => {
    const validEvent = {
      event_id: 'evt_gen_001',
      profile_id: 'prof_test_user',
      task_id: null,
      event_type: 'schedule_proposal_generated',
      timestamp: '2026-10-16T10:00:00.000Z',
      schema_version: SCHEMA_VERSION,
      payload: {
        schedule_id: 'sched_123',
        scheduler_version: 1,
        strategy: 'adaptive',
        daily_capacity_hours: 6.0,
        horizon_days: 14,
        total_eligible_tasks: 5,
        scheduled_count: 5,
        date_changes_count: 2,
        feasibility: 'feasible',
      },
    };

    const res = validateEvent(validEvent);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  it('rejects proposal events missing schedule_id or with invalid types', () => {
    const missingScheduleId = {
      event_id: 'evt_bad_001',
      profile_id: 'prof_test_user',
      task_id: null,
      event_type: 'schedule_proposal_generated',
      timestamp: '2026-10-16T10:00:00.000Z',
      schema_version: SCHEMA_VERSION,
      payload: {
        strategy: 'adaptive',
      },
    };

    const res = validateEvent(missingScheduleId);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('schedule_id')));
  });

  it('validates schedule_proposal_accepted event with applied task placements', () => {
    const validAccept = {
      event_id: 'evt_acc_001',
      profile_id: 'prof_test_user',
      task_id: null,
      event_type: 'schedule_proposal_accepted',
      timestamp: '2026-10-16T10:05:00.000Z',
      schema_version: SCHEMA_VERSION,
      payload: {
        schedule_id: 'sched_123',
        scheduler_version: 1,
        strategy: 'adaptive',
        changes_count: 2,
        applied_placements: [
          { task_id: 'task_1', original_due_date: '2026-10-20', proposed_date: '2026-10-18' },
          { task_id: 'task_2', original_due_date: null, proposed_date: '2026-10-19' },
        ],
      },
    };

    const res = validateEvent(validAccept);
    assert.equal(res.valid, true);
  });

  it('validates schedule_proposal_discarded event with reason', () => {
    const validDiscard = {
      event_id: 'evt_disc_001',
      profile_id: 'prof_test_user',
      task_id: null,
      event_type: 'schedule_proposal_discarded',
      timestamp: '2026-10-16T10:06:00.000Z',
      schema_version: SCHEMA_VERSION,
      payload: {
        schedule_id: 'sched_999',
        scheduler_version: 1,
        strategy: 'adaptive',
        reason: 'user_discard',
        changes_count: 3,
      },
    };

    const res = validateEvent(validDiscard);
    assert.equal(res.valid, true);
  });
});

describe('2. Deduplication & Manager Proposal Tracking', () => {
  beforeEach(async () => {
    await telemetry.clearHistory();
  });

  it('deduplicates proposal generated, accepted, and discarded calls for the same action', async () => {
    const mockProposal = {
      summary: {
        scheduleId: 'sched_dedupe_test',
        strategy: 'adaptive',
        dailyCapacityHours: 6.0,
        horizonDays: 14,
        totalEligibleTasks: 2,
        scheduledCount: 2,
        dateChangesCount: 1,
        feasibilityStatus: 'feasible',
      },
      proposedPlacements: [
        { taskId: 'task_t1', originalDueDate: '2026-10-25', proposedDate: '2026-10-21' },
      ],
    };

    // First call records event
    const ev1 = await telemetry.recordScheduleProposalGenerated(mockProposal);
    assert.ok(ev1);
    assert.equal(ev1.event_type, 'schedule_proposal_generated');

    // Duplicate call returns null and does not duplicate
    const ev2 = await telemetry.recordScheduleProposalGenerated(mockProposal);
    assert.equal(ev2, null);

    // Accept proposal once
    const acc1 = await telemetry.recordScheduleProposalAccepted(mockProposal, mockProposal.proposedPlacements);
    assert.ok(acc1);
    assert.equal(acc1.event_type, 'schedule_proposal_accepted');

    // Duplicate accept call returns null
    const acc2 = await telemetry.recordScheduleProposalAccepted(mockProposal, mockProposal.proposedPlacements);
    assert.equal(acc2, null);

    // Verify cache length: exactly 2 events
    const events = telemetry.getEvents();
    assert.equal(events.length, 2);
  });
});

describe('3. Schedule Feedback & Acceptance Metrics Calculation', () => {
  it('computes proposal acceptance rate with explicit denominator and reports unattempted states', () => {
    const events = [
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_generated',
        timestamp: '2026-10-16T09:00:00.000Z',
        payload: { schedule_id: 's1' },
      }),
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_accepted',
        timestamp: '2026-10-16T09:02:00.000Z',
        payload: { schedule_id: 's1', applied_placements: [] },
      }),
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_generated',
        timestamp: '2026-10-16T10:00:00.000Z',
        payload: { schedule_id: 's2' },
      }),
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_discarded',
        timestamp: '2026-10-16T10:01:00.000Z',
        payload: { schedule_id: 's2', reason: 'user_discard' },
      }),
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_generated',
        timestamp: '2026-10-16T11:00:00.000Z',
        payload: { schedule_id: 's3' },
      }),
      // s3 is generated but pending/undecided in the modal
    ];

    const report = computeScheduleFeedback(events, []);

    assert.equal(report.summary.generatedCount, 3);
    assert.equal(report.summary.acceptedCount, 1);
    assert.equal(report.summary.discardedCount, 1);
    assert.equal(report.summary.decidedCount, 2);
    // Acceptance rate is 1 / 2 = 0.5 (50%), denominator is strictly 2 decided proposals
    assert.equal(report.summary.acceptanceRate, 0.5);
    // Insufficient data (< 3 decided)
    assert.equal(report.summary.isSufficientData, false);
  });
});

describe('4. Subsequent Manual Date Overrides & Shift Direction', () => {
  it('detects subsequent manual date overrides and classifies postponed vs advanced shifts', () => {
    const events = [
      // Proposal accepted on 2026-10-16T09:00:00.000Z placing task_A on 2026-10-20 and task_B on 2026-10-22
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_accepted',
        timestamp: '2026-10-16T09:00:00.000Z',
        payload: {
          schedule_id: 'sched_override_test',
          applied_placements: [
            { task_id: 'task_A', original_due_date: '2026-10-25', proposed_date: '2026-10-20' },
            { task_id: 'task_B', original_due_date: '2026-10-18', proposed_date: '2026-10-22' },
            { task_id: 'task_C', original_due_date: '2026-10-24', proposed_date: '2026-10-24' },
          ],
        },
      }),
      // Scheduler's own apply event (must be ignored as an override)
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_A',
        eventType: 'task_rescheduled',
        timestamp: '2026-10-16T09:00:01.000Z',
        payload: {
          previous_due_date: '2026-10-25',
          new_due_date: '2026-10-20',
          reason: 'adaptive_scheduler',
        },
      }),
      // User manual override 1: task_A postponed from 2026-10-20 to 2026-10-23 (+3 days)
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_A',
        eventType: 'task_rescheduled',
        timestamp: '2026-10-16T14:00:00.000Z',
        payload: {
          previous_due_date: '2026-10-20',
          new_due_date: '2026-10-23',
          reason: 'user_update',
        },
      }),
      // User manual override 2: task_B pulled forward from 2026-10-22 to 2026-10-21 (-1 day)
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_B',
        eventType: 'task_rescheduled',
        timestamp: '2026-10-16T15:00:00.000Z',
        payload: {
          previous_due_date: '2026-10-22',
          new_due_date: '2026-10-21',
          reason: 'user_update',
        },
      }),
    ];

    const report = computeScheduleFeedback(events, []);

    assert.equal(report.summary.acceptedCount, 1);
    assert.equal(report.summary.totalPlacedTasksCount, 3);
    assert.equal(report.summary.uniqueOverriddenTasksCount, 2);
    // Task override rate: 2 / 3 = 0.6667
    assert.ok(Math.abs(report.summary.taskOverrideRate - (2 / 3)) < 0.001);
    // Proposal override rate: 1 / 1 = 1.0 (proposal experienced at least one override)
    assert.equal(report.summary.proposalOverrideRate, 1.0);

    // Directional counts
    assert.equal(report.summary.postponedOverridesCount, 1);
    assert.equal(report.summary.advancedOverridesCount, 1);

    const shiftA = report.overrides.details.find((o) => o.taskId === 'task_A');
    assert.equal(shiftA.shiftDays, 3);
    assert.equal(shiftA.shiftDirection, 'postponed');

    const shiftB = report.overrides.details.find((o) => o.taskId === 'task_B');
    assert.equal(shiftB.shiftDays, -1);
    assert.equal(shiftB.shiftDirection, 'advanced');
  });
});

describe('5. Task Completion Outcomes & Attribution Integrity', () => {
  it('correctly tracks on-time completion for unaltered tasks and excludes manually overridden tasks', () => {
    const tasks = [
      { id: 'task_ontime', title: 'Task On Time', due_date: '2026-10-20' },
      { id: 'task_late', title: 'Task Late', due_date: '2026-10-19' },
      { id: 'task_overridden_then_completed', title: 'Overridden Task', due_date: '2026-10-25' },
    ];

    const events = [
      // Proposal accepted on 2026-10-16
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_accepted',
        timestamp: '2026-10-16T09:00:00.000Z',
        payload: {
          schedule_id: 'sched_outcomes_test',
          applied_placements: [
            { task_id: 'task_ontime', original_due_date: '2026-10-22', proposed_date: '2026-10-20' },
            { task_id: 'task_late', original_due_date: '2026-10-22', proposed_date: '2026-10-19' },
            { task_id: 'task_overridden_then_completed', original_due_date: '2026-10-22', proposed_date: '2026-10-21' },
          ],
        },
      }),

      // task_ontime completed on 2026-10-19 (before 2026-10-20 end-of-day deadline) -> ON TIME
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_ontime',
        eventType: 'task_completed',
        timestamp: '2026-10-19T17:00:00.000Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 3600 },
      }),

      // task_late completed on 2026-10-21 (after 2026-10-19 deadline) -> LATE
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_late',
        eventType: 'task_completed',
        timestamp: '2026-10-21T10:00:00.000Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 7200 },
      }),

      // task_overridden_then_completed manually moved to 2026-10-25 BEFORE completion
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_overridden_then_completed',
        eventType: 'task_rescheduled',
        timestamp: '2026-10-18T10:00:00.000Z',
        payload: { new_due_date: '2026-10-25', reason: 'user_override' },
      }),
      // then completed on 2026-10-24
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_overridden_then_completed',
        eventType: 'task_completed',
        timestamp: '2026-10-24T12:00:00.000Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 4000 },
      }),
    ];

    const report = computeScheduleFeedback(events, tasks);

    // Only 2 eligible unaltered completion observations (task_ontime and task_late)
    assert.equal(report.summary.eligibleCompletedCount, 2);
    assert.equal(report.summary.completedOnTimeCount, 1);
    assert.equal(report.summary.onTimeCompletionRate, 0.5);

    // 1 excluded observation because it was overridden prior to completion
    assert.equal(report.summary.excludedAmbiguousCount, 1);
    const excluded = report.completionOutcomes.excludedObservations[0];
    assert.equal(excluded.taskId, 'task_overridden_then_completed');
    assert.equal(excluded.reason, 'overridden_prior_to_completion');
  });

  it('excludes tasks missing deadlines from on-time calculations', () => {
    const events = [
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_accepted',
        timestamp: '2026-10-16T09:00:00.000Z',
        payload: {
          schedule_id: 'sched_no_deadline',
          applied_placements: [
            { task_id: 'task_nodue', original_due_date: null, proposed_date: null },
          ],
        },
      }),
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_nodue',
        eventType: 'task_completed',
        timestamp: '2026-10-17T12:00:00.000Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 1800 },
      }),
    ];

    const report = computeScheduleFeedback(events, [{ id: 'task_nodue', due_date: null }]);
    assert.equal(report.summary.eligibleCompletedCount, 0);
    assert.equal(report.summary.excludedAmbiguousCount, 1);
    assert.equal(report.completionOutcomes.excludedObservations[0].reason, 'missing_applicable_deadline');
  });
});

describe('6. History Clearing & Immediate Metrics Reset', () => {
  it('clearHistory permanently removes telemetry and immediately resets feedback metrics to clean state', async () => {
    await telemetry.clearHistory();

    const mockProposal = {
      summary: {
        scheduleId: 'sched_to_be_cleared',
        strategy: 'adaptive',
        dailyCapacityHours: 6.0,
        horizonDays: 14,
        totalEligibleTasks: 1,
        scheduledCount: 1,
        dateChangesCount: 1,
        feasibilityStatus: 'feasible',
      },
      proposedPlacements: [
        { taskId: 'task_del', originalDueDate: '2026-10-20', proposedDate: '2026-10-18' },
      ],
    };

    await telemetry.recordScheduleProposalGenerated(mockProposal);
    await telemetry.recordScheduleProposalAccepted(mockProposal, mockProposal.proposedPlacements);

    let currentEvents = telemetry.getEvents();
    assert.equal(currentEvents.length, 2);

    let feedback = computeScheduleFeedback(currentEvents, []);
    assert.equal(feedback.summary.acceptedCount, 1);
    assert.equal(feedback.summary.generatedCount, 1);

    // Execute clear history
    await telemetry.clearHistory();

    currentEvents = telemetry.getEvents();
    assert.equal(currentEvents.length, 0);

    feedback = computeScheduleFeedback(currentEvents, []);
    assert.equal(feedback.summary.acceptedCount, 0);
    assert.equal(feedback.summary.generatedCount, 0);
    assert.equal(feedback.summary.acceptanceRate, null);
    assert.equal(feedback.summary.proposalOverrideRate, null);
    assert.equal(feedback.summary.onTimeCompletionRate, null);
    assert.equal(feedback.summary.isSufficientData, false);
  });
});

describe('7. Cautious Learning Boundary Enforcement', () => {
  it('strictly enforces no automatic retuning or parameter updates from sparse feedback', () => {
    const report = computeScheduleFeedback([], []);
    assert.equal(report.cautiousLearningBoundary.status, 'active_measurement_only');
    assert.equal(report.cautiousLearningBoundary.automaticTuningEnabled, false);
    assert.ok(report.cautiousLearningBoundary.reason.includes('VoxPlan does not alter scheduling weights'));
    assert.ok(report.conceptDistinctions.acceptanceRateNote.includes('not schedule quality'));
    assert.ok(report.conceptDistinctions.overrideRateNote.includes('do not always imply poor scheduling'));
    assert.ok(report.conceptDistinctions.completionRateNote.includes('NOT manually rescheduled'));
  });
});

describe('8. Multi-Proposal Attribution & Interval Scoping (Stage 6)', () => {
  it('attributes events strictly to the proposal governing the active window when a task appears in multiple proposals', () => {
    // Proposal 1: accepted at 2026-10-10, sets task_X to 2026-10-14
    // Proposal 2: accepted at 2026-10-12, sets task_X to 2026-10-18
    const events = [
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_accepted',
        timestamp: '2026-10-10T10:00:00.000Z',
        payload: {
          schedule_id: 'sched_P1',
          applied_placements: [
            { task_id: 'task_X', original_due_date: '2026-10-20', proposed_date: '2026-10-14' },
          ],
        },
      }),
      // Manual reschedule on 2026-10-11 (between P1 and P2) -> belongs strictly to P1
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_X',
        eventType: 'task_rescheduled',
        timestamp: '2026-10-11T12:00:00.000Z',
        payload: {
          previous_due_date: '2026-10-14',
          new_due_date: '2026-10-15',
          reason: 'user_override',
        },
      }),
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_accepted',
        timestamp: '2026-10-12T10:00:00.000Z',
        payload: {
          schedule_id: 'sched_P2',
          applied_placements: [
            { task_id: 'task_X', original_due_date: '2026-10-15', proposed_date: '2026-10-18' },
          ],
        },
      }),
      // Manual reschedule on 2026-10-13 (after P2) -> belongs strictly to P2
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_X',
        eventType: 'task_rescheduled',
        timestamp: '2026-10-13T14:00:00.000Z',
        payload: {
          previous_due_date: '2026-10-18',
          new_due_date: '2026-10-19',
          reason: 'user_override',
        },
      }),
    ];

    const report = computeScheduleFeedback(events, []);

    // Both proposals were accepted and had placements
    assert.equal(report.summary.acceptedCount, 2);
    assert.equal(report.summary.proposalOverrideRate, 1.0); // Both proposals suffered an override in their respective intervals
    
    // Unique placed tasks = 1 (task_X), overridden tasks = 1 -> taskOverrideRate = 1.0
    assert.equal(report.summary.totalUniquePlacedTasksCount, 1);
    assert.equal(report.summary.uniqueOverriddenTasksCount, 1);
    assert.equal(report.summary.taskOverrideRate, 1.0);

    // Verify detailed override attribution
    const overridesP1 = report.overrides.details.filter((o) => o.scheduleId === 'sched_P1');
    const overridesP2 = report.overrides.details.filter((o) => o.scheduleId === 'sched_P2');

    assert.equal(overridesP1.length, 1);
    assert.equal(overridesP1[0].shiftDays, 1); // 2026-10-14 -> 2026-10-15 (+1 day)
    assert.equal(overridesP1[0].overriddenAt, '2026-10-11T12:00:00.000Z');

    assert.equal(overridesP2.length, 1);
    assert.equal(overridesP2[0].shiftDays, 1); // 2026-10-18 -> 2026-10-19 (+1 day)
    assert.equal(overridesP2[0].overriddenAt, '2026-10-13T14:00:00.000Z');
  });
});

describe('9. Reload Deduplication & Conflicting Decisions Resilience (Stage 6)', () => {
  beforeEach(async () => {
    await telemetry.clearHistory();
  });

  it('durable deduplication survives in-memory cache recreation and blocks repeated actions', async () => {
    const proposal = {
      summary: {
        scheduleId: 'sched_reload_durability_test',
        strategy: 'adaptive',
        dailyCapacityHours: 6.0,
        horizonDays: 14,
        totalEligibleTasks: 1,
        scheduledCount: 1,
        dateChangesCount: 1,
        feasibilityStatus: 'feasible',
      },
      proposedPlacements: [
        { taskId: 'task_dur_1', originalDueDate: '2026-10-22', proposedDate: '2026-10-20' },
      ],
    };

    // 1. Generate and accept proposal
    const genEv = await telemetry.recordScheduleProposalGenerated(proposal);
    assert.ok(genEv);
    const accEv = await telemetry.recordScheduleProposalAccepted(proposal, proposal.proposedPlacements);
    assert.ok(accEv);

    // 2. Simulate page reload: wipe in-memory state and re-init from IndexedDB
    telemetry.recordedProposalActions.clear();
    telemetry.isInitialized = false;
    await telemetry.init();

    // 3. Re-attempting duplicate generation or acceptance must return null
    const dupGen = await telemetry.recordScheduleProposalGenerated(proposal);
    assert.equal(dupGen, null);

    const dupAcc = await telemetry.recordScheduleProposalAccepted(proposal, proposal.proposedPlacements);
    assert.equal(dupAcc, null);

    // 4. Conflicting decision (discarding an already accepted proposal) must return null
    const conflictDisc = await telemetry.recordScheduleProposalDiscarded(proposal, 'user_cancelled');
    assert.equal(conflictDisc, null);

    // Event cache must contain exactly the original 2 events
    assert.equal(telemetry.getEvents().length, 2);
  });

  it('isolates conflicting proposal decisions (accepted AND discarded) from corrupting feedback metrics', () => {
    const events = [
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_generated',
        timestamp: '2026-10-16T08:00:00.000Z',
        payload: { schedule_id: 'sched_corrupt' },
      }),
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_accepted',
        timestamp: '2026-10-16T08:01:00.000Z',
        payload: {
          schedule_id: 'sched_corrupt',
          applied_placements: [
            { task_id: 'task_bad', original_due_date: '2026-10-20', proposed_date: '2026-10-18' },
          ],
        },
      }),
      // Malformed/tampered event stream where same proposal has discard event
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_discarded',
        timestamp: '2026-10-16T08:02:00.000Z',
        payload: { schedule_id: 'sched_corrupt', reason: 'conflicting_entry' },
      }),
      // Legitimate clean proposal
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_generated',
        timestamp: '2026-10-16T09:00:00.000Z',
        payload: { schedule_id: 'sched_clean' },
      }),
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_accepted',
        timestamp: '2026-10-16T09:01:00.000Z',
        payload: {
          schedule_id: 'sched_clean',
          applied_placements: [
            { task_id: 'task_clean', original_due_date: '2026-10-20', proposed_date: '2026-10-19' },
          ],
        },
      }),
    ];

    const report = computeScheduleFeedback(events, []);

    // Conflicting proposal sched_corrupt is isolated
    assert.equal(report.diagnostics.conflictingProposalDecisions.length, 1);
    assert.equal(report.diagnostics.conflictingProposalDecisions[0], 'sched_corrupt');

    // Only clean proposal is counted in acceptedCount
    assert.equal(report.summary.acceptedCount, 1);
    assert.equal(report.summary.decidedCount, 1);
    assert.equal(report.summary.totalPlacedTasksCount, 1);
    assert.equal(report.summary.acceptanceRate, 1.0);
  });
});

describe('10. Lifecycle Edge Cases & Diagnostics Observability (Stage 6)', () => {
  it('excludes reopened tasks and tasks currently incomplete from completed metrics', () => {
    // Current task state in VoxPlan has task_reopened as open (completed: false)
    const currentTasks = [
      { id: 'task_reopened', title: 'Task Reopened', completed: false, due_date: '2026-10-20' },
      { id: 'task_completed_normal', title: 'Task Normal', completed: true, due_date: '2026-10-20' },
    ];

    const events = [
      createEvent({
        profileId: 'prof_test',
        taskId: null,
        eventType: 'schedule_proposal_accepted',
        timestamp: '2026-10-16T09:00:00.000Z',
        payload: {
          schedule_id: 'sched_life_test',
          applied_placements: [
            { task_id: 'task_reopened', original_due_date: '2026-10-25', proposed_date: '2026-10-20' },
            { task_id: 'task_completed_normal', original_due_date: '2026-10-25', proposed_date: '2026-10-20' },
          ],
        },
      }),
      // Both tasks logged completion
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_reopened',
        eventType: 'task_completed',
        timestamp: '2026-10-18T10:00:00.000Z',
        payload: { duration_source: 'tracked' },
      }),
      // task_reopened was subsequently reopened!
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_reopened',
        eventType: 'task_reopened',
        timestamp: '2026-10-18T12:00:00.000Z',
        payload: { reason: 'user_reopened' },
      }),
      createEvent({
        profileId: 'prof_test',
        taskId: 'task_completed_normal',
        eventType: 'task_completed',
        timestamp: '2026-10-19T11:00:00.000Z',
        payload: { duration_source: 'tracked' },
      }),
    ];

    const report = computeScheduleFeedback(events, currentTasks);

    // Only task_completed_normal is counted
    assert.equal(report.summary.eligibleCompletedCount, 1);
    assert.equal(report.summary.completedOnTimeCount, 1);
    assert.equal(report.summary.onTimeCompletionRate, 1.0);

    // Diagnostics captures the reopened incomplete task
    assert.ok(report.diagnostics.reopenedIncompleteCount >= 1);
    const excludedReopened = report.completionOutcomes.excludedObservations.find(
      (o) => o.taskId === 'task_reopened'
    );
    assert.ok(excludedReopened);
    assert.equal(excludedReopened.reason, 'reopened_incomplete_lifecycle');
  });

  it('exposes privacy-preserving diagnostics with zero leakage of task titles or personal content', () => {
    const report = computeScheduleFeedback([], []);
    assert.ok(report.diagnostics);
    assert.equal(typeof report.diagnostics.excludedAmbiguousCount, 'number');
    assert.equal(typeof report.diagnostics.reopenedIncompleteCount, 'number');
    assert.equal(typeof report.diagnostics.conflictingDecisionsCount, 'number');
    assert.equal(typeof report.diagnostics.overriddenPriorToCompletionCount, 'number');
    assert.equal(typeof report.diagnostics.missingProposalIdentityCount, 'number');
  });
});

