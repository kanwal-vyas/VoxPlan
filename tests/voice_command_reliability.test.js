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

    test('Intermediate isFinal chunk does not execute early while interim text is in-flight', () => {
      let mockRec = null;
      let executedUtterance = null;
      let draftUpdates = [];

      const controller = new VoiceRecognitionController({
        continuous: true,
        silenceTimeoutMs: 50,
        getSpeechRecognition: () => {
          return function() {
            mockRec = new MockSpeechRecognition();
            return mockRec;
          };
        },
        onInterimResult: (draft) => draftUpdates.push(draft),
        onResult: (transcript) => {
          executedUtterance = transcript;
        },
      });

      controller.start();

      // Chunk 0 is marked final, but Chunk 1 is in-flight interim
      mockRec.onresult({
        results: [
          Object.assign([{ transcript: 'Create task Alpha with high priority' }], { isFinal: true }),
          Object.assign([{ transcript: 'and create another task Beta with low priority' }], { isFinal: false }),
        ],
      });

      // Must NOT dispatch immediately because interim is in-flight
      assert.equal(executedUtterance, null);
      assert.ok(draftUpdates.includes('Create task Alpha with high priority and create another task Beta with low priority'));

      // When stop({ submit: true }) is called, it finalizes the complete unified utterance
      controller.stop({ submit: true });
      assert.equal(executedUtterance, 'Create task Alpha with high priority and create another task Beta with low priority');
    });

    test('Explicit stop with pending draft text submits the transcript intact', () => {
      let mockRec = null;
      let executedUtterance = null;

      const controller = new VoiceRecognitionController({
        continuous: true,
        getSpeechRecognition: () => {
          return function() {
            mockRec = new MockSpeechRecognition();
            return mockRec;
          };
        },
        onResult: (transcript) => {
          executedUtterance = transcript;
        },
      });

      controller.start();
      // User speaks interim draft
      mockRec.simulateResult('Create task Gamma with high priority', false);
      assert.equal(executedUtterance, null);

      // User clicks mic/stop button to finalize
      controller.stop({ submit: true });
      assert.equal(executedUtterance, 'Create task Gamma with high priority');
    });

    test('Explicit cancel() discards pending draft and does not submit', () => {
      let mockRec = null;
      let executedUtterance = null;

      const controller = new VoiceRecognitionController({
        continuous: true,
        getSpeechRecognition: () => {
          return function() {
            mockRec = new MockSpeechRecognition();
            return mockRec;
          };
        },
        onResult: (transcript) => {
          executedUtterance = transcript;
        },
      });

      controller.start();
      mockRec.simulateResult('Delete all tasks', false);
      controller.cancel();

      assert.equal(executedUtterance, null);
      assert.equal(controller.getState(), RECOGNITION_STATES.IDLE);
    });

    test('Session onend finalizes and dispatches unsubmitted draft', () => {
      let mockRec = null;
      let executedUtterance = null;

      const controller = new VoiceRecognitionController({
        continuous: true,
        getSpeechRecognition: () => {
          return function() {
            mockRec = new MockSpeechRecognition();
            return mockRec;
          };
        },
        onResult: (transcript) => {
          executedUtterance = transcript;
        },
      });

      controller.start();
      mockRec.simulateResult('Create task Delta with low priority', false);
      assert.equal(executedUtterance, null);

      // Browser fires onend (e.g. microphone stream closed)
      if (mockRec.onend) mockRec.onend();
      assert.equal(executedUtterance, 'Create task Delta with low priority');
    });

    test('Conjunction within task title does not accidentally split the title', () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Research and Development with high priority, and create another task Sales with low priority.';
      const res = dm.processInput(utterance, { tasks: [] });

      assert.equal(res.state, CONVERSATION_STATES.IDLE);
      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(res.action.actions.length, 2);

      assert.equal(res.action.actions[0].title, 'Research and Development');
      assert.equal(res.action.actions[0].priority, 'high');

      assert.equal(res.action.actions[1].title, 'Sales');
      assert.equal(res.action.actions[1].priority, 'low');
    });
  });

  describe('D. End-to-End Compound Task Store Simulation', () => {
    // Helper simulating ProductivityApp.jsx executeCommand and dispatchAction flow
    async function simulateAppExecution(dm, utterance, initialTasks = []) {
      let workingTasks = [...initialTasks];
      const res = dm.processInput(utterance, { tasks: workingTasks });

      if (res.action) {
        const dispatch = async (act) => {
          if (act.type === 'COMPOUND_ACTIONS') {
            for (const sub of act.actions) {
              await dispatch(sub);
            }
          } else if (act.type === CONVERSATION_INTENTS.CREATE_TASK) {
            const newTask = {
              id: act.taskId || `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              title: act.title,
              priority: act.priority || 'medium',
              dueDate: act.dueDate || null,
              completed: false,
              category: 'General',
              estimatedEffort: act.estimatedEffort || null,
              dependencies: [],
              createdAt: new Date().toISOString(),
            };
            workingTasks = [newTask, ...workingTasks];
            dm.setActiveSubject(newTask.id);
          } else if (act.type === CONVERSATION_INTENTS.CHANGE_PRIORITY) {
            workingTasks = workingTasks.map(t => t.id === act.taskId ? { ...t, priority: act.priority } : t);
            dm.setActiveSubject(act.taskId);
          } else if (act.type === CONVERSATION_INTENTS.COMPLETE_TASK) {
            workingTasks = workingTasks.map(t => t.id === act.taskId ? { ...t, completed: true } : t);
            dm.setActiveSubject(act.taskId);
          }
        };
        await dispatch(res.action);
      }

      return { res, finalTasks: workingTasks };
    }

    test('Phase 2 Example 1: Create task Alpha with high priority, and create another task Beta with low priority.', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Alpha with high priority, and create another task Beta with low priority.';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2);

      const alpha = finalTasks.find(t => t.title === 'Alpha');
      const beta = finalTasks.find(t => t.title === 'Beta');

      assert.ok(alpha, 'Alpha task must exist');
      assert.ok(beta, 'Beta task must exist');
      assert.equal(alpha.priority, 'high');
      assert.equal(beta.priority, 'low');
    });

    test('Phase 2 Example 2: Create task Gamma with high priority, then create task Delta with low priority.', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Gamma with high priority, then create task Delta with low priority.';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2);

      const gamma = finalTasks.find(t => t.title === 'Gamma');
      const delta = finalTasks.find(t => t.title === 'Delta');

      assert.ok(gamma, 'Gamma task must exist');
      assert.ok(delta, 'Delta task must exist');
      assert.equal(gamma.priority, 'high');
      assert.equal(delta.priority, 'low');
    });

    test('Phase 2 Example 3: Create task Epsilon with high priority, and set its priority to low.', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Epsilon with high priority, and set its priority to low.';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 1);

      const epsilon = finalTasks.find(t => t.title === 'Epsilon');
      assert.ok(epsilon, 'Epsilon task must exist');
      assert.equal(epsilon.priority, 'low', 'Priority should have been updated to low');
    });

    test('Phase 2 Example 4: Create task Zeta with high priority, create task Eta with low priority, and mark Zeta as completed.', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Zeta with high priority, create task Eta with low priority, and mark Zeta as completed.';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2);

      const zeta = finalTasks.find(t => t.title === 'Zeta');
      const eta = finalTasks.find(t => t.title === 'Eta');

      assert.ok(zeta, 'Zeta task must exist');
      assert.ok(eta, 'Eta task must exist');
      assert.equal(zeta.priority, 'high');
      assert.equal(zeta.completed, true, 'Zeta must be marked as completed');
      assert.equal(eta.priority, 'low');
      assert.equal(eta.completed, false, 'Eta must be active');
    });
  });

  describe('E. Regression Suite: Compound Title Corruption & Preposition Guard', () => {
    // Helper simulating ProductivityApp.jsx executeCommand and dispatchAction flow
    async function simulateAppExecution(dm, utterance, initialTasks = []) {
      let workingTasks = [...initialTasks];
      const res = dm.processInput(utterance, { tasks: workingTasks });

      if (res.action) {
        const dispatch = async (act) => {
          if (act.type === 'COMPOUND_ACTIONS') {
            for (const sub of act.actions) {
              await dispatch(sub);
            }
          } else if (act.type === CONVERSATION_INTENTS.CREATE_TASK) {
            const newTask = {
              id: act.taskId || `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              title: act.title,
              priority: act.priority || 'medium',
              dueDate: act.dueDate || null,
              completed: false,
              category: 'General',
              estimatedEffort: act.estimatedEffort || null,
              dependencies: [],
              createdAt: new Date().toISOString(),
            };
            workingTasks = [newTask, ...workingTasks];
            dm.setActiveSubject(newTask.id);
          } else if (act.type === CONVERSATION_INTENTS.CHANGE_PRIORITY) {
            workingTasks = workingTasks.map(t => t.id === act.taskId ? { ...t, priority: act.priority } : t);
            dm.setActiveSubject(act.taskId);
          } else if (act.type === CONVERSATION_INTENTS.COMPLETE_TASK) {
            workingTasks = workingTasks.map(t => t.id === act.taskId ? { ...t, completed: true } : t);
            dm.setActiveSubject(act.taskId);
          }
        };
        await dispatch(res.action);
      }

      return { res, finalTasks: workingTasks };
    }

    test('Regression 1: "beta and another task gamma" - Prevents task amalgamation when shorthand "and another task" is used', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Beta with low priority and another task Gamma with medium priority';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2);

      const beta = finalTasks.find(t => t.title === 'Beta');
      const gamma = finalTasks.find(t => t.title === 'Gamma');

      assert.ok(beta, 'Task Beta must exist independently');
      assert.ok(gamma, 'Task Gamma must exist independently');
      assert.equal(beta.title, 'Beta', 'Title must NOT contain "and another task"');
      assert.equal(beta.priority, 'low');
      assert.equal(gamma.title, 'Gamma');
      assert.equal(gamma.priority, 'medium');
    });

    test('Regression 2: "Alpha of" - Prevents residual preposition corruption when "of <priority> priority" is spoken', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Alpha of high priority and another task Beta of low priority';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2);

      const alpha = finalTasks.find(t => t.title === 'Alpha');
      const beta = finalTasks.find(t => t.title === 'Beta');

      assert.ok(alpha, 'Task Alpha must exist');
      assert.ok(beta, 'Task Beta must exist');
      assert.equal(alpha.title, 'Alpha', 'Title must NOT contain dangling "of"');
      assert.equal(alpha.priority, 'high');
      assert.equal(beta.title, 'Beta', 'Title must NOT contain dangling "of"');
      assert.equal(beta.priority, 'low');
    });

    test('Regression 3: Flexible priority connectors ("with priority of high", "with a priority of low")', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Alpha with priority of high and another task Beta with a priority of low';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2);

      const alpha = finalTasks.find(t => t.title === 'Alpha');
      const beta = finalTasks.find(t => t.title === 'Beta');

      assert.equal(alpha.title, 'Alpha');
      assert.equal(alpha.priority, 'high');
      assert.equal(beta.title, 'Beta');
      assert.equal(beta.priority, 'low');
    });

    test('Regression 4: Speech transcript without any punctuation cleanly splits and completes target task', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'create task zeta with high priority create task eta with low priority and mark zeta as completed';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2);

      const zeta = finalTasks.find(t => t.title === 'Zeta');
      const eta = finalTasks.find(t => t.title === 'Eta');

      assert.ok(zeta, 'Zeta must exist');
      assert.ok(eta, 'Eta must exist');
      assert.equal(zeta.title, 'Zeta', 'Zeta must be capitalized');
      assert.equal(zeta.priority, 'high');
      assert.equal(zeta.completed, true, 'Zeta must be marked completed');
      assert.equal(eta.title, 'Eta', 'Eta must be capitalized');
      assert.equal(eta.priority, 'low');
      assert.equal(eta.completed, false, 'Eta must remain active');
    });

    test('Regression 5: Legitimate title conjunctions ("Research and Development", "Bread and Butter") are preserved intact', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Research and Development with high priority and create another task Bread and Butter with low priority';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2);

      const rd = finalTasks.find(t => t.title === 'Research and Development');
      const bb = finalTasks.find(t => t.title === 'Bread and Butter');

      assert.ok(rd, 'Research and Development must exist intact');
      assert.ok(bb, 'Bread and Butter must exist intact');
      assert.equal(rd.priority, 'high');
      assert.equal(bb.priority, 'low');
    });

    test('Regression 6: Local persistence round-trip preserves compound tasks after reload', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Alpha with high priority, and create another task Beta with low priority.';
      const { finalTasks } = await simulateAppExecution(dm, utterance, []);

      // Simulate JSON localStorage persistence round-trip
      const serialized = JSON.stringify(finalTasks);
      const reloaded = JSON.parse(serialized);

      assert.equal(reloaded.length, 2);
      assert.equal(reloaded[0].title, 'Beta');
      assert.equal(reloaded[0].priority, 'low');
      assert.equal(reloaded[1].title, 'Alpha');
      assert.equal(reloaded[1].priority, 'high');
    });

    test('Regression 7: No duplicate tasks after retrying a failed command', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      let currentTasks = [];

      // Step 1: Failed attempt - command references non-existent task
      const failedUtterance = 'mark NonExistentTask as completed';
      const failRes = dm.processInput(failedUtterance, { tasks: currentTasks });
      assert.equal(failRes.isAuthorized, false, 'Failed command must not be authorized');
      assert.equal(failRes.error, 'task_not_found');
      assert.equal(currentTasks.length, 0, 'No tasks should have been created or modified');

      // Step 2: Retry with valid compound task creation
      const retryUtterance = 'Create task Alpha with high priority, and create another task Beta with low priority.';
      const { res: retryRes, finalTasks } = await simulateAppExecution(dm, retryUtterance, currentTasks);
      assert.equal(retryRes.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2, 'Exactly two tasks must exist');

      // Step 3: Repeated retry of an already completed task creation does not produce duplicates when guarded
      const taskTitles = finalTasks.map(t => t.title);
      assert.deepStrictEqual(taskTitles.sort(), ['Alpha', 'Beta']);
    });

    test('Regression 8: Speech transcript with colloquial phonetics ("in another task ... and marked task ... is complete") correctly splits and completes target task', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const utterance = 'Create task Alpha in another task beta and marked task Alpha is complete';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, []);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(res.action.actions.length, 3, 'Must split into 3 distinct operations');

      const alpha = finalTasks.find(t => t.title === 'Alpha');
      const beta = finalTasks.find(t => t.title === 'Beta');

      assert.ok(alpha, 'Alpha must exist');
      assert.ok(beta, 'Beta must exist');
      assert.equal(alpha.title, 'Alpha');
      assert.equal(alpha.completed, true, 'Alpha must be marked completed');
      assert.equal(beta.title, 'Beta');
      assert.equal(beta.completed, false, 'Beta must be active');
    });

    test('Regression 9: Two-task creation and completion with explicit priorities: "Create task Beta with low priority, and mark Alpha as completed."', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      const existingAlpha = {
        id: 'task-alpha-123',
        title: 'Alpha',
        priority: 'high',
        completed: false,
        createdAt: new Date(injectedClock()).toISOString(),
      };
      const utterance = 'Create task Beta with low priority, and mark Alpha as completed.';
      const { res, finalTasks } = await simulateAppExecution(dm, utterance, [existingAlpha]);

      assert.equal(res.action.type, 'COMPOUND_ACTIONS');
      assert.equal(finalTasks.length, 2, 'Must have exactly Alpha and Beta, no malformed extra task');

      const alpha = finalTasks.find(t => t.title === 'Alpha');
      const beta = finalTasks.find(t => t.title === 'Beta');

      assert.ok(alpha, 'Alpha must exist');
      assert.ok(beta, 'Beta must exist');
      assert.equal(alpha.completed, true, 'Alpha must be completed');
      assert.equal(alpha.priority, 'high', 'Alpha retains high priority');
      assert.equal(beta.title, 'Beta');
      assert.equal(beta.priority, 'low', 'Beta must have low priority');
      assert.equal(beta.completed, false, 'Beta must be active (not completed)');
    });

    test('Regression 10: Truly ambiguous unsegmented compound command requests clarification rather than creating corrupted task title', async () => {
      const dm = new DialogueManager({ clock: injectedClock });
      // Utterance containing embedded command syntax that cannot be cleanly separated
      const ambiguousUtterance = 'Create task Alpha marked task complete';
      const res = dm.processInput(ambiguousUtterance, { tasks: [] });

      assert.equal(res.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
      assert.equal(res.error, 'ambiguous_compound_command');
      assert.equal(res.action, null, 'Must NOT create a corrupted action');
      assert.ok(res.responseText.includes('state each task or action separately'));

      // Direct call to _handleCreateTaskIntent with the unsegmented failure utterance
      const directRes = dm._handleCreateTaskIntent('Create task Alpha in another task beta and marked task Alpha is complete');
      assert.equal(directRes.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
      assert.equal(directRes.error, 'ambiguous_compound_command');
      assert.equal(directRes.action, null);
    });

    test('Regression 11: VoiceRecognitionController handles multiple finalized segments and interim results across pauses without duplication', () => {
      let mockRec = null;
      let executedUtterance = null;
      let interimUpdates = [];

      const controller = new VoiceRecognitionController({
        continuous: true,
        silenceTimeoutMs: 100,
        getSpeechRecognition: () => {
          return function() {
            mockRec = new MockSpeechRecognition();
            return mockRec;
          };
        },
        onInterimResult: (draft) => interimUpdates.push(draft),
        onResult: (transcript) => {
          executedUtterance = transcript;
        },
      });

      controller.start();

      // Chunk 0 is final
      mockRec.onresult({
        results: [
          Object.assign([{ transcript: 'Create task Beta with low priority' }], { isFinal: true }),
        ],
      });

      // Chunk 1 is interim
      mockRec.onresult({
        results: [
          Object.assign([{ transcript: 'Create task Beta with low priority' }], { isFinal: true }),
          Object.assign([{ transcript: 'and mark Alpha as completed' }], { isFinal: false }),
        ],
      });

      assert.equal(executedUtterance, null, 'Should not dispatch while interim is in-flight');

      // Chunk 1 becomes final
      mockRec.onresult({
        results: [
          Object.assign([{ transcript: 'Create task Beta with low priority' }], { isFinal: true }),
          Object.assign([{ transcript: 'and mark Alpha as completed' }], { isFinal: true }),
        ],
      });

      // User stops to finalize command
      controller.stop({ submit: true });

      assert.equal(executedUtterance, 'Create task Beta with low priority and mark Alpha as completed');
    });

    test('Regression 12: VoiceRecognitionController resets state cleanly across repeated sessions without leaking stale draft', () => {
      let mockRec = null;
      let executedUtterances = [];

      const controller = new VoiceRecognitionController({
        continuous: true,
        getSpeechRecognition: () => {
          return function() {
            mockRec = new MockSpeechRecognition();
            return mockRec;
          };
        },
        onResult: (transcript) => {
          executedUtterances.push(transcript);
        },
      });

      // Session 1: Started then aborted/cancelled
      controller.start();
      mockRec.simulateResult('stale text from abandoned attempt', false);
      controller.cancel();

      // Session 2: New session should have zero stale text
      controller.start();
      mockRec.simulateResult('Create task Beta with low priority', true);
      controller.stop({ submit: true });

      assert.equal(executedUtterances.length, 1);
      assert.equal(executedUtterances[0], 'Create task Beta with low priority');
    });
  });
});
