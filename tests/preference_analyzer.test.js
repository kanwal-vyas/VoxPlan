/**
 * Comprehensive Automated Tests for VoxPlan Empirical Preference Signal Derivation
 * & Friction Profiling (Phase 7, Stage 2).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzePreferenceSignals,
  EVIDENCE_LEVELS,
  MIN_OBSERVATIONS_PER_SEGMENT,
} from '../src/scheduler/preferenceAnalyzer.js';
import { generateAdaptiveSchedule } from '../src/scheduler/adaptiveScheduler.js';

describe('Phase 7.2: Empirical Preference Signal Derivation & Friction Profiling', () => {
  const BASE_TIME = new Date('2026-10-18T12:00:00.000Z');

  // Helper to create an ISO timestamp N days before BASE_TIME
  const daysAgo = (n, hour = 10) => {
    const d = new Date(BASE_TIME);
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  // Helper to generate a fully mature synthetic fixture satisfying Phase 7.1
  const createFullyMatureFixture = () => {
    const events = [];
    const tasks = [];

    // 20 proposals with decisions
    for (let i = 1; i <= 20; i++) {
      const scheduleId = `sched_mature_${i}`;
      const dayOffset = Math.min(25, i);
      const genTime = daysAgo(dayOffset, 9);
      const decTime = daysAgo(dayOffset, 10);

      events.push({
        event_id: `evt_gen_${i}`,
        event_type: 'schedule_proposal_generated',
        timestamp: genTime,
        payload: { schedule_id: scheduleId, strategy: 'adaptive' },
      });

      if (i <= 15) {
        const taskId = `task_mature_${i}`;
        const proposedDate = daysAgo(dayOffset - 1).split('T')[0];
        const cat = i % 3 === 0 ? 'Engineering' : i % 3 === 1 ? 'Design' : 'Product';

        tasks.push({
          id: taskId,
          title: `Mature Task ${i}`,
          category: cat,
          priority: i % 2 === 0 ? 'high' : 'low',
          completed: true,
          dueDate: proposedDate,
          estimatedEffort: 2.0,
        });

        events.push({
          event_id: `evt_acc_${i}`,
          event_type: 'schedule_proposal_accepted',
          timestamp: decTime,
          payload: {
            schedule_id: scheduleId,
            applied_placements: [{ task_id: taskId, proposed_date: proposedDate }],
          },
        });

        const compTime = daysAgo(dayOffset - 1, 15);
        events.push({
          event_id: `evt_comp_${i}`,
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: compTime,
          payload: {
            completed_at: compTime,
            tracked_duration_seconds: cat === 'Engineering' ? 10800 : 7200, // Engineering takes 3h (1.5x of 2h)
          },
        });
      } else {
        events.push({
          event_id: `evt_disc_${i}`,
          event_type: 'schedule_proposal_discarded',
          timestamp: decTime,
          payload: { schedule_id: scheduleId, reason: 'user_discard' },
        });
      }
    }

    return { events, tasks };
  };

  describe('1. Readiness Gate Integration & Governance Boundaries', () => {
    it('strictly locks adaptation and labels signals as preliminary when Phase 7.1 readiness is unmet', () => {
      assert.equal(MIN_OBSERVATIONS_PER_SEGMENT, 3);
      // Incomplete history (e.g. only 3 proposals)
      const events = [
        {
          event_id: 'e1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5),
          payload: { schedule_id: 's1', applied_placements: [] },
        },
      ];
      const result = analyzePreferenceSignals({ events, tasks: [], now: BASE_TIME });

      assert.equal(result.readiness.status, 'insufficient_evidence');
      assert.equal(result.isAdaptationUnlocked, false);
      assert.equal(result.governance.noSchedulerWeightsModified, true);
      assert.equal(result.governance.noLearningPerformed, true);
    });

    it('permits candidate signal derivation when Phase 7.1 passes, but still keeps adaptation locked', () => {
      const { events, tasks } = createFullyMatureFixture();
      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });

      assert.equal(result.readiness.status, 'ready');
      // Adaptation must STILL be locked in Phase 7.2!
      assert.equal(result.isAdaptationUnlocked, false);
      assert.equal(result.governance.noSchedulerWeightsModified, true);
      assert.ok(result.candidateSignals.length > 0);
    });

    it('returns structured unavailable result when events is not an array', () => {
      const result = analyzePreferenceSignals({ events: null, tasks: [] });
      assert.equal(result.readiness.status, 'unavailable');
      assert.equal(result.isAdaptationUnlocked, false);
      assert.equal(result.candidateSignals.length, 0);
      assert.ok(result.unavailableSignalFamilies.length > 0);
    });
  });

  describe('2. Category Effort Underestimation Signals', () => {
    it('detects category effort underestimation when median ratio > 1.2 with >= 3 observations', () => {
      const { events, tasks } = createFullyMatureFixture();
      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });

      const engSignal = result.candidateSignals.find(
        (s) => s.family === 'category_effort_underestimation' && s.id.includes('engineering')
      );
      assert.ok(engSignal, 'Should detect Engineering underestimation signal');
      assert.equal(engSignal.evidenceLevel, EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION);
      assert.equal(engSignal.metricValue, '1.50x');
      assert.ok(engSignal.observedBehavior.includes('1.50x duration ratio'));
      assert.ok(engSignal.confounders.length >= 2);
    });

    it('marks category signal as insufficient_evidence when fewer than 3 paired tasks exist', () => {
      const events = [
        {
          event_id: 'e1',
          task_id: 't_sparse',
          event_type: 'task_completed',
          timestamp: daysAgo(2),
          payload: { tracked_duration_seconds: 14400 },
        },
      ];
      const tasks = [{ id: 't_sparse', category: 'Dev', estimatedEffort: 2.0, completed: true }];

      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });
      const devSignal = result.candidateSignals.find((s) => s.id.includes('dev'));
      assert.equal(devSignal, undefined, 'Sparse category (< 3 tasks) must not yield a candidate signal');
    });
  });

  describe('3. Postponement Friction Signals', () => {
    it('detects forward postponement friction when segment has >= 60% postponed overrides (>= 3 overrides)', () => {
      const events = [];
      const tasks = [];

      for (let i = 1; i <= 4; i++) {
        const taskId = `t_low_${i}`;
        tasks.push({ id: taskId, title: `Low Task ${i}`, priority: 'low', category: 'General' });

        // Accepted proposal placing the task
        events.push({
          event_id: `e_acc_${i}`,
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(10 + i),
          payload: {
            schedule_id: `s_prio_${i}`,
            applied_placements: [{ task_id: taskId, proposed_date: daysAgo(5 + i).split('T')[0] }],
          },
        });

        // User manually postpones forward
        events.push({
          event_id: `e_shift_${i}`,
          task_id: taskId,
          event_type: 'task_rescheduled',
          timestamp: daysAgo(4 + i),
          payload: {
            previous_due_date: daysAgo(5 + i).split('T')[0],
            new_due_date: daysAgo(1 + i).split('T')[0],
            reason: 'manual_shift',
          },
        });
      }

      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });
      const prioSignal = result.candidateSignals.find((s) => s.family === 'postponement_friction');
      assert.ok(prioSignal, 'Should detect low priority postponement friction');
      assert.equal(prioSignal.metricValue, '100%');
      assert.equal(prioSignal.denominator, 4);
      assert.ok(prioSignal.isPreliminary, 'Should be preliminary when Phase 7.1 readiness is unmet');
    });
  });

  describe('4. Proposal Decision Friction & Discard Rates', () => {
    it('calculates exact proposal discard rate and flags elevated discard frequency when discardRate >= 0.4', () => {
      const events = [];
      // 3 accepted, 3 discarded = 6 decided (discardRate = 50%)
      for (let i = 1; i <= 6; i++) {
        const sId = `s_dec_${i}`;
        events.push({
          event_id: `g_${i}`,
          event_type: 'schedule_proposal_generated',
          timestamp: daysAgo(10, 8),
          payload: { schedule_id: sId },
        });

        if (i <= 3) {
          events.push({
            event_id: `a_${i}`,
            event_type: 'schedule_proposal_accepted',
            timestamp: daysAgo(10, 9),
            payload: { schedule_id: sId, applied_placements: [] },
          });
        } else {
          events.push({
            event_id: `d_${i}`,
            event_type: 'schedule_proposal_discarded',
            timestamp: daysAgo(10, 9),
            payload: { schedule_id: sId, reason: 'too_packed' },
          });
        }
      }

      const result = analyzePreferenceSignals({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.frictionProfile.proposals.decidedCount, 6);
      assert.equal(result.frictionProfile.proposals.acceptedCount, 3);
      assert.equal(result.frictionProfile.proposals.discardedCount, 3);
      assert.equal(result.frictionProfile.proposals.discardRate, 0.5);

      const discardSignal = result.candidateSignals.find((s) => s.family === 'proposal_decision_friction');
      assert.ok(discardSignal);
      assert.equal(discardSignal.metricValue, '50%');
      assert.equal(discardSignal.denominator, 6);
    });

    it('detects weekday completion dip when total completed >= 8 and a day has <= 1 completion', () => {
      const events = [];
      const tasks = [];

      // Create completions distributed across Mon-Thu (2 each = 8 total), Friday = 0
      // 2026-10-18 is Sunday (day 0)
      // Mon Oct 12: 2 completions
      // Tue Oct 13: 2 completions
      // Wed Oct 14: 2 completions
      // Thu Oct 15: 2 completions
      // Fri Oct 16: 0 completions
      const days = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'];
      let count = 0;
      for (const d of days) {
        for (let j = 1; j <= 2; j++) {
          count++;
          const tId = `t_wkday_${count}`;
          tasks.push({ id: tId, title: `Weekday Task ${count}`, completed: true });
          events.push({
            event_id: `e_comp_${count}`,
            task_id: tId,
            event_type: 'task_completed',
            timestamp: `${d}T14:00:00.000Z`,
            payload: { tracked_duration_seconds: 3600 },
          });
        }
      }

      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });
      const dipSignal = result.candidateSignals.find((s) => s.family === 'day_of_week_focus_realism');
      assert.ok(dipSignal, 'Should detect weekday velocity dip');
      assert.ok(dipSignal.name.includes('Completion Velocity Dip'));
      assert.equal(dipSignal.denominator, 8);
    });

    it('excludes reopened tasks from category effort overrun calculations', () => {
      const tId = 't_reopened_calc';
      const events = [
        {
          event_id: 'e1',
          task_id: tId,
          event_type: 'task_created',
          timestamp: daysAgo(5),
          payload: { category: 'Design', estimated_effort: 1.0 },
        },
        {
          event_id: 'e2',
          task_id: tId,
          event_type: 'task_completed',
          timestamp: daysAgo(3),
          payload: { tracked_duration_seconds: 14400 }, // 4 hours (4x overrun)
        },
        {
          event_id: 'e3',
          task_id: tId,
          event_type: 'task_reopened',
          timestamp: daysAgo(2),
        },
      ];

      const tasks = [{ id: tId, category: 'Design', completed: false }];
      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });
      assert.equal(result.frictionProfile.effortAccuracy.totalPairedCount, 0, 'Reopened tasks must be excluded from effort paired count');
    });
  });

  describe('5. Explicitly Unavailable Signal Families', () => {
    it('marks intraday time-window friction as unavailable with explicit missing provenance reason', () => {
      const result = analyzePreferenceSignals({ events: [], tasks: [], now: BASE_TIME });
      const unavail = result.unavailableSignalFamilies.find((f) => f.family === 'intraday_window_friction');

      assert.ok(unavail, 'Must explicitly report intraday window friction as unavailable');
      assert.equal(unavail.reason, 'missing_intraday_window_provenance');
      assert.ok(unavail.explanation.includes('intraday time-block identifiers'));
      assert.ok(unavail.requiredTelemetry.includes('original_window_id'));
    });
  });

  describe('6. Immutability, Isolation & Schedule Invariance', () => {
    it('does not mutate input events or tasks', () => {
      const events = Object.freeze([
        Object.freeze({
          event_id: 'e1',
          event_type: 'task_completed',
          timestamp: daysAgo(2),
          payload: Object.freeze({ tracked_duration_seconds: 3600 }),
        }),
      ]);
      const tasks = Object.freeze([
        Object.freeze({ id: 't1', category: 'Work', estimatedEffort: 1.0, completed: true }),
      ]);

      assert.doesNotThrow(() => {
        analyzePreferenceSignals({ events, tasks, now: BASE_TIME });
      });
    });

    it('guarantees that running analyzePreferenceSignals leaves adaptiveScheduler output 100% identical', () => {
      const testTasks = [
        { id: 't1', title: 'Task 1', estimatedEffort: 2.0, dueDate: '2026-10-22', priority: 'high', completed: false },
        { id: 't2', title: 'Task 2', estimatedEffort: 3.0, dueDate: '2026-10-25', priority: 'medium', completed: false },
      ];

      // Schedule generation BEFORE running analysis
      const schedBefore = generateAdaptiveSchedule(testTasks, { startDate: '2026-10-18' });

      // Run preference analysis with fully mature fixture
      const { events, tasks } = createFullyMatureFixture();
      analyzePreferenceSignals({ events, tasks, now: BASE_TIME });

      // Schedule generation AFTER running analysis
      const schedAfter = generateAdaptiveSchedule(testTasks, { startDate: '2026-10-18' });

      // Must be completely identical down to placements and scheduled dates
      assert.deepEqual(schedBefore.placements, schedAfter.placements);
      assert.deepEqual(schedBefore.summary, schedAfter.summary);
    });
  });
});
