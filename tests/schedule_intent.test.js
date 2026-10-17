import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseScheduleIntent,
  SCHEDULE_INTENTS,
} from '../src/conversation/scheduleIntentParser.js';
import {
  negotiateScheduleProposal,
} from '../src/conversation/scheduleNegotiator.js';
import {
  DialogueManager,
  CONVERSATION_STATES,
  CONVERSATION_INTENTS,
  parseDateExpression,
} from '../src/conversation/dialogueManager.js';
import {
  addDaysISO,
} from '../src/scheduler/adaptiveScheduler.js';

// Fixed reference epoch: Monday, Oct 19, 2026, 10:00:00 local time
const FIXED_TIMESTAMP = new Date(2026, 9, 19, 10, 0, 0).getTime();
const createClock = (startTime = FIXED_TIMESTAMP) => {
  let cur = startTime;
  const clockFn = () => cur;
  clockFn.advance = (ms) => {
    cur += ms;
  };
  return clockFn;
};

const createTestTasks = () => [
  {
    id: 'task-db',
    title: 'Database Assignment',
    description: 'Implement SQL migrations',
    dueDate: '2026-10-20', // Tuesday
    completed: false,
    priority: 'high',
    estimatedEffort: 3.0,
    dependencies: [],
  },
  {
    id: 'task-api',
    title: 'API Integration',
    description: 'Connect REST endpoints',
    dueDate: '2026-10-22', // Thursday
    completed: false,
    priority: 'medium',
    estimatedEffort: 4.0,
    dependencies: ['task-db'], // depends on task-db!
  },
  {
    id: 'task-test-unit',
    title: 'Unit Test Assignment',
    description: 'Write unit tests',
    dueDate: '2026-10-21', // Wednesday
    completed: false,
    priority: 'low',
    estimatedEffort: 2.0,
    dependencies: [],
  },
  {
    id: 'task-test-integration',
    title: 'Integration Test Assignment',
    description: 'End-to-end tests',
    dueDate: '2026-10-23', // Friday
    completed: false,
    priority: 'low',
    estimatedEffort: 2.5,
    dependencies: [],
  },
];

describe('A. Natural-Language Schedule Intent Recognition', () => {
  const clock = createClock();

  test('Direct task rescheduling extracts target task and date expression', () => {
    const res = parseScheduleIntent('Move my database assignment to tomorrow', { clock });
    assert.equal(res.intent, SCHEDULE_INTENTS.DIRECT_RESCHEDULE);
    assert.ok(res.params.targetTaskQuery.toLowerCase().includes('database assignment'));
    assert.equal(res.params.targetDate, '2026-10-20');
  });

  test('Reschedule task to a specific weekday resolves correctly', () => {
    const res = parseScheduleIntent('Reschedule this task to Friday', {
      clock,
      activeSubjectTask: { id: 'task-db', title: 'Database Assignment' },
    });
    assert.equal(res.intent, SCHEDULE_INTENTS.DIRECT_RESCHEDULE);
    assert.equal(res.params.targetDate, '2026-10-23'); // Friday of current week
  });

  test('Relative-date offset parsing for single tasks', () => {
    const res = parseScheduleIntent('Delay database assignment by 3 days', { clock });
    assert.equal(res.intent, SCHEDULE_INTENTS.RELATIVE_SHIFT);
    assert.equal(res.params.isBatch, false);
    assert.equal(res.params.offsetDays, 3);
    assert.ok(res.params.targetTaskQuery.toLowerCase().includes('database assignment'));
  });

  test('Relative-date offset parsing for earlier direction', () => {
    const res = parseScheduleIntent('Move database assignment earlier by 1 day', { clock });
    assert.equal(res.intent, SCHEDULE_INTENTS.RELATIVE_SHIFT);
    assert.equal(res.params.offsetDays, -1);
  });

  test('Batch relative shift by priority tier', () => {
    const res = parseScheduleIntent('Push low-priority tasks by 2 days', { clock });
    assert.equal(res.intent, SCHEDULE_INTENTS.RELATIVE_SHIFT);
    assert.equal(res.params.isBatch, true);
    assert.equal(res.params.priorityFilter, 'low');
    assert.equal(res.params.offsetDays, 2);
  });

  test('Workload spreading and capacity negotiation intent', () => {
    const res1 = parseScheduleIntent('Tomorrow looks overloaded. Spread it out.', { clock });
    assert.equal(res1.intent, SCHEDULE_INTENTS.SPREAD_TASKS);

    const res2 = parseScheduleIntent('Spread my tasks across the next 3 days', { clock });
    assert.equal(res2.intent, SCHEDULE_INTENTS.SPREAD_TASKS);
    assert.equal(res2.params.horizonDays, 3);
  });

  test('Feasibility and hypothetical questions ("What if...")', () => {
    const res = parseScheduleIntent('What happens if I move this task to Friday?', {
      clock,
      activeSubjectTask: { id: 'task-db', title: 'Database Assignment' },
    });
    assert.equal(res.intent, SCHEDULE_INTENTS.HYPOTHETICAL_SIMULATION);
    assert.equal(res.params.isSimulationOnly, true);
    assert.equal(res.params.targetDate, '2026-10-23');
  });

  test('Capacity query ("Do I have capacity for a 4-hour task on Thursday?")', () => {
    const res = parseScheduleIntent('Do I have capacity for a 4-hour task on Thursday?', { clock });
    assert.equal(res.intent, SCHEDULE_INTENTS.CAPACITY_QUERY);
    assert.equal(res.params.requestedHours, 4.0);
    assert.equal(res.params.targetDate, '2026-10-22');
  });

  test('Dependency scheduling ("Schedule this after my database assignment")', () => {
    const res = parseScheduleIntent('Schedule this after my database assignment', {
      clock,
      activeSubjectTask: { id: 'task-api', title: 'API Integration' },
    });
    assert.equal(res.intent, SCHEDULE_INTENTS.SCHEDULE_AFTER);
    assert.ok(res.params.targetTaskQuery.includes('this'));
    assert.ok(res.params.prerequisiteTaskQuery.includes('database assignment'));
  });

  test('Incomplete request missing target date triggers INCOMPLETE_REQUEST', () => {
    const res = parseScheduleIntent('Move my database assignment', { clock });
    assert.equal(res.intent, SCHEDULE_INTENTS.INCOMPLETE_REQUEST);
    assert.equal(res.params.missingField, 'targetDate');
  });

  test('Accept and Discard proposals parse accurately', () => {
    assert.equal(parseScheduleIntent('Accept').intent, SCHEDULE_INTENTS.ACCEPT_PROPOSAL);
    assert.equal(parseScheduleIntent('Apply schedule').intent, SCHEDULE_INTENTS.ACCEPT_PROPOSAL);
    assert.equal(parseScheduleIntent('Discard proposal').intent, SCHEDULE_INTENTS.DISCARD_PROPOSAL);
    assert.equal(parseScheduleIntent('Reject').intent, SCHEDULE_INTENTS.DISCARD_PROPOSAL);
  });
});

describe('B. Deterministic Date Handling & Boundary Tests', () => {
  test('Today and tomorrow resolve to local ISO dates', () => {
    const now = new Date(2026, 9, 19, 12, 0, 0); // Oct 19, 2026
    assert.equal(parseDateExpression('today', now), '2026-10-19');
    assert.equal(parseDateExpression('tomorrow', now), '2026-10-20');
  });

  test('Weekday resolution always yields future date or next occurrence', () => {
    const nowMonday = new Date(2026, 9, 19); // Monday Oct 19, 2026
    assert.equal(parseDateExpression('Friday', nowMonday), '2026-10-23');
    assert.equal(parseDateExpression('Monday', nowMonday), '2026-10-26'); // Next Monday
  });

  test('Month boundary roll-over (October 31 to November 1)', () => {
    const endOfOct = new Date(2026, 9, 31, 10, 0, 0);
    assert.equal(parseDateExpression('tomorrow', endOfOct), '2026-11-01');
    assert.equal(addDaysISO('2026-10-31', 1), '2026-11-01');
    assert.equal(addDaysISO('2026-10-31', 5), '2026-11-05');
  });

  test('Year boundary roll-over (December 31 to January 1)', () => {
    const endOfYear = new Date(2026, 11, 31, 10, 0, 0);
    assert.equal(parseDateExpression('tomorrow', endOfYear), '2027-01-01');
    assert.equal(addDaysISO('2026-12-31', 1), '2027-01-01');
  });

  test('Invalid calendar date strings return null', () => {
    assert.equal(parseDateExpression('not-a-date'), null);
    assert.equal(parseDateExpression('someday next century'), null);
  });
});

describe('C. Context-Aware Multi-Turn Negotiation', () => {
  test('Example 1: Rescheduling with multi-turn revision and explicit acceptance', () => {
    const clock = createClock();
    const dm = new DialogueManager({ clock });
    const tasks = createTestTasks();

    // Turn 1: Initial natural-language request
    const res1 = dm.processInput('Move my database assignment to Friday', { tasks });
    assert.equal(res1.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.ok(res1.proposal, 'Proposal should be generated');
    assert.equal(res1.proposal.proposedPlacements[0].proposedDate, '2026-10-23');
    assert.equal(res1.isAuthorized, false, 'Persisted schedule must NOT mutate prior to acceptance');

    // Confirm persisted task is unchanged
    const originalTask = tasks.find((t) => t.id === 'task-db');
    assert.equal(originalTask.dueDate, '2026-10-20');

    // Turn 2: Follow-up revision using pronoun "it" ("What if I move it to Saturday instead?")
    const res2 = dm.processInput('What if I move it to Saturday instead?', { tasks });
    assert.equal(res2.isSimulationOnly, true);
    assert.ok(res2.responseText.includes('Saturday'));
    assert.ok(res2.responseText.includes('non-working day'));

    // Turn 2b: Move it to next Monday
    const res2b = dm.processInput('Move it to next Monday', { tasks });
    assert.equal(res2b.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.ok(res2b.proposal);
    assert.equal(res2b.proposal.proposedPlacements[0].proposedDate, '2026-10-26');
    assert.ok(res2b.supersededProposal, 'Prior proposal must be marked superseded');

    // Turn 3: User accepts the active proposal
    const res3 = dm.processInput('Accept', { tasks });
    assert.equal(res3.state, CONVERSATION_STATES.IDLE);
    assert.equal(res3.isAuthorized, true);
    assert.equal(res3.action.type, 'ACCEPT_SCHEDULE_PROPOSAL');
    assert.equal(res3.action.proposal.proposedPlacements[0].proposedDate, '2026-10-26');
  });

  test('Example 2: Ambiguous task match requests clarification, then generates proposal', () => {
    const clock = createClock();
    const dm = new DialogueManager({ clock });
    const tasks = createTestTasks();

    // Turn 1: "Move the test assignment to tomorrow" matches Unit Test and Integration Test
    const res1 = dm.processInput('Move the test assignment to tomorrow', { tasks });
    assert.equal(res1.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.ok(res1.responseText.includes('Which one'));

    // Turn 2: User answers with specific choice
    const res2 = dm.processInput('Unit Test Assignment', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.ok(res2.proposal);
    assert.equal(res2.proposal.proposedPlacements[0].taskTitle, 'Unit Test Assignment');
    assert.equal(res2.proposal.proposedPlacements[0].proposedDate, '2026-10-20');
  });

  test('Example 4: Missing target date requests clarification, then completes proposal', () => {
    const clock = createClock();
    const dm = new DialogueManager({ clock });
    const tasks = createTestTasks();

    // Turn 1: "Move my database assignment" (no date)
    const res1 = dm.processInput('Move my database assignment', { tasks });
    assert.equal(res1.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.ok(res1.responseText.includes('When would you like to reschedule'));

    // Turn 2: User provides date "Friday"
    const res2 = dm.processInput('Friday', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.ok(res2.proposal);
    assert.equal(res2.proposal.proposedPlacements[0].proposedDate, '2026-10-23');
  });

  test('Five-minute inactivity timeout clears pending proposal context', () => {
    const clock = createClock();
    const dm = new DialogueManager({ clock });
    const tasks = createTestTasks();

    dm.processInput('Move my database assignment to Friday', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.ok(dm.activeProposal);

    // Advance clock past 5 minutes (300,000 ms)
    clock.advance(300001);

    const resTimeout = dm.processInput('Accept', { tasks });
    assert.equal(resTimeout.state, CONVERSATION_STATES.IDLE);
    assert.equal(resTimeout.isAuthorized, false);
    assert.ok(resTimeout.responseText.toLowerCase().includes('no active schedule proposal'));
  });

  test('Discard proposal resets conversation and leaves schedule intact', () => {
    const clock = createClock();
    const dm = new DialogueManager({ clock });
    const tasks = createTestTasks();

    dm.processInput('Move my database assignment to Friday', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);

    const resDiscard = dm.processInput('Discard', { tasks });
    assert.equal(resDiscard.state, CONVERSATION_STATES.IDLE);
    assert.equal(resDiscard.isAuthorized, false);
    assert.equal(dm.activeProposal, null);
  });
});

describe('D. Scheduler and Proposal Integrity Constraints', () => {
  const clock = createClock();

  test('Violating dependency ordering reports infeasible_dependency conflict', () => {
    const tasks = createTestTasks();
    // task-api depends on task-db (which is due on 2026-10-20)
    // If user attempts to move task-api to 2026-10-19 (before task-db), it violates DAG!
    const negotiation = negotiateScheduleProposal({
      intentResult: {
        intent: SCHEDULE_INTENTS.DIRECT_RESCHEDULE,
        params: {
          targetTaskQuery: 'API Integration',
          targetDate: '2026-10-19',
        },
      },
      tasks,
      options: { clock },
    });

    assert.equal(negotiation.success, true);
    assert.ok(negotiation.proposal);
    assert.equal(negotiation.proposal.summary.feasibilityStatus, 'infeasible_dependency');
    assert.equal(negotiation.proposal.proposedPlacements[0].status, 'blocked_by_dependency');
    assert.ok(negotiation.responseText.includes('Violates dependency ordering'));
  });

  test('Exceeding daily capacity triggers capacity_warning', () => {
    const tasks = createTestTasks();
    // Tuesday 2026-10-20 already has task-db (3.0h)
    // If we move task-api (4.0h) to Tuesday, total is 7.0h > 6.0h limit!
    const negotiation = negotiateScheduleProposal({
      intentResult: {
        intent: SCHEDULE_INTENTS.DIRECT_RESCHEDULE,
        params: {
          targetTaskQuery: 'API Integration',
          targetDate: '2026-10-20',
        },
      },
      tasks,
      options: { clock, dailyCapacityHours: 6.0 },
    });

    assert.equal(negotiation.proposal.summary.feasibilityStatus, 'capacity_warning');
    assert.ok(negotiation.responseText.includes('Capacity alert'));
  });

  test('Pure simulation query does not create pending proposal', () => {
    const tasks = createTestTasks();
    const dm = new DialogueManager({ clock });

    const res = dm.processInput('What happens if I move API Integration to Friday?', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.isAuthorized, false);
    assert.equal(dm.activeProposal, null);
    assert.ok(res.responseText.includes('Simulation:'));
  });

  test('Superseded proposals cannot be accepted', () => {
    const tasks = createTestTasks();
    const proposal1 = {
      scheduleId: 'prop-1',
      status: 'superseded',
      proposedPlacements: [],
    };

    const negotiation = negotiateScheduleProposal({
      intentResult: { intent: SCHEDULE_INTENTS.ACCEPT_PROPOSAL },
      tasks,
      activeProposal: proposal1,
      options: { clock },
    });

    assert.equal(negotiation.success, false);
    assert.ok(negotiation.responseText.includes('superseded'));
  });

  test('Workload spreading invokes existing adaptive scheduler', () => {
    const tasks = createTestTasks();
    const dm = new DialogueManager({ clock });

    const res = dm.processInput('Spread tasks across next 4 days', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.ok(res.proposal);
    assert.equal(res.proposal.strategy, 'balanced_pace');
    assert.ok(res.proposal.proposedPlacements.length > 0);
  });
});

describe('E. Regression and Privacy Safeguards', () => {
  test('Standard task creation continues to work unimpeded', () => {
    const dm = new DialogueManager();
    const tasks = createTestTasks();

    const res = dm.processInput('create task Finish Documentation due Friday priority high', { tasks });
    assert.equal(res.intent, CONVERSATION_INTENTS.CREATE_TASK);
    assert.equal(res.isAuthorized, true);
    assert.equal(res.action.title, 'Finish Documentation');
    assert.equal(res.action.priority, 'high');
  });

  test('Sprint modal opening command works unimpeded', () => {
    const dm = new DialogueManager();
    const res = dm.processInput('plan sprint', { tasks: [] });
    assert.equal(res.intent, CONVERSATION_INTENTS.OPEN_SCHEDULER);
    assert.equal(res.isAuthorized, true);
  });

  test('High risk filter command works unimpeded', () => {
    const dm = new DialogueManager();
    const res = dm.processInput('show high risk tasks', { tasks: [] });
    assert.equal(res.intent, CONVERSATION_INTENTS.FILTER_HIGH_RISK);
    assert.equal(res.isAuthorized, true);
  });
});
