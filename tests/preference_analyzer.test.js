/**
 * Comprehensive Automated Tests for VoxPlan Empirical Preference Signal Derivation
 * & Friction Profiling (Phase 7, Stage 2).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzePreferenceSignals,
  classifySignalEvidenceLevel,
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

  describe('7. Evidence-Level Classification Contract & Boundary Hierarchy (Audit C)', () => {
    it('classifies unavailable provenance as UNAVAILABLE with highest precedence', () => {
      const level = classifySignalEvidenceLevel({
        observationCount: 10,
        isReadinessMet: true,
        isProvenanceAvailable: false,
      });
      assert.equal(level, EVIDENCE_LEVELS.UNAVAILABLE);
    });

    it('classifies sample counts 0, 1, 2 as INSUFFICIENT_EVIDENCE regardless of readiness', () => {
      for (const count of [0, 1, 2]) {
        assert.equal(
          classifySignalEvidenceLevel({ observationCount: count, isReadinessMet: false }),
          EVIDENCE_LEVELS.INSUFFICIENT_EVIDENCE,
          `count ${count} with unmet readiness must be INSUFFICIENT_EVIDENCE`
        );
        assert.equal(
          classifySignalEvidenceLevel({ observationCount: count, isReadinessMet: true }),
          EVIDENCE_LEVELS.INSUFFICIENT_EVIDENCE,
          `count ${count} with met readiness must be INSUFFICIENT_EVIDENCE`
        );
      }
    });

    it('classifies sample counts 3 and 4 as PRELIMINARY when readiness is unmet', () => {
      for (const count of [3, 4]) {
        assert.equal(
          classifySignalEvidenceLevel({ observationCount: count, isReadinessMet: false }),
          EVIDENCE_LEVELS.PRELIMINARY,
          `count ${count} with unmet readiness must be PRELIMINARY`
        );
      }
    });

    it('classifies sample counts 3 and 4 as REPEATED_OBSERVATION when readiness is met', () => {
      for (const count of [3, 4]) {
        assert.equal(
          classifySignalEvidenceLevel({ observationCount: count, isReadinessMet: true }),
          EVIDENCE_LEVELS.REPEATED_OBSERVATION,
          `count ${count} with met readiness must be REPEATED_OBSERVATION`
        );
      }
    });

    it('strictly bounds count >= 5 to PRELIMINARY when global readiness is unmet', () => {
      assert.equal(
        classifySignalEvidenceLevel({ observationCount: 5, isReadinessMet: false }),
        EVIDENCE_LEVELS.PRELIMINARY,
        'Global readiness unmet must override local sample count of 5'
      );
      assert.equal(
        classifySignalEvidenceLevel({ observationCount: 20, isReadinessMet: false }),
        EVIDENCE_LEVELS.PRELIMINARY,
        'Global readiness unmet must override local sample count of 20'
      );
    });

    it('classifies count >= 5 as ELIGIBLE_FOR_LATER_EVALUATION when global readiness is met', () => {
      assert.equal(
        classifySignalEvidenceLevel({ observationCount: 5, isReadinessMet: true }),
        EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION
      );
      assert.equal(
        classifySignalEvidenceLevel({ observationCount: 12, isReadinessMet: true }),
        EVIDENCE_LEVELS.ELIGIBLE_FOR_LATER_EVALUATION
      );
    });

    it('classifies inconsistent, contradictory, or clustered data as INSUFFICIENT_EVIDENCE', () => {
      assert.equal(
        classifySignalEvidenceLevel({ observationCount: 6, isReadinessMet: true, isConsistent: false }),
        EVIDENCE_LEVELS.INSUFFICIENT_EVIDENCE
      );
      assert.equal(
        classifySignalEvidenceLevel({ observationCount: 6, isReadinessMet: true, hasContradictions: true }),
        EVIDENCE_LEVELS.INSUFFICIENT_EVIDENCE
      );
      assert.equal(
        classifySignalEvidenceLevel({ observationCount: 6, isReadinessMet: true, hasTaskClustering: true }),
        EVIDENCE_LEVELS.INSUFFICIENT_EVIDENCE
      );
    });
  });

  describe('8. Proposal Decision Provenance, Deduplication & Denominator Integrity (Audit A & B)', () => {
    it('does not inflate decidedCount or discardRate upon duplicate delivery of the same decision', () => {
      const scheduleId = 'sched_dedup_test';
      const events = [
        {
          event_id: 'e_gen_1',
          event_type: 'schedule_proposal_generated',
          timestamp: daysAgo(5),
          payload: { schedule_id: scheduleId },
        },
        {
          event_id: 'e_disc_1',
          event_type: 'schedule_proposal_discarded',
          timestamp: daysAgo(4),
          payload: { schedule_id: scheduleId },
        },
        // Duplicate delivery with identical schedule_id
        {
          event_id: 'e_disc_2',
          event_type: 'schedule_proposal_discarded',
          timestamp: daysAgo(4, 11),
          payload: { schedule_id: scheduleId },
        },
      ];

      const result = analyzePreferenceSignals({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.frictionProfile.proposals.decidedCount, 1, 'Duplicate discard must not inflate decidedCount');
      assert.equal(result.frictionProfile.proposals.discardedCount, 1, 'Duplicate discard must not inflate discardedCount');
      assert.equal(result.frictionProfile.proposals.discardRate, 1.0);
    });

    it('isolates and excludes conflicting decisions (accepted AND discarded) from decided count', () => {
      const scheduleId = 'sched_conflict_test';
      const events = [
        {
          event_id: 'e_gen',
          event_type: 'schedule_proposal_generated',
          timestamp: daysAgo(6),
          payload: { schedule_id: scheduleId },
        },
        {
          event_id: 'e_acc',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5),
          payload: { schedule_id: scheduleId, applied_placements: [] },
        },
        {
          event_id: 'e_disc',
          event_type: 'schedule_proposal_discarded',
          timestamp: daysAgo(4),
          payload: { schedule_id: scheduleId },
        },
      ];

      const result = analyzePreferenceSignals({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.frictionProfile.proposals.decidedCount, 0, 'Conflicting proposal must be excluded from decided count');
      assert.equal(result.frictionProfile.proposals.acceptedCount, 0);
      assert.equal(result.frictionProfile.proposals.discardedCount, 0);
      assert.equal(result.frictionProfile.proposals.discardRate, null);
    });

    it('excludes pending drafts and generated proposals from the decided denominator', () => {
      const events = [
        {
          event_id: 'e_gen_1',
          event_type: 'schedule_proposal_generated',
          timestamp: daysAgo(3),
          payload: { schedule_id: 'sched_pending_1' },
        },
        {
          event_id: 'e_gen_2',
          event_type: 'schedule_proposal_generated',
          timestamp: daysAgo(2),
          payload: { schedule_id: 'sched_pending_2' },
        },
        {
          event_id: 'e_acc_1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(1),
          payload: { schedule_id: 'sched_decided_1', applied_placements: [] },
        },
      ];

      const result = analyzePreferenceSignals({ events, tasks: [], now: BASE_TIME });
      // Total generated is 3, but decided count is strictly 1
      assert.equal(result.frictionProfile.proposals.decidedCount, 1);
      assert.equal(result.frictionProfile.proposals.acceptedCount, 1);
      assert.equal(result.frictionProfile.proposals.acceptanceRate, 1.0);
    });

    it('safely excludes events missing schedule_id without crashing or distorting metrics', () => {
      const events = [
        {
          event_id: 'e_malformed_1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(2),
          payload: {}, // Missing schedule_id
        },
        {
          event_id: 'e_malformed_2',
          event_type: 'schedule_proposal_discarded',
          timestamp: daysAgo(1),
          payload: { schedule_id: '' }, // Blank schedule_id
        },
      ];

      const result = analyzePreferenceSignals({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.frictionProfile.proposals.decidedCount, 0);
      assert.equal(result.frictionProfile.proposals.discardRate, null);
    });
  });

  describe('9. Multi-Task Independence & Clustering Safeguards (Audit E)', () => {
    it('blocks postponement friction signal when 4 overrides cluster on a single task (< 3 distinct tasks)', () => {
      const events = [];
      const singleTaskId = 'single_clustered_task';
      const scheduleId = 'sched_clustered_test';

      // Accepted proposal placing singleTaskId on 2026-10-10
      events.push({
        event_id: 'e_gen',
        event_type: 'schedule_proposal_generated',
        timestamp: daysAgo(15),
        payload: { schedule_id: scheduleId },
      });
      events.push({
        event_id: 'e_acc',
        event_type: 'schedule_proposal_accepted',
        timestamp: daysAgo(14),
        payload: {
          schedule_id: scheduleId,
          applied_placements: [{ task_id: singleTaskId, proposed_date: '2026-10-10' }],
        },
      });

      // 4 manual date postponements all on the SAME task
      for (let i = 1; i <= 4; i++) {
        events.push({
          event_id: `e_resched_${i}`,
          task_id: singleTaskId,
          event_type: 'task_rescheduled',
          timestamp: daysAgo(10 - i),
          payload: {
            previous_due_date: `2026-10-${10 + i}`,
            new_due_date: `2026-10-${12 + i}`, // postponed forward
            reason: 'manual_override',
          },
        });
      }

      const tasks = [{ id: singleTaskId, title: 'Single Task', priority: 'high', category: 'General' }];
      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });

      // Overrides count shows 4, but unique tasks count is 1
      assert.equal(result.frictionProfile.overrides.totalOverridesCount, 4);
      assert.equal(result.frictionProfile.overrides.uniqueTasksOverriddenCount, 1);

      // Must NOT form a candidate signal due to task clustering
      const postSignal = result.candidateSignals.find((s) => s.family === 'postponement_friction');
      assert.equal(postSignal, undefined, 'Must not emit postponement candidate signal when clustered on < 3 tasks');
    });

    it('deduplicates multiple task_completed events for the same task in effort overruns', () => {
      const taskId = 't_multi_comp';
      const events = [
        {
          event_id: 'e_create',
          task_id: taskId,
          event_type: 'task_created',
          timestamp: daysAgo(5),
          payload: { category: 'Engineering', estimated_effort: 2.0 },
        },
        // Duplicate/repeated completion events for the same task
        {
          event_id: 'e_comp_1',
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: daysAgo(4),
          payload: { tracked_duration_seconds: 14400 }, // 4h
        },
        {
          event_id: 'e_comp_2',
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: daysAgo(3),
          payload: { tracked_duration_seconds: 14400 }, // 4h
        },
      ];

      const tasks = [{ id: taskId, category: 'Engineering', estimatedEffort: 2.0, completed: true }];
      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });

      // Paired tasks must count this task exactly ONCE
      assert.equal(result.frictionProfile.effortAccuracy.totalPairedCount, 1);
      assert.equal(result.frictionProfile.effortAccuracy.byCategory[0].count, 1);
    });

    it('excludes tasks currently marked open (completed: false) in active tasks backlog from paired effort', () => {
      const taskId = 't_currently_open';
      const events = [
        {
          event_id: 'e_comp',
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: daysAgo(2),
          payload: { tracked_duration_seconds: 7200 },
        },
      ];

      // Task exists in active backlog and is currently open
      const tasks = [{ id: taskId, category: 'Engineering', estimatedEffort: 2.0, completed: false }];
      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });

      assert.equal(result.frictionProfile.effortAccuracy.totalPairedCount, 0, 'Open task in backlog must be excluded from paired effort');
    });
  });

  describe('10. Working-Days Focus Realism & Weekend Handling (Audit E)', () => {
    it('does not misdiagnose standard non-working weekend days (Sat/Sun) as velocity dips', () => {
      const events = [];
      const tasks = [];

      // 8 completions spread across Monday to Friday (e.g. 2 each on Mon, Tue, Wed, Thu)
      // Saturday and Sunday have 0 completions.
      // Friday has 2 completions.
      const dates = [
        '2026-10-12', '2026-10-12', // Mon
        '2026-10-13', '2026-10-13', // Tue
        '2026-10-14', '2026-10-14', // Wed
        '2026-10-15', '2026-10-15', // Thu
      ];

      dates.forEach((d, idx) => {
        const id = `t_wkd_${idx}`;
        tasks.push({ id, title: `Task ${idx}`, completed: true });
        events.push({
          event_id: `e_comp_${idx}`,
          task_id: id,
          event_type: 'task_completed',
          timestamp: `${d}T15:00:00.000Z`,
          payload: { tracked_duration_seconds: 3600 },
        });
      });

      const result = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });

      // Lowest working day in this dataset is Friday (0 completions), NOT Saturday or Sunday
      const dipSignal = result.candidateSignals.find((s) => s.family === 'day_of_week_focus_realism');
      if (dipSignal) {
        assert.ok(
          !dipSignal.name.includes('Sat') && !dipSignal.name.includes('Sun'),
          'Weekend days must not be diagnosed as weekday velocity dips'
        );
      }
    });
  });

  describe('11. Evidence Clearing & Pure Determinism (Audit F)', () => {
    it('returns empty profile with adaptation locked when telemetry events are cleared', () => {
      const result = analyzePreferenceSignals({ events: [], tasks: [], now: BASE_TIME });
      assert.equal(result.isAdaptationUnlocked, false);
      assert.equal(result.frictionProfile.proposals.decidedCount, 0);
      assert.equal(result.frictionProfile.overrides.totalOverridesCount, 0);
      assert.equal(result.frictionProfile.effortAccuracy.totalPairedCount, 0);
      assert.equal(result.candidateSignals.length, 0);
    });

    it('produces 100% deterministic results across multiple evaluations of the same evidence', () => {
      const { events, tasks } = createFullyMatureFixture();
      const res1 = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });
      const res2 = analyzePreferenceSignals({ events, tasks, now: BASE_TIME });

      assert.deepEqual(res1.candidateSignals, res2.candidateSignals);
      assert.deepEqual(res1.frictionProfile, res2.frictionProfile);
      assert.equal(res1.analysisTimestamp, res2.analysisTimestamp);
    });
  });
});
