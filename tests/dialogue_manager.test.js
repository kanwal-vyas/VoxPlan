/**
 * Comprehensive Automated Tests for VoxPlan Conversational Planning Dialogue Manager.
 * Phase 5, Stage 5.1: Conversational Planning State Machine & Turn Management
 * Executable via: node --test tests/dialogue_manager.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DialogueManager,
  CONVERSATION_STATES,
  CONVERSATION_INTENTS,
  parseDateExpression,
  DEFAULT_IDLE_TIMEOUT_MS,
} from '../src/conversation/dialogueManager.js';

// Realistic fixtures for multi-turn planning tests
const createSampleTasks = () => [
  {
    id: 'task-101',
    title: 'Database Assignment',
    description: 'Design relational schema and write SQL queries',
    priority: 'high',
    dueDate: '2026-10-20',
    completed: false,
    category: 'Academics',
    estimatedEffort: 4.0,
    dependencies: [],
  },
  {
    id: 'task-102',
    title: 'Draft architecture audit',
    description: 'Review system design documents',
    priority: 'medium',
    dueDate: '2026-10-22',
    completed: false,
    category: 'Engineering',
    estimatedEffort: 3.5,
    dependencies: [],
  },
  {
    id: 'task-103',
    title: 'Unit test suite',
    description: 'Write comprehensive tests for core modules',
    priority: 'high',
    dueDate: '2026-10-21',
    completed: true,
    category: 'Engineering',
    estimatedEffort: 2.0,
    dependencies: [],
  },
  {
    id: 'task-104',
    title: 'Integration test suite',
    description: 'Write end-to-end integration tests',
    priority: 'medium',
    dueDate: '2026-10-23',
    completed: false,
    category: 'Engineering',
    estimatedEffort: 5.0,
    dependencies: ['task-103'],
  },
];

describe('1. Dialogue State Machine Lifecycle & Initial State', () => {
  test('Initial state is IDLE with null active subject and empty pending context', () => {
    const dm = new DialogueManager();
    const ctx = dm.getContext();
    assert.equal(ctx.state, CONVERSATION_STATES.IDLE);
    assert.equal(ctx.activeSubjectTaskId, null);
    assert.equal(ctx.pendingIntent, null);
    assert.equal(ctx.pendingAction, null);
    assert.equal(ctx.pendingClarification, null);
  });

  test('Empty or whitespace input does not change state or authorize action', () => {
    const dm = new DialogueManager();
    const res = dm.processInput('   ', { tasks: createSampleTasks() });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.isAuthorized, false);
    assert.equal(res.action, null);
  });

  test('Deterministic reset clears all ephemeral context to IDLE', () => {
    const dm = new DialogueManager();
    dm.setActiveSubject('task-101');
    dm.state = CONVERSATION_STATES.AWAITING_CONFIRMATION;
    dm.pendingAction = { type: 'DELETE_TASK' };

    dm.reset();
    const ctx = dm.getContext();
    assert.equal(ctx.state, CONVERSATION_STATES.IDLE);
    assert.equal(ctx.activeSubjectTaskId, null);
    assert.equal(ctx.pendingAction, null);
  });
});

describe('2. Active Subject Task Establishment & Multi-Turn Pronoun Resolution', () => {
  test('A valid task inquiry establishes the active subject task', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    const res = dm.processInput('Tell me about my database assignment', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.intent, CONVERSATION_INTENTS.DESCRIBE_TASK);
    assert.equal(res.targetTask.id, 'task-101');
    assert.ok(res.responseText.includes('Database Assignment'));
    assert.equal(dm.activeSubjectTaskId, 'task-101');
  });

  test('Follow-up "Mark it done" resolves "it" to the active subject task', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    // Turn 1: Discuss database assignment
    dm.processInput('Tell me about my database assignment', { tasks });
    assert.equal(dm.activeSubjectTaskId, 'task-101');

    // Turn 2: Follow-up referring to "it"
    const res2 = dm.processInput('Mark it done', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res2.targetTask.id, 'task-101');
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.action.taskId, 'task-101');
  });

  test('Follow-up "Complete this task" resolves contextually', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('Describe Draft architecture audit', { tasks });
    assert.equal(dm.activeSubjectTaskId, 'task-102');

    const res2 = dm.processInput('Complete this task', { tasks });
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.targetTask.id, 'task-102');
  });

  test('Pronoun reference without prior active subject triggers AWAITING_CLARIFICATION', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    const res = dm.processInput('Mark it done', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(res.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res.isAuthorized, false);
    assert.equal(res.action, null);
    assert.ok(res.responseText.includes('not sure which task'));
  });
});

describe('3. Clarification Handling for Ambiguous or Missing Information', () => {
  test('Ambiguous task references trigger clarification instead of arbitrary selection', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks(); // contains "Unit test suite" and "Integration test suite"

    // Query "test suite" matches both task-103 and task-104
    const res = dm.processInput('complete test suite', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(res.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res.isAuthorized, false);
    assert.ok(res.responseText.includes('matching tasks'));
    assert.ok(res.responseText.includes('Unit test suite'));
    assert.ok(res.responseText.includes('Integration test suite'));
  });

  test('A valid clarification response resolves the ambiguous reference and executes', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    // Turn 1: ambiguous request
    dm.processInput('complete test suite', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

    // Turn 2: clarification response naming the specific task
    const res2 = dm.processInput('Unit test suite', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res2.targetTask.id, 'task-103');
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.action.taskId, 'task-103');
  });

  test('Invalid clarification input does not execute the operation and remains in clarification', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('complete test suite', { tasks });

    const res2 = dm.processInput('some completely random nonexistent task', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(res2.isAuthorized, false);
    assert.equal(res2.action, null);
  });

  test('User can cancel an outstanding clarification cleanly without side effects', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('complete test suite', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

    const res2 = dm.processInput('cancel', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, false);
    assert.equal(res2.action, null);
    assert.equal(dm.pendingClarification, null);
  });

  test('Missing task title on task creation triggers clarification for task title', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    const res = dm.processInput('add task', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(res.intent, CONVERSATION_INTENTS.CREATE_TASK);
    assert.ok(res.responseText.includes('title of the task'));

    // Answering clarification creates the task
    const res2 = dm.processInput('Prepare Product Demo due tomorrow', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.intent, CONVERSATION_INTENTS.CREATE_TASK);
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.action.title, 'Prepare Product Demo due tomorrow');
  });

  test('Missing due date on reschedule triggers clarification for date', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    // Turn 1: reschedule without date
    const res = dm.processInput('reschedule Database Assignment to', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(res.intent, CONVERSATION_INTENTS.RESCHEDULE_TASK);
    assert.ok(res.responseText.includes('When would you like to reschedule'));

    // Turn 2: answer with a valid date
    const res2 = dm.processInput('2026-10-30', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.action.newDueDate, '2026-10-30');
  });
});

describe('4. Consequential Operations & Confirmation Safeguards', () => {
  test('Deleting a task enters AWAITING_CONFIRMATION and does not authorize immediately', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    const res = dm.processInput('delete task Database Assignment', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);
    assert.equal(res.intent, CONVERSATION_INTENTS.DELETE_TASK);
    assert.equal(res.requiresConfirmation, true);
    assert.equal(res.isAuthorized, false);
    assert.equal(res.action, null);
    assert.ok(res.responseText.includes('Are you sure you want to delete'));
  });

  test('Follow-up "delete it" enters AWAITING_CONFIRMATION for active subject', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('Tell me about Draft architecture audit', { tasks });
    assert.equal(dm.activeSubjectTaskId, 'task-102');

    const res2 = dm.processInput('delete it', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);
    assert.equal(res2.requiresConfirmation, true);
    assert.equal(res2.isAuthorized, false);
    assert.equal(res2.targetTask.id, 'task-102');
  });

  test('Explicit confirmation ("yes") executes authorized operation exactly once', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('delete task Database Assignment', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);

    // Turn 2: confirm
    const res2 = dm.processInput('yes', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.action.type, CONVERSATION_INTENTS.DELETE_TASK);
    assert.equal(res2.action.targetTaskId, 'task-101');

    // Turn 3: saying "yes" again does NOT re-execute
    const res3 = dm.processInput('yes', { tasks });
    assert.equal(res3.state, CONVERSATION_STATES.IDLE);
    assert.equal(res3.isAuthorized, false);
    assert.equal(res3.action, null);
  });

  test('Explicit cancellation ("no" / "cancel") leaves state unmutated and resets to IDLE', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('delete task Database Assignment', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);

    const res2 = dm.processInput('no', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, false);
    assert.equal(res2.action, null);
    assert.ok(res2.responseText.includes('cancelled'));
  });

  test('An unrelated or invalid response does not accidentally confirm an operation', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('delete task Database Assignment', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);

    const res2 = dm.processInput('what is high risk?', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);
    assert.equal(res2.isAuthorized, false);
    assert.equal(res2.action, null);
    assert.ok(res2.responseText.includes('Pending confirmation'));
  });

  test('Clearing all completed tasks requires confirmation when completed tasks exist', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks(); // task-103 is completed

    const res = dm.processInput('clear completed tasks', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);
    assert.equal(res.requiresConfirmation, true);
    assert.equal(res.isAuthorized, false);

    const res2 = dm.processInput('confirm', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.action.type, CONVERSATION_INTENTS.CLEAR_COMPLETED);
  });

  test('Clearing completed tasks when none are completed gives immediate info without confirmation', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks().filter((t) => !t.completed);

    const res = dm.processInput('clear completed tasks', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.requiresConfirmation, false);
    assert.equal(res.isAuthorized, false);
    assert.ok(res.responseText.includes('No completed tasks to clear'));
  });

  test('Clearing behavioral history requires explicit confirmation', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    const res = dm.processInput('clear behavioral telemetry history', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);
    assert.equal(res.requiresConfirmation, true);
    assert.equal(res.isAuthorized, false);

    const res2 = dm.processInput('proceed', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.action.type, CONVERSATION_INTENTS.CLEAR_HISTORY);
  });
});

describe('5. Context Invalidation & Unavailable Tasks', () => {
  test('Deleted task invalidates active subject context immediately', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('tell me about Database Assignment', { tasks });
    assert.equal(dm.activeSubjectTaskId, 'task-101');

    // Simulate task deletion via invalidateTask
    dm.invalidateTask('task-101');
    assert.equal(dm.activeSubjectTaskId, null);

    // Follow-up cannot resolve deleted task
    const res = dm.processInput('mark it done', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
  });

  test('Removing task from task list invalidates pending confirmation safely', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('delete task Database Assignment', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);

    // Task is removed from tasks array (e.g. deleted by another action)
    const updatedTasks = tasks.filter((t) => t.id !== 'task-101');

    // When confirmation is attempted with updated tasks, it cancels safely
    const res = dm.processInput('yes', { tasks: updatedTasks });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.isAuthorized, false);
    assert.ok(res.responseText.includes('no longer available'));
  });
});

describe('6. Deterministic Inactivity Timeout & Clock Injection', () => {
  test('Five minutes of inactivity resets state to IDLE and clears context', () => {
    let mockTime = 1000000;
    const fakeClock = () => mockTime;

    const dm = new DialogueManager({
      timeoutMs: DEFAULT_IDLE_TIMEOUT_MS, // 300,000 ms
      clock: fakeClock,
    });
    const tasks = createSampleTasks();

    // Establish context
    dm.processInput('Tell me about Database Assignment', { tasks });
    assert.equal(dm.activeSubjectTaskId, 'task-101');

    // Advance clock by 4 minutes (240,000 ms) -> context remains active
    mockTime += 240000;
    const res1 = dm.processInput('Mark it done', { tasks });
    assert.equal(res1.isAuthorized, true);
    assert.equal(res1.targetTask.id, 'task-101');

    // Establish pending confirmation
    dm.processInput('delete it', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);

    // Advance clock by 5 minutes + 1 second (300,001 ms)
    mockTime += 300001;

    // Next interaction checks timeout: pending confirmation has expired!
    const res2 = dm.processInput('yes', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, false);
    assert.equal(res2.action, null);
    assert.equal(dm.activeSubjectTaskId, null);
  });

  test('Timeout check via checkTimeout returns true when expired', () => {
    let mockTime = 500000;
    const dm = new DialogueManager({
      timeoutMs: 60000, // 1 minute
      clock: () => mockTime,
    });
    dm.setActiveSubject('task-101');

    assert.equal(dm.checkTimeout(), false);
    mockTime += 65000;
    assert.equal(dm.checkTimeout(), true);
    assert.equal(dm.activeSubjectTaskId, null);
    assert.equal(dm.state, CONVERSATION_STATES.IDLE);
  });
});

describe('7. Existing Commands & Feature Parity Preservation', () => {
  test('ML commands execute without regression', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    const trainRes = dm.processInput('train the model', { tasks });
    assert.equal(trainRes.intent, CONVERSATION_INTENTS.TRAIN_MODEL);
    assert.equal(trainRes.isAuthorized, true);

    const predictRes = dm.processInput('predict delay risk', { tasks });
    assert.equal(predictRes.intent, CONVERSATION_INTENTS.PREDICT_RISK);
    assert.equal(predictRes.isAuthorized, true);

    const filterRes = dm.processInput('show high risk tasks', { tasks });
    assert.equal(filterRes.intent, CONVERSATION_INTENTS.FILTER_HIGH_RISK);
    assert.equal(filterRes.isAuthorized, true);
  });

  test('Scheduler modal command opens scheduler', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    const res = dm.processInput('open scheduler', { tasks });
    assert.equal(res.intent, CONVERSATION_INTENTS.OPEN_SCHEDULER);
    assert.equal(res.isAuthorized, true);
  });

  test('Task creation with priority and due date parses deterministically', () => {
    const dm = new DialogueManager({ clock: () => new Date('2026-10-17T12:00:00Z').getTime() });
    const tasks = createSampleTasks();

    const res = dm.processInput('add task Prepare Sprint Review due 2026-10-25 with high priority', { tasks });
    assert.equal(res.intent, CONVERSATION_INTENTS.CREATE_TASK);
    assert.equal(res.isAuthorized, true);
    assert.equal(res.action.title, 'Prepare Sprint Review');
    assert.equal(res.action.dueDate, '2026-10-25');
    assert.equal(res.action.priority, 'high');
  });

  test('Date expression parser handles today, tomorrow, and ISO dates correctly', () => {
    const refDate = new Date('2026-10-17T10:00:00Z');
    assert.equal(parseDateExpression('today', refDate), '2026-10-17');
    assert.equal(parseDateExpression('tomorrow', refDate), '2026-10-18');
    assert.equal(parseDateExpression('in 3 days', refDate), '2026-10-20');
    assert.equal(parseDateExpression('due 2026-11-05', refDate), '2026-11-05');
  });
});

describe('8. Voice & Programmatic Symmetry, Reopen Pronouns, and Context Reset', () => {
  test('Programmatic confirm() and cancel() execute identically to typed responses', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    // Turn 1: request deletion
    dm.processInput('delete task Database Assignment', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);

    // Cancel programmatically
    const cancelRes = dm.cancel(tasks);
    assert.equal(cancelRes.state, CONVERSATION_STATES.IDLE);
    assert.equal(cancelRes.isAuthorized, false);

    // Turn 2: request deletion again
    dm.processInput('delete task Database Assignment', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);

    // Confirm programmatically
    const confirmRes = dm.confirm(tasks);
    assert.equal(confirmRes.state, CONVERSATION_STATES.IDLE);
    assert.equal(confirmRes.isAuthorized, true);
    assert.equal(confirmRes.action.targetTaskId, 'task-101');
  });

  test('Voice transcript string routes through identical state machine transitions as typed text', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    // Simulated Web Speech API final transcript
    const voiceTranscript = 'tell me about Unit test suite';
    const voiceRes = dm.processInput(voiceTranscript, { tasks });
    assert.equal(voiceRes.intent, CONVERSATION_INTENTS.DESCRIBE_TASK);
    assert.equal(voiceRes.targetTask.id, 'task-103');
    assert.equal(dm.activeSubjectTaskId, 'task-103');

    // Follow-up voice transcript
    const followUpVoice = 'reopen it';
    const followUpRes = dm.processInput(followUpVoice, { tasks });
    assert.equal(followUpRes.intent, CONVERSATION_INTENTS.REOPEN_TASK);
    assert.equal(followUpRes.isAuthorized, true);
    assert.equal(followUpRes.action.taskId, 'task-103');
  });

  test('Resetting application context or clearing history leaves no executable stale dialogue state', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    dm.processInput('delete task Draft architecture audit', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);

    // Simulated application context reset / history wipe
    dm.reset();

    const ctx = dm.getContext();
    assert.equal(ctx.state, CONVERSATION_STATES.IDLE);
    assert.equal(ctx.pendingAction, null);
    assert.equal(ctx.activeSubjectTaskId, null);

    // User attempts to confirm after reset
    const attempt = dm.processInput('yes', { tasks });
    assert.equal(attempt.isAuthorized, false);
    assert.equal(attempt.action, null);
  });
});

