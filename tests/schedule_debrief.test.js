import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  explainScheduleDecision,
  explainScheduleChanges,
  generatePlanDebrief,
} from '../src/conversation/scheduleDebrief.js';
import {
  DialogueManager,
  CONVERSATION_STATES,
  CONVERSATION_INTENTS,
} from '../src/conversation/dialogueManager.js';
import { generateSpokenSummary } from '../src/conversation/speechEngine.js';

const FIXED_NOW = new Date('2026-10-18T10:00:00.000Z').getTime();
const fixedClock = () => FIXED_NOW;

describe('Phase 5.4 Feature A: Explain Scheduling Decisions', () => {
  const baseTasks = [
    { id: 't1', title: 'Database Design', dueDate: '2026-10-19', priority: 'high', estimatedEffort: 2.0, completed: false },
    { id: 't2', title: 'API Implementation', dueDate: '2026-10-20', priority: 'medium', estimatedEffort: 3.0, completed: false, dependencies: ['t1'] },
    { id: 't3', title: 'Large Migration Task', dueDate: '2026-10-22', priority: 'low', estimatedEffort: 8.0, completed: false },
  ];

  test('Explains task blocked by dependency topological constraints', () => {
    const activeProposal = {
      scheduleId: 'prop-1',
      status: 'pending',
      proposedPlacements: [
        { taskId: 't2', proposedDate: null, status: 'blocked_by_dependency', conflicts: ['Dependency t1 incomplete'] },
      ],
    };

    const result = explainScheduleDecision({
      targetTask: baseTasks[1],
      tasks: baseTasks,
      activeProposal,
      clock: fixedClock,
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'blocked_by_dependency');
    assert.ok(result.responseText.includes('blocked by dependencies'));
    assert.ok(result.responseText.includes('Database Design'));
    assert.ok(result.spokenSummary.includes('blocked by prerequisite tasks'));
    assert.equal(result.evidence.reasonCode, 'blocked_by_dependency');
  });

  test('Explains oversized task exceeding daily capacity', () => {
    const activeProposal = {
      scheduleId: 'prop-1',
      status: 'pending',
      proposedPlacements: [
        { taskId: 't3', proposedDate: null, status: 'oversized_exceeds_capacity', effectiveHours: 8.0 },
      ],
    };

    const result = explainScheduleDecision({
      targetTask: baseTasks[2],
      tasks: baseTasks,
      activeProposal,
      dailyCapacityHours: 6.0,
      clock: fixedClock,
    });

    assert.equal(result.success, true);
    assert.equal(result.status, 'oversized_exceeds_capacity');
    assert.ok(result.responseText.includes('exceeds your daily working capacity (6h/day)'));
    assert.ok(result.spokenSummary.includes('exceeding your daily capacity of 6 hours'));
  });

  test('Explains why a task could not fit on an earlier requested date due to daily capacity limits', () => {
    const activeProposal = {
      scheduleId: 'prop-1',
      status: 'pending',
      proposedPlacements: [
        { taskId: 't1', proposedDate: '2026-10-19', effectiveHours: 5.0 },
        { taskId: 't4', proposedDate: '2026-10-20', effectiveHours: 3.0 },
      ],
    };

    const targetTask = { id: 't4', title: 'Security Audit', dueDate: '2026-10-20', estimatedEffort: 3.0 };

    const result = explainScheduleDecision({
      targetTask,
      targetDateQuery: '2026-10-19',
      tasks: [...baseTasks, targetTask],
      activeProposal,
      dailyCapacityHours: 6.0,
      clock: fixedClock,
    });

    assert.equal(result.success, true);
    assert.ok(result.responseText.includes('5.0h of work are already allocated against your 6h/day limit'));
    assert.ok(result.responseText.includes('exceeding daily capacity'));
    assert.equal(result.evidence.reasonCode, 'daily_capacity_limit');
  });

  test('Distinguishes proposed schedule from accepted schedule', () => {
    const acceptedProposal = {
      scheduleId: 'prop-accepted',
      status: 'accepted',
      proposedPlacements: [
        { taskId: 't1', proposedDate: '2026-10-19', status: 'on_time', effectiveHours: 2.0 },
      ],
    };

    const result = explainScheduleDecision({
      targetTask: baseTasks[0],
      tasks: baseTasks,
      activeProposal: null,
      proposalHistory: [acceptedProposal],
      clock: fixedClock,
    });

    assert.equal(result.success, true);
    assert.equal(result.decisionType, 'accepted_schedule');
    assert.ok(result.responseText.includes('In your accepted schedule'));
    assert.ok(!result.responseText.includes('the proposed schedule'));
  });

  test('Reports limitation honestly when fine-grained causal comparisons were not recorded', () => {
    const activeProposal = {
      scheduleId: 'prop-1',
      status: 'pending',
      proposedPlacements: [
        { taskId: 't1', proposedDate: '2026-10-19', status: 'on_time', effectiveHours: 2.0 },
      ],
    };

    const result = explainScheduleDecision({
      targetTask: baseTasks[0],
      tasks: baseTasks,
      activeProposal,
      clock: fixedClock,
    });

    assert.equal(result.success, true);
    assert.ok(result.responseText.includes('Fine-grained slot comparisons were not recorded'));
    assert.ok(Array.isArray(result.evidence.limitations));
  });

  test('Handles backlog task with no proposal placement gracefully without hallucinating', () => {
    const backlogTask = { id: 'tb', title: 'Read Research Paper', dueDate: '2026-10-25', priority: 'low' };

    const result = explainScheduleDecision({
      targetTask: backlogTask,
      tasks: [backlogTask],
      activeProposal: null,
      proposalHistory: [],
      clock: fixedClock,
    });

    assert.equal(result.success, true);
    assert.equal(result.decisionType, 'task_backlog');
    assert.ok(result.responseText.includes('not governed by an active automated schedule proposal'));
    assert.equal(result.evidence.reasonCode, 'direct_user_schedule');
  });

  test('Missing task argument returns clear error without crashing', () => {
    const result = explainScheduleDecision({
      targetTask: null,
      tasks: baseTasks,
      clock: fixedClock,
    });

    assert.equal(result.success, false);
    assert.equal(result.error, 'no_task_specified');
  });
});

describe('Phase 5.4 Feature B: Explain Schedule Changes', () => {
  const tasks = [
    { id: 't1', title: 'English assignment', dueDate: '2026-10-19' },
    { id: 't2', title: 'Math homework', dueDate: '2026-10-20' },
    { id: 't3', title: 'Physics lab', dueDate: '2026-10-21' },
  ];

  test('Detects moved, added, and removed tasks using stable task IDs', () => {
    const proposalA = {
      scheduleId: 'prop-v1',
      proposedPlacements: [
        { taskId: 't1', taskTitle: 'English assignment', proposedDate: '2026-10-19' },
        { taskId: 't2', taskTitle: 'Math homework', proposedDate: '2026-10-20' },
        { taskId: 't3', taskTitle: 'Physics lab', proposedDate: '2026-10-21' },
      ],
    };

    const proposalB = {
      scheduleId: 'prop-v2',
      supersedesScheduleId: 'prop-v1',
      proposedPlacements: [
        { taskId: 't1', taskTitle: 'English assignment', proposedDate: '2026-10-21' }, // moved +2 days
        { taskId: 't2', taskTitle: 'Math homework', proposedDate: '2026-10-20' },     // unchanged
        { taskId: 't4', taskTitle: 'Chemistry report', proposedDate: '2026-10-22' },   // newly added
      ],
    };

    const result = explainScheduleChanges({
      activeProposal: proposalB,
      proposalHistory: [proposalA],
      tasks,
    });

    assert.equal(result.success, true);
    assert.equal(result.hasChanges, true);
    assert.equal(result.movedTasks.length, 1);
    assert.equal(result.movedTasks[0].id, 't1');
    assert.equal(result.movedTasks[0].fromDate, '2026-10-19');
    assert.equal(result.movedTasks[0].toDate, '2026-10-21');
    assert.equal(result.movedTasks[0].offsetDays, 2);

    assert.equal(result.addedTasks.length, 1);
    assert.equal(result.addedTasks[0].id, 't4');

    assert.equal(result.removedTasks.length, 1);
    assert.equal(result.removedTasks[0].id, 't3');
  });

  test('Identifies recorded user trigger when available vs honest unrecorded trigger', () => {
    const proposalA = {
      scheduleId: 'prop-v1',
      proposedPlacements: [
        { taskId: 't1', taskTitle: 'English assignment', proposedDate: '2026-10-19' },
        { taskId: 't2', taskTitle: 'Math homework', proposedDate: '2026-10-20' },
      ],
    };

    const proposalB = {
      scheduleId: 'prop-v2',
      proposedPlacements: [
        { taskId: 't1', taskTitle: 'English assignment', proposedDate: '2026-10-21' },
        { taskId: 't2', taskTitle: 'Math homework', proposedDate: '2026-10-22' },
      ],
    };

    // t1 was rescheduled by explicit user action; t2 was shifted automatically
    const telemetryEvents = [
      {
        event_type: 'task_rescheduled',
        task_id: 't1',
        payload: { previous_due_date: '2026-10-19', new_due_date: '2026-10-21', reason: 'user requested Friday' },
      },
    ];

    const result = explainScheduleChanges({
      activeProposal: proposalB,
      proposalHistory: [proposalA],
      tasks,
      telemetryEvents,
    });

    const m1 = result.movedTasks.find((m) => m.id === 't1');
    const m2 = result.movedTasks.find((m) => m.id === 't2');

    assert.ok(m1.triggerText.includes('user requested Friday'), 'Must attribute explicit recorded user action');
    assert.ok(m2.triggerText.includes('shifted during automated schedule balancing; specific trigger not recorded'), 'Must be non-causal when trigger unrecorded');
  });

  test('Single task movement query reports movement or confirms no change', () => {
    const proposalA = {
      scheduleId: 'prop-v1',
      proposedPlacements: [
        { taskId: 't1', proposedDate: '2026-10-19' },
        { taskId: 't2', proposedDate: '2026-10-20' },
      ],
    };
    const proposalB = {
      scheduleId: 'prop-v2',
      proposedPlacements: [
        { taskId: 't1', proposedDate: '2026-10-21' },
        { taskId: 't2', proposedDate: '2026-10-20' },
      ],
    };

    // Query moved task
    const resMoved = explainScheduleChanges({
      activeProposal: proposalB,
      proposalHistory: [proposalA],
      tasks,
      queryTaskId: 't1',
    });
    assert.equal(resMoved.hasChanges, true);
    assert.ok(resMoved.responseText.includes('moved from 2026-10-19 to 2026-10-21'));

    // Query unmoved task
    const resUnmoved = explainScheduleChanges({
      activeProposal: proposalB,
      proposalHistory: [proposalA],
      tasks,
      queryTaskId: 't2',
    });
    assert.equal(resUnmoved.hasChanges, false);
    assert.ok(resUnmoved.responseText.includes('did not move in the latest proposal'));
  });

  test('Handles no proposals available safely without crashing', () => {
    const result = explainScheduleChanges({
      activeProposal: null,
      proposalHistory: [],
      tasks,
    });
    assert.equal(result.success, false);
    assert.equal(result.hasChanges, false);
    assert.ok(result.responseText.includes('No schedule proposals have been generated yet'));
  });
});

describe('Phase 5.4 Feature C: Conversational Planning Debriefs', () => {
  const testTasks = [
    { id: 't1', title: 'Write Report', dueDate: '2026-10-18', completed: true },
    { id: 't2', title: 'Submit Code', dueDate: '2026-10-18', completed: true },
    { id: 't3', title: 'Team Meeting Prep', dueDate: '2026-10-18', completed: false, priority: 'high', estimatedEffort: 2.0 },
  ];

  test('Calculates planned vs completed vs incomplete outcomes correctly', () => {
    const telemetryEvents = [
      {
        event_type: 'task_completed',
        task_id: 't1',
        timestamp: '2026-10-18T14:00:00.000Z',
        payload: { duration_source: 'tracked', tracked_duration_seconds: 3600 },
      },
      {
        event_type: 'task_completed',
        task_id: 't2',
        timestamp: '2026-10-18T16:30:00.000Z',
        payload: { duration_source: 'self_reported', self_reported_duration_seconds: 1800 },
      },
    ];

    const debrief = generatePlanDebrief({
      period: 'today',
      targetDate: '2026-10-18',
      tasks: testTasks,
      telemetryEvents,
      clock: fixedClock,
    });

    assert.equal(debrief.success, true);
    assert.equal(debrief.hasSufficientData, true);
    assert.equal(debrief.metrics.scheduledCount, 3);
    assert.equal(debrief.metrics.completedCount, 2);
    assert.equal(debrief.metrics.incompleteCount, 1);
    assert.equal(debrief.metrics.onTimeCount, 2);
    assert.equal(debrief.metrics.trackedSecondsTotal, 3600);
    assert.equal(debrief.metrics.selfReportedSecondsTotal, 1800);
    assert.ok(debrief.responseText.includes('Planned Tasks: 3'));
    assert.ok(debrief.responseText.includes('Completed: 2 (67%)'));
    assert.ok(debrief.responseText.includes('Incomplete: 1'));
    assert.ok(debrief.responseText.includes('Recorded Focus Time: 60m timed, 30m reported'));
    assert.ok(debrief.spokenSummary.includes('2 of 3 tasks completed, 1 remaining'));
  });

  test('Guards against punctuality fabrication when completion timestamp is missing', () => {
    // Task is marked completed in task store, but has NO completion event in telemetry
    const unverifiedTasks = [
      { id: 'tu', title: 'Ad-hoc Task', dueDate: '2026-10-18', completed: true },
    ];

    const debrief = generatePlanDebrief({
      period: 'today',
      targetDate: '2026-10-18',
      tasks: unverifiedTasks,
      telemetryEvents: [],
      clock: fixedClock,
    });

    assert.equal(debrief.metrics.completedCount, 1);
    assert.equal(debrief.metrics.onTimeCount, 0, 'Must NOT assume on-time without timestamp');
    assert.equal(debrief.metrics.unverifiedTimingCount, 1, 'Must record unverified timing');
    assert.ok(debrief.responseText.includes('Unverified Punctuality: 1 (missing completion timestamp)'));
  });

  test('Insufficient data guard triggers when no tasks or completions exist for period', () => {
    const debrief = generatePlanDebrief({
      period: 'yesterday',
      targetDate: '2026-10-17',
      tasks: testTasks, // Due 2026-10-18, none on 2026-10-17
      telemetryEvents: [],
      clock: fixedClock,
    });

    assert.equal(debrief.success, true);
    assert.equal(debrief.hasSufficientData, false);
    assert.equal(debrief.metrics.scheduledCount, 0);
    assert.ok(debrief.responseText.includes('Insufficient recorded data: No scheduled tasks or recorded completions'));
    assert.ok(debrief.spokenSummary.includes('No scheduled tasks or outcomes were recorded'));
  });

  test('Formulates evidence-based capacity overload advice without psychological claims', () => {
    const overloadedTasks = [
      { id: 't1', title: 'Task 1', dueDate: '2026-10-18', estimatedEffort: 4.0, completed: true },
      { id: 't2', title: 'Task 2', dueDate: '2026-10-18', estimatedEffort: 4.0, completed: false }, // total effort 8h > 6h daily capacity
    ];

    const debrief = generatePlanDebrief({
      period: 'today',
      targetDate: '2026-10-18',
      tasks: overloadedTasks,
      telemetryEvents: [],
      dailyCapacityHours: 6.0,
      clock: fixedClock,
    });

    assert.equal(debrief.suggestions.length, 1);
    assert.ok(debrief.suggestions[0].includes('totaled 8.0h, exceeding your daily capacity limit of 6h/day'));
  });
});

describe('Phase 5.4 Conversational Integration & Invariants', () => {
  const sampleTasks = [
    { id: 't1', title: 'English presentation', dueDate: '2026-10-19', priority: 'medium', completed: false },
    { id: 't2', title: 'English assignment', dueDate: '2026-10-20', priority: 'high', completed: false },
    { id: 't3', title: 'Math quiz', dueDate: '2026-10-19', priority: 'low', completed: true },
  ];

  test('Typed and voice input use identical dialogue processing pathway for explanations', () => {
    const dm = new DialogueManager({ clock: fixedClock });
    const tasks = [...sampleTasks];

    const query = 'Why was English assignment scheduled for tomorrow?';
    const result = dm.processInput(query, { tasks });

    assert.equal(result.intent, CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION);
    assert.equal(result.isAuthorized, false, 'Explanation must be read-only');
    assert.equal(result.action, null, 'Must produce no executable mutation action');
    assert.ok(result.responseText.includes('English assignment'));

    const spoken = generateSpokenSummary(result);
    assert.ok(spoken.length > 0);
  });

  test('Ambiguous task inquiry in explanation triggers Stage 5.1 clarification flow', () => {
    const dm = new DialogueManager({ clock: fixedClock });
    const tasks = [...sampleTasks];

    // Refers to "English" which matches both English presentation and English assignment
    const result = dm.processInput('Why was English scheduled for tomorrow?', { tasks });

    assert.equal(result.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(result.isAuthorized, false);
    assert.ok(result.responseText.includes('matching tasks'));
    assert.ok(result.responseText.includes('English presentation'));
    assert.ok(result.responseText.includes('English assignment'));

    // User clarifies: "English presentation"
    const clarified = dm.processInput('English presentation', { tasks });
    assert.equal(clarified.state, CONVERSATION_STATES.IDLE);
    assert.equal(clarified.intent, CONVERSATION_INTENTS.EXPLAIN_SCHEDULE_DECISION);
    assert.equal(clarified.isAuthorized, false);
    assert.ok(clarified.responseText.includes('English presentation'));
  });

  test('Proposal decision state is preserved when user asks explanation or comparison questions', () => {
    const dm = new DialogueManager({ clock: fixedClock });
    const tasks = [...sampleTasks];

    // Generate a proposal review state
    dm.state = CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION;
    dm.activeProposal = {
      scheduleId: 'prop-test',
      status: 'pending',
      proposedPlacements: [
        { taskId: 't1', taskTitle: 'English presentation', proposedDate: '2026-10-21' },
      ],
      summary: { dateChangesCount: 1, feasibilityStatus: 'feasible' },
    };

    // User asks "What changed in my schedule?"
    const changeRes = dm.processInput('What changed in my schedule?', { tasks });
    assert.equal(changeRes.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION, 'State must remain in proposal review');
    assert.ok(dm.activeProposal !== null, 'Active proposal must not be discarded by explanation query');

    // Spoken response reflects explanation rather than generic proposal prompt
    const spoken = generateSpokenSummary(changeRes);
    assert.ok(spoken.includes('English presentation') || spoken.includes('moved in the proposal'));

    // User can still accept the proposal afterwards!
    const acceptRes = dm.processInput('accept', { tasks });
    assert.equal(acceptRes.intent, CONVERSATION_INTENTS.ACCEPT_PROPOSAL);
    assert.equal(acceptRes.isAuthorized, true);
    assert.equal(dm.state, CONVERSATION_STATES.IDLE);
  });

  test('Read-only explanation and debrief queries cause zero task or schedule mutation', () => {
    const dm = new DialogueManager({ clock: fixedClock });
    const tasksBefore = JSON.parse(JSON.stringify(sampleTasks));

    const queries = [
      'How did my plan go?',
      'How did I do yesterday?',
      'What changed in my schedule?',
      'Why was English assignment scheduled for tomorrow?',
      'Why is English assignment blocked?',
      'Which tasks did I complete as planned?',
    ];

    for (const q of queries) {
      const res = dm.processInput(q, { tasks: sampleTasks });
      assert.equal(res.isAuthorized, false, `Query "${q}" must have isAuthorized=false`);
      assert.equal(res.action, null, `Query "${q}" must have action=null`);
    }

    assert.deepEqual(sampleTasks, tasksBefore, 'Tasks collection must remain completely unmodified');
  });
});
