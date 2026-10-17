import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DialogueManager, CONVERSATION_STATES, CONVERSATION_INTENTS } from '../src/conversation/dialogueManager.js';
import {
  parseCompoundTaskCreation,
} from '../src/conversation/compoundCommandParser.js';
import { VoiceRecognitionController, RECOGNITION_STATES } from '../src/conversation/speechEngine.js';

// Fixed reference date: Wednesday, October 21, 2026, 12:00:00 UTC
const FIXED_CLOCK_TIMESTAMP = new Date('2026-10-21T12:00:00Z').getTime();
const injectedClock = () => FIXED_CLOCK_TIMESTAMP;

// Mock Web Speech API SpeechRecognition implementation
class MockSpeechRecognition {
  constructor() {
    this.continuous = true;
    this.interimResults = true;
    this.lang = 'en-US';
    this.maxAlternatives = 1;
    this.onstart = null;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.isStarted = false;
    this.isStopped = false;
  }

  start() {
    this.isStarted = true;
    if (this.onstart) this.onstart();
  }

  stop() {
    this.isStopped = true;
    if (this.onend) this.onend();
  }

  abort() {
    this.isStopped = true;
    if (this.onend) this.onend();
  }

  simulateResult(transcript, isFinal = true) {
    if (this.onresult) {
      this.onresult({
        results: [
          Object.assign([{ transcript }], { isFinal }),
        ],
      });
    }
  }

  simulateError(error) {
    if (this.onerror) {
      this.onerror({ error });
    }
  }
}

describe('A. Voice UI Lifecycle & Persistent Listening Session', () => {
  test('Controller accurately exposes LISTENING state and passes interim draft text', () => {
    let mockRec = null;
    const interimDrafts = [];
    const finalTranscripts = [];

    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
      onInterimResult: (draft) => interimDrafts.push(draft),
      onResult: (final) => finalTranscripts.push(final),
    });

    assert.equal(controller.getState(), RECOGNITION_STATES.IDLE);
    controller.start();
    assert.equal(controller.getState(), RECOGNITION_STATES.LISTENING);

    // Interim draft 1
    mockRec.simulateResult('add a database', false);
    assert.equal(controller.getState(), RECOGNITION_STATES.LISTENING);
    assert.equal(interimDrafts.length, 1);
    assert.equal(interimDrafts[0], 'add a database');
    assert.equal(finalTranscripts.length, 0);

    // Brief pause between words: interim draft 2 arrives, still LISTENING
    mockRec.simulateResult('add a database assignment due tomorrow', false);
    assert.equal(controller.getState(), RECOGNITION_STATES.LISTENING);
    assert.equal(interimDrafts.length, 2);
    assert.equal(interimDrafts[1], 'add a database assignment due tomorrow');
    assert.equal(finalTranscripts.length, 0);

    // Final result arrives: transitions to PROCESSING, submits exactly once, returns to IDLE
    mockRec.simulateResult('add a database assignment due tomorrow', true);
    assert.equal(finalTranscripts.length, 1);
    assert.equal(finalTranscripts[0], 'add a database assignment due tomorrow');
    assert.equal(controller.getState(), RECOGNITION_STATES.IDLE);
  });

  test('Explicit stop ends active session and clears interim state promptly', () => {
    let mockRec = null;
    const interimDrafts = [];

    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
      onInterimResult: (draft) => interimDrafts.push(draft),
    });

    controller.start();
    mockRec.simulateResult('draft words', false);
    assert.equal(controller.getState(), RECOGNITION_STATES.LISTENING);

    controller.stop();
    assert.equal(controller.getState(), RECOGNITION_STATES.IDLE);
    assert.equal(mockRec.isStopped, true);
    // onInterimResult was invoked with empty string to clear draft
    assert.equal(interimDrafts[interimDrafts.length - 1], '');
  });

  test('Recognition error transitions out of LISTENING and does not leave indicator stuck', () => {
    let mockRec = null;
    let caughtError = null;

    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
      onError: (err) => { caughtError = err; },
    });

    controller.start();
    assert.equal(controller.getState(), RECOGNITION_STATES.LISTENING);

    mockRec.simulateError('not-allowed');
    assert.equal(controller.getState(), RECOGNITION_STATES.ERROR);
    assert.ok(caughtError);
    assert.equal(caughtError.code, 'not-allowed');
  });

  test('Repeated start clicks do not launch concurrent or duplicate sessions', () => {
    let newInstanceCount = 0;
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          newInstanceCount += 1;
          return new MockSpeechRecognition();
        };
      },
    });

    const first = controller.start();
    const second = controller.start();
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(newInstanceCount, 1);
  });
});

describe('B. Compound Task Creation (Single Utterance Intent Resolution)', () => {
  const refDate = new Date(FIXED_CLOCK_TIMESTAMP); // Wednesday, Oct 21, 2026

  test('Example 1: "Add a database assignment due tomorrow."', () => {
    const res = parseCompoundTaskCreation('Add a database assignment due tomorrow.', refDate);
    assert.ok(res);
    assert.equal(res.title, 'database assignment');
    assert.equal(res.dueDate, '2026-10-22');
    assert.equal(res.priority, 'medium');
  });

  test('Example 2: "Create a task called Network Security Lab with a deadline of Friday."', () => {
    const res = parseCompoundTaskCreation('Create a task called Network Security Lab with a deadline of Friday.', refDate);
    assert.ok(res);
    assert.equal(res.title, 'Network Security Lab');
    assert.equal(res.dueDate, '2026-10-23'); // Wednesday -> Friday is +2 days
    assert.equal(res.priority, 'medium');
  });

  test('Example 3: "Remind me to finish the cryptography assignment by October 25."', () => {
    const res = parseCompoundTaskCreation('Remind me to finish the cryptography assignment by October 25.', refDate);
    assert.ok(res);
    assert.equal(res.title, 'cryptography assignment');
    assert.equal(res.dueDate, '2026-10-25');
  });

  test('Example 4: "Add an AI project task, due next Monday."', () => {
    const res = parseCompoundTaskCreation('Add an AI project task, due next Monday.', refDate);
    assert.ok(res);
    assert.equal(res.title, 'AI project');
    assert.equal(res.dueDate, '2026-10-26'); // Wednesday -> next Monday is Oct 26
  });

  test('Example 5: "Create a task for preparing my presentation and set the deadline to November 3."', () => {
    const res = parseCompoundTaskCreation('Create a task for preparing my presentation and set the deadline to November 3.', refDate);
    assert.ok(res);
    assert.equal(res.title, 'preparing my presentation');
    assert.equal(res.dueDate, '2026-11-03');
  });

  test('Example 6: "I need to complete the operating systems lab by the end of this week."', () => {
    const res = parseCompoundTaskCreation('I need to complete the operating systems lab by the end of this week.', refDate);
    assert.ok(res);
    assert.equal(res.title, 'operating systems lab');
    assert.equal(res.dueDate, '2026-10-25'); // End of current week (Sunday)
  });

  test('Example 7: "Add a task to revise machine learning notes, due in three days."', () => {
    const res = parseCompoundTaskCreation('Add a task to revise machine learning notes, due in three days.', refDate);
    assert.ok(res);
    assert.equal(res.title, 'revise machine learning notes');
    assert.equal(res.dueDate, '2026-10-24'); // Oct 21 + 3 days = Oct 24
  });

  test('Example 8: "Create a task called Database Assignment, due tomorrow, with high priority."', () => {
    const res = parseCompoundTaskCreation('Create a task called Database Assignment, due tomorrow, with high priority.', refDate);
    assert.ok(res);
    assert.equal(res.title, 'Database Assignment');
    assert.equal(res.dueDate, '2026-10-22');
    assert.equal(res.priority, 'high');
  });

  test('DialogueManager executes compound task creation in one atomic action', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    const result = dm.processInput('Create a task called Network Security Lab with a deadline of Friday', { tasks: [] });

    assert.equal(result.state, CONVERSATION_STATES.IDLE);
    assert.equal(result.intent, CONVERSATION_INTENTS.CREATE_TASK);
    assert.ok(result.isAuthorized);
    assert.equal(result.action.title, 'Network Security Lab');
    assert.equal(result.action.dueDate, '2026-10-23');
    assert.equal(result.action.priority, 'medium');
    assert.ok(result.responseText.includes('Network Security Lab'));
    assert.ok(result.responseText.includes('2026-10-23'));
  });

  test('Compound task creation with title and priority, missing deadline: creates task without deadline when not required', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    const result = dm.processInput('Create task called Database Architecture with high priority', { tasks: [] });

    assert.equal(result.state, CONVERSATION_STATES.IDLE);
    assert.equal(result.intent, CONVERSATION_INTENTS.CREATE_TASK);
    assert.equal(result.action.title, 'Database Architecture');
    assert.equal(result.action.priority, 'high');
    assert.equal(result.action.dueDate, null);
  });

  test('Missing title in creation prompts for title and preserves captured deadline and priority', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    const result = dm.processInput('Add a task due tomorrow with high priority', { tasks: [] });

    assert.equal(result.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(result.intent, CONVERSATION_INTENTS.CREATE_TASK);
    assert.ok(result.responseText.includes('title'));

    // Clarification answer provides title
    const nextResult = dm.processInput('Compiler Lab', { tasks: [] });
    assert.equal(nextResult.state, CONVERSATION_STATES.IDLE);
    assert.equal(nextResult.intent, CONVERSATION_INTENTS.CREATE_TASK);
    assert.equal(nextResult.action.title, 'Compiler Lab');
    assert.equal(nextResult.action.dueDate, '2026-10-22');
    assert.equal(nextResult.action.priority, 'high');
  });
});

describe('C. Broader Command Adaptability & Intent Families', () => {
  const sampleTasks = [
    { id: 't1', title: 'Network Lab', dueDate: '2026-10-20', priority: 'medium', completed: false }, // Overdue
    { id: 't2', title: 'AI Assignment', dueDate: '2026-10-24', priority: 'low', completed: false }, // Upcoming
    { id: 't3', title: 'Database Assignment', dueDate: '2026-10-23', priority: 'high', completed: false }, // Upcoming
  ];

  test('Priority change on active subject: "Make it high priority"', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    dm.setActiveSubject('t2');

    const result = dm.processInput('Make it high priority', { tasks: sampleTasks });
    assert.equal(result.state, CONVERSATION_STATES.IDLE);
    assert.equal(result.intent, CONVERSATION_INTENTS.CHANGE_PRIORITY);
    assert.equal(result.action.priority, 'high');
    assert.equal(result.action.taskId, 't2');
  });

  test('Priority change by explicit name: "Set priority of Network Lab to low"', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    const result = dm.processInput('Set priority of Network Lab to low', { tasks: sampleTasks });

    assert.equal(result.state, CONVERSATION_STATES.IDLE);
    assert.equal(result.intent, CONVERSATION_INTENTS.CHANGE_PRIORITY);
    assert.equal(result.action.priority, 'low');
    assert.equal(result.action.taskId, 't1');
  });

  test('Overdue tasks query: "Show my overdue tasks"', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    const result = dm.processInput('Show my overdue tasks', { tasks: sampleTasks });

    assert.equal(result.state, CONVERSATION_STATES.IDLE);
    assert.equal(result.intent, CONVERSATION_INTENTS.QUERY_TASKS);
    assert.ok(result.responseText.includes('Network Lab'));
    assert.ok(result.responseText.includes('overdue'));
  });

  test('Upcoming tasks query: "Show tasks due this week"', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    const result = dm.processInput('Show tasks due this week', { tasks: sampleTasks });

    assert.equal(result.state, CONVERSATION_STATES.IDLE);
    assert.equal(result.intent, CONVERSATION_INTENTS.QUERY_TASKS);
    assert.ok(result.responseText.includes('AI Assignment'));
    assert.ok(result.responseText.includes('Database Assignment'));
  });

  test('Deadline inquiry on active subject: "When is it due?"', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    dm.setActiveSubject('t3');

    const result = dm.processInput('When is it due?', { tasks: sampleTasks });
    assert.equal(result.state, CONVERSATION_STATES.IDLE);
    assert.equal(result.intent, CONVERSATION_INTENTS.DESCRIBE_TASK);
    assert.ok(result.responseText.includes('2026-10-23'));
    assert.ok(result.responseText.includes('Database Assignment'));
  });

  test('Lookup and tell deadline: "Find my network lab and tell me its deadline"', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    const result = dm.processInput('Find my network lab and tell me its deadline', { tasks: sampleTasks });

    assert.equal(result.state, CONVERSATION_STATES.IDLE);
    assert.equal(result.intent, CONVERSATION_INTENTS.DESCRIBE_TASK);
    assert.ok(result.responseText.includes('2026-10-20'));
    assert.ok(result.responseText.includes('Network Lab'));
  });

  test('Conversational proposal revision: "What about Monday instead?"', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    // Step 1: Request reschedule
    const step1 = dm.processInput('Move my AI assignment to Friday', { tasks: sampleTasks });
    assert.equal(step1.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.ok(step1.proposal);
    assert.equal(step1.proposal.proposedPlacements[0].proposedDate, '2026-10-23');

    // Step 2: Conversational revision "What about Monday instead?"
    const step2 = dm.processInput('What about Monday instead?', { tasks: sampleTasks });
    assert.equal(step2.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.ok(step2.proposal);
    assert.equal(step2.proposal.proposedPlacements[0].proposedDate, '2026-10-26');
    assert.ok(step2.supersededProposal); // Preserves supersession lifecycle
  });

  test('Multi-intent read-only query sequencing: "Show my overdue tasks and then show tasks due this week"', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    const result = dm.processInput('Show my overdue tasks and then show tasks due this week', { tasks: sampleTasks });

    assert.equal(result.state, CONVERSATION_STATES.IDLE);
    assert.ok(result.responseText.includes('Network Lab'));
    assert.ok(result.responseText.includes('AI Assignment'));
  });
});

describe('D. Regression and Safety Safeguards', () => {
  const sampleTasks = [
    { id: 't1', title: 'Network Lab', dueDate: '2026-10-20', priority: 'medium', completed: false },
  ];

  test('Destructive action "Delete that task" retains mandatory confirmation safeguard', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    dm.setActiveSubject('t1');

    const result = dm.processInput('Delete that task', { tasks: sampleTasks });
    assert.equal(result.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);
    assert.equal(result.intent, CONVERSATION_INTENTS.DELETE_TASK);
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.isAuthorized, false); // Must NOT authorize without explicit yes

    // Answering invalid response does not authorize
    const invalid = dm.processInput('maybe later', { tasks: sampleTasks });
    assert.equal(invalid.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);
    assert.equal(invalid.isAuthorized, false);

    // Confirming explicitly authorizes
    const confirmed = dm.processInput('yes', { tasks: sampleTasks });
    assert.equal(confirmed.state, CONVERSATION_STATES.IDLE);
    assert.equal(confirmed.isAuthorized, true);
    assert.equal(confirmed.action.type, CONVERSATION_INTENTS.DELETE_TASK);
  });

  test('Schedule proposal changes require explicit user acceptance before being applied', () => {
    const dm = new DialogueManager({ clock: injectedClock });
    const result = dm.processInput('Move Network Lab to tomorrow', { tasks: sampleTasks });

    assert.equal(result.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.equal(result.isAuthorized, false);
    assert.ok(result.proposal);

    // Explicit discard leaves schedule untouched
    const discardRes = dm.processInput('discard', { tasks: sampleTasks });
    assert.equal(discardRes.state, CONVERSATION_STATES.IDLE);
    assert.equal(discardRes.intent, CONVERSATION_INTENTS.DISCARD_PROPOSAL);
    assert.equal(discardRes.isAuthorized, false);
  });
});
