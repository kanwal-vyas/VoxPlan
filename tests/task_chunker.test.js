import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTaskChunkable,
  calculateChunkPlan,
  scheduleMultiDayTask,
} from '../src/scheduler/taskChunker.js';
import {
  generateAdaptiveSchedule,
} from '../src/scheduler/adaptiveScheduler.js';
import {
  evaluateScheduleStability,
} from '../src/scheduler/scheduleEvaluator.js';
import {
  explainScheduleDecision,
} from '../src/conversation/scheduleDebrief.js';
import {
  DialogueManager,
  CONVERSATION_INTENTS,
} from '../src/conversation/dialogueManager.js';

describe('Phase 6.1: Deterministic Multi-day Task Chunking Foundation', () => {

  describe('1. Chunk Generation & Policy Invariants', () => {
    test('1. A small task fits in one session and remains unsplit', () => {
      const task = { id: 't-small', title: 'Small Task', estimatedEffort: 3.0 };
      const plan = calculateChunkPlan(3.0, 4.0);
      assert.deepEqual(plan, [3.0]);

      const calendarSlots = [
        { date: '2026-10-19', remainingHours: 4.0, capacityHours: 4.0, assignedTasks: [] },
      ];
      const result = scheduleMultiDayTask(task, 3.0, calendarSlots, 0, { minChunkHours: 1.0 });
      assert.equal(result.isChunked, false);
      assert.equal(result.chunks.length, 1);
      assert.equal(result.chunks[0].chunkDuration, 3.0);
      assert.equal(result.allocationStatus, 'fully_allocated');
      assert.equal(result.allocatedHours, 3.0);
      assert.equal(result.unscheduledHours, 0);
      assert.equal(calendarSlots[0].remainingHours, 1.0);
    });

    test('2. A task larger than daily capacity is split across eligible days', () => {
      const task = { id: 't-large', title: 'Write Documentation', estimatedEffort: 8.0 };
      const plan = calculateChunkPlan(8.0, 4.0);
      assert.deepEqual(plan, [4.0, 4.0]);

      const calendarSlots = [
        { date: '2026-10-19', remainingHours: 4.0, capacityHours: 4.0, assignedTasks: [] },
        { date: '2026-10-20', remainingHours: 4.0, capacityHours: 4.0, assignedTasks: [] },
      ];
      const result = scheduleMultiDayTask(task, 8.0, calendarSlots, 0, { minChunkHours: 1.0 });
      assert.equal(result.isChunked, true);
      assert.equal(result.chunks.length, 2);
      assert.equal(result.chunks[0].chunkDuration, 4.0);
      assert.equal(result.chunks[0].proposedDate, '2026-10-19');
      assert.equal(result.chunks[1].chunkDuration, 4.0);
      assert.equal(result.chunks[1].proposedDate, '2026-10-20');
      assert.equal(result.allocationStatus, 'fully_allocated');
      assert.equal(calendarSlots[0].remainingHours, 0);
      assert.equal(calendarSlots[1].remainingHours, 0);
    });

    test('3. The sum of chunk durations equals the fully allocated effort', () => {
      const totalEffort = 9.5;
      const dailyCap = 3.5;
      const plan = calculateChunkPlan(totalEffort, dailyCap, { minChunkHours: 1.0 });
      const sumPlan = Number(plan.reduce((a, b) => a + b, 0).toFixed(4));
      assert.equal(sumPlan, totalEffort);

      const calendarSlots = [
        { date: '2026-10-19', remainingHours: dailyCap, capacityHours: dailyCap, assignedTasks: [] },
        { date: '2026-10-20', remainingHours: dailyCap, capacityHours: dailyCap, assignedTasks: [] },
        { date: '2026-10-21', remainingHours: dailyCap, capacityHours: dailyCap, assignedTasks: [] },
      ];
      const task = { id: 't-float', title: 'Floating Point Effort', estimatedEffort: totalEffort };
      const result = scheduleMultiDayTask(task, totalEffort, calendarSlots, 0, { minChunkHours: 1.0 });
      const sumAllocated = Number(result.chunks.reduce((s, c) => s + c.chunkDuration, 0).toFixed(4));
      assert.equal(sumAllocated, totalEffort);
      assert.equal(result.allocatedHours, totalEffort);
      assert.equal(result.unscheduledHours, 0);
    });

    test('4. Daily capacity is never exceeded', () => {
      const task = { id: 't-heavy', title: 'Heavy Compute', estimatedEffort: 10.0 };
      const calendarSlots = [
        { date: '2026-10-19', remainingHours: 3.0, capacityHours: 4.0, assignedTasks: [{ id: 'prior-1' }] },
        { date: '2026-10-20', remainingHours: 2.5, capacityHours: 4.0, assignedTasks: [{ id: 'prior-2' }] },
        { date: '2026-10-21', remainingHours: 4.0, capacityHours: 4.0, assignedTasks: [] },
        { date: '2026-10-22', remainingHours: 4.0, capacityHours: 4.0, assignedTasks: [] },
      ];
      const result = scheduleMultiDayTask(task, 10.0, calendarSlots, 0, { minChunkHours: 1.0 });
      assert.equal(result.allocationStatus, 'fully_allocated');
      for (const slot of calendarSlots) {
        assert.ok(slot.remainingHours >= 0, `Slot ${slot.date} went negative: ${slot.remainingHours}`);
        assert.ok(slot.remainingHours <= slot.capacityHours);
      }
    });

    test('5. Session minimum and maximum duration rules are respected', () => {
      // Tail-smoothing: with 4.5h effort and 4.0h daily capacity, without tail smoothing chunk 2 would be 0.5h (< minChunk 1.0h).
      // Balanced chunking should create [2.5, 2.0] or [2.25, 2.25] ensuring no session is smaller than minChunk.
      const plan = calculateChunkPlan(4.5, 4.0, { minChunkHours: 1.0, maxChunkHours: 4.0 });
      for (const chunk of plan) {
        assert.ok(chunk >= 1.0, `Chunk ${chunk} violates minimum session duration 1.0h`);
        assert.ok(chunk <= 4.0, `Chunk ${chunk} violates maximum session duration 4.0h`);
      }
      assert.equal(Number(plan.reduce((a, b) => a + b, 0).toFixed(4)), 4.5);
    });

    test('6. A deadline permits full allocation', () => {
      const task = { id: 't-dl-full', title: 'Report', estimatedEffort: 6.0, dueDate: '2026-10-21' };
      const calendarSlots = [
        { date: '2026-10-19', remainingHours: 3.0, capacityHours: 4.0, assignedTasks: [] },
        { date: '2026-10-20', remainingHours: 3.0, capacityHours: 4.0, assignedTasks: [] },
        { date: '2026-10-21', remainingHours: 3.0, capacityHours: 4.0, assignedTasks: [] },
        { date: '2026-10-22', remainingHours: 3.0, capacityHours: 4.0, assignedTasks: [] },
      ];
      const result = scheduleMultiDayTask(task, 6.0, calendarSlots, 0, { minChunkHours: 1.0 });
      assert.equal(result.allocationStatus, 'fully_allocated');
      assert.equal(result.allocatedHours, 6.0);
      assert.equal(result.unscheduledHours, 0);
      assert.ok(result.chunks.every((c) => c.proposedDate <= '2026-10-21'));
    });

    test('7. A deadline permits only partial allocation', () => {
      const task = { id: 't-dl-part', title: 'Long Paper', estimatedEffort: 8.0, dueDate: '2026-10-20' };
      const calendarSlots = [
        { date: '2026-10-19', remainingHours: 3.0, capacityHours: 3.0, assignedTasks: [] },
        { date: '2026-10-20', remainingHours: 3.0, capacityHours: 3.0, assignedTasks: [] },
        { date: '2026-10-21', remainingHours: 3.0, capacityHours: 3.0, assignedTasks: [] }, // after deadline!
      ];
      const result = scheduleMultiDayTask(task, 8.0, calendarSlots, 0, { minChunkHours: 1.0 });
      assert.equal(result.allocationStatus, 'partially_allocated');
      assert.equal(result.allocatedHours, 6.0);
      assert.equal(result.unscheduledHours, 2.0);
      // Invariant: Work is never scheduled beyond the deadline while claiming it is on time
      assert.ok(result.chunks.every((c) => c.proposedDate <= '2026-10-20'));
      assert.equal(calendarSlots[2].remainingHours, 3.0); // day 3 untouched
    });

    test('8. No eligible days remain before a deadline', () => {
      const task = { id: 't-dl-none', title: 'Overdue Task', estimatedEffort: 4.0, dueDate: '2026-10-18' };
      const calendarSlots = [
        { date: '2026-10-19', remainingHours: 4.0, capacityHours: 4.0, assignedTasks: [] },
        { date: '2026-10-20', remainingHours: 4.0, capacityHours: 4.0, assignedTasks: [] },
      ];
      const result = scheduleMultiDayTask(task, 4.0, calendarSlots, 0, { minChunkHours: 1.0 });
      assert.equal(result.allocationStatus, 'unscheduled');
      assert.equal(result.allocatedHours, 0);
      assert.equal(result.unscheduledHours, 4.0);
      assert.equal(result.chunks.length, 0);
    });

    test('9. Zero, missing, negative, or invalid effort values are handled safely', () => {
      assert.deepEqual(calculateChunkPlan(0, 4.0), []);
      assert.deepEqual(calculateChunkPlan(-5, 4.0), []);
      assert.deepEqual(calculateChunkPlan(null, 4.0), []);
      assert.deepEqual(calculateChunkPlan(undefined, 4.0), []);
      assert.deepEqual(calculateChunkPlan(NaN, 4.0), []);
      assert.deepEqual(calculateChunkPlan(4.0, 0), []);
      assert.deepEqual(calculateChunkPlan(4.0, -1), []);

      const slots = [{ date: '2026-10-19', remainingHours: 4.0, capacityHours: 4.0, assignedTasks: [] }];
      const resZero = scheduleMultiDayTask({ id: 't-0' }, 0, slots, 0);
      assert.equal(resZero.allocationStatus, 'unscheduled');
    });

    test('10. Identical inputs produce identical chunk proposals (deterministic reproducibility)', () => {
      const task = { id: 't-det', title: 'Deterministic Build', estimatedEffort: 7.5, dueDate: '2026-10-22' };
      const makeSlots = () => [
        { date: '2026-10-19', remainingHours: 3.0, capacityHours: 4.0, assignedTasks: [] },
        { date: '2026-10-20', remainingHours: 3.0, capacityHours: 4.0, assignedTasks: [] },
        { date: '2026-10-21', remainingHours: 3.0, capacityHours: 4.0, assignedTasks: [] },
        { date: '2026-10-22', remainingHours: 3.0, capacityHours: 4.0, assignedTasks: [] },
      ];

      const res1 = scheduleMultiDayTask(task, 7.5, makeSlots(), 0);
      const res2 = scheduleMultiDayTask(task, 7.5, makeSlots(), 0);
      assert.deepEqual(res1, res2);
    });

    test('11. Multiple tasks competing for capacity respect existing priority and deadline rules', () => {
      const tasks = [
        { id: 't-high', title: 'High Priority Feature', priority: 'high', estimatedEffort: 6.0, dueDate: '2026-10-21' },
        { id: 't-low', title: 'Low Priority Clean Up', priority: 'low', estimatedEffort: 6.0, dueDate: '2026-10-21' },
      ];

      const schedule = generateAdaptiveSchedule(tasks, {
        startDate: '2026-10-19',
        dailyCapacityHours: 4.0,
        horizonDays: 5,
        workingDays: [1, 2, 3, 4, 5],
        enableChunking: true,
      });

      // t-high should schedule earlier than t-low
      const highPlacements = schedule.proposedPlacements.filter((p) => p.taskId === 't-high');
      const lowPlacements = schedule.proposedPlacements.filter((p) => p.taskId === 't-low');
      assert.ok(highPlacements.length > 0);
      assert.ok(lowPlacements.length > 0);
      assert.ok(highPlacements[0].proposedDate <= lowPlacements[0].proposedDate);
    });

    test('12. Dependencies remain valid: downstream dependents wait for the final chunk', () => {
      const tasks = [
        { id: 't-parent', title: 'Core Library Engine', priority: 'high', estimatedEffort: 8.0, dueDate: '2026-10-21' },
        { id: 't-child', title: 'UI Consumer Component', priority: 'high', estimatedEffort: 2.0, dueDate: '2026-10-22', dependencies: ['t-parent'] },
      ];

      const schedule = generateAdaptiveSchedule(tasks, {
        startDate: '2026-10-19', // Monday
        dailyCapacityHours: 4.0,
        horizonDays: 7,
        workingDays: [1, 2, 3, 4, 5],
        enableChunking: true,
      });

      const parentPlacements = schedule.proposedPlacements.filter((p) => p.taskId === 't-parent');
      const childPlacement = schedule.proposedPlacements.find((p) => p.taskId === 't-child');

      assert.equal(parentPlacements.length, 2);
      assert.equal(parentPlacements[0].proposedDate, '2026-10-19');
      assert.equal(parentPlacements[1].proposedDate, '2026-10-20');

      // The child cannot start until the final chunk finishes (2026-10-20 or later)
      assert.ok(childPlacement.proposedDate !== null);
      assert.ok(
        childPlacement.proposedDate >= parentPlacements[1].proposedDate,
        `Child scheduled on ${childPlacement.proposedDate} before parent final chunk on ${parentPlacements[1].proposedDate}`
      );
    });

    test('13. Non-working days are respected where supported', () => {
      // 2026-10-23 is Friday. 2026-10-24 & 25 are Saturday & Sunday.
      const task = { id: 't-weekend', title: 'Weekend Crossing Task', estimatedEffort: 8.0, dueDate: '2026-10-27' };
      const schedule = generateAdaptiveSchedule([task], {
        startDate: '2026-10-23', // Friday
        dailyCapacityHours: 4.0,
        horizonDays: 5,
        workingDays: [1, 2, 3, 4, 5], // Mon-Fri only
        enableChunking: true,
      });

      const chunks = schedule.proposedPlacements.filter((p) => p.taskId === 't-weekend');
      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].proposedDate, '2026-10-23'); // Friday
      assert.equal(chunks[1].proposedDate, '2026-10-26'); // Monday (skipped Sat/Sun!)
    });

    test('14. Repeated planning does not duplicate task records or chunk allocations', () => {
      const task = { id: 't-idemp', title: 'Idempotency Check', estimatedEffort: 6.0 };
      const run1 = generateAdaptiveSchedule([task], {
        startDate: '2026-10-19',
        dailyCapacityHours: 3.0,
        enableChunking: true,
      });
      const run2 = generateAdaptiveSchedule([task], {
        startDate: '2026-10-19',
        dailyCapacityHours: 3.0,
        enableChunking: true,
      });

      assert.equal(run1.proposedPlacements.length, 2);
      assert.equal(run2.proposedPlacements.length, 2);
      assert.equal(run1.summary.scheduledCount, 1); // 1 distinct parent task
      assert.equal(run2.summary.scheduledCount, 1);
    });
  });

  describe('2. Proposal Integration & Backward Compatibility', () => {
    test('Proposal preserves parentTaskId, chunkIndex, totalChunks, and unique placement IDs', () => {
      const task = { id: 't-multi', title: 'Multi Chunk Task', estimatedEffort: 6.0 };
      const schedule = generateAdaptiveSchedule([task], {
        startDate: '2026-10-19',
        dailyCapacityHours: 3.0,
        enableChunking: true,
      });

      const placements = schedule.proposedPlacements;
      assert.equal(placements.length, 2);

      const [c1, c2] = placements;
      assert.equal(c1.taskId, 't-multi');
      assert.equal(c2.taskId, 't-multi');
      assert.equal(c1.chunkIndex, 0);
      assert.equal(c1.totalChunks, 2);
      assert.equal(c2.chunkIndex, 1);
      assert.equal(c2.totalChunks, 2);
      assert.notEqual(c1.placementId, c2.placementId);
      assert.equal(c1.parentTotalEffort, 6.0);
      assert.equal(c2.parentTotalEffort, 6.0);
    });

    test('Proposal comparison handles multiple placements per task without collapsing', () => {
      const propA = {
        scheduleId: 'prop-A',
        proposedPlacements: [
          { taskId: 't-big', placementId: 't-big-0', proposedDate: '2026-10-19', effectiveHours: 3.0 },
          { taskId: 't-big', placementId: 't-big-1', proposedDate: '2026-10-20', effectiveHours: 3.0 },
        ],
      };
      const propB = {
        scheduleId: 'prop-B',
        proposedPlacements: [
          { taskId: 't-big', placementId: 't-big-0', proposedDate: '2026-10-19', effectiveHours: 3.0 },
          { taskId: 't-big', placementId: 't-big-1', proposedDate: '2026-10-21', effectiveHours: 3.0 }, // shifted
        ],
      };

      const stability = evaluateScheduleStability(propA, propB);
      assert.equal(stability.commonCount, 2);
      assert.equal(stability.shiftedCount, 1);
      assert.equal(stability.dateDifferences.length, 1);
      assert.equal(stability.dateDifferences[0].placementKey, 't-big-1');
      assert.equal(stability.dateDifferences[0].dateA, '2026-10-20');
      assert.equal(stability.dateDifferences[0].dateB, '2026-10-21');
      assert.equal(stability.dateDifferences[0].daysShift, 1);
    });

    test('Backward compatibility: single-placement proposals without chunk metadata compare seamlessly', () => {
      const oldPropA = {
        scheduleId: 'old-A',
        proposedPlacements: [
          { taskId: 't-legacy', proposedDate: '2026-10-19', effectiveHours: 2.0 },
        ],
      };
      const oldPropB = {
        scheduleId: 'old-B',
        proposedPlacements: [
          { taskId: 't-legacy', proposedDate: '2026-10-20', effectiveHours: 2.0 },
        ],
      };

      const stability = evaluateScheduleStability(oldPropA, oldPropB);
      assert.equal(stability.commonCount, 1);
      assert.equal(stability.shiftedCount, 1);
      assert.equal(stability.dateDifferences[0].taskId, 't-legacy');
    });

    test('isTaskChunkable respects explicit task atomic: true and chunkable: false opt-outs', () => {
      assert.equal(isTaskChunkable({ id: 't-atom', atomic: true }, { enableChunking: true }), false);
      assert.equal(isTaskChunkable({ id: 't-no', chunkable: false }, { enableChunking: true }), false);
      assert.equal(isTaskChunkable({ id: 't-yes', chunkable: true }, { enableChunking: false }), true);
      assert.equal(isTaskChunkable({ id: 't-default' }, { enableChunking: true }), true);
      assert.equal(isTaskChunkable({ id: 't-default' }, { enableChunking: false }), false);
    });
  });

  describe('3. Grounded Conversational Explanations', () => {
    const chunkedProposal = {
      scheduleId: 'prop-chunked',
      status: 'pending',
      proposedPlacements: [
        {
          taskId: 't-split',
          taskTitle: 'Write Research Paper',
          placementId: 'chunk_t-split_seg_0',
          chunkIndex: 0,
          totalChunks: 3,
          chunkDuration: 3.0,
          effectiveHours: 3.0,
          proposedDate: '2026-10-19',
          parentTotalEffort: 8.0,
          allocatedHours: 8.0,
          unscheduledHours: 0,
          allocationStatus: 'fully_allocated',
          isChunk: true,
          status: 'on_time',
        },
        {
          taskId: 't-split',
          taskTitle: 'Write Research Paper',
          placementId: 'chunk_t-split_seg_1',
          chunkIndex: 1,
          totalChunks: 3,
          chunkDuration: 3.0,
          effectiveHours: 3.0,
          proposedDate: '2026-10-20',
          parentTotalEffort: 8.0,
          allocatedHours: 8.0,
          unscheduledHours: 0,
          allocationStatus: 'fully_allocated',
          isChunk: true,
          status: 'on_time',
        },
        {
          taskId: 't-split',
          taskTitle: 'Write Research Paper',
          placementId: 'chunk_t-split_seg_2',
          chunkIndex: 2,
          totalChunks: 3,
          chunkDuration: 2.0,
          effectiveHours: 2.0,
          proposedDate: '2026-10-21',
          parentTotalEffort: 8.0,
          allocatedHours: 8.0,
          unscheduledHours: 0,
          allocationStatus: 'fully_allocated',
          isChunk: true,
          status: 'on_time',
        },
      ],
    };

    const targetTask = {
      id: 't-split',
      title: 'Write Research Paper',
      estimatedEffort: 8.0,
      dueDate: '2026-10-21',
      completed: false,
    };

    test('Explains "Why was this task split across three days?"', () => {
      const res = explainScheduleDecision({
        targetTask,
        inquiryType: 'why_split',
        tasks: [targetTask],
        activeProposal: chunkedProposal,
        dailyCapacityHours: 3.0,
      });

      assert.equal(res.success, true);
      assert.ok(res.responseText.includes('exceeds your daily working capacity of 3h/day'));
      assert.ok(res.responseText.includes('split across 3 separate day(s) into 3 work session(s)'));
      assert.equal(res.evidence.reasonCode, 'task_chunked_exceeds_daily_capacity');
      assert.equal(res.evidence.sessionCount, 3);
    });

    test('Explains "How much work is scheduled for this task?"', () => {
      const res = explainScheduleDecision({
        targetTask,
        inquiryType: 'work_scheduled',
        tasks: [targetTask],
        activeProposal: chunkedProposal,
      });

      assert.equal(res.success, true);
      assert.ok(res.responseText.includes('8h of work is scheduled'));
      assert.ok(res.responseText.includes('across 3 session(s)'));
      assert.equal(res.evidence.scheduledHours, 8.0);
    });

    test('Explains "How much of this task remains unscheduled?" for fully scheduled task', () => {
      const res = explainScheduleDecision({
        targetTask,
        inquiryType: 'work_unscheduled',
        tasks: [targetTask],
        activeProposal: chunkedProposal,
      });

      assert.equal(res.success, true);
      assert.ok(res.responseText.includes('0h of unscheduled work remaining'));
      assert.equal(res.evidence.unscheduledHours, 0);
    });

    test('Explains "Why couldn\'t you fit the whole task before its deadline?" for partially allocated task', () => {
      const partialProposal = {
        scheduleId: 'prop-partial',
        status: 'pending',
        proposedPlacements: [
          {
            taskId: 't-partial',
            taskTitle: 'Urgent Large Project',
            chunkIndex: 0,
            totalChunks: 1,
            chunkDuration: 4.0,
            effectiveHours: 4.0,
            proposedDate: '2026-10-19',
            parentTotalEffort: 8.0,
            allocatedHours: 4.0,
            unscheduledHours: 4.0,
            allocationStatus: 'partially_allocated',
            isChunk: true,
            status: 'partially_allocated',
          },
        ],
      };

      const partialTask = {
        id: 't-partial',
        title: 'Urgent Large Project',
        estimatedEffort: 8.0,
        dueDate: '2026-10-19',
      };

      const res = explainScheduleDecision({
        targetTask: partialTask,
        inquiryType: 'why_not_fit_before_deadline',
        tasks: [partialTask],
        activeProposal: partialProposal,
      });

      assert.equal(res.success, true);
      assert.ok(res.responseText.includes('insufficient to accommodate the full 8h effort (4h unscheduled)'));
      assert.ok(res.responseText.includes('work is never scheduled past the deadline'));
      assert.equal(res.evidence.reasonCode, 'deadline_capacity_deficit');
      assert.equal(res.evidence.unscheduledHours, 4.0);
    });

    test('Explains "How many sessions did you propose for this task?"', () => {
      const res = explainScheduleDecision({
        targetTask,
        inquiryType: 'session_count',
        tasks: [targetTask],
        activeProposal: chunkedProposal,
      });

      assert.equal(res.success, true);
      assert.ok(res.responseText.includes('proposed 3 work session(s) for task "Write Research Paper"'));
      assert.equal(res.evidence.sessionCount, 3);
    });

    test('DialogueManager integration parses chunking natural language questions in idle state', async () => {
      const dm = new DialogueManager({ clock: () => new Date('2026-10-18T10:00:00Z').getTime() });
      dm.activeProposal = chunkedProposal;
      const tasks = [targetTask];

      const r1 = await dm.processInput('Why was Write Research Paper split across three days?', { tasks });
      assert.equal(r1.intent, CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION);
      assert.ok(r1.responseText.includes('split across 3 separate day(s)'));

      const r2 = await dm.processInput('How much work is scheduled for Write Research Paper?', { tasks });
      assert.equal(r2.intent, CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION);
      assert.ok(r2.responseText.includes('8h of work is scheduled'));

      const r3 = await dm.processInput('How much of Write Research Paper remains unscheduled?', { tasks });
      assert.equal(r3.intent, CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION);
      assert.ok(r3.responseText.includes('0h of unscheduled work remaining'));

      const r4 = await dm.processInput('How many sessions did you propose for Write Research Paper?', { tasks });
      assert.equal(r4.intent, CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION);
      assert.ok(r4.responseText.includes('3 work session(s)'));
    });
  });

  describe('4. Progress, Completion & Rescheduling Invariants', () => {
    test('Planned duration is not treated as actual duration and parent task is not marked complete', () => {
      const task = { id: 't-parent', title: 'Parent Task', estimatedEffort: 6.0, completed: false };
      const schedule = generateAdaptiveSchedule([task], {
        startDate: '2026-10-19',
        dailyCapacityHours: 3.0,
        enableChunking: true,
      });

      // Assert that generation does NOT mutate original task
      assert.equal(task.completed, false);
      assert.equal(task.actualDuration, undefined);

      // Verify that chunks have chunkDuration and effectiveHours, without falsifying actual tracked time
      for (const chunk of schedule.proposedPlacements) {
        assert.ok(chunk.chunkDuration > 0);
        assert.equal(chunk.actualEffort, undefined);
      }
    });

    test('Explanation queries are purely read-only and never mutate proposal or tasks', () => {
      const task = { id: 't-ro', title: 'Read-only Check', estimatedEffort: 4.0, completed: false, dueDate: '2026-10-20' };
      const proposal = {
        scheduleId: 'prop-ro',
        status: 'pending',
        proposedPlacements: [
          { taskId: 't-ro', proposedDate: '2026-10-20', effectiveHours: 4.0, isChunk: false },
        ],
      };
      const taskJsonBefore = JSON.stringify(task);
      const propJsonBefore = JSON.stringify(proposal);

      explainScheduleDecision({
        targetTask: task,
        inquiryType: 'why_split',
        tasks: [task],
        activeProposal: proposal,
      });

      assert.equal(JSON.stringify(task), taskJsonBefore);
      assert.equal(JSON.stringify(proposal), propJsonBefore);
    });
  });

});
