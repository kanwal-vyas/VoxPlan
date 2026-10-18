import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DialogueManager,
  CONVERSATION_STATES,
  CONVERSATION_INTENTS,
  RESOLUTION_STATUS,
} from '../src/conversation/dialogueManager.js';
import { formatTaskDueDate } from '../src/conversation/compoundCommandParser.js';

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

describe('Critical Correctness Regression — Ambiguous Task Mutation Prevention', () => {
  function createExactFourTaskScenario() {
    return [
      {
        id: 'task-eng-assign',
        title: 'English assignment',
        dueDate: null,
        priority: 'medium',
        completed: false,
        estimatedEffort: 3,
      },
      {
        id: 'task-eng-pres',
        title: 'English presentation',
        dueDate: null,
        priority: 'low',
        completed: false,
        estimatedEffort: 2,
      },
      {
        id: 'task-eng-today',
        title: 'English',
        dueDate: '2026-10-17', // Today (Saturday Oct 17, 2026)
        priority: 'high',
        completed: false,
        estimatedEffort: 1,
      },
      {
        id: 'task-eng-tomorrow',
        title: 'English',
        dueDate: '2026-10-18', // Tomorrow (Sunday Oct 18, 2026)
        priority: 'high',
        completed: false,
        estimatedEffort: 1,
      },
    ];
  }

  test('1 & 2. "Complete English" returns AMBIGUOUS resolution, not a resolved ID, identifying all 4 tasks', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createExactFourTaskScenario();

    const resolution = dm.resolveTaskReference('English', tasks);
    assert.equal(resolution.status, RESOLUTION_STATUS.AMBIGUOUS);
    assert.equal(resolution.matches.length, 4);
    const ids = resolution.matches.map((m) => m.id);
    assert.ok(ids.includes('task-eng-assign'));
    assert.ok(ids.includes('task-eng-pres'));
    assert.ok(ids.includes('task-eng-today'));
    assert.ok(ids.includes('task-eng-tomorrow'));
  });

  test('3 & 4. Dialogue presents actual candidates with distinguishing metadata; no task mutated before clarification', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createExactFourTaskScenario();

    const res = dm.processInput('Complete English', { tasks });
    assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(res.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res.isAuthorized, false);
    assert.equal(res.action, null);

    // Assert every task remains uncompleted
    assert.ok(tasks.every((t) => t.completed === false));

    // Assert prompt presents candidate count and distinguishes duplicate titles
    assert.ok(res.responseText.includes('four matching tasks'));
    assert.ok(res.responseText.includes('"English" (due today)'));
    assert.ok(res.responseText.includes('"English" (due tomorrow)'));
    assert.ok(res.responseText.includes('"English assignment" (no deadline)'));
    assert.ok(res.responseText.includes('"English presentation" (no deadline)'));
  });

  test('5 & 6. Selecting "the one due tomorrow" resolves only Task 4 and executes only on that task', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createExactFourTaskScenario();

    dm.processInput('Complete English', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

    const res2 = dm.processInput('the one due tomorrow', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.targetTask.id, 'task-eng-tomorrow');
    assert.equal(res2.action.type, CONVERSATION_INTENTS.COMPLETE_TASK);
    assert.equal(res2.action.taskId, 'task-eng-tomorrow');

    // Simulate mutation application at boundary
    const updated = tasks.map((t) => (t.id === res2.action.taskId ? { ...t, completed: true } : t));
    assert.equal(updated.find((t) => t.id === 'task-eng-tomorrow').completed, true);
    assert.equal(updated.find((t) => t.id === 'task-eng-today').completed, false);
    assert.equal(updated.find((t) => t.id === 'task-eng-assign').completed, false);
    assert.equal(updated.find((t) => t.id === 'task-eng-pres').completed, false);
  });

  test('Candidate selection variations: "the one due today", "the assignment", "the presentation", and "the first one"', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createExactFourTaskScenario();

    // 1. "the one due today"
    dm.processInput('Complete English', { tasks });
    const resToday = dm.processInput('the one due today', { tasks });
    assert.equal(resToday.targetTask.id, 'task-eng-today');

    // 2. "the assignment"
    dm.processInput('Complete English', { tasks });
    const resAssign = dm.processInput('the assignment', { tasks });
    assert.equal(resAssign.targetTask.id, 'task-eng-assign');

    // 3. "the presentation"
    dm.processInput('Complete English', { tasks });
    const resPres = dm.processInput('the presentation', { tasks });
    assert.equal(resPres.targetTask.id, 'task-eng-pres');

    // 4. "the first one" against stable displayed ordering
    dm.processInput('Complete English', { tasks });
    const firstCandidateId = dm.pendingClarification.matches[0].id;
    const resFirst = dm.processInput('the first one', { tasks });
    assert.equal(resFirst.targetTask.id, firstCandidateId);
  });

  test('7. Cancelling leaves all four tasks untouched', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createExactFourTaskScenario();

    dm.processInput('Complete English', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

    const res2 = dm.processInput('cancel', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.intent, CONVERSATION_INTENTS.CANCEL);
    assert.equal(res2.isAuthorized, false);
    assert.equal(res2.action, null);
    assert.equal(dm.pendingClarification, null);
    assert.ok(tasks.every((t) => t.completed === false));
  });

  test('8. Revalidation safeguard: aborted if selected candidate task is deleted before response', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createExactFourTaskScenario();

    dm.processInput('Complete English', { tasks });
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

    // English due tomorrow is deleted externally
    const tasksWithoutTomorrow = tasks.filter((t) => t.id !== 'task-eng-tomorrow');

    const res2 = dm.processInput('the one due tomorrow', { tasks: tasksWithoutTomorrow });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, false);
    assert.equal(res2.error, 'task_not_found');
    assert.ok(res2.responseText.includes('no longer available'));
    assert.equal(dm.pendingClarification, null);
  });

  test('9. Ambiguity safeguards also protect deletion, deadline changes, and priority changes', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createExactFourTaskScenario();

    // Deletion
    const delRes = dm.processInput('Delete English', { tasks });
    assert.equal(delRes.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(delRes.isAuthorized, false);
    assert.equal(delRes.action, null);
    assert.ok(delRes.responseText.includes('four matching tasks'));
    dm.processInput('cancel', { tasks });

    // Deadline reschedule
    const reschedRes = dm.processInput('Reschedule English to next Monday', { tasks });
    assert.equal(reschedRes.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(reschedRes.isAuthorized, false);
    assert.equal(reschedRes.action, null);
    assert.ok(reschedRes.responseText.includes('four matching tasks'));
    dm.processInput('cancel', { tasks });

    // Priority change
    const prioRes = dm.processInput('Make English high priority', { tasks });
    assert.equal(prioRes.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(prioRes.isAuthorized, false);
    assert.equal(prioRes.action, null);
    assert.ok(prioRes.responseText.includes('four matching tasks'));
    dm.processInput('cancel', { tasks });
  });

  test('10. Unique references still resolve and mutate normally without disabling fuzzy matching', () => {
    const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
    const tasks = createExactFourTaskScenario();

    // Unique match "English assignment"
    const res1 = dm.processInput('Complete English assignment', { tasks });
    assert.equal(res1.state, CONVERSATION_STATES.IDLE);
    assert.equal(res1.isAuthorized, true);
    assert.equal(res1.targetTask.id, 'task-eng-assign');

    // Unique match "English presentation"
    const res2 = dm.processInput('Complete English presentation', { tasks });
    assert.equal(res2.state, CONVERSATION_STATES.IDLE);
    assert.equal(res2.isAuthorized, true);
    assert.equal(res2.targetTask.id, 'task-eng-pres');
  });

  describe('Contextual Task Resolution using Meaningful Attributes (Phase 5.4 Hardening)', () => {
    test('"Complete the English task for today" resolves only the unique task due today', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      const res = dm.processInput('Complete the English task for today', { tasks });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, true);
      assert.equal(res.targetTask.id, 'task-eng-today');
      assert.equal(res.action.taskId, 'task-eng-today');
    });

    test('"Complete the English task due today" resolves only the unique task due today', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      const res = dm.processInput('Complete the English task due today', { tasks });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, true);
      assert.equal(res.targetTask.id, 'task-eng-today');
      assert.equal(res.action.taskId, 'task-eng-today');
    });

    test('"Complete the English task for tomorrow" and "due tomorrow" resolve the task due tomorrow', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      const res1 = dm.processInput('Complete the English task for tomorrow', { tasks });
      assert.equal(res1.state, CONVERSATION_STATES.IDLE);
      assert.equal(res1.isAuthorized, true);
      assert.equal(res1.targetTask.id, 'task-eng-tomorrow');

      const dm2 = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const res2 = dm2.processInput('Complete the English task due tomorrow', { tasks });
      assert.equal(res2.state, CONVERSATION_STATES.IDLE);
      assert.equal(res2.isAuthorized, true);
      assert.equal(res2.targetTask.id, 'task-eng-tomorrow');
    });

    test('Two tasks with identical title and deadline remain ambiguous', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const duplicateTasks = [
        { id: 'eng-1', title: 'English', dueDate: '2026-10-17', completed: false },
        { id: 'eng-2', title: 'English', dueDate: '2026-10-17', completed: false },
      ];

      const res = dm.processInput('Complete the English task due today', { tasks: duplicateTasks });
      assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
      assert.equal(res.isAuthorized, false);
      assert.equal(res.action, null);
    });

    test('Nonexistent explicit deadline does not fall back to an unrelated task', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      const res = dm.processInput('Complete the English task due 2026-11-15', { tasks });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, false);
      assert.equal(res.action, null);
      assert.equal(res.error, 'task_not_found');
      assert.ok(tasks.every((t) => t.completed === false));
    });

    test('Deadline filter preserves ambiguity when multiple tasks match "no deadline"', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      const res = dm.processInput('Complete the English task with no deadline', { tasks });
      assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
      assert.equal(res.isAuthorized, false);
      assert.equal(res.action, null);
      assert.equal(res.candidateTasks.length, 2);
    });
  });

  describe('Candidate-Card Interaction & Clarification Resolution Pathway', () => {
    test('Clicking candidate 1 by stable ID resolves candidate 1 through the existing pathway', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      // Step 1: Prompt clarification
      const clar = dm.processInput('Complete English', { tasks });
      assert.equal(clar.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
      assert.equal(clar.candidateTasks.length, 4);

      const candidate1 = clar.candidateTasks[0]; // e.g. task-eng-today
      // Step 2: User clicks candidate card 1, which sends candidate.id to executeCommand
      const res = dm.processInput(candidate1.id, { tasks });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, true);
      assert.equal(res.targetTask.id, candidate1.id);
      assert.equal(res.action.type, CONVERSATION_INTENTS.COMPLETE_TASK);
      assert.equal(res.action.taskId, candidate1.id);

      // Verify only selected task would be mutated
      const mutated = tasks.map((t) => (t.id === res.action.taskId ? { ...t, completed: true } : t));
      assert.equal(mutated.find((t) => t.id === candidate1.id).completed, true);
      assert.ok(mutated.filter((t) => t.id !== candidate1.id).every((t) => !t.completed));
    });

    test('Clicking candidate 2 by stable ID resolves candidate 2 through the existing pathway', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      const clar = dm.processInput('Complete English', { tasks });
      assert.equal(clar.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

      const candidate2 = clar.candidateTasks[1]; // e.g. task-eng-tomorrow
      const res = dm.processInput(candidate2.id, { tasks });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, true);
      assert.equal(res.targetTask.id, candidate2.id);
      assert.equal(res.action.type, CONVERSATION_INTENTS.COMPLETE_TASK);
      assert.equal(res.action.taskId, candidate2.id);
    });

    test('Selected candidate cannot be resolved if removed from store before click', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      const clar = dm.processInput('Complete English', { tasks });
      assert.equal(clar.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

      const candidate1 = clar.candidateTasks[0];
      // Simulate task removed before user clicks card
      const tasksWithoutCandidate1 = tasks.filter((t) => t.id !== candidate1.id);

      const res = dm.processInput(candidate1.id, { tasks: tasksWithoutCandidate1 });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, false);
      assert.equal(res.action, null);
      assert.ok(res.responseText.includes('no longer available') || res.responseText.includes('no longer found') || res.responseText.includes('no longer exists'));
    });

    test('Rapid repeated click does not execute the action twice', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      const clar = dm.processInput('Complete English', { tasks });
      assert.equal(clar.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

      const candidate1 = clar.candidateTasks[0];
      // First click: resolves and returns to IDLE
      const firstClick = dm.processInput(candidate1.id, { tasks });
      assert.equal(firstClick.state, CONVERSATION_STATES.IDLE);
      assert.equal(firstClick.isAuthorized, true);

      // Simulate mutation happened on task store
      const updatedTasks = tasks.map((t) => (t.id === candidate1.id ? { ...t, completed: true } : t));

      // Second rapid click on same ID while now in IDLE state
      const secondClick = dm.processInput(candidate1.id, { tasks: updatedTasks });
      // In IDLE state, passing an ID without an action verb does not execute completion again
      assert.equal(secondClick.isAuthorized, false);
      assert.equal(secondClick.action, null);
    });

    test('Cancellation remains independent of card selection', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      dm.processInput('Complete English', { tasks });
      assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

      const cancelRes = dm.processInput('never mind', { tasks });
      assert.equal(cancelRes.state, CONVERSATION_STATES.IDLE);
      assert.equal(cancelRes.isAuthorized, false);
      assert.equal(cancelRes.action, null);
      assert.equal(dm.pendingClarification, null);
    });

    test('Clarification remains visible and active if an invalid answer is provided', () => {
      const dm = new DialogueManager({ clock: () => FIXED_REFERENCE_TIME });
      const tasks = createExactFourTaskScenario();

      dm.processInput('Complete English', { tasks });
      assert.equal(dm.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);

      const invalidRes = dm.processInput('something completely unrelated', { tasks });
      assert.equal(invalidRes.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
      assert.equal(invalidRes.isAuthorized, false);
      assert.equal(invalidRes.action, null);
      assert.ok(dm.pendingClarification !== null);
    });
  });

  describe('Contextual Resolution with Deterministic October 18, 2026 Reference Date', () => {
    // Reference date: Sunday, October 18, 2026
    const OCT_18_2026 = new Date('2026-10-18T10:00:00.000Z').getTime();

    function createOct18Scenario() {
      return [
        {
          id: 'task-eng-assign',
          title: 'English assignment',
          dueDate: null, // no deadline
          completed: false,
        },
        {
          id: 'task-eng-today',
          title: 'English',
          dueDate: '2026-10-18', // due today
          completed: false,
        },
        {
          id: 'task-eng-tomorrow',
          title: 'English',
          dueDate: '2026-10-19', // due tomorrow
          completed: false,
        },
      ];
    }

    test('"Complete the English task for today" resolves unique match (English due Oct 18)', () => {
      const dm = new DialogueManager({ clock: () => OCT_18_2026 });
      const tasks = createOct18Scenario();

      const res = dm.processInput('Complete the English task for today', { tasks });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, true);
      assert.equal(res.targetTask.id, 'task-eng-today');
      assert.equal(res.action.type, CONVERSATION_INTENTS.COMPLETE_TASK);
      assert.equal(res.action.taskId, 'task-eng-today');
    });

    test('"Complete the English task today" (trailing qualifier) resolves unique match', () => {
      const dm = new DialogueManager({ clock: () => OCT_18_2026 });
      const tasks = createOct18Scenario();

      const res = dm.processInput('Complete the English task today', { tasks });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, true);
      assert.equal(res.targetTask.id, 'task-eng-today');
    });

    test('"Complete the English task for tomorrow" resolves English due Oct 19', () => {
      const dm = new DialogueManager({ clock: () => OCT_18_2026 });
      const tasks = createOct18Scenario();

      const res = dm.processInput('Complete the English task for tomorrow', { tasks });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, true);
      assert.equal(res.targetTask.id, 'task-eng-tomorrow');
    });

    test('"Complete English" without deadline qualifier asks for clarification across all candidates', () => {
      const dm = new DialogueManager({ clock: () => OCT_18_2026 });
      const tasks = createOct18Scenario();

      const res = dm.processInput('Complete English', { tasks });
      assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
      assert.equal(res.isAuthorized, false);
      assert.equal(res.candidateTasks.length, 3);
    });

    test('Two English tasks due today remain ambiguous and ask for clarification', () => {
      const dm = new DialogueManager({ clock: () => OCT_18_2026 });
      const twoTodayTasks = [
        { id: 'eng-today-1', title: 'English', dueDate: '2026-10-18', completed: false },
        { id: 'eng-today-2', title: 'English', dueDate: '2026-10-18', completed: false },
        { id: 'eng-tomorrow', title: 'English', dueDate: '2026-10-19', completed: false },
      ];

      const res = dm.processInput('Complete the English task for today', { tasks: twoTodayTasks });
      assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
      assert.equal(res.isAuthorized, false);
      assert.equal(res.action, null);
      assert.equal(res.candidateTasks.length, 2);
      assert.ok(res.candidateTasks.every((t) => t.dueDate === '2026-10-18'));
    });

    test('Nonexistent deadline does not silently substitute an unscheduled task', () => {
      const dm = new DialogueManager({ clock: () => OCT_18_2026 });
      const tasks = createOct18Scenario();

      const res = dm.processInput('Complete the English task for yesterday', { tasks });
      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, false);
      assert.equal(res.action, null);
      assert.equal(res.error, 'task_not_found');
      assert.ok(tasks.every((t) => !t.completed));
    });
  });

  describe('Date-Label Consistency & Timezone Stability', () => {
    const OCT_18_2026 = new Date('2026-10-18T12:00:00.000Z');

    test('formatTaskDueDate produces consistent labels relative to reference date', () => {
      assert.equal(formatTaskDueDate('2026-10-18', OCT_18_2026), 'Due today');
      assert.equal(formatTaskDueDate('2026-10-19', OCT_18_2026), 'Due tomorrow');
      assert.equal(formatTaskDueDate('2026-10-17', OCT_18_2026), 'Overdue by 1 day');
      assert.equal(formatTaskDueDate('2026-10-16', OCT_18_2026), 'Overdue by 2 days');
      assert.equal(formatTaskDueDate('2026-10-25', OCT_18_2026), 'Due Oct 25');
      assert.equal(formatTaskDueDate(null, OCT_18_2026), 'No deadline');
      assert.equal(formatTaskDueDate('', OCT_18_2026), 'No deadline');
      assert.equal(formatTaskDueDate(undefined, OCT_18_2026), 'No deadline');
    });

    test('Calendar date strings YYYY-MM-DD are immune to timezone offset drift', () => {
      // Test start of local day and end of local day without date shifting
      const morningRef = new Date(2026, 9, 18, 0, 1, 0);
      const nightRef = new Date(2026, 9, 18, 23, 59, 0);

      assert.equal(formatTaskDueDate('2026-10-18', morningRef), 'Due today');
      assert.equal(formatTaskDueDate('2026-10-18', nightRef), 'Due today');
      assert.equal(formatTaskDueDate('2026-10-19', morningRef), 'Due tomorrow');
      assert.equal(formatTaskDueDate('2026-10-19', nightRef), 'Due tomorrow');
    });
  });
});


