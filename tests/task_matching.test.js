import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DialogueManager, CONVERSATION_STATES, CONVERSATION_INTENTS } from '../src/conversation/dialogueManager.js';

// Fixed reference date: Saturday, October 17, 2026
const FIXED_REFERENCE_TIME = new Date('2026-10-17T12:00:00.000Z').getTime();

function createSampleEnglishTasks() {
  return [
    {
      id: 'task-eng-1',
      title: 'English Assignment',
      dueDate: '2026-10-20',
      priority: 'medium',
      completed: false,
      estimatedEffort: 3,
    },
    {
      id: 'task-eng-2',
      title: 'English Presentation',
      dueDate: '2026-10-22',
      priority: 'low',
      completed: false,
      estimatedEffort: 2,
    },
    {
      id: 'task-math-1',
      title: 'Mathematics Problem Set',
      dueDate: '2026-10-18',
      priority: 'high',
      completed: false,
      estimatedEffort: 4,
    },
    {
      id: 'task-prep-1',
      title: 'Preparing Presentation',
      dueDate: '2026-10-25',
      priority: 'medium',
      completed: false,
      estimatedEffort: 2,
    },
  ];
}

describe('Gate 3 — Contextual Matching for Existing Tasks', () => {
  test('Single unambiguous match completes immediately', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    const res = dm.processInput('Complete Mathematics Problem Set', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res.isAuthorized, true);
    assert.equal(res.targetTask.id, 'task-math-1');
  });

  test('Fuzzy token overlap matches unique task ("Mathematics")', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    const res = dm.processInput('Complete my mathematics task', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res.isAuthorized, true);
    assert.equal(res.targetTask.id, 'task-math-1');
  });

  test('Ambiguous match prompts clarification with exact candidate names and count', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // "Complete English" matches both "English Assignment" and "English Presentation"
    const res = dm.processInput('Complete English', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(res.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res.isAuthorized, false);
    assert.equal(res.error, 'ambiguous_reference');
    assert.equal(
      res.responseText,
      'I found two matching tasks: English Assignment and English Presentation. Which one should I mark complete?'
    );
  });

  test('Clarification resolution by distinctive token ("The assignment")', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // Turn 1: Ambiguous command
    dm.processInput('Complete English', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

    // Turn 2: Disambiguation with distinctive word
    const res2 = dm.processInput('The assignment', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.targetTask.id, 'task-eng-1');
    assert.equal(res2.targetTask.title, 'English Assignment');
  });

  test('Clarification resolution by ordinal ("the first one")', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // Turn 1
    dm.processInput('Complete English', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

    // Turn 2: Ordinal selection
    const res2 = dm.processInput('the first one', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res2.targetTask.id, 'task-eng-1');
  });

  test('Clarification resolution by ordinal ("the second one")', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // Turn 1
    dm.processInput('Complete English', { tasks });

    // Turn 2: Second ordinal selection
    const res2 = dm.processInput('the second one', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res2.targetTask.id, 'task-eng-2');
  });

  test('Clarification cancellation leaves tasks untouched', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    dm.processInput('Complete English', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

    const res2 = dm.processInput('cancel', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.intent, CONVERSATION_INTENTS.CANCEL);
    assert.equal(res2.isAuthorized, false);
    assert.equal(dm.pendingClarification, null);
  });

  test('Deletion safeguards during clarification: aborted if task is deleted before response', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // Turn 1
    dm.processInput('Complete English', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

    // Task deleted externally before user clarifies
    const updatedTasks = tasks.filter((t) => t.id !== 'task-eng-1');

    const res2 = dm.processInput('The assignment', { tasks: updatedTasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, false);
    assert.equal(res2.error, 'task_not_found');
    assert.ok(res2.responseText.includes('no longer available'));
  });

  test('No credible match asks user to identify task and never selects arbitrary task', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    const res = dm.processInput('Complete Quantum Computing Research', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.isAuthorized, false);
    assert.equal(res.targetTask, null);
    assert.equal(res.error, 'task_not_found');
  });

  test('Destructive command ("Delete the English task") disambiguates, then requires confirmation', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // Turn 1: ambiguous delete
    const res1 = dm.processInput('Delete the English task', { tasks });
    assert.equal(res1.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.ok(res1.responseText.includes('Which one should I delete?'));

    // Turn 2: clarify task
    const res2 = dm.processInput('English Presentation', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);
    assert.equal(res2.requiresConfirmation, true);
    assert.ok(res2.responseText.includes('Are you sure you want to delete task "English Presentation"?'));

    // Turn 3: confirm
    const res3 = dm.processInput('yes', { tasks });
    assert.equal(res3.state, CONVERSATION_STATES.IDLE);
    assert.equal(res3.isAuthorized, true);
    assert.equal(res3.action.type, CONVERSATION_INTENTS.DELETE_TASK);
    assert.equal(res3.action.targetTaskId, 'task-eng-2');
  });

  test('Priority change command ("Make the English assignment high priority")', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    const res = dm.processInput('Make the English assignment high priority', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.intent, CONVERSATION_INTENTS.CHANGE_PRIORITY);
    assert.equal(res.isAuthorized, true);
    assert.equal(res.targetTask.id, 'task-eng-1');
    assert.equal(res.action.priority, 'high');
  });

  test('Deadline query ("When is my English task due?") disambiguates when multiple exist', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    const res = dm.processInput('When is my English task due?', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.ok(res.responseText.includes('Which one should I check?'));
  });

  test('Contrast query ("What about the other English task?") switches active subject', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // Inspect first task
    dm.processInput('Describe English Assignment', { tasks });
    assert.equal(dm.activeSubjectTaskId, 'task-eng-1');

    // Ask about other English task
    const res = dm.processInput('What about the other English task?', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.IDLE);
    assert.equal(res.targetTask.id, 'task-eng-2');
    assert.equal(dm.activeSubjectTaskId, 'task-eng-2');
  });

  test('Complex description matching: "Change the deadline for the task about preparing my presentation to tomorrow"', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    const res = dm.processInput('Change the deadline for the task about preparing my presentation to tomorrow', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.equal(res.targetTask.id, 'task-prep-1');
    assert.equal(res.proposal.proposedPlacements[0].proposedDate, '2026-10-18');
  });
});

describe('Gate 4 — Deadline Updates and Dialogue Integration', () => {
  test('Move English to the 19th: clarifies ambiguous task first, then reschedules to October 19, 2026', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // Turn 1: Move English to the 19th
    const res1 = dm.processInput('Move English to the 19th', { tasks });
    assert.equal(res1.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.ok(res1.responseText.includes('matching tasks'));
    assert.ok(res1.responseText.includes('Which one'));

    // Turn 2: Disambiguate with "English Assignment"
    const res2 = dm.processInput('English Assignment', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.equal(res2.targetTask.id, 'task-eng-1');
    assert.equal(res2.proposal.proposedPlacements[0].proposedDate, '2026-10-19');
  });

  test('Move English to 19th October', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = [
      { id: 'eng-only', title: 'English', dueDate: '2026-10-25', priority: 'medium', completed: false, estimatedEffort: 2 },
    ];

    const res = dm.processInput('Move English to 19th October', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.equal(res.targetTask.id, 'eng-only');
    assert.equal(res.proposal.proposedPlacements[0].proposedDate, '2026-10-19');
  });

  test('Set the English assignment deadline to tomorrow', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    const res = dm.processInput('Set the English assignment deadline to tomorrow', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.equal(res.targetTask.id, 'task-eng-1');
    assert.equal(res.proposal.proposedPlacements[0].proposedDate, '2026-10-18');
  });

  test('Multi-turn negotiation: "Change that to Friday instead" / "What about Monday instead?"', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // Turn 1: Set deadline
    dm.processInput('Set the English assignment deadline to tomorrow', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);

    // Turn 2: Change that to Friday instead (Next Friday from Sat Oct 17 is Oct 23)
    const res2 = dm.processInput('Change that to Friday instead', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.equal(res2.proposal.proposedPlacements[0].proposedDate, '2026-10-23');

    // Turn 3: What about Monday instead? (Next Monday from Sat Oct 17 is Oct 19)
    const res3 = dm.processInput('What about Monday instead?', { tasks });
    assert.equal(res3.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.equal(res3.proposal.proposedPlacements[0].proposedDate, '2026-10-19');

    // Turn 4: Accept proposal
    const res4 = dm.processInput('accept', { tasks });
    assert.equal(res4.state, CONVERSATION_STATES.IDLE);
    assert.equal(res4.intent, CONVERSATION_INTENTS.ACCEPT_PROPOSAL);
    assert.equal(res4.isAuthorized, true);
  });

  test('Move it to the 19th of October using contextual pronoun', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createSampleEnglishTasks();

    // Establish context with English Assignment
    dm.processInput('Describe English Assignment', { tasks });
    assert.equal(dm.activeSubjectTaskId, 'task-eng-1');

    // Move it to the 19th of October
    const res = dm.processInput('Move it to the 19th of October', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.equal(res.targetTask.id, 'task-eng-1');
    assert.equal(res.proposal.proposedPlacements[0].proposedDate, '2026-10-19');
  });
});
