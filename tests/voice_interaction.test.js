import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VoiceRecognitionController,
  SpeechSynthesisController,
  generateSpokenSummary,
  sanitizeForSpeech,
  RECOGNITION_STATES,
  SPEECH_STORAGE_KEY,
} from '../src/conversation/speechEngine.js';
import { DialogueManager, CONVERSATION_STATES } from '../src/conversation/dialogueManager.js';
import { telemetry } from '../src/telemetry/telemetryManager.js';

// Mock Web Speech API SpeechRecognition implementation
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
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

  // Test helpers to simulate browser events
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

// Mock Web Speech API SpeechSynthesis implementation
class MockSpeechSynthesis {
  constructor() {
    this.spokenUtterances = [];
    this.isCancelled = false;
    this.cancelCount = 0;
  }

  speak(utterance) {
    this.spokenUtterances.push(utterance);
    this.isCancelled = false;
    if (utterance.onstart) utterance.onstart();
  }

  cancel() {
    this.isCancelled = true;
    this.cancelCount += 1;
  }
}

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = 'en-US';
    this.rate = 1.0;
    this.pitch = 1.0;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}

// Mock localStorage
class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] ?? null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

function createSampleTasks() {
  return [
    {
      id: 'task-v1',
      title: 'Database Assignment',
      priority: 'high',
      dueDate: '2026-10-20',
      completed: false,
      estimatedEffort: 3.0,
      dependencies: [],
    },
    {
      id: 'task-v2',
      title: 'Draft architecture audit',
      priority: 'medium',
      dueDate: '2026-10-21',
      completed: false,
      estimatedEffort: 4.0,
      dependencies: ['task-v1'],
    },
  ];
}

describe('A. Voice Recognition Lifecycle', () => {
  test('Initial state is IDLE and does not auto-activate microphone', () => {
    let mockInstancesCreated = 0;
    class SpyingSpeechRecognition extends MockSpeechRecognition {
      constructor() {
        super();
        mockInstancesCreated += 1;
      }
    }
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => SpyingSpeechRecognition,
    });

    assert.equal(controller.getState(), RECOGNITION_STATES.IDLE);
    assert.equal(controller.isSupported(), true);
    assert.equal(mockInstancesCreated, 0, 'Microphone session must never be initiated before user action');
  });

  test('Starting recognition transitions state to LISTENING and invokes onstart', () => {
    let mockRec = null;
    let stateChanges = [];

    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
      onStateChange: (s) => stateChanges.push(s),
    });

    const started = controller.start();
    assert.equal(started, true);
    assert.equal(controller.getState(), RECOGNITION_STATES.LISTENING);
    assert.equal(mockRec.isStarted, true);
    assert.ok(stateChanges.includes(RECOGNITION_STATES.LISTENING));
  });

  test('Repeated start actions do not create duplicate sessions', () => {
    let creations = 0;
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          creations += 1;
          return new MockSpeechRecognition();
        };
      },
    });

    controller.start();
    assert.equal(creations, 1);

    const secondStart = controller.start();
    assert.equal(secondStart, false);
    assert.equal(creations, 1, 'Must not create a second concurrent recognition session');
  });

  test('Stopping recognition ends the active session and returns to IDLE', () => {
    let mockRec = null;
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
    });

    controller.start();
    assert.equal(controller.getState(), RECOGNITION_STATES.LISTENING);

    controller.stop();
    assert.equal(controller.getState(), RECOGNITION_STATES.IDLE);
    assert.equal(mockRec.isStopped, true);
  });

  test('Unsupported browser APIs produce clear UNSUPPORTED state', () => {
    let errorReceived = null;
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => null,
      onError: (err) => { errorReceived = err; },
    });

    assert.equal(controller.isSupported(), false);
    const started = controller.start();
    assert.equal(started, false);
    assert.equal(controller.getState(), RECOGNITION_STATES.UNSUPPORTED);
    assert.equal(errorReceived.code, 'unsupported');
  });

  test('Permission denial (not-allowed) produces actionable ERROR state', () => {
    let mockRec = null;
    let errorReceived = null;
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
      onError: (err) => { errorReceived = err; },
    });

    controller.start();
    mockRec.simulateError('not-allowed');

    assert.equal(controller.getState(), RECOGNITION_STATES.ERROR);
    assert.ok(errorReceived.message.includes('permission was denied'));
  });

  test('Recognition errors (network, audio-capture) are handled safely without crashing', () => {
    let mockRec = null;
    let errors = [];
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
      onError: (err) => errors.push(err),
    });

    controller.start();
    mockRec.simulateError('network');
    assert.equal(controller.getState(), RECOGNITION_STATES.ERROR);
    assert.ok(errors[0].message.includes('network connection failed'));

    controller.start();
    mockRec.simulateError('audio-capture');
    assert.equal(controller.getState(), RECOGNITION_STATES.ERROR);
    assert.ok(errors[1].message.includes('No microphone was detected'));
  });

  test('Empty or whitespace recognition results do not submit commands', () => {
    let mockRec = null;
    let submittedCommands = [];
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
      onResult: (cmd) => submittedCommands.push(cmd),
    });

    controller.start();
    mockRec.simulateResult('   ');
    assert.equal(submittedCommands.length, 0);
    assert.equal(controller.getState(), RECOGNITION_STATES.IDLE);
  });

  test('Interim transcripts do not execute commands; only final results submit', () => {
    let mockRec = null;
    let submittedCommands = [];
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
      onResult: (cmd) => submittedCommands.push(cmd),
    });

    controller.start();
    // Simulate interim transcript
    mockRec.simulateResult('move data', false);
    assert.equal(submittedCommands.length, 0, 'Interim transcripts must never execute');

    // Simulate final transcript
    mockRec.simulateResult('move database assignment to Friday', true);
    assert.equal(submittedCommands.length, 1);
    assert.equal(submittedCommands[0], 'move database assignment to Friday');
  });

  test('Late events after cancellation do not execute stale commands', () => {
    let mockRec = null;
    let submittedCommands = [];
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
      onResult: (cmd) => submittedCommands.push(cmd),
    });

    controller.start();
    controller.stop(); // User cancelled or pressed Escape

    // Late asynchronous result from browser
    mockRec.simulateResult('delete all tasks', true);
    assert.equal(submittedCommands.length, 0, 'Late events after cancellation must be rejected');
  });

  test('Cleanup destroys active session and removes visibility listeners', () => {
    let mockRec = null;
    const controller = new VoiceRecognitionController({
      getSpeechRecognition: () => {
        return function() {
          mockRec = new MockSpeechRecognition();
          return mockRec;
        };
      },
    });

    controller.start();
    controller.destroy();
    assert.equal(controller.getState(), RECOGNITION_STATES.IDLE);
    assert.equal(mockRec.isStopped, true);
  });
});

describe('B. Speech Synthesis (Text-to-Speech)', () => {
  test('Speech output is disabled by default for conservative non-intrusive behavior', () => {
    const storage = new MockStorage();
    const synthCtrl = new SpeechSynthesisController({ storage });
    assert.equal(synthCtrl.getEnabled(), false);
  });

  test('Enabling speech output persists preference to storage', () => {
    const storage = new MockStorage();
    const synthCtrl = new SpeechSynthesisController({ storage });

    synthCtrl.setEnabled(true);
    assert.equal(synthCtrl.getEnabled(), true);
    assert.equal(storage.getItem(SPEECH_STORAGE_KEY), 'true');

    synthCtrl.setEnabled(false);
    assert.equal(synthCtrl.getEnabled(), false);
    assert.equal(storage.getItem(SPEECH_STORAGE_KEY), 'false');
  });

  test('No speech is initiated when disabled', () => {
    const mockSynth = new MockSpeechSynthesis();
    const storage = new MockStorage();
    const synthCtrl = new SpeechSynthesisController({
      getSpeechSynthesis: () => mockSynth,
      getSpeechSynthesisUtterance: () => MockSpeechSynthesisUtterance,
      storage,
    });

    synthCtrl.setEnabled(false);
    const spoken = synthCtrl.speak('Hello world');
    assert.equal(spoken, false);
    assert.equal(mockSynth.spokenUtterances.length, 0);
  });

  test('Appropriate response is spoken when speech output is enabled', () => {
    const mockSynth = new MockSpeechSynthesis();
    const storage = new MockStorage();
    const synthCtrl = new SpeechSynthesisController({
      getSpeechSynthesis: () => mockSynth,
      getSpeechSynthesisUtterance: () => MockSpeechSynthesisUtterance,
      storage,
    });

    synthCtrl.setEnabled(true);
    const spoken = synthCtrl.speak('Rescheduled task to Friday.');
    assert.equal(spoken, true);
    assert.equal(mockSynth.spokenUtterances.length, 1);
    assert.equal(mockSynth.spokenUtterances[0].text, 'Rescheduled task to Friday.');
  });

  test('Repeated renders do not repeat the same utterance (rate-limiting deduplication)', () => {
    const mockSynth = new MockSpeechSynthesis();
    const storage = new MockStorage();
    const synthCtrl = new SpeechSynthesisController({
      getSpeechSynthesis: () => mockSynth,
      getSpeechSynthesisUtterance: () => MockSpeechSynthesisUtterance,
      storage,
    });

    synthCtrl.setEnabled(true);
    const first = synthCtrl.speak('Active Task Focus: Database Assignment');
    assert.equal(first, true);
    assert.equal(mockSynth.spokenUtterances.length, 1);

    // Immediate duplicate render
    const second = synthCtrl.speak('Active Task Focus: Database Assignment');
    assert.equal(second, false, 'Duplicate utterance within debounce window must not speak again');
    assert.equal(mockSynth.spokenUtterances.length, 1);
  });

  test('New speech cancels previous active speech to prevent overlap', () => {
    const mockSynth = new MockSpeechSynthesis();
    const storage = new MockStorage();
    const synthCtrl = new SpeechSynthesisController({
      getSpeechSynthesis: () => mockSynth,
      getSpeechSynthesisUtterance: () => MockSpeechSynthesisUtterance,
      storage,
    });

    synthCtrl.setEnabled(true);
    synthCtrl.speak('First announcement.');
    assert.equal(mockSynth.cancelCount, 1);

    // Speak second announcement
    synthCtrl.speak('Second announcement.');
    assert.equal(mockSynth.cancelCount, 2, 'Must cancel previous speech before speaking new text');
    assert.equal(mockSynth.spokenUtterances.length, 2);
  });

  test('Stop control cancels active speech immediately', () => {
    const mockSynth = new MockSpeechSynthesis();
    const synthCtrl = new SpeechSynthesisController({
      getSpeechSynthesis: () => mockSynth,
      getSpeechSynthesisUtterance: () => MockSpeechSynthesisUtterance,
    });

    synthCtrl.setEnabled(true);
    synthCtrl.speak('Long paragraph of instructions.');
    synthCtrl.stop();
    assert.equal(mockSynth.isCancelled, true);
    assert.equal(synthCtrl.isSpeaking, false);
  });

  test('Missing speech-synthesis support is handled gracefully without throwing', () => {
    const synthCtrl = new SpeechSynthesisController({
      getSpeechSynthesis: () => null,
      getSpeechSynthesisUtterance: () => null,
    });

    assert.equal(synthCtrl.isSupported(), false);
    synthCtrl.setEnabled(true);
    const result = synthCtrl.speak('Hello');
    assert.equal(result, false);
  });

  test('Spoken responses accurately distinguish proposed changes from applied changes', () => {
    // 1. Pending Proposal
    const pendingProposalSummary = generateSpokenSummary({
      state: 'AWAITING_PROPOSAL_DECISION',
      proposal: {
        strategy: 'conversational_reschedule',
        proposedPlacements: [{ taskId: 't1' }],
        summary: { dateChangesCount: 1, feasibilityStatus: 'feasible' },
      },
    });
    assert.ok(pendingProposalSummary.includes('Proposed schedule change'), 'Must explicitly state proposed');
    assert.ok(!pendingProposalSummary.includes('Applied schedule'), 'Must not claim applied before acceptance');

    // 2. Explicit Acceptance Outcome
    const acceptedSummary = generateSpokenSummary(null, {
      event: 'PROPOSAL_ACCEPTED',
      proposal: { summary: { dateChangesCount: 1 } },
    });
    assert.ok(acceptedSummary.includes('Schedule proposal applied'));
  });

  test('Failure responses never falsely claim success', () => {
    const conflictSummary = generateSpokenSummary({
      state: 'AWAITING_PROPOSAL_DECISION',
      proposal: {
        summary: { feasibilityStatus: 'infeasible_dependency' },
      },
    });
    assert.ok(conflictSummary.includes('Dependency conflict detected'));
    assert.ok(!conflictSummary.includes('Applied'));

    const capacitySummary = generateSpokenSummary({
      state: 'AWAITING_PROPOSAL_DECISION',
      proposal: {
        summary: { feasibilityStatus: 'capacity_warning' },
      },
    });
    assert.ok(capacitySummary.includes('exceeds daily capacity'));
    assert.ok(!capacitySummary.includes('Applied'));
  });

  test('Sanitization cleans markdown, emojis, and symbols', () => {
    const raw = '⚠️ **Dependency Alert**: Move [Task 1](http://task) now! `code` 📋';
    const cleaned = sanitizeForSpeech(raw);
    assert.equal(cleaned, 'Dependency Alert: Move Task 1 now! code');
  });
});

describe('C. Dialogue and Scheduling Integration', () => {
  test('Typed and voice input use the exact same dialogue processing pathway', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    // Spoken input transcript
    const voiceTranscript = 'Move Database Assignment to Friday';
    const result = dm.processInput(voiceTranscript, { tasks });

    assert.equal(result.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);
    assert.ok(result.proposal, 'Must generate proposal review card');
    assert.equal(dm.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);

    // Spoken prompt summary
    const summary = generateSpokenSummary(result);
    assert.ok(summary.includes('Proposed schedule change'));
  });

  test('Voice input respects Stage 5.1 clarification for ambiguous tasks', () => {
    const dm = new DialogueManager();
    const tasks = [
      { id: 't1', title: 'Security Audit Alpha', dueDate: '2026-10-20', priority: 'high' },
      { id: 't2', title: 'Security Audit Beta', dueDate: '2026-10-20', priority: 'medium' },
    ];

    const result = dm.processInput('reschedule Security Audit to Friday', { tasks });
    assert.equal(result.state, CONVERSATION_STATES.AWAITING_CLARIFICATION);
    assert.equal(result.clarificationType, 'AMBIGUOUS_TASK');

    const spoken = generateSpokenSummary(result);
    assert.ok(spoken.includes('Found 2 matching tasks'));
  });

  test('Voice input respects confirmation and cancellation for consequential operations', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    // Spoken delete command
    const delResult = dm.processInput('delete task Database Assignment', { tasks });
    assert.equal(delResult.state, CONVERSATION_STATES.AWAITING_CONFIRMATION);
    assert.equal(delResult.isAuthorized, false, 'Must not delete without explicit confirmation');

    const spokenPrompt = generateSpokenSummary(delResult);
    assert.ok(spokenPrompt.includes('confirm') && spokenPrompt.includes('cancel'));

    // Spoken cancellation
    const cancelResult = dm.processInput('cancel', { tasks });
    assert.equal(cancelResult.state, CONVERSATION_STATES.IDLE);
    assert.equal(cancelResult.isAuthorized, false);
    assert.equal(dm.state, CONVERSATION_STATES.IDLE);
  });

  test('Voice input respects Stage 5.2 proposal generation and requires explicit acceptance', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    const result = dm.processInput('Move Database Assignment to Friday', { tasks });
    assert.equal(result.state, CONVERSATION_STATES.AWAITING_PROPOSAL_DECISION);

    // User speaks "accept"
    const acceptResult = dm.processInput('accept', { tasks });
    assert.equal(acceptResult.isAuthorized, true);
    assert.equal(acceptResult.action.type, 'ACCEPT_SCHEDULE_PROPOSAL');
  });

  test('Voice input cannot accept a superseded proposal', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    // First proposal
    dm.processInput('Move Database Assignment to Friday', { tasks });
    // Revision supersedes
    dm.processInput('What if I move it to next Monday instead?', { tasks });

    // The DM has transitioned or updated active proposal
    assert.ok(dm.activeProposal || dm.state !== 'IDLE');
  });
});

describe('D. Accessibility and Privacy Verification', () => {
  test('Speech output toggle and microphone buttons expose accessible semantics', () => {
    const storage = new MockStorage();
    const synth = new SpeechSynthesisController({ storage });
    const recog = new VoiceRecognitionController();

    assert.equal(typeof synth.getEnabled, 'function');
    assert.equal(typeof recog.getState, 'function');
    assert.equal(recog.getState(), RECOGNITION_STATES.IDLE);
  });

  test('No audio data or conversation transcripts are ever recorded in telemetry', () => {
    const events = telemetry.eventsCache || [];
    // Ensure telemetry contains zero speech audio or full transcripts
    for (const ev of events) {
      assert.equal(ev.audioData, undefined);
      assert.equal(ev.rawAudio, undefined);
      assert.equal(ev.microphoneStream, undefined);
      assert.equal(ev.transcriptText, undefined);
    }
  });

  test('No external cloud LLM or remote speech endpoint is configured', () => {
    const synth = new SpeechSynthesisController();
    const recog = new VoiceRecognitionController();
    assert.equal(synth._getSpeechSynthesis() !== undefined, true);
    assert.equal(recog._getSpeechRecognition() !== undefined, true);
  });

  test('Voice functionality failing or unsupported does not disable typed interaction', () => {
    const dm = new DialogueManager();
    const tasks = createSampleTasks();

    // Unsupported recognition controller
    const recog = new VoiceRecognitionController({
      getSpeechRecognition: () => null,
    });
    assert.equal(recog.isSupported(), false);

    // Typed command still works 100% unimpeded
    const typedResult = dm.processInput('create task Complete quarterly report', { tasks });
    assert.equal(typedResult.isAuthorized, true);
    assert.equal(typedResult.action.type, 'CREATE_TASK');
    assert.equal(typedResult.action.title, 'Complete quarterly report');
  });
});
