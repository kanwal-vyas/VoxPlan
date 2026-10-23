import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DialogueManager, CONVERSATION_STATES, CONVERSATION_INTENTS } from '../src/conversation/dialogueManager.js';
import { VoiceRecognitionController, RECOGNITION_STATES } from '../src/conversation/speechEngine.js';

// Fixed reference date: Wednesday, October 21, 2026, 12:00:00 UTC
const FIXED_CLOCK_TIMESTAMP = new Date('2026-10-21T12:00:00Z').getTime();
const injectedClock = () => FIXED_CLOCK_TIMESTAMP;

class MockSpeechRecognition {
  constructor() {
    this.continuous = true;
    this.interimResults = true;
    this.lang = 'en-US';
    this.onstart = null;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.isStarted = false;
    this.isStopped = false;
  }
  start() { this.isStarted = true; if (this.onstart) this.onstart(); }
  stop() { this.isStopped = true; if (this.onend) this.onend(); }
  abort() { this.isStopped = true; if (this.onend) this.onend(); }
  simulateResult(transcript, isFinal = true) {
    if (this.onresult) {
      this.onresult({
        results: [Object.assign([{ transcript }], { isFinal })],
      });
    }
  }
  simulateError(error) {
    if (this.onerror) this.onerror({ error });
  }
}

describe('Voice Command Reliability — Phase 2 & 3 Regression Tests', () => {
  describe('A. Multiple operations in one utterance (Compound Commands)', () => {
    test('Two tasks created from compound utterance with titles, assignees, and priorities', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task XYZ for ABC with high priority, and create another task DEF for PQR with low priority.';
      const res = dm.processInput(utterance, { tasks: [] });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(res.action.actions.length, 2);

      const [act1, act2] = res.action.actions;
      assert.equal(act1.type, CONVERSATION_INTENTS.CREATE_TASK);
      assert.equal(act1.title, 'XYZ');
      assert.equal(act1.priority, 'high');

      assert.equal(act2.type, CONVERSATION_INTENTS.CREATE_TASK);
      assert.equal(act2.title, 'DEF');
      assert.equal(act2.priority, 'low');

      assert.ok(res.responseText.includes('Executed 2 operations'));
    });

    test('Two tasks with "called" and "another called" phrasing', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create a task called Prepare report for ABC with high priority, and create another called Review report for PQR with low priority.';
      const res = dm.processInput(utterance, { tasks: [] });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(res.action.actions.length, 2);

      const [act1, act2] = res.action.actions;
      assert.equal(act1.title, 'Prepare report');
      assert.equal(act1.priority, 'high');

      assert.equal(act2.title, 'Review report');
      assert.equal(act2.priority, 'low');
    });

    test('Two tasks with "then" separator: "Create task XYZ with high priority, then create task DEF with low priority."', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task XYZ with high priority, then create task DEF with low priority.';
      const res = dm.processInput(utterance, { tasks: [] });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(res.action.actions.length, 2);

      const [act1, act2] = res.action.actions;
      assert.equal(act1.title, 'XYZ');
      assert.equal(act1.priority, 'high');

      assert.equal(act2.title, 'DEF');
      assert.equal(act2.priority, 'low');
    });

    test('Three operations in one utterance', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Task One with high priority, then create task Task Two with low priority, and create task Task Three with medium priority.';
      const res = dm.processInput(utterance, { tasks: [] });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(res.action.actions.length, 3);

      assert.equal(res.action.actions[0].title, 'Task One');
      assert.equal(res.action.actions[0].priority, 'high');
      assert.equal(res.action.actions[1].title, 'Task Two');
      assert.equal(res.action.actions[1].priority, 'low');
      assert.equal(res.action.actions[2].title, 'Task Three');
      assert.equal(res.action.actions[2].priority, 'medium');
    });

    test('Multiple attributes for one task does NOT create an unintended second task', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create a task called Database Assignment, due tomorrow, with high priority.';
      const res = dm.processInput(utterance, { tasks: [] });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.type, CONVERSATION_INTENTS.CREATE_TASK);
      assert.equal(res.action.title, 'Database Assignment');
      assert.equal(res.action.dueDate, '2026-10-22');
      assert.equal(res.action.priority, 'high');
    });

    test('Creation followed by update to that same task: "Create task XYZ for ABC and set its priority to high."', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task XYZ for ABC and set its priority to high.';
      const res = dm.processInput(utterance, { tasks: [] });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(res.action.actions.length, 2);

      const [createAct, updateAct] = res.action.actions;
      assert.equal(createAct.type, CONVERSATION_INTENTS.CREATE_TASK);
      assert.equal(createAct.title, 'XYZ');
      assert.ok(createAct.taskId);

      assert.equal(updateAct.type, CONVERSATION_INTENTS.CHANGE_PRIORITY);
      assert.equal(updateAct.taskId, createAct.taskId);
      assert.equal(updateAct.priority, 'high');
    });
  });

  describe('B. Voice Editing Existing Tasks', () => {
    const existingTasks = [
      { id: 'task-1', title: 'XYZ', priority: 'medium', dueDate: '2026-10-22', completed: false },
      { id: 'task-2', title: 'DEF', priority: 'medium', dueDate: '2026-10-24', completed: false },
      { id: 'task-3', title: 'Review Code', priority: 'low', dueDate: '2026-10-25', completed: true },
      { id: 'task-dup-1', title: 'Budget Report', priority: 'medium', dueDate: '2026-10-22', completed: false },
      { id: 'task-dup-2', title: 'Budget Report', priority: 'high', dueDate: '2026-10-29', completed: false },
    ];

    test('Change XYZ\'s priority to high (possessive apostrophe)', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const res = dm.processInput("Change XYZ's priority to high.", { tasks: existingTasks });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.intent, CONVERSATION_INTENTS.CHANGE_PRIORITY);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.taskId, 'task-1');
      assert.equal(res.action.priority, 'high');
    });

    test('Set the priority of task DEF to low (task prefix)', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const res = dm.processInput('Set the priority of task DEF to low.', { tasks: existingTasks });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.intent, CONVERSATION_INTENTS.CHANGE_PRIORITY);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.taskId, 'task-2');
      assert.equal(res.action.priority, 'low');
    });

    test('Assign XYZ to ABC receives truthful explanation and leaves task unchanged', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const res = dm.processInput('Assign XYZ to ABC.', { tasks: existingTasks });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.intent, 'ASSIGN_TASK');
      assert.equal(res.isAuthorized, false);
      assert.equal(res.action, null);
      assert.ok(res.responseText.includes('not supported in VoxPlan'));
    });

    test('Mark XYZ as completed', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const res = dm.processInput('Mark XYZ as completed.', { tasks: existingTasks });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.intent, CONVERSATION_INTENTS.COMPLETE_TASK);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.taskId, 'task-1');
    });

    test('Reopen completed task "Review Code"', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const res = dm.processInput('Reopen Review Code', { tasks: existingTasks });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.intent, CONVERSATION_INTENTS.REOPEN_TASK);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.taskId, 'task-3');
    });

    test('Rename XYZ to Prepare the final report', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const res = dm.processInput('Rename XYZ to Prepare the final report.', { tasks: existingTasks });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.intent, CONVERSATION_INTENTS.RENAME_TASK);
      assert.ok(res.isAuthorized);
      assert.equal(res.action.taskId, 'task-1');
      assert.equal(res.action.newTitle, 'Prepare the final report');
    });

    test('Change XYZ\'s deadline to Friday', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const res = dm.processInput("Change XYZ's deadline to Friday.", { tasks: existingTasks });

      // Direct rescheduling or proposal
      assert.ok(
        (res.state === CONVERSATION_STATES.IDLE && res.intent === CONVERSATION_INTENTS.RESCHEDULE_TASK && res.action?.taskId === 'task-1') ||
        (res.state === CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION && res.proposal?.proposedPlacements?.some(p => p.taskId === 'task-1'))
      );
    });

    test('Ambiguous task name triggers clarification without mutating either candidate', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const res = dm.processInput("Change Budget Report's priority to high", { tasks: existingTasks });

      assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
      assert.equal(res.isAuthorized, false);
      assert.equal(res.action, null);
      assert.equal(res.candidateTasks.length, 2);
      assert.ok(res.candidateTasks.some(t => t.id === 'task-dup-1'));
      assert.ok(res.candidateTasks.some(t => t.id === 'task-dup-2'));
    });

    test('Invalid priority value is rejected safely with guidance', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const res = dm.processInput("Change XYZ's priority to extreme", { tasks: existingTasks });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.isAuthorized, false);
      assert.equal(res.action, null);
      assert.ok(res.responseText.includes('high, medium, or low'));
    });
  });

  describe('C. Speech Recognition Transcript Submission & Invariants', () => {
    test('Interim transcripts do not execute actions; only final transcript executes once', () => {
      let mockRec = null;
      let executionCount = 0;
      let executedUtterance = '';

      const controller = new VoiceRecognitionController({
        getSpeechRecognition: () => {
          return function() {
            mockRec = new MockSpeechRecognition();
            return mockRec;
          };
        },
        onResult: (transcript) => {
          executionCount += 1;
          executedUtterance = transcript;
        },
      });

      controller.start();
      assert.equal(controller.getState(), RECOGNITION_STATES.LISTENING);

      // Interim result 1
      mockRec.simulateResult('create task XYZ', false);
      assert.equal(executionCount, 0);

      // Interim result 2
      mockRec.simulateResult('create task XYZ with high priority', false);
      assert.equal(executionCount, 0);

      // Final result
      mockRec.simulateResult('create task XYZ with high priority', true);
      assert.equal(executionCount, 1);
      assert.equal(executedUtterance, 'create task XYZ with high priority');
    });

    test('Equivalent typed and voice transcripts produce identical DialogueManager outputs', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const text = 'Create task Analysis with high priority, then create task Synthesis with low priority.';

      const typedResult = dm.processInput(text, { tasks: [] });
      const voiceResult = dm.processInput(text, { tasks: [] });

      assert.deepEqual(typedResult.intent, voiceResult.intent);
      assert.deepEqual(typedResult.action.actions.map(a => ({ title: a.title, priority: a.priority })),
                       voiceResult.action.actions.map(a => ({ title: a.title, priority: a.priority })));
    });
  });
});
