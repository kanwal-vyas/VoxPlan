/**
 * Comprehensive Automated Tests for VoxPlan Longitudinal Sample Maturity Gating
 * & Readiness Diagnostics (Phase 7, Stage 1).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateLearningReadiness,
  normalizeCategory,
  READINESS_THRESHOLDS,
  READINESS_STATUS,
} from '../src/scheduler/learningReadinessGate.js';

describe('Phase 7.1: Longitudinal Sample Maturity Gating & Readiness Diagnostics', () => {
  const BASE_TIME = new Date('2026-10-18T12:00:00.000Z');

  // Helper to create an ISO timestamp N days before BASE_TIME
  const daysAgo = (n, hour = 10) => {
    const d = new Date(BASE_TIME);
    d.setUTCDate(d.getUTCDate() - n);
    d.setUTCHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  // Helper to generate a fully mature synthetic fixture that satisfies all 4 gates
  const createFullyMatureFixture = () => {
    const events = [];
    const tasks = [];

    // 1. Create 20 distinct schedule proposals with decisions (15 accepted, 5 discarded)
    for (let i = 1; i <= 20; i++) {
      const scheduleId = `sched_mature_${i}`;
      const dayOffset = Math.min(25, i); // spread over ~20 days
      const genTime = daysAgo(dayOffset, 9);
      const decTime = daysAgo(dayOffset, 10);

      // Proposal generated event
      events.push({
        event_id: `evt_gen_${i}`,
        event_type: 'schedule_proposal_generated',
        timestamp: genTime,
        payload: {
          schedule_id: scheduleId,
          strategy: 'adaptive',
        },
      });

      if (i <= 15) {
        // First 15 proposals are accepted, each placing 1 unique task
        const taskId = `task_mature_${i}`;
        const proposedDate = daysAgo(dayOffset - 1).split('T')[0];

        // Categories distributed across 3 distinct valid categories
        const cat = i % 3 === 0 ? 'Engineering' : i % 3 === 1 ? 'Design' : 'Product';
        tasks.push({
          id: taskId,
          title: `Mature Task ${i}`,
          category: cat,
          completed: true,
          dueDate: proposedDate,
        });

        events.push({
          event_id: `evt_acc_${i}`,
          event_type: 'schedule_proposal_accepted',
          timestamp: decTime,
          payload: {
            schedule_id: scheduleId,
            applied_placements: [
              {
                task_id: taskId,
                proposed_date: proposedDate,
              },
            ],
          },
        });

        // Add task_completed event within active window, unaltered
        const compTime = daysAgo(dayOffset - 1, 15);
        events.push({
          event_id: `evt_comp_${i}`,
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: compTime,
          payload: {
            completed_at: compTime,
          },
        });
      } else {
        // Remaining 5 proposals are discarded
        events.push({
          event_id: `evt_disc_${i}`,
          event_type: 'schedule_proposal_discarded',
          timestamp: decTime,
          payload: {
            schedule_id: scheduleId,
            reason: 'user_discard',
          },
        });
      }
    }

    return { events, tasks };
  };

  describe('1. Threshold Boundary Tests', () => {
    it('passes overall readiness when all 4 gates meet or exceed thresholds', () => {
      const { events, tasks } = createFullyMatureFixture();
      const result = evaluateLearningReadiness({ events, tasks, now: BASE_TIME });

      assert.equal(result.status, READINESS_STATUS.READY);
      assert.equal(result.isAdaptationUnlocked, true);
      assert.equal(result.readinessRatio, 1.0);
      assert.equal(result.gates.decidedProposals.passed, true);
      assert.equal(result.gates.verifiedCompletions.passed, true);
      assert.equal(result.gates.taskCategories.passed, true);
      assert.equal(result.gates.activeDuration.passed, true);

      assert.ok(result.summary.decidedCount >= READINESS_THRESHOLDS.MIN_DECIDED_PROPOSALS);
      assert.ok(result.summary.eligibleCompletedCount >= READINESS_THRESHOLDS.MIN_VERIFIED_COMPLETIONS);
      assert.ok(result.summary.distinctCategoryCount >= READINESS_THRESHOLDS.MIN_DISTINCT_CATEGORIES);
      assert.ok(result.summary.activeDaysCount >= READINESS_THRESHOLDS.MIN_ACTIVE_DAYS);
    });

    it('blocks readiness when decided proposals are just below threshold (19 vs 20)', () => {
      const { events, tasks } = createFullyMatureFixture();
      // Remove one decision (e.g. discard 20)
      const filteredEvents = events.filter((e) => e.payload?.schedule_id !== 'sched_mature_20');

      const result = evaluateLearningReadiness({ events: filteredEvents, tasks, now: BASE_TIME });
      assert.equal(result.summary.decidedCount, 19);
      assert.equal(result.gates.decidedProposals.passed, false);
      assert.equal(result.gates.decidedProposals.current, 19);
      assert.equal(result.status, READINESS_STATUS.INSUFFICIENT_EVIDENCE);
      assert.equal(result.isAdaptationUnlocked, false);
    });

    it('blocks readiness when verified completions are just below threshold (14 vs 15)', () => {
      const { events, tasks } = createFullyMatureFixture();
      // Remove completion for task 15
      const filteredEvents = events.filter((e) => e.event_id !== 'evt_comp_15');

      const result = evaluateLearningReadiness({ events: filteredEvents, tasks, now: BASE_TIME });
      assert.equal(result.summary.eligibleCompletedCount, 14);
      assert.equal(result.gates.verifiedCompletions.passed, false);
      assert.equal(result.status, READINESS_STATUS.INSUFFICIENT_EVIDENCE);
      assert.equal(result.isAdaptationUnlocked, false);
    });

    it('blocks readiness when distinct task categories are below threshold (2 vs 3)', () => {
      const { events, tasks } = createFullyMatureFixture();
      // Overwrite all tasks to only use 2 categories: 'Engineering' and 'Design'
      const modifiedTasks = tasks.map((t) => ({
        ...t,
        category: t.category === 'Product' ? 'Engineering' : t.category,
      }));

      const result = evaluateLearningReadiness({ events, tasks: modifiedTasks, now: BASE_TIME });
      assert.equal(result.summary.distinctCategoryCount, 2);
      assert.equal(result.gates.taskCategories.passed, false);
      assert.equal(result.status, READINESS_STATUS.INSUFFICIENT_EVIDENCE);
      assert.equal(result.isAdaptationUnlocked, false);
    });

    it('blocks readiness when active telemetry duration is below threshold (13 vs 14 days)', () => {
      const { events, tasks } = createFullyMatureFixture();
      // Compress all events to fall within a 10-day span
      const compressedEvents = events.map((e) => {
        const origD = new Date(e.timestamp);
        const dayMod = 1 + (origD.getUTCDate() % 10); // only 10 unique days
        const newD = new Date(BASE_TIME);
        newD.setUTCDate(newD.getUTCDate() - dayMod);
        return {
          ...e,
          timestamp: newD.toISOString(),
        };
      });

      const result = evaluateLearningReadiness({ events: compressedEvents, tasks, now: BASE_TIME });
      assert.ok(result.summary.activeDaysCount < 14);
      assert.equal(result.gates.activeDuration.passed, false);
      assert.equal(result.status, READINESS_STATUS.INSUFFICIENT_EVIDENCE);
      assert.equal(result.isAdaptationUnlocked, false);
    });
  });

  describe('2. Evidence Eligibility & Deduplication', () => {
    it('does NOT count generated proposals alone as decided', () => {
      const events = [
        {
          event_id: 'e1',
          event_type: 'schedule_proposal_generated',
          timestamp: daysAgo(5),
          payload: { schedule_id: 's_only_gen' },
        },
      ];
      const result = evaluateLearningReadiness({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.summary.decidedCount, 0);
      assert.equal(result.gates.decidedProposals.passed, false);
    });

    it('deduplicates duplicate acceptance events for the same schedule_id', () => {
      const events = [
        {
          event_id: 'e1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5),
          payload: { schedule_id: 's_dup', applied_placements: [] },
        },
        {
          event_id: 'e2',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5, 11),
          payload: { schedule_id: 's_dup', applied_placements: [] },
        },
      ];
      const result = evaluateLearningReadiness({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.summary.decidedCount, 1);
    });

    it('isolates conflicting proposals (both accepted and discarded) and excludes them', () => {
      const events = [
        {
          event_id: 'e1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5),
          payload: { schedule_id: 's_conflict', applied_placements: [] },
        },
        {
          event_id: 'e2',
          event_type: 'schedule_proposal_discarded',
          timestamp: daysAgo(5, 11),
          payload: { schedule_id: 's_conflict', reason: 'reverted' },
        },
      ];
      const result = evaluateLearningReadiness({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.summary.decidedCount, 0);
      assert.equal(result.exclusions.conflictingProposals, 1);
      assert.ok(result.warnings.some((w) => w.includes('conflicting proposal decision')));
    });

    it('excludes tasks that were manually rescheduled before completion from verified count', () => {
      const scheduleId = 's_override';
      const taskId = 't_over';
      const proposedDate = daysAgo(2).split('T')[0];

      const events = [
        {
          event_id: 'e1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5),
          payload: {
            schedule_id: scheduleId,
            applied_placements: [{ task_id: taskId, proposed_date: proposedDate }],
          },
        },
        // Manual override shifting due date
        {
          event_id: 'e2',
          task_id: taskId,
          event_type: 'task_rescheduled',
          timestamp: daysAgo(4),
          payload: {
            previous_due_date: proposedDate,
            new_due_date: daysAgo(1).split('T')[0],
            reason: 'manual_override',
          },
        },
        // Completion occurs after manual shift
        {
          event_id: 'e3',
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: daysAgo(3),
        },
      ];

      const tasks = [{ id: taskId, category: 'Work', completed: true, dueDate: daysAgo(1).split('T')[0] }];
      const result = evaluateLearningReadiness({ events, tasks, now: BASE_TIME });
      assert.equal(result.summary.eligibleCompletedCount, 0);
      assert.equal(result.exclusions.excludedCompletions, 1);
    });

    it('excludes reopened tasks without subsequent completion', () => {
      const scheduleId = 's_reopen';
      const taskId = 't_reopen';
      const proposedDate = daysAgo(2).split('T')[0];

      const events = [
        {
          event_id: 'e1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5),
          payload: {
            schedule_id: scheduleId,
            applied_placements: [{ task_id: taskId, proposed_date: proposedDate }],
          },
        },
        {
          event_id: 'e2',
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: daysAgo(3),
        },
        // Task reopened after completion
        {
          event_id: 'e3',
          task_id: taskId,
          event_type: 'task_reopened',
          timestamp: daysAgo(2),
        },
      ];

      const tasks = [{ id: taskId, category: 'Dev', completed: false, dueDate: proposedDate }];
      const result = evaluateLearningReadiness({ events, tasks, now: BASE_TIME });
      assert.equal(result.summary.eligibleCompletedCount, 0);
    });
  });

  describe('3. Category Normalization & Qualification', () => {
    it('normalizes categories properly and ignores blanks or placeholders', () => {
      assert.equal(normalizeCategory('  engineering  '), 'Engineering');
      assert.equal(normalizeCategory('marketing'), 'Marketing');
      assert.equal(normalizeCategory(''), null);
      assert.equal(normalizeCategory('   '), null);
      assert.equal(normalizeCategory(null), null);
      assert.equal(normalizeCategory(undefined), null);
      assert.equal(normalizeCategory('unknown'), null);
      assert.equal(normalizeCategory('none'), null);
      assert.equal(normalizeCategory('N/A'), null);
      assert.equal(normalizeCategory('null'), null);
      assert.equal(normalizeCategory('placeholder'), null);
    });

    it('falls back to category from task_created event if task was removed from current backlog', () => {
      const scheduleId = 's_archived';
      const taskId = 't_archived';
      const proposedDate = daysAgo(2).split('T')[0];

      const events = [
        {
          event_id: 'e0',
          task_id: taskId,
          event_type: 'task_created',
          timestamp: daysAgo(10),
          payload: { category: 'Finance' },
        },
        {
          event_id: 'e1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5),
          payload: {
            schedule_id: scheduleId,
            applied_placements: [{ task_id: taskId, proposed_date: proposedDate }],
          },
        },
        {
          event_id: 'e2',
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: daysAgo(3),
        },
      ];

      // Task is NOT in tasks array (e.g. deleted or archived)
      const result = evaluateLearningReadiness({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.summary.eligibleCompletedCount, 1);
      assert.equal(result.summary.distinctCategoryCount, 1);
      assert.deepEqual(result.gates.taskCategories.categories, ['Finance']);
    });
  });

  describe('4. Active Telemetry Duration & Sanity Policies', () => {
    it('counts distinct local calendar days and ignores multiple events on the same day', () => {
      const events = [
        {
          event_id: 'e1',
          event_type: 'task_created',
          timestamp: '2026-10-10T08:00:00.000Z',
        },
        {
          event_id: 'e2',
          event_type: 'task_started',
          timestamp: '2026-10-10T12:00:00.000Z',
        },
        {
          event_id: 'e3',
          event_type: 'task_completed',
          timestamp: '2026-10-10T18:00:00.000Z',
        },
        {
          event_id: 'e4',
          event_type: 'task_created',
          timestamp: '2026-10-11T09:00:00.000Z',
        },
      ];

      const result = evaluateLearningReadiness({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.summary.activeDaysCount, 2);
    });

    it('ignores timestamps beyond the future sanity horizon (>24h ahead)', () => {
      const futureTime = new Date(BASE_TIME.getTime() + 1000 * 86400 * 10).toISOString(); // 10 days in future
      const events = [
        {
          event_id: 'e_valid',
          event_type: 'task_created',
          timestamp: daysAgo(2),
        },
        {
          event_id: 'e_future',
          event_type: 'task_created',
          timestamp: futureTime,
        },
      ];

      const result = evaluateLearningReadiness({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.summary.activeDaysCount, 1);
      assert.equal(result.exclusions.futureEventsIgnored, 1);
      assert.ok(result.warnings.some((w) => w.includes('future timestamps')));
    });

    it('ignores invalid unparseable timestamps safely', () => {
      const events = [
        {
          event_id: 'e1',
          event_type: 'task_created',
          timestamp: 'invalid-date-format',
        },
        {
          event_id: 'e2',
          event_type: 'task_created',
          timestamp: daysAgo(2),
        },
      ];

      const result = evaluateLearningReadiness({ events, tasks: [], now: BASE_TIME });
      assert.equal(result.summary.activeDaysCount, 1);
      assert.equal(result.exclusions.invalidTimestampsIgnored, 1);
    });
  });

  describe('5. Data Integrity, Immutability & Governance Boundaries', () => {
    it('returns status UNAVAILABLE if events is not an array', () => {
      const result = evaluateLearningReadiness({ events: null, tasks: [] });
      assert.equal(result.status, READINESS_STATUS.UNAVAILABLE);
      assert.equal(result.isAdaptationUnlocked, false);
      assert.equal(result.readinessRatio, 0);
    });

    it('does not mutate input events or tasks', () => {
      const events = Object.freeze([
        Object.freeze({
          event_id: 'e1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5),
          payload: Object.freeze({
            schedule_id: 's1',
            applied_placements: Object.freeze([{ task_id: 't1', proposed_date: '2026-10-15' }]),
          }),
        }),
      ]);
      const tasks = Object.freeze([
        Object.freeze({ id: 't1', category: 'Dev', completed: true, dueDate: '2026-10-15' }),
      ]);

      assert.doesNotThrow(() => {
        evaluateLearningReadiness({ events, tasks, now: BASE_TIME });
      });
    });

    it('declares that no preference learning or weight modification occurred', () => {
      const { events, tasks } = createFullyMatureFixture();
      const result = evaluateLearningReadiness({ events, tasks, now: BASE_TIME });

      assert.equal(result.governance.noLearningPerformed, true);
      assert.equal(result.governance.schedulerWeightsModified, false);
      assert.equal(result.governance.readOnlyDiagnostics, true);
      assert.ok(result.governance.disclosure.includes('read-only'));
    });

    it('does not count scheduled sessions as completed merely because time has passed', () => {
      const scheduleId = 's_time_passed';
      const taskId = 't_time_passed';
      const proposedDate = daysAgo(10).split('T')[0];

      const events = [
        {
          event_id: 'e1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(15),
          payload: {
            schedule_id: scheduleId,
            applied_placements: [{ task_id: taskId, proposed_date: proposedDate }],
          },
        },
      ];

      // Task is scheduled in the past, but NEVER marked completed
      const tasks = [{ id: taskId, title: 'Incomplete', category: 'Dev', completed: false, dueDate: proposedDate }];
      const result = evaluateLearningReadiness({ events, tasks, now: BASE_TIME });
      assert.equal(result.summary.eligibleCompletedCount, 0);
      assert.equal(result.gates.verifiedCompletions.passed, false);
    });

    it('deduplicates repeated completion events for the same task in the same interval', () => {
      const scheduleId = 's_repeat_comp';
      const taskId = 't_repeat_comp';
      const proposedDate = daysAgo(2).split('T')[0];

      const events = [
        {
          event_id: 'e1',
          event_type: 'schedule_proposal_accepted',
          timestamp: daysAgo(5),
          payload: {
            schedule_id: scheduleId,
            applied_placements: [{ task_id: taskId, proposed_date: proposedDate }],
          },
        },
        // First completion
        {
          event_id: 'e2',
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: daysAgo(2, 14),
        },
        // Second duplicate completion event on same task
        {
          event_id: 'e3',
          task_id: taskId,
          event_type: 'task_completed',
          timestamp: daysAgo(2, 16),
        },
      ];

      const tasks = [{ id: taskId, category: 'Dev', completed: true, dueDate: proposedDate }];
      const result = evaluateLearningReadiness({ events, tasks, now: BASE_TIME });
      assert.equal(result.summary.eligibleCompletedCount, 1);
    });

    it('evaluation is completely deterministic for a fixed snapshot and reference clock', () => {
      const { events, tasks } = createFullyMatureFixture();
      const res1 = evaluateLearningReadiness({ events, tasks, now: BASE_TIME });
      const res2 = evaluateLearningReadiness({ events, tasks, now: BASE_TIME });

      assert.deepEqual(res1, res2);
    });
  });
});
