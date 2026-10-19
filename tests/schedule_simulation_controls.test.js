/**
 * Comprehensive Automated Tests for VoxPlan Phase 7.4, Stage 1:
 * User Controls, Schedule Simulation & Shadow-Only Evaluation.
 *
 * Verifies:
 * 1. Scheduler Mode and Readiness Diagnostics Integrity.
 * 2. Candidate Parameter Validation (Bounds, Non-finite Rejection, Unknown Key Rejection).
 * 3. Schedule Simulation Execution, Input Mutation Safety & Determinism.
 * 4. Hard-Constraint Infeasibility Flags & Invariant Protection.
 * 5. Explicit Preference Collection Control & Telemetry Lifecycle Isolation.
 * 6. Non-Negotiable Production Safety Invariants.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIMULATION_WEIGHT_BOUNDS,
  validateCandidateWeights,
  SIMULATION_SCENARIOS,
  runScheduleSimulation,
} from '../src/scheduler/scheduleSimulator.js';
import {
  FACTORY_SCHEDULER_WEIGHTS,
  generateAdaptiveSchedule,
} from '../src/scheduler/adaptiveScheduler.js';
import {
  evaluateLearningReadiness,
  READINESS_STATUS,
} from '../src/scheduler/learningReadinessGate.js';
import { extractEligiblePreferenceEvidence } from '../src/scheduler/preferenceEvidence.js';
import {
  TelemetryManager,
  PREFERENCE_COLLECTION_STORAGE_KEY,
} from '../src/telemetry/telemetryManager.js';
import { createEvent } from '../src/telemetry/eventSchema.js';

describe('Phase 7.4, Stage 1: User Controls, Schedule Simulation & Shadow-Only Evaluation', () => {
  // ---------------------------------------------------------------------------
  // 1. Scheduler Mode and Readiness Diagnostics
  // ---------------------------------------------------------------------------
  describe('1. Scheduler Mode & Personalization Status Invariants', () => {
    it('reports factory baseline weights as exact immutable defaults', () => {
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
      assert.equal(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS), true);

      // Verify documented simulation bounds enforce exact ±20% bounds
      assert.equal(SIMULATION_WEIGHT_BOUNDS.urgencyWeight.min, 40.0);
      assert.equal(SIMULATION_WEIGHT_BOUNDS.urgencyWeight.max, 60.0);
      assert.equal(SIMULATION_WEIGHT_BOUNDS.priorityWeight.min, 80.0);
      assert.equal(SIMULATION_WEIGHT_BOUNDS.priorityWeight.max, 120.0);

      // Verify preset scenarios are available
      assert.equal(Boolean(SIMULATION_SCENARIOS.deadline_vs_priority), true);
      assert.equal(Boolean(SIMULATION_SCENARIOS.active_backlog), true);

      // Verify storage key constant
      assert.equal(PREFERENCE_COLLECTION_STORAGE_KEY, 'voxplan_preference_collection_enabled');
    });

    it('derives actual evidence counts and exclusions from current events', () => {
      const events = [
        createEvent({
          profileId: 'prof_test',
          eventType: 'schedule_preference_expressed',
          payload: {
            comparison_id: 'cmp_1',
            source: 'explicit_user_choice',
            alternative_a: { id: 'adaptive', strategy: 'adaptive', isConstraintCompliant: true },
            alternative_b: { id: 'edf', strategy: 'edf', isConstraintCompliant: true },
            selected: 'alternative_a',
            comparison_context: { scenario_name: 'Backlog 1' },
          },
        }),
        // Duplicate event with same canonical identity
        createEvent({
          profileId: 'prof_test',
          eventType: 'schedule_preference_expressed',
          payload: {
            comparison_id: 'cmp_1',
            source: 'explicit_user_choice',
            alternative_a: { id: 'adaptive', strategy: 'adaptive', isConstraintCompliant: true },
            alternative_b: { id: 'edf', strategy: 'edf', isConstraintCompliant: true },
            selected: 'alternative_a',
            comparison_context: { scenario_name: 'Backlog 1' },
          },
        }),
        // Non-preference event
        createEvent({
          profileId: 'prof_test',
          taskId: 'task_non_pref',
          eventType: 'task_created',
          payload: { title: 'Test Task' },
        }),
      ];

      const evidence = extractEligiblePreferenceEvidence(events);
      assert.equal(evidence.counts.totalObserved, 2);
      assert.equal(evidence.counts.eligibleCount, 1);
      assert.equal(evidence.counts.byReason.duplicate, 1);
      assert.equal(evidence.eligible.length, 1);
    });

    it('returns a safe unavailable state when event telemetry is corrupt or missing', () => {
      const corruptResult = evaluateLearningReadiness({ events: null, tasks: null });
      assert.equal(corruptResult.status, READINESS_STATUS.UNAVAILABLE);
      assert.equal(corruptResult.isAdaptationUnlocked, false);
      assert.equal(corruptResult.governance.schedulerWeightsModified, false);
    });

    it('does not conflate readiness gate progression with production adaptation authorization', () => {
      // Even if readiness was hypothetically ready, production adaptation remains locked
      const emptyResult = evaluateLearningReadiness({ events: [], tasks: [] });
      assert.equal(emptyResult.isAdaptationUnlocked, false);
      assert.equal(emptyResult.status, READINESS_STATUS.INSUFFICIENT_EVIDENCE);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Candidate Parameter Validation
  // ---------------------------------------------------------------------------
  describe('2. Candidate Parameter Validation (Bounds & Safety)', () => {
    it('accepts valid candidate weights within ±20% bounds', () => {
      const valid = {
        urgencyWeight: 55.0, // bounds [40, 60]
        priorityWeight: 90.0, // bounds [80, 120]
        unblockWeight: 16.5, // bounds [12, 18]
        riskWeight: 22.0, // bounds [20, 30]
      };
      const res = validateCandidateWeights(valid);
      assert.equal(res.isValid, true);
      assert.equal(res.errors.length, 0);
      assert.deepEqual(res.validatedWeights, valid);
      assert.equal(res.isIdenticalToBaseline, false);
      assert.equal(res.deltas.urgencyWeight, 10.0);
      assert.equal(res.deltas.priorityWeight, -10.0);
    });

    it('detects when candidate weights are identical to factory baseline', () => {
      const identical = {
        urgencyWeight: 50.0,
        priorityWeight: 100.0,
        unblockWeight: 15.0,
        riskWeight: 25.0,
      };
      const res = validateCandidateWeights(identical);
      assert.equal(res.isValid, true);
      assert.equal(res.isIdenticalToBaseline, true);
      assert.equal(res.deltas.urgencyWeight, 0.0);
      assert.equal(res.deltas.priorityWeight, 0.0);
    });

    it('rejects candidate weights that exceed the upper bound (+20%)', () => {
      const tooHigh = {
        urgencyWeight: 65.0, // max is 60.0
      };
      const res = validateCandidateWeights(tooHigh);
      assert.equal(res.isValid, false);
      assert.match(res.errors[0], /outside allowed bounds/);
    });

    it('rejects candidate weights below the lower bound (-20%)', () => {
      const tooLow = {
        priorityWeight: 75.0, // min is 80.0
      };
      const res = validateCandidateWeights(tooLow);
      assert.equal(res.isValid, false);
      assert.match(res.errors[0], /outside allowed bounds/);
    });

    it('rejects NaN, Infinity, -Infinity, and non-numeric inputs', () => {
      const nanWeights = { urgencyWeight: NaN };
      const nanRes = validateCandidateWeights(nanWeights);
      assert.equal(nanRes.isValid, false);
      assert.match(nanRes.errors[0], /must be a finite number/);

      const infWeights = { priorityWeight: Infinity };
      const infRes = validateCandidateWeights(infWeights);
      assert.equal(infRes.isValid, false);
      assert.match(infRes.errors[0], /must be a finite number/);

      const strWeights = { unblockWeight: 'not_a_number' };
      const strRes = validateCandidateWeights(strWeights);
      assert.equal(strRes.isValid, false);
      assert.match(strRes.errors[0], /must be a finite number/);
    });

    it('rejects unsupported configuration keys to prevent parameter injection', () => {
      const injected = {
        urgencyWeight: 50.0,
        maliciousKey: 999,
        anotherInvalid: 'hack',
      };
      const res = validateCandidateWeights(injected);
      assert.equal(res.isValid, false);
      assert.equal(res.errors.length, 2);
      assert.match(res.errors[0], /Unsupported configuration parameter: "maliciousKey"/);
      assert.match(res.errors[1], /Unsupported configuration parameter: "anotherInvalid"/);
    });

    it('rejects non-object or array candidate weights inputs', () => {
      assert.equal(validateCandidateWeights(null).isValid, false);
      assert.equal(validateCandidateWeights('invalid').isValid, false);
      assert.equal(validateCandidateWeights([50, 100, 15, 25]).isValid, false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Schedule Simulation Execution, Input Mutation Safety & Determinism
  // ---------------------------------------------------------------------------
  describe('3. Schedule Simulation Execution & Isolation', () => {
    it('produces identical results between factory baseline and identical candidate weights', () => {
      const sim = runScheduleSimulation({
        scenarioKey: 'deadline_vs_priority',
        candidateWeights: FACTORY_SCHEDULER_WEIGHTS,
        options: { startDate: '2026-10-19', dailyCapacityHours: 6.0 },
      });

      assert.equal(sim.status, 'success');
      assert.equal(sim.isIdenticalToBaseline, true);
      assert.equal(sim.isFeasible, true);
      assert.equal(sim.comparison.churnCount, 0);
      assert.equal(sim.comparison.onTimeDelta, 0);
      assert.equal(sim.comparison.delayedDelta, 0);
      assert.equal(sim.comparison.delayDaysDelta, 0);
      assert.equal(sim.comparison.utilizationDeltaPct, 0.0);
      assert.match(sim.tradeOffAnalysis.summary, /identical to factory baseline/);
      assert.equal(sim.isShadowOnly, true);
      assert.equal(sim.productionApplied, false);
      assert.equal(sim.productionScheduleUnchanged, true);
    });

    it('is completely non-mutating with respect to input tasks and options', () => {
      const inputTasks = [
        { id: 't1', title: 'Task 1', estimatedEffort: 2.0, dueDate: '2026-10-19', priority: 'high', dependencies: ['t0'] },
        { id: 't0', title: 'Task 0', estimatedEffort: 1.0, dueDate: '2026-10-19', priority: 'medium', dependencies: [] },
      ];
      const tasksSnapshot = JSON.parse(JSON.stringify(inputTasks));
      const options = { startDate: '2026-10-19', dailyCapacityHours: 6.0 };
      const optionsSnapshot = JSON.parse(JSON.stringify(options));

      runScheduleSimulation({
        scenarioKey: 'active_backlog',
        tasks: inputTasks,
        candidateWeights: { urgencyWeight: 45.0, priorityWeight: 110.0, unblockWeight: 16.0, riskWeight: 22.0 },
        options,
      });

      assert.deepEqual(inputTasks, tasksSnapshot);
      assert.deepEqual(options, optionsSnapshot);
    });

    it('guarantees deterministic output for repeated simulation runs', () => {
      const candidateWeights = {
        urgencyWeight: 58.0,
        priorityWeight: 85.0,
        unblockWeight: 14.0,
        riskWeight: 28.0,
      };

      const run1 = runScheduleSimulation({
        scenarioKey: 'deadline_vs_priority',
        candidateWeights,
        options: { startDate: '2026-10-19', dailyCapacityHours: 6.0 },
      });

      const run2 = runScheduleSimulation({
        scenarioKey: 'deadline_vs_priority',
        candidateWeights,
        options: { startDate: '2026-10-19', dailyCapacityHours: 6.0 },
      });

      assert.deepEqual(run1.baselineMetrics, run2.baselineMetrics);
      assert.deepEqual(run1.candidateMetrics, run2.candidateMetrics);
      assert.deepEqual(run1.comparison, run2.comparison);
      assert.equal(run1.isFeasible, run2.isFeasible);
    });

    it('returns empty_backlog status gracefully when active backlog has no uncompleted tasks', () => {
      const res = runScheduleSimulation({
        scenarioKey: 'active_backlog',
        tasks: [{ id: 'done_1', title: 'Done Task', completed: true }],
      });

      assert.equal(res.status, 'empty_backlog');
      assert.match(res.message, /active task backlog has no uncompleted tasks/);
      assert.equal(res.baselineMetrics, null);
    });

    it('rejects invalid parameters gracefully without throwing uncaught exceptions', () => {
      const res = runScheduleSimulation({
        scenarioKey: 'deadline_vs_priority',
        candidateWeights: { urgencyWeight: 999.0 },
      });

      assert.equal(res.status, 'invalid_parameters');
      assert.equal(res.errors.length, 1);
      assert.equal(res.isFeasible, false);
      assert.equal(res.baselineMetrics, null);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Hard-Constraint Infeasibility Flags & Invariant Protection
  // ---------------------------------------------------------------------------
  describe('4. Hard Constraints & Infeasibility Flags', () => {
    it('verifies that hard constraints remain enforced across all preset scenarios', () => {
      const scenarios = ['deadline_vs_priority', 'dependency_chain', 'capacity_bottleneck'];

      for (const scen of scenarios) {
        const res = runScheduleSimulation({
          scenarioKey: scen,
          candidateWeights: FACTORY_SCHEDULER_WEIGHTS,
        });

        assert.equal(res.isFeasible, true);
        assert.equal(res.baselineMetrics.cycleDetected, false);
        assert.equal(res.candidateMetrics.cycleDetected, false);
        assert.equal(res.baselineMetrics.infeasiblePlacementsCount, 0);
        assert.equal(res.candidateMetrics.infeasiblePlacementsCount, 0);
      }
    });

    it('flags infeasible candidate if tasks contain a circular dependency', () => {
      const cyclicTasks = [
        { id: 'cycle_a', title: 'Task A', estimatedEffort: 2.0, dueDate: '2026-10-19', priority: 'high', dependencies: ['cycle_b'] },
        { id: 'cycle_b', title: 'Task B', estimatedEffort: 2.0, dueDate: '2026-10-19', priority: 'high', dependencies: ['cycle_a'] },
      ];

      const res = runScheduleSimulation({
        scenarioKey: 'active_backlog',
        tasks: cyclicTasks,
        candidateWeights: FACTORY_SCHEDULER_WEIGHTS,
      });

      assert.equal(res.candidateMetrics.cycleDetected, true);
      assert.equal(res.isFeasible, false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Explicit Preference Collection Control & Telemetry Lifecycle
  // ---------------------------------------------------------------------------
  describe('5. Explicit Preference Collection Control', () => {
    let telemetryMgr;

    beforeEach(() => {
      telemetryMgr = new TelemetryManager();
      // Ensure in-memory fallback is reset
      telemetryMgr._preferenceCollectionEnabledMemory = null;
    });

    it('defaults to enabled (true) following opt-in user consent convention', () => {
      assert.equal(telemetryMgr.isPreferenceCollectionEnabled(), true);
    });

    it('toggling collection setting to false persists and blocks new preference recording', async () => {
      const setOk = telemetryMgr.setPreferenceCollectionEnabled(false);
      assert.equal(setOk, true);
      assert.equal(telemetryMgr.isPreferenceCollectionEnabled(), false);

      // Attempt to record explicit preference while collection is disabled
      const recorded = await telemetryMgr.recordSchedulePreference({
        comparisonId: 'test_cmp_blocked',
        alternativeA: { id: 'adaptive', strategy: 'adaptive', isConstraintCompliant: true },
        alternativeB: { id: 'edf', strategy: 'edf', isConstraintCompliant: true },
        selected: 'alternative_a',
        comparisonContext: { scenario_name: 'Blocked Scenario' },
      });

      assert.equal(recorded, null);

      // Verify no event was added to the events cache
      const hasPrefEvent = telemetryMgr.eventsCache.some(
        (e) => e.event_type === 'schedule_preference_expressed' && e.payload?.comparison_id === 'test_cmp_blocked'
      );
      assert.equal(hasPrefEvent, false);
    });

    it('essential lifecycle telemetry continues functioning normally when preference collection is disabled', async () => {
      telemetryMgr.setPreferenceCollectionEnabled(false);

      const taskEvent = await telemetryMgr.recordTaskCreated({
        id: 't_essential_1',
        title: 'Essential Operational Task',
        priority: 'high',
        category: 'Work',
      });

      assert.notEqual(taskEvent, null);
      assert.equal(taskEvent.event_type, 'task_created');
      assert.equal(taskEvent.task_id, 't_essential_1');
    });

    it('re-enabling preference collection allows new events without duplicating history', async () => {
      // Step 1: Record initial preference
      telemetryMgr.setPreferenceCollectionEnabled(true);
      const pref1 = await telemetryMgr.recordSchedulePreference({
        comparisonId: 'cmp_re_enable_1',
        alternativeA: { id: 'adaptive', strategy: 'adaptive' },
        alternativeB: { id: 'edf', strategy: 'edf' },
        selected: 'alternative_a',
      });
      assert.notEqual(pref1, null);

      // Step 2: Disable collection
      telemetryMgr.setPreferenceCollectionEnabled(false);
      const blocked = await telemetryMgr.recordSchedulePreference({
        comparisonId: 'cmp_re_enable_2',
        alternativeA: { id: 'adaptive', strategy: 'adaptive' },
        alternativeB: { id: 'edf', strategy: 'edf' },
        selected: 'alternative_a',
      });
      assert.equal(blocked, null);

      // Step 3: Re-enable collection
      telemetryMgr.setPreferenceCollectionEnabled(true);
      const pref3 = await telemetryMgr.recordSchedulePreference({
        comparisonId: 'cmp_re_enable_3',
        alternativeA: { id: 'adaptive', strategy: 'adaptive' },
        alternativeB: { id: 'edf', strategy: 'edf' },
        selected: 'alternative_b',
      });
      assert.notEqual(pref3, null);
      assert.equal(pref3.payload.comparison_id, 'cmp_re_enable_3');

      // Attempting to submit cmp_re_enable_1 again is deduplicated
      const dup = await telemetryMgr.recordSchedulePreference({
        comparisonId: 'cmp_re_enable_1',
        alternativeA: { id: 'adaptive', strategy: 'adaptive' },
        alternativeB: { id: 'edf', strategy: 'edf' },
        selected: 'alternative_a',
      });
      assert.equal(dup, null);
    });

    it('toggling preference collection setting produces zero telemetry events', () => {
      const initialCount = telemetryMgr.eventsCache.length;
      telemetryMgr.setPreferenceCollectionEnabled(false);
      telemetryMgr.setPreferenceCollectionEnabled(true);
      assert.equal(telemetryMgr.eventsCache.length, initialCount);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Non-Negotiable Production Safety Invariants
  // ---------------------------------------------------------------------------
  describe('6. Non-Negotiable Production Safety Invariants', () => {
    it('factory scheduler weights remain strictly unchanged', () => {
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
    });

    it('schedule generation produces bit-for-bit identical schedules for production inputs', () => {
      const sampleTasks = [
        { id: 'safe_1', title: 'Task 1', estimatedEffort: 3.0, dueDate: '2026-10-20', priority: 'high' },
        { id: 'safe_2', title: 'Task 2', estimatedEffort: 2.0, dueDate: '2026-10-21', priority: 'low' },
      ];

      const sched1 = generateAdaptiveSchedule(sampleTasks, {
        startDate: '2026-10-19',
        dailyCapacityHours: 6.0,
      });

      const sched2 = generateAdaptiveSchedule(sampleTasks, {
        startDate: '2026-10-19',
        dailyCapacityHours: 6.0,
      });

      assert.deepEqual(sched1.placements, sched2.placements);
      assert.deepEqual(sched1.summary, sched2.summary);
    });

    it('simulation does not write to production settings or shared objects', () => {
      const sharedTasks = [
        { id: 'p1', title: 'Production Task', estimatedEffort: 4.0, dueDate: '2026-10-22', priority: 'medium' },
      ];
      const candidateWeights = {
        urgencyWeight: 60.0,
        priorityWeight: 120.0,
        unblockWeight: 18.0,
        riskWeight: 30.0,
      };

      const sim = runScheduleSimulation({
        scenarioKey: 'active_backlog',
        tasks: sharedTasks,
        candidateWeights,
      });

      assert.equal(sim.productionApplied, false);
      assert.equal(sim.isShadowOnly, true);
      assert.equal(sim.productionScheduleUnchanged, true);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
    });
  });
});
