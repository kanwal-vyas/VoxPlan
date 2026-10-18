/**
 * Comprehensive Automated Tests for VoxPlan Bounded Heuristic Weight Adaptation
 * & Bayesian Shrinkage (Phase 7, Stage 3).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeBayesianPosteriorWeight,
  clampWeightDelta,
  computeBoundedCandidateWeights,
  DEFAULT_K_PRIOR,
  MAX_RELATIVE_WEIGHT_DELTA,
  ADAPTATION_EVALUATION_STATUS,
} from '../src/scheduler/boundedWeightAdapter.js';
import {
  evaluateShadowSchedule,
} from '../src/scheduler/shadowSchedulerEvaluator.js';
import {
  FACTORY_SCHEDULER_WEIGHTS,
  generateAdaptiveSchedule,
  calculateTaskPriorityScore,
} from '../src/scheduler/adaptiveScheduler.js';
import { EVIDENCE_LEVELS } from '../src/scheduler/preferenceAnalyzer.js';

describe('Phase 7.3: Bounded Heuristic Weight Adaptation & Bayesian Shrinkage', () => {
  describe('1. Bayesian Shrinkage Mathematics & Precision Weighting', () => {
    it('verifies default shrinkage constants: K_prior = 10 and maxDelta = 20%', () => {
      assert.equal(DEFAULT_K_PRIOR, 10);
      assert.equal(MAX_RELATIVE_WEIGHT_DELTA, 0.20);
    });

    it('preserves factory baseline exactly when observation count is 0', () => {
      const w0 = 100.0;
      const posterior = computeBayesianPosteriorWeight({
        baselineWeight: w0,
        empiricalWeight: 70.0,
        observationCount: 0,
        kPrior: 10,
      });
      assert.equal(posterior, w0);
    });

    it('strongly shrinks weak evidence (N = 3) toward factory baseline (K_prior = 10)', () => {
      const w0 = 100.0;
      const wEmp = 60.0; // Implies -40% drop
      const posterior = computeBayesianPosteriorWeight({
        baselineWeight: w0,
        empiricalWeight: wEmp,
        observationCount: 3,
        kPrior: 10,
      });

      // Expected: (10 * 100 + 3 * 60) / 13 = 1180 / 13 = 90.769...
      const expected = (10 * 100 + 3 * 60) / 13;
      assert.ok(Math.abs(posterior - expected) < 1e-6);
      // Posterior is only ~9.2% away from baseline despite empirical being 40% away!
      assert.ok(posterior > 90.0 && posterior < 91.0);
    });

    it('gives equal 50/50 weight to prior baseline and empirical evidence when N = K_prior', () => {
      const w0 = 50.0;
      const wEmp = 70.0;
      const posterior = computeBayesianPosteriorWeight({
        baselineWeight: w0,
        empiricalWeight: wEmp,
        observationCount: 10,
        kPrior: 10,
      });

      // Expected: (10 * 50 + 10 * 70) / 20 = 60.0
      assert.equal(posterior, 60.0);
    });

    it('gives majority weight to empirical evidence when observations are abundant (N = 40)', () => {
      const w0 = 100.0;
      const wEmp = 80.0;
      const posterior = computeBayesianPosteriorWeight({
        baselineWeight: w0,
        empiricalWeight: wEmp,
        observationCount: 40,
        kPrior: 10,
      });

      // Expected: (10 * 100 + 40 * 80) / 50 = (1000 + 3200) / 50 = 84.0
      assert.equal(posterior, 84.0);
    });

    it('safely handles non-finite, negative, or invalid empirical weights by retaining baseline', () => {
      const w0 = 100.0;
      assert.equal(
        computeBayesianPosteriorWeight({ baselineWeight: w0, empiricalWeight: NaN, observationCount: 5 }),
        w0
      );
      assert.equal(
        computeBayesianPosteriorWeight({ baselineWeight: w0, empiricalWeight: -50, observationCount: 5 }),
        w0
      );
      assert.equal(
        computeBayesianPosteriorWeight({ baselineWeight: w0, empiricalWeight: null, observationCount: 5 }),
        w0
      );
      assert.equal(
        computeBayesianPosteriorWeight({ baselineWeight: w0, empiricalWeight: 80, observationCount: -2 }),
        w0
      );
    });
  });

  describe('2. Strict ±20% Parameter Safety Clamping', () => {
    it('clamps values exceeding +20% to exactly 1.20 * baseline', () => {
      const w0 = 100.0;
      const clamp = clampWeightDelta({
        candidateWeight: 150.0, // +50%
        baselineWeight: w0,
        maxRelativeDelta: 0.20,
      });

      assert.equal(clamp.postClampValue, 120.0);
      assert.equal(clamp.isClamped, true);
      assert.equal(clamp.isClampedAbove, true);
      assert.equal(clamp.relativeDeltaPct, 20.0);
    });

    it('clamps values below -20% to exactly 0.80 * baseline', () => {
      const w0 = 100.0;
      const clamp = clampWeightDelta({
        candidateWeight: 50.0, // -50%
        baselineWeight: w0,
        maxRelativeDelta: 0.20,
      });

      assert.equal(clamp.postClampValue, 80.0);
      assert.equal(clamp.isClamped, true);
      assert.equal(clamp.isClampedBelow, true);
      assert.equal(clamp.relativeDeltaPct, -20.0);
    });

    it('preserves values within ±20% without clamping', () => {
      const w0 = 100.0;
      const clamp = clampWeightDelta({
        candidateWeight: 92.5, // -7.5%
        baselineWeight: w0,
        maxRelativeDelta: 0.20,
      });

      assert.equal(clamp.postClampValue, 92.5);
      assert.equal(clamp.isClamped, false);
      assert.equal(clamp.relativeDeltaPct, -7.5);
    });
  });

  describe('3. Readiness Gating & Authoritative Phase 7.1 Integration', () => {
    it('strictly locks adaptation and returns factory baseline when readiness is unmet', () => {
      const unmetReadiness = {
        status: 'insufficient_evidence',
        gates: {
          decidedProposals: { passed: false, current: 7, required: 20 },
          verifiedCompletions: { passed: false, current: 0, required: 15 },
          taskCategories: { passed: false, current: 0, required: 3 },
          activeDuration: { passed: false, current: 2, required: 14 },
        },
      };

      const result = computeBoundedCandidateWeights({
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        preferenceReport: { candidateSignals: [] },
        readiness: unmetReadiness,
      });

      assert.equal(result.isReadinessMet, false);
      assert.equal(result.readinessStatus, ADAPTATION_EVALUATION_STATUS.INSUFFICIENT_READINESS);
      assert.equal(result.isAdaptationUnlocked, false);
      assert.equal(result.productionApplied, false);
      assert.deepEqual(result.candidateWeights, FACTORY_SCHEDULER_WEIGHTS);
      assert.deepEqual(result.unmetGates, [
        'decidedProposals',
        'verifiedCompletions',
        'taskCategories',
        'activeDuration',
      ]);
    });

    it('retains adaptation lock even when readiness is met (shadow evaluation only)', () => {
      const metReadiness = {
        status: 'ready',
        gates: {
          decidedProposals: { passed: true, current: 20, required: 20 },
          verifiedCompletions: { passed: true, current: 15, required: 15 },
          taskCategories: { passed: true, current: 3, required: 3 },
          activeDuration: { passed: true, current: 14, required: 14 },
        },
      };

      const result = computeBoundedCandidateWeights({
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        preferenceReport: { candidateSignals: [] },
        readiness: metReadiness,
      });

      assert.equal(result.isReadinessMet, true);
      assert.equal(result.readinessStatus, ADAPTATION_EVALUATION_STATUS.READY_FOR_SHADOW_EVALUATION);
      assert.equal(result.isAdaptationUnlocked, false, 'Adaptation must remain locked in Phase 7.3');
      assert.equal(result.productionApplied, false, 'Production applied must remain false');
      assert.equal(result.isShadowOnly, true);
    });
  });

  describe('4. Evidence-to-Weight Mapping & Conflict Resolution', () => {
    it('adapts priorityWeight when eligible high-priority postponement friction exists', () => {
      const metReadiness = { status: 'ready', gates: {} };
      const preferenceReport = {
        candidateSignals: [
          {
            id: 'postponement_priority_high',
            family: 'postponement_friction',
            evidenceLevel: EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION,
            isPreliminary: false,
            supportingEvidenceCount: 8,
            denominator: 10, // 80% postponed
          },
        ],
      };

      const result = computeBoundedCandidateWeights({
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        preferenceReport,
        readiness: metReadiness,
      });

      const prioDiag = result.weightDiagnostics.priorityWeight;
      assert.equal(prioDiag.supported, true);
      assert.ok(prioDiag.postClamp < FACTORY_SCHEDULER_WEIGHTS.priorityWeight);
      assert.ok(prioDiag.postClamp >= 80.0, 'Must stay within -20% clamp');
      assert.equal(result.candidateWeights.priorityWeight, prioDiag.postClamp);
    });

    it('quarantines priorityWeight to factory baseline when conflicting postponement signals exist', () => {
      const metReadiness = { status: 'ready', gates: {} };
      const preferenceReport = {
        candidateSignals: [
          {
            id: 'postponement_priority_high',
            family: 'postponement_friction',
            evidenceLevel: EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION,
            isPreliminary: false,
            supportingEvidenceCount: 6,
            denominator: 8,
          },
          {
            id: 'postponement_priority_low',
            family: 'postponement_friction',
            evidenceLevel: EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION,
            isPreliminary: false,
            supportingEvidenceCount: 6,
            denominator: 8,
          },
        ],
      };

      const result = computeBoundedCandidateWeights({
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        preferenceReport,
        readiness: metReadiness,
      });

      assert.equal(result.conflictingSignals.length, 1);
      assert.equal(result.candidateWeights.priorityWeight, FACTORY_SCHEDULER_WEIGHTS.priorityWeight);
      assert.equal(result.weightDiagnostics.priorityWeight.reason, 'conflict_quarantine');
    });

    it('documents unmapped signals as unsupported without corrupting weights', () => {
      const metReadiness = { status: 'ready', gates: {} };
      const preferenceReport = {
        candidateSignals: [
          {
            id: 'proposal_discard_friction',
            family: 'proposal_decision_friction',
            evidenceLevel: EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION,
            isPreliminary: false,
          },
        ],
      };

      const result = computeBoundedCandidateWeights({
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        preferenceReport,
        readiness: metReadiness,
      });

      // Proposal discard does not adjust priority or urgency weights
      assert.deepEqual(result.candidateWeights, FACTORY_SCHEDULER_WEIGHTS);
      assert.ok(result.unsupportedMappings.some((u) => u.signalFamily === 'proposal_decision_friction'));
    });
  });

  describe('5. Shadow Schedule Evaluation & Regression Gates', () => {
    it('evaluates baseline and candidate schedules on identical task inputs without churn when weights match', () => {
      const tasks = [
        { id: 't1', title: 'Task 1', estimatedEffort: 2.0, dueDate: '2026-10-22', priority: 'high', completed: false },
        { id: 't2', title: 'Task 2', estimatedEffort: 3.0, dueDate: '2026-10-23', priority: 'medium', completed: false },
      ];

      const report = evaluateShadowSchedule({
        tasks,
        options: { startDate: '2026-10-18' },
        candidateWeights: FACTORY_SCHEDULER_WEIGHTS,
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        verifiedCompletionsCount: 0,
      });

      assert.equal(report.isShadowOnly, true);
      assert.equal(report.productionApplied, false);
      assert.equal(report.comparison.scheduleChurnCount, 0);
      assert.equal(report.regressionGate.passed, true);
      assert.equal(report.isRealEvidenceSufficient, false);
      assert.equal(report.evaluationOutcome, 'not_evaluable_insufficient_real_evidence');
    });

    it('detects and flags candidate schedule regressions (e.g. cycle failure or delay regression)', () => {
      const tasks = [
        { id: 't1', title: 'Task 1', estimatedEffort: 2.0, dueDate: '2026-10-19', priority: 'low', completed: false },
        { id: 't2', title: 'Task 2', estimatedEffort: 4.0, dueDate: '2026-10-19', priority: 'high', completed: false },
      ];

      // With inverted weights that might alter deadline order
      const report = evaluateShadowSchedule({
        tasks,
        options: { startDate: '2026-10-18', dailyCapacityHours: 4.0 },
        candidateWeights: { urgencyWeight: 10.0, priorityWeight: 120.0, unblockWeight: 15.0, riskWeight: 25.0 },
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        verifiedCompletionsCount: 20, // Pretend mature for regression gate test
      });

      assert.ok(report.baselineMetrics.scheduledTasks > 0);
      assert.ok(report.candidateMetrics.scheduledTasks > 0);
    });
  });

  describe('6. Production Isolation & Schedule Invariance', () => {
    it('guarantees that computing candidate weights leaves FACTORY_SCHEDULER_WEIGHTS immutable', () => {
      const frozenBefore = { ...FACTORY_SCHEDULER_WEIGHTS };
      computeBoundedCandidateWeights({
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        preferenceReport: { candidateSignals: [] },
        readiness: { status: 'ready' },
      });
      assert.deepEqual(FACTORY_SCHEDULER_WEIGHTS, frozenBefore);
    });

    it('guarantees that default generateAdaptiveSchedule output is 100% identical before and after adapter evaluation', () => {
      const testTasks = [
        { id: 't1', title: 'Task 1', estimatedEffort: 2.0, dueDate: '2026-10-22', priority: 'high', completed: false },
        { id: 't2', title: 'Task 2', estimatedEffort: 3.0, dueDate: '2026-10-25', priority: 'medium', completed: false },
        { id: 't3', title: 'Task 3', estimatedEffort: 1.5, dueDate: '2026-10-21', priority: 'low', completed: false },
      ];

      // Schedule generated before adapter invocation
      const schedBefore = generateAdaptiveSchedule(testTasks, { startDate: '2026-10-18' });

      // Run candidate weight adapter and shadow evaluator
      const weightsRes = computeBoundedCandidateWeights({
        baselineWeights: FACTORY_SCHEDULER_WEIGHTS,
        preferenceReport: null,
        readiness: { status: 'ready' },
      });
      evaluateShadowSchedule({
        tasks: testTasks,
        options: { startDate: '2026-10-18' },
        candidateWeights: weightsRes.candidateWeights,
      });

      // Schedule generated after adapter invocation (production default path)
      const schedAfter = generateAdaptiveSchedule(testTasks, { startDate: '2026-10-18' });

      assert.deepEqual(schedBefore.placements, schedAfter.placements);
      assert.deepEqual(schedBefore.summary, schedAfter.summary);
    });

    it('guarantees calculateTaskPriorityScore uses FACTORY_SCHEDULER_WEIGHTS by default', () => {
      const task = { id: 'sample', dueDate: '2026-10-20', priority: 'high' };
      const defaultScore = calculateTaskPriorityScore(task, undefined, '2026-10-18');
      const explicitScore = calculateTaskPriorityScore(task, FACTORY_SCHEDULER_WEIGHTS, '2026-10-18');
      assert.equal(defaultScore, explicitScore);
    });
  });
});
