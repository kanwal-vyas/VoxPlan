import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimeToMinutes,
  minutesToTimeString,
  formatTimeAmPm,
  createTimeInterval,
  intervalsOverlap,
  mergeIntervals,
  subtractIntervals,
  normalizeWorkingHours,
  getBlackoutsForDate,
  computeAvailableWindowsForDate,
  allocateIntradaySession,
  loadTimeBlockSettings,
  saveTimeBlockSettings,
} from '../src/scheduler/timeBlockScheduler.js';
import {
  scheduleMultiDayTask,
} from '../src/scheduler/taskChunker.js';
import {
  generateAdaptiveSchedule,
} from '../src/scheduler/adaptiveScheduler.js';
import {
  explainScheduleDecision,
} from '../src/conversation/scheduleDebrief.js';
import {
  DialogueManager,
  CONVERSATION_INTENTS,
} from '../src/conversation/dialogueManager.js';

describe('Phase 6.2: Intraday Focus Windows & Meeting Blackouts', () => {

  describe('1. Interval Arithmetic & Half-Open Boundaries [start, end)', () => {
    test('1.1 parseTimeToMinutes and minutesToTimeString convert accurately', () => {
      assert.equal(parseTimeToMinutes('00:00'), 0);
      assert.equal(parseTimeToMinutes('09:30'), 570);
      assert.equal(parseTimeToMinutes('17:00'), 1020);
      assert.equal(parseTimeToMinutes('23:59'), 1439);

      assert.equal(minutesToTimeString(0), '00:00');
      assert.equal(minutesToTimeString(570), '09:30');
      assert.equal(minutesToTimeString(1020), '17:00');
    });

    test('1.2 formatTimeAmPm outputs 12-hour formatted strings', () => {
      assert.equal(formatTimeAmPm('09:00'), '9:00 AM');
      assert.equal(formatTimeAmPm('12:00'), '12:00 PM');
      assert.equal(formatTimeAmPm('14:30'), '2:30 PM');
      assert.equal(formatTimeAmPm('17:00'), '5:00 PM');
    });

    test('1.3 createTimeInterval handles valid and invalid intervals gracefully', () => {
      const valid = createTimeInterval('09:00', '12:00', 'work');
      assert.equal(valid.startMinutes, 540);
      assert.equal(valid.endMinutes, 720);
      assert.equal(valid.durationMinutes, 180);
      assert.equal(valid.durationHours, 3.0);

      const inverted = createTimeInterval('17:00', '09:00');
      assert.equal(inverted, null);

      const zeroDuration = createTimeInterval('10:00', '10:00');
      assert.equal(zeroDuration, null);
    });

    test('1.4 half-open interval overlap [start, end) avoids boundary collision', () => {
      const slotA = createTimeInterval('09:00', '10:00');
      const slotB = createTimeInterval('10:00', '11:00');
      const slotC = createTimeInterval('10:00', '10:30');
      const slotOverlap = createTimeInterval('09:30', '10:30');

      // Adjacent intervals do NOT overlap
      assert.equal(intervalsOverlap(slotA, slotB), false);
      assert.equal(intervalsOverlap(slotB, slotA), false);

      // Overlapping intervals do overlap
      assert.equal(intervalsOverlap(slotA, slotOverlap), true);
      assert.equal(intervalsOverlap(slotOverlap, slotB), true);
      assert.equal(intervalsOverlap(slotB, slotC), true);
    });

    test('1.5 mergeIntervals unions adjacent and overlapping blocks correctly', () => {
      const intervals = [
        createTimeInterval('09:00', '10:00'),
        createTimeInterval('10:00', '11:00'), // adjacent to first
        createTimeInterval('13:00', '14:30'),
        createTimeInterval('14:00', '15:00'), // overlapping with 13:00-14:30
      ];

      const merged = mergeIntervals(intervals);
      assert.equal(merged.length, 2);
      assert.equal(merged[0].start, '09:00');
      assert.equal(merged[0].end, '11:00');
      assert.equal(merged[1].start, '13:00');
      assert.equal(merged[1].end, '15:00');
    });

    test('1.6 subtractIntervals cuts blackouts out of windows cleanly', () => {
      const workingWindow = [createTimeInterval('09:00', '17:00')];
      const lunchMeeting = [createTimeInterval('12:00', '13:00')];

      // Mid-day cut splits 1 window into 2
      const afterLunch = subtractIntervals(workingWindow, lunchMeeting);
      assert.equal(afterLunch.length, 2);
      assert.equal(afterLunch[0].start, '09:00');
      assert.equal(afterLunch[0].end, '12:00');
      assert.equal(afterLunch[1].start, '13:00');
      assert.equal(afterLunch[1].end, '17:00');

      // Standup at start of day cuts front
      const standup = [createTimeInterval('09:00', '09:30')];
      const afterStandup = subtractIntervals(workingWindow, standup);
      assert.equal(afterStandup.length, 1);
      assert.equal(afterStandup[0].start, '09:30');
      assert.equal(afterStandup[0].end, '17:00');

      // Retrospective at end of day cuts back
      const retro = [createTimeInterval('16:00', '17:00')];
      const afterRetro = subtractIntervals(workingWindow, retro);
      assert.equal(afterRetro.length, 1);
      assert.equal(afterRetro[0].start, '09:00');
      assert.equal(afterRetro[0].end, '16:00');

      // Blackout outside working hours does not alter windows
      const eveningEvent = [createTimeInterval('18:00', '19:00')];
      const afterEvening = subtractIntervals(workingWindow, eveningEvent);
      assert.equal(afterEvening.length, 1);
      assert.equal(afterEvening[0].start, '09:00');
      assert.equal(afterEvening[0].end, '17:00');
    });
  });

  describe('2. Working Hours & Blackout Window Generation', () => {
    test('2.1 normalizeWorkingHours applies standard fallback or respects custom', () => {
      const defaultHours = normalizeWorkingHours();
      assert.equal(defaultHours.start, '09:00');
      assert.equal(defaultHours.end, '17:00');

      const custom = normalizeWorkingHours({ start: '08:30', end: '16:30' });
      assert.equal(custom.start, '08:30');
      assert.equal(custom.end, '16:30');
    });

    test('2.2 getBlackoutsForDate filters one-off and recurring blackouts', () => {
      // 2026-10-19 is a Monday (dayOfWeek = 1)
      const blackouts = [
        { id: 'b1', title: 'Sprint Review', date: '2026-10-19', startTime: '10:00', endTime: '11:00' },
        { id: 'b2', title: 'Daily Standup', recurring: true, daysOfWeek: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '09:30' },
        { id: 'b3', title: 'Sunday Sync', recurring: true, daysOfWeek: [0], startTime: '15:00', endTime: '16:00' },
        { id: 'b4', title: 'Other Day One-Off', date: '2026-10-20', startTime: '14:00', endTime: '15:00' },
      ];

      const monBlackouts = getBlackoutsForDate('2026-10-19', blackouts);
      assert.equal(monBlackouts.length, 2);
      assert.deepEqual(monBlackouts.map(b => b.id).sort(), ['b1', 'b2']);

      const tueBlackouts = getBlackoutsForDate('2026-10-20', blackouts);
      assert.equal(tueBlackouts.length, 2);
      assert.deepEqual(tueBlackouts.map(b => b.id).sort(), ['b2', 'b4']);
    });

    test('2.3 computeAvailableWindowsForDate computes available windows and clamped capacity', () => {
      const workingHours = { start: '09:00', end: '17:00' }; // 8 total hours
      const blackouts = [
        { id: 'b-lunch', title: 'Lunch', startTime: '12:00', endTime: '13:00', recurring: true, daysOfWeek: [1] },
        { id: 'b-meeting', title: 'Team Meeting', date: '2026-10-19', startTime: '14:00', endTime: '15:00' },
      ];

      // On Monday 2026-10-19:
      // Available windows: 09:00-12:00 (3h), 13:00-14:00 (1h), 15:00-17:00 (2h) = total 6h
      const result = computeAvailableWindowsForDate('2026-10-19', {
        workingHours,
        blackouts,
        dailyCapacityHours: 7.0,
      });

      assert.equal(result.availableWindows.length, 3);
      assert.equal(result.totalWindowHours, 6.0);
      // Schedulable capacity strictly equals min(dailyCapacityHours, sum of window hours)
      assert.equal(result.effectiveCapacityHours, 6.0);
      assert.equal(result.blackoutsApplied.length, 2);
    });

    test('2.4 blackouts outside working hours do not reduce schedulable capacity', () => {
      const workingHours = { start: '09:00', end: '17:00' }; // 8 hours
      const blackouts = [
        { id: 'b-dinner', title: 'Late Dinner', date: '2026-10-19', startTime: '19:00', endTime: '21:00' },
      ];

      const result = computeAvailableWindowsForDate('2026-10-19', {
        workingHours,
        blackouts,
        dailyCapacityHours: 6.0,
      });

      assert.equal(result.availableWindows.length, 1);
      assert.equal(result.totalWindowHours, 8.0);
      assert.equal(result.effectiveCapacityHours, 6.0); // clamped to dailyCapacityHours
    });
  });

  describe('3. Intraday Session Placement & Focus Window Selection', () => {
    test('3.1 allocateIntradaySession fits session into continuous window without crossing blackouts', () => {
      const availableWindows = [
        createTimeInterval('09:00', '11:00'), // 2 hours
        createTimeInterval('13:00', '17:00'), // 4 hours
      ];

      // A 2.0h session fits in the first window
      const alloc1 = allocateIntradaySession(2.0, availableWindows);
      assert.notEqual(alloc1, null);
      assert.equal(alloc1.startTime, '09:00');
      assert.equal(alloc1.endTime, '11:00');

      // A 3.0h session cannot fit in the 2h window, so it is placed in the second window
      const alloc2 = allocateIntradaySession(3.0, availableWindows);
      assert.notEqual(alloc2, null);
      assert.equal(alloc2.startTime, '13:00');
      assert.equal(alloc2.endTime, '16:00');

      // A 5.0h session cannot fit in any continuous window
      const allocFail = allocateIntradaySession(5.0, availableWindows);
      assert.equal(allocFail.allocated, false);
      assert.equal(allocFail.startTime, null);
    });

    test('3.2 allocateIntradaySession prefers matching focus windows', () => {
      const availableWindows = [
        createTimeInterval('09:00', '12:00'), // Morning 3h
        createTimeInterval('13:00', '17:00'), // Afternoon 4h
      ];

      const focusWindows = [
        { id: 'fw1', title: 'Deep Work', startTime: '13:00', endTime: '16:00', preferred: true },
      ];

      const alloc = allocateIntradaySession(2.0, availableWindows, { focusWindows });
      assert.notEqual(alloc, null);
      // Because afternoon is in focus window, preferred window is chosen
      assert.equal(alloc.startTime, '13:00');
      assert.equal(alloc.endTime, '15:00');
      assert.equal(alloc.inFocusWindow, true);
      assert.equal(alloc.focusWindowLabel, 'Deep Work');
    });

    test('3.3 scheduleMultiDayTask with enableIntraday assigns valid start and end times', () => {
      const task = { id: 't-intraday', title: 'Write Architecture Spec', estimatedEffort: 4.0 };
      const calendarSlots = [
        {
          date: '2026-10-19',
          capacityHours: 4.0,
          remainingHours: 4.0,
          assignedTasks: [],
          availableWindows: [
            createTimeInterval('09:00', '12:00'),
            createTimeInterval('14:00', '17:00'),
          ],
        },
      ];

      const result = scheduleMultiDayTask(task, 3.0, calendarSlots, 0, {
        enableIntraday: true,
        minChunkHours: 1.0,
      });

      assert.equal(result.allocationStatus, 'fully_allocated');
      assert.equal(result.chunks.length, 1);
      assert.equal(result.chunks[0].startTime, '09:00');
      assert.equal(result.chunks[0].endTime, '12:00');
      assert.equal(calendarSlots[0].remainingHours, 1.0);
    });
  });

  describe('4. Full Adaptive Schedule Engine with Intraday Availability', () => {
    test('4.1 generates adaptive schedule with intraday session times and window respect', () => {
      const tasks = [
        { id: 'task-1', title: 'Morning Code Review', estimatedEffort: 2.0, dueDate: '2026-10-19' },
        { id: 'task-2', title: 'Core Feature Dev', estimatedEffort: 3.0, dueDate: '2026-10-19' },
      ];

      const workingHours = { start: '09:00', end: '17:00' };
      const blackouts = [
        { id: 'lunch', title: 'Lunch', date: '2026-10-19', startTime: '12:00', endTime: '13:00' },
      ];

      const proposal = generateAdaptiveSchedule(tasks, {
        scheduleId: 'test_intraday_sched',
        startDate: '2026-10-19',
        horizonDays: 7,
        dailyCapacityHours: 6.0,
        enableIntraday: true,
        workingHours,
        blackouts,
      });

      assert.ok(proposal);
      assert.equal(proposal.summary.enableIntraday, true);

      const p1 = proposal.proposedPlacements.find(p => p.taskId === 'task-1');
      assert.ok(p1);
      assert.equal(p1.proposedDate, '2026-10-19');
      assert.ok(p1.startTime);
      assert.ok(p1.endTime);

      const p2 = proposal.proposedPlacements.find(p => p.taskId === 'task-2');
      assert.ok(p2);
      assert.equal(p2.proposedDate, '2026-10-19');
      assert.ok(p2.startTime);
      assert.ok(p2.endTime);

      // Verify neither task overlaps with lunch (12:00-13:00)
      const lunchInterval = createTimeInterval('12:00', '13:00');
      const p1Interval = createTimeInterval(p1.startTime, p1.endTime);
      const p2Interval = createTimeInterval(p2.startTime, p2.endTime);

      assert.equal(intervalsOverlap(lunchInterval, p1Interval), false);
      assert.equal(intervalsOverlap(lunchInterval, p2Interval), false);
    });

    test('4.2 atomic task that exceeds single window capacity defers to next day with continuous window', () => {
      // Task is 3.5 hours and cannot be chunked
      const tasks = [
        { id: 'deep-work', title: 'Monolithic Database Migration', estimatedEffort: 3.5, dueDate: '2026-10-25' },
      ];

      // Day 1 has two disjoint 2h windows (split by 11:00-13:00 meeting) -> neither window has 3.5 continuous hours
      // Day 2 has a continuous 4h window
      const blackouts = [
        { id: 'split-day1', title: 'Midday Block', date: '2026-10-19', startTime: '11:00', endTime: '14:00' },
      ];

      const proposal = generateAdaptiveSchedule(tasks, {
        scheduleId: 'test_atomic_defer',
        startDate: '2026-10-19',
        horizonDays: 7,
        dailyCapacityHours: 4.0,
        enableIntraday: true,
        enableChunking: false, // force atomic placement
        workingHours: { start: '09:00', end: '16:00' },
        blackouts,
      });

      const p = proposal.proposedPlacements.find(item => item.taskId === 'deep-work');
      assert.ok(p);
      // Because Day 1 windows are 09:00-11:00 (2h) and 14:00-16:00 (2h), 3.5h cannot fit on Day 1
      assert.equal(p.proposedDate, '2026-10-20');
    });

    test('4.3 backward compatibility: when enableIntraday is omitted, engine behaves as legacy date-only', () => {
      const tasks = [
        { id: 'legacy-t', title: 'Legacy Task', estimatedEffort: 3.0, dueDate: '2026-10-19' },
      ];

      const proposal = generateAdaptiveSchedule(tasks, {
        scheduleId: 'legacy_test',
        startDate: '2026-10-19',
        horizonDays: 7,
        dailyCapacityHours: 6.0,
      });

      assert.ok(proposal);
      assert.equal(proposal.summary.enableIntraday, false);
      const p = proposal.proposedPlacements[0];
      assert.equal(p.proposedDate, '2026-10-19');
      assert.equal(p.startTime, null);
      assert.equal(p.endTime, null);
      assert.equal(proposal.dayAllocations[0].availableWindows, null);
    });
  });

  describe('5. Conversational Debriefing & Dialogue Manager Integration', () => {
    test('5.1 explainScheduleDecision grounded why_at_time explanation', () => {
      const placement = {
        taskId: 't-1',
        taskTitle: 'Write Spec',
        proposedDate: '2026-10-19',
        chunkDuration: 2.0,
        startTime: '10:00',
        endTime: '12:00',
        inFocusWindow: true,
        focusWindowLabel: 'Deep Focus',
      };

      const dayAllocations = [
        {
          date: '2026-10-19',
          blackoutsApplied: [{ title: 'Standup', startTime: '09:00', endTime: '09:30' }],
        },
      ];

      const res = explainScheduleDecision({
        targetTask: { id: 't-1', title: 'Write Spec' },
        inquiryType: 'why_at_time',
        activeProposal: {
          proposedPlacements: [placement],
          dayAllocations,
        },
      });

      assert.ok(res.success);
      assert.ok(res.responseText.includes('10:00 – 12:00'));
      assert.ok(res.responseText.includes('Deep Focus'));
      assert.ok(res.responseText.includes('Standup'));
    });

    test('5.2 DialogueManager handles SET_WORKING_HOURS', async () => {
      const dm = new DialogueManager({ clock: () => new Date('2026-10-18T10:00:00Z').getTime() });
      const resp = await dm.processInput('set working hours from 08:30 to 16:30', { tasks: [] });

      assert.equal(resp.intent, CONVERSATION_INTENTS.SET_WORKING_HOURS);
      assert.ok(resp.responseText.includes('08:30'));
      assert.ok(resp.responseText.includes('16:30'));

      const settings = loadTimeBlockSettings();
      assert.equal(settings.workingHours.start, '08:30');
      assert.equal(settings.workingHours.end, '16:30');
    });

    test('5.3 DialogueManager handles ADD_BLACKOUT', async () => {
      const dm = new DialogueManager({ clock: () => new Date('2026-10-18T10:00:00Z').getTime() });
      const resp = await dm.processInput('add meeting Team Sync from 14:00 to 15:00 on 2026-10-21', { tasks: [] });

      assert.equal(resp.intent, CONVERSATION_INTENTS.ADD_BLACKOUT);
      assert.ok(resp.responseText.includes('Team Sync'));
      assert.ok(resp.responseText.includes('14:00 to 15:00'));

      const settings = loadTimeBlockSettings();
      const added = settings.blackouts.find(b => b.title === 'Team Sync');
      assert.ok(added);
      assert.equal(added.startTime, '14:00');
      assert.equal(added.endTime, '15:00');
    });

    test('5.4 DialogueManager handles SET_FOCUS_WINDOW', async () => {
      const dm = new DialogueManager({ clock: () => new Date('2026-10-18T10:00:00Z').getTime() });
      const resp = await dm.processInput('set focus window Deep Work from 09:00 to 11:30', { tasks: [] });

      assert.equal(resp.intent, CONVERSATION_INTENTS.SET_FOCUS_WINDOW);
      assert.ok(resp.responseText.includes('Deep Work'));
      assert.ok(resp.responseText.includes('09:00 to 11:30'));

      const settings = loadTimeBlockSettings();
      const fw = settings.focusWindows.find(f => f.title === 'Deep Work');
      assert.ok(fw);
      assert.equal(fw.startTime, '09:00');
      assert.equal(fw.endTime, '11:30');
    });

    test('5.5 DialogueManager handles why_at_time query in awaiting proposal state', async () => {
      const targetTask = { id: 't-focus', title: 'Architecture Review' };
      const dm = new DialogueManager({ clock: () => new Date('2026-10-18T10:00:00Z').getTime() });
      const proposal = {
        scheduleId: 'test_prop',
        proposedPlacements: [
          {
            taskId: 't-focus',
            taskTitle: 'Architecture Review',
            proposedDate: '2026-10-19',
            chunkDuration: 2.0,
            startTime: '09:00',
            endTime: '11:00',
            inFocusWindow: true,
            focusWindowLabel: 'Morning Focus',
          },
        ],
        dayAllocations: [
          {
            date: '2026-10-19',
            blackoutsApplied: [],
          },
        ],
      };

      dm.activeProposal = proposal;
      dm.conversationState = 'AWAITING_PROPOSAL_DECISION';

      const resp = await dm.processInput('why is Architecture Review at that time?', { tasks: [targetTask] });

      assert.equal(resp.intent, CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION);
      assert.ok(resp.responseText.includes('09:00 – 11:00'));
      assert.ok(resp.responseText.includes('Morning Focus'));
    });
  });

  describe('6. Local-First Persistence Round-Trip', () => {
    test('6.1 saveTimeBlockSettings and loadTimeBlockSettings preserve all properties', () => {
      const sampleSettings = {
        enableIntraday: true,
        workingHours: { start: '08:00', end: '16:00' },
        blackouts: [
          { id: 'b-pers', title: 'Persistent Sync', date: '2026-10-22', startTime: '11:00', endTime: '12:00' },
        ],
        focusWindows: [
          { id: 'fw-pers', title: 'Focus Afternoon', startTime: '13:00', endTime: '15:00', preferred: true },
        ],
      };

      saveTimeBlockSettings(sampleSettings);
      const loaded = loadTimeBlockSettings();

      assert.equal(loaded.enableIntraday, true);
      assert.equal(loaded.workingHours.start, '08:00');
      assert.equal(loaded.workingHours.end, '16:00');
      assert.equal(loaded.blackouts.length >= 1, true);
      assert.ok(loaded.blackouts.some(b => b.title === 'Persistent Sync'));
      assert.ok(loaded.focusWindows.some(f => f.title === 'Focus Afternoon'));
    });
  });
});
