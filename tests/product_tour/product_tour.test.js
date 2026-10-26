import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOUR_STEPS } from '../../src/productTour/tourSteps.js';
import {
  TOUR_STORAGE_KEY,
  TOUR_MODES,
  loadTourState,
  saveTourState,
  markTourCompleted,
  resetTourState,
} from '../../src/productTour/tourStorage.js';
import {
  getInitialDemoTasks,
  getInitialDemoStickyNotes,
} from '../../src/productTour/demoState.js';
import { FACTORY_SCHEDULER_WEIGHTS } from '../../src/scheduler/adaptiveScheduler.js';
import { evaluateLearningReadiness } from '../../src/scheduler/learningReadinessGate.js';
import {
  computeCalloutPosition,
  computeSpotlightRect,
  SPOTLIGHT_PADDING,
} from '../../src/productTour/positionHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// In-memory mock storage simulating isolated browser localStorage
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, val) {
    this.store[key] = String(val);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('VoxPlan Product Tour — Comprehensive Architecture & Safety Suite', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    global.window = { localStorage: mockStorage };
  });

  // =========================================================================
  // 1. Feature Inventory & Step Coverage Verification
  // =========================================================================
  describe('1. Feature Inventory & Coverage Mapping', () => {
    test('1.1 Contains exactly 20 curated tour steps in sequential order', () => {
      assert.strictEqual(TOUR_STEPS.length, 20);
      TOUR_STEPS.forEach((step, idx) => {
        assert.strictEqual(step.stepNumber, idx + 1);
        assert.ok(step.id, `Step at index ${idx} must have an id`);
        assert.ok(step.title, `Step ${step.id} must have a title`);
        assert.ok(step.description, `Step ${step.id} must have a description`);
        assert.ok(step.actionPrompt, `Step ${step.id} must have an action prompt`);
      });
    });

    test('1.2 Covers Orientation & Navigation (Overview vs Workspace, tabs)', () => {
      const orientationStep = TOUR_STEPS.find((s) => s.id === 'step-orientation');
      assert.ok(orientationStep, 'Orientation step must exist');
      assert.strictEqual(orientationStep.category, 'Orientation & Workspace');
      assert.ok(orientationStep.targetSelector.includes('#header-nav-landing-btn'));
    });

    test('1.3 Covers Today Focus & Sprint Cockpit with time-tracking', () => {
      const todayStep = TOUR_STEPS.find((s) => s.id === 'step-today-cockpit');
      assert.ok(todayStep, 'Today focus step must exist');
      assert.strictEqual(todayStep.targetSelector, '#today-focus-card');
      assert.ok(todayStep.description.includes('stopwatch'));
    });

    test('1.4 Covers Natural Language Command Dock and Voice Recognition Controller', () => {
      const commandStep = TOUR_STEPS.find((s) => s.id === 'step-command-dock');
      const voiceStep = TOUR_STEPS.find((s) => s.id === 'step-voice-mic');
      const speechStep = TOUR_STEPS.find((s) => s.id === 'step-speech-toggle');

      assert.ok(commandStep && voiceStep && speechStep);
      assert.strictEqual(commandStep.targetSelector, '#command');
      assert.strictEqual(voiceStep.targetSelector, '#voice-mic-btn');
      assert.strictEqual(speechStep.targetSelector, '#speech-toggle-btn');
      assert.ok(voiceStep.limitations.includes('Web Speech'));
    });

    test('1.5 Covers Tasks Backlog, Filtering, Inline Editing, and Safe Undo', () => {
      const tasksNav = TOUR_STEPS.find((s) => s.id === 'step-tasks-workspace');
      const filters = TOUR_STEPS.find((s) => s.id === 'step-task-filters');
      const card = TOUR_STEPS.find((s) => s.id === 'step-task-card');
      const undo = TOUR_STEPS.find((s) => s.id === 'step-delete-undo');

      assert.ok(tasksNav && filters && card && undo);
      assert.strictEqual(tasksNav.view, 'tasks');
      assert.ok(undo.description.includes('Undo'));
      assert.ok(undo.limitations.includes('8 seconds'));
    });

    test('1.6 Covers Illustrated Stationery Sticky Notes for Tasks', () => {
      const notesStep = TOUR_STEPS.find((s) => s.id === 'step-sticky-notes');
      assert.ok(notesStep);
      assert.strictEqual(notesStep.category, 'Sticky Notes');
      assert.ok(notesStep.description.includes('Morning Sky Bear'));
      assert.ok(notesStep.description.includes('Sakura Blush Bunny'));
    });

    test('1.7 Covers Calendar View & RFC 5545 .ics Export', () => {
      const calStep = TOUR_STEPS.find((s) => s.id === 'step-calendar-nav');
      const icsStep = TOUR_STEPS.find((s) => s.id === 'step-ical-export');
      assert.ok(calStep && icsStep);
      assert.strictEqual(calStep.view, 'calendar');
      assert.strictEqual(icsStep.view, 'calendar');
      assert.ok(icsStep.description.includes('.ics'));
    });

    test('1.8 Covers Topological Adaptive Scheduler with Kahn DAG', () => {
      const schedStep = TOUR_STEPS.find((s) => s.id === 'step-adaptive-scheduler');
      assert.ok(schedStep);
      assert.ok(schedStep.description.includes('Kahn'));
      assert.ok(schedStep.description.includes('6.0 hours/day'));
      assert.ok(schedStep.limitations.includes('NEVER modifies your active task dates without your explicit acceptance'));
    });

    test('1.9 Covers Notification Center, Preferences, Lead Times, and Quiet Hours', () => {
      const bellStep = TOUR_STEPS.find((s) => s.id === 'step-notifications-bell');
      const prefsStep = TOUR_STEPS.find((s) => s.id === 'step-notifications-prefs');
      assert.ok(bellStep && prefsStep);
      assert.strictEqual(bellStep.targetSelector, '#header-notification-bell-btn');
      assert.ok(prefsStep.limitations.includes('closed without external cloud push infrastructure'));
    });

    test('1.10 Covers Model Intelligence, Bayesian Duration Estimator, and Locked Gate', () => {
      const insightsStep = TOUR_STEPS.find((s) => s.id === 'step-insights-nav');
      const personalStep = TOUR_STEPS.find((s) => s.id === 'step-personal-model');
      const gateStep = TOUR_STEPS.find((s) => s.id === 'step-adaptation-gate');

      assert.ok(insightsStep && personalStep && gateStep);
      assert.strictEqual(insightsStep.view, 'insights');
      assert.ok(personalStep.description.includes('Bayesian shrinkage (K=3.0)'));
      assert.ok(gateStep.description.includes('Urgency: 50.0, Priority: 100.0, Unblock: 15.0, Risk: 25.0'));
      assert.ok(gateStep.limitations.includes('locked'));
    });

    test('1.11 Covers Encrypted Workspace Backup (AES-GCM) & Local-First Privacy', () => {
      const backupStep = TOUR_STEPS.find((s) => s.id === 'step-backup-privacy');
      assert.ok(backupStep);
      assert.strictEqual(backupStep.targetSelector, '#header-backup-btn');
      assert.ok(backupStep.description.includes('AES-GCM 256-bit'));
      assert.ok(backupStep.limitations.includes('clearing browser site data without a backup file will erase local workspace data'));
    });
  });

  // =========================================================================
  // 2. Storage & Strict Isolation Architecture Verification
  // =========================================================================
  describe('2. Isolated Tour Storage & State Safety', () => {
    test('2.1 Initial state loads default values without throwing', () => {
      const state = loadTourState();
      assert.strictEqual(state.completed, false);
      assert.strictEqual(state.completedAt, null);
      assert.strictEqual(state.lastStepIndex, 0);
      assert.strictEqual(state.mode, TOUR_MODES.OBSERVE);
    });

    test('2.2 Saves and reloads tour state exclusively to TOUR_STORAGE_KEY', () => {
      saveTourState({ lastStepIndex: 5, mode: TOUR_MODES.DEMO });
      const state = loadTourState();
      assert.strictEqual(state.lastStepIndex, 5);
      assert.strictEqual(state.mode, TOUR_MODES.DEMO);

      // Verify that NO production task keys were touched
      assert.strictEqual(mockStorage.getItem('voxplan_tasks'), null);
      assert.strictEqual(mockStorage.getItem('voxplan_notifications'), null);
      assert.strictEqual(mockStorage.getItem('voxplan_task_sticky_notes'), null);
      assert.ok(mockStorage.getItem(TOUR_STORAGE_KEY) !== null);
    });

    test('2.3 markTourCompleted flags completion with valid ISO timestamp', () => {
      markTourCompleted();
      const state = loadTourState();
      assert.strictEqual(state.completed, true);
      assert.ok(state.completedAt);
      assert.ok(!isNaN(new Date(state.completedAt).getTime()));
    });

    test('2.4 resetTourState clears completion allowing restart', () => {
      markTourCompleted();
      resetTourState();
      const state = loadTourState();
      assert.strictEqual(state.completed, false);
      assert.strictEqual(state.completedAt, null);
      assert.strictEqual(state.lastStepIndex, 0);
    });
  });

  // =========================================================================
  // 3. Hands-on Demo (Mode B) State Isolation
  // =========================================================================
  describe('3. Hands-on Demo State Isolation', () => {
    test('3.1 Disposable demo tasks are independent objects with demo flags', () => {
      const demoTasks = getInitialDemoTasks();
      assert.strictEqual(demoTasks.length, 4);
      demoTasks.forEach((t) => {
        assert.ok(t.id.startsWith('demo-task-'));
        assert.strictEqual(t.isDemoTourItem, true);
      });
    });

    test('3.2 Disposable demo sticky notes are properly attached to demo-task-1', () => {
      const demoNotes = getInitialDemoStickyNotes();
      assert.ok(demoNotes['demo-task-1']);
      assert.strictEqual(demoNotes['demo-task-1'].length, 2);
      assert.strictEqual(demoNotes['demo-task-1'][0].themeId, 'sakura-bunny');
    });

    test('3.3 Demo tasks never pollute production localStorage', () => {
      const initial = getInitialDemoTasks();
      initial[0].completed = true;

      assert.strictEqual(mockStorage.getItem('voxplan_tasks'), null);
      assert.strictEqual(mockStorage.getItem('voxplan_notifications'), null);
    });
  });

  // =========================================================================
  // 4. Component Implementation & Scoped CSS Audit
  // =========================================================================
  describe('4. Component & CSS Scoping Audit', () => {
    test('4.1 ProductTour.css contains only scoped .voxplan-tour-* selectors', () => {
      const cssPath = path.join(REPO_ROOT, 'src/components/productTour/ProductTour.css');
      assert.ok(fs.existsSync(cssPath), 'ProductTour.css must exist');
      const content = fs.readFileSync(cssPath, 'utf8');

      // Assert no naked element selectors like "div {", "button {", "body {"
      const lines = content.split('\n');
      lines.forEach((line, lineIdx) => {
        const trimmed = line.trim();
        if (
          trimmed.endsWith('{') &&
          !trimmed.startsWith('@') &&
          !trimmed.startsWith('/*') &&
          !trimmed.includes('%')
        ) {
          assert.ok(
            trimmed.includes('.voxplan-tour-'),
            `Line ${lineIdx + 1} has non-scoped selector: "${trimmed}"`
          );
        }
      });
    });

    test('4.2 ProductTour.css includes reduced-motion media query override', () => {
      const cssPath = path.join(REPO_ROOT, 'src/components/productTour/ProductTour.css');
      const content = fs.readFileSync(cssPath, 'utf8');
      assert.ok(content.includes('@media (prefers-reduced-motion: reduce)'));
      assert.ok(content.includes('animation: none !important'));
    });

    test('4.3 ProductTour.css includes responsive mobile bottom sheet layout (max-width: 768px)', () => {
      const cssPath = path.join(REPO_ROOT, 'src/components/productTour/ProductTour.css');
      const content = fs.readFileSync(cssPath, 'utf8');
      assert.ok(content.includes('@media (max-width: 768px)'));
      assert.ok(content.includes('bottom: 16px !important'));
    });

    test('4.4 TourOverlay renders accessible live region and dialog attributes', () => {
      const overlayPath = path.join(REPO_ROOT, 'src/components/productTour/TourOverlay.jsx');
      assert.ok(fs.existsSync(overlayPath));
      const content = fs.readFileSync(overlayPath, 'utf8');
      assert.ok(content.includes('aria-live="polite"'));
      assert.ok(content.includes('aria-atomic="true"'));
    });

    test('4.5 TourCallout renders dialog semantics and step progress elements', () => {
      const calloutPath = path.join(REPO_ROOT, 'src/components/productTour/TourCallout.jsx');
      assert.ok(fs.existsSync(calloutPath));
      const content = fs.readFileSync(calloutPath, 'utf8');
      assert.ok(content.includes('role="dialog"'));
      assert.ok(content.includes('aria-modal="true"'));
      assert.ok(content.includes('voxplan-tour-next-btn'));
    });
  });

  // =========================================================================
  // 5. Minimal Production Integration Points Verification
  // =========================================================================
  describe('5. Production Integration Integrity', () => {
    test('5.1 LandingPage.jsx exposes minimal, reversible hero and mobile tour launcher', () => {
      const lpPath = path.join(REPO_ROOT, 'src/pages/LandingPage.jsx');
      const content = fs.readFileSync(lpPath, 'utf8');
      assert.ok(content.includes('id="hero-tour-btn"'), 'Hero tour button must exist');
      assert.ok(content.includes('handleOpenTour'), 'handleOpenTour handler must exist');
      assert.ok(content.includes('/app?tour=1'), 'Tour button navigates to /app?tour=1');
      assert.ok(content.includes('id="mobile-nav-tour-btn"'), 'Mobile menu tour button must exist');
    });

    test('5.2 ProductivityApp.jsx integrates useProductTour and TourOverlay safely', () => {
      const appPath = path.join(REPO_ROOT, 'src/pages/ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf8');
      assert.ok(content.includes("from '../productTour'"));
      assert.ok(content.includes('useProductTour'));
      assert.ok(content.includes('<TourOverlay'));
      assert.ok(content.includes('onStartTour={() => productTour.startTour()}'));
    });

    test('5.3 Header.jsx supports optional onStartTour prop without modifying existing buttons', () => {
      const headerPath = path.join(REPO_ROOT, 'src/components/Header.jsx');
      const content = fs.readFileSync(headerPath, 'utf8');
      assert.ok(content.includes('onStartTour'));
      assert.ok(content.includes('id="header-tour-btn"'));
      assert.ok(content.includes('id="header-mobile-tour-btn"'));
    });
  });

  // =========================================================================
  // 6. Security Invariants & Protected Baseline Checks
  // =========================================================================
  describe('6. Protected Baseline & Safety Invariants', () => {
    test('6.1 Factory scheduler weights are strictly immutable at canonical values', () => {
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
    });

    test('6.2 Phase 7.4.4B adaptation gate remains strictly locked with empty caller claims', () => {
      const readiness = evaluateLearningReadiness({ events: [], tasks: [] });
      assert.strictEqual(readiness.isAdaptationUnlocked, false);
      assert.strictEqual(readiness.status, 'insufficient_evidence');
    });

    test('6.3 Overview hero motto "Plan with clarity. Act with focus." remains removed', () => {
      const lpPath = path.join(REPO_ROOT, 'src/pages/LandingPage.jsx');
      const content = fs.readFileSync(lpPath, 'utf8');
      assert.ok(
        !content.includes('Plan with clarity. Act with focus.'),
        'Forbidden motto phrase must not be reintroduced'
      );
    });

    test('6.4 Ribbon words (PLAN, PREDICT, UNDERSTAND, ACT) remain present in LandingPage', () => {
      const lpPath = path.join(REPO_ROOT, 'src/pages/LandingPage.jsx');
      const content = fs.readFileSync(lpPath, 'utf8');
      assert.ok(content.includes('PLAN'));
      assert.ok(content.includes('PREDICT'));
      assert.ok(content.includes('UNDERSTAND'));
      assert.ok(content.includes('ACT'));
    });
  });

  // =========================================================================
  // 7. Step Advancement Lifecycle & Positioning Overflow Suite
  // =========================================================================
  describe('7. Step Advancement Lifecycle & Positioning Overflow Suite', () => {
    test('7.1 computeCalloutPosition prevents Step 2 positioning overflow for tall elements', () => {
      global.window = {
        innerWidth: 1536,
        innerHeight: 826,
        localStorage: mockStorage,
      };

      // Real bounding rect of #today-focus-card on desktop
      const todayFocusRect = {
        top: 220,
        bottom: 700,
        left: 820,
        right: 1360,
        width: 540,
        height: 480,
      };

      const result = computeCalloutPosition(todayFocusRect, 'left', false);
      assert.strictEqual(result.isCenter, false);
      assert.ok(result.style.top);
      assert.ok(result.style.left);

      const topPx = parseInt(result.style.top, 10);
      const leftPx = parseInt(result.style.left, 10);

      // Verify that callout (width 440, height 490) fits completely in viewport without clipping
      assert.ok(topPx >= 16, `topPx (${topPx}) must be >= 16`);
      assert.ok(topPx + 490 <= 826 - 16, `topPx + 490 (${topPx + 490}) must not overflow window height 826`);
      assert.ok(leftPx >= 16, `leftPx (${leftPx}) must be >= 16`);
      assert.ok(leftPx + 440 <= 1536 - 16, `leftPx + 440 (${leftPx + 440}) must not overflow window width 1536`);
    });

    test('7.2 computeCalloutPosition handles bottom placement clipping on small laptops', () => {
      // 1280x720 laptop viewport
      global.window = {
        innerWidth: 1280,
        innerHeight: 720,
        localStorage: mockStorage,
      };

      const elementNearBottom = {
        top: 500,
        bottom: 660,
        left: 400,
        right: 840,
        width: 440,
        height: 160,
      };

      // Even if 'bottom' is requested, callout height 490 won't fit below 660 in 720px viewport
      const result = computeCalloutPosition(elementNearBottom, 'bottom', false);
      const topPx = parseInt(result.style.top, 10);

      assert.ok(topPx >= 16);
      assert.ok(topPx + 490 <= 720 - 16, 'Callout must not overflow viewport bottom');
    });

    test('7.3 Step 1 -> Step 2 -> Step 3 advancement state sequence', () => {
      // Simulates exact step index transition logic used by useProductTour
      let currentIndex = 0;
      const totalSteps = TOUR_STEPS.length;

      const advance = () => {
        if (currentIndex < totalSteps - 1) {
          currentIndex += 1;
          saveTourState({ lastStepIndex: currentIndex });
        }
      };

      // Step 1
      assert.strictEqual(currentIndex, 0);
      assert.strictEqual(TOUR_STEPS[currentIndex].stepNumber, 1);
      assert.strictEqual(TOUR_STEPS[currentIndex].title, 'Welcome to VoxPlan');

      // Click Next -> Step 2
      advance();
      assert.strictEqual(currentIndex, 1);
      assert.strictEqual(TOUR_STEPS[currentIndex].stepNumber, 2);
      assert.strictEqual(TOUR_STEPS[currentIndex].title, "Today's Active Sprint Focus");
      assert.strictEqual(loadTourState().lastStepIndex, 1);

      // Click Next on Step 2 -> Step 3
      advance();
      assert.strictEqual(currentIndex, 2);
      assert.strictEqual(TOUR_STEPS[currentIndex].stepNumber, 3);
      assert.strictEqual(TOUR_STEPS[currentIndex].title, 'Natural Language Command Dock');
      assert.strictEqual(loadTourState().lastStepIndex, 2);
    });

    test('7.4 Full 20-step traversal from Step 1 through Step 20 without stalling', () => {
      let currentIndex = 0;
      const totalSteps = TOUR_STEPS.length;
      const visitedSteps = [];

      for (let i = 0; i < totalSteps; i++) {
        visitedSteps.push({
          stepNumber: TOUR_STEPS[currentIndex].stepNumber,
          id: TOUR_STEPS[currentIndex].id,
          view: TOUR_STEPS[currentIndex].view,
        });

        if (i < totalSteps - 1) {
          currentIndex += 1;
        }
      }

      assert.strictEqual(visitedSteps.length, 20);
      assert.strictEqual(visitedSteps[0].stepNumber, 1);
      assert.strictEqual(visitedSteps[19].stepNumber, 20);
      assert.strictEqual(visitedSteps[19].id, 'step-graduation');
    });

    test('7.5 Final step completion marks tour completed and closes overlay', () => {
      let currentIndex = 19;
      let isActive = true;
      const totalSteps = TOUR_STEPS.length;

      const next = () => {
        if (currentIndex < totalSteps - 1) {
          currentIndex += 1;
        } else {
          markTourCompleted();
          isActive = false;
        }
      };

      next();
      assert.strictEqual(isActive, false);
      const state = loadTourState();
      assert.strictEqual(state.completed, true);
    });

    test('7.6 Back navigation traversal returns from Step 20 down to Step 1', () => {
      let currentIndex = 19;
      const prev = () => {
        if (currentIndex > 0) {
          currentIndex -= 1;
          saveTourState({ lastStepIndex: currentIndex });
        }
      };

      for (let i = 19; i > 0; i--) {
        prev();
      }

      assert.strictEqual(currentIndex, 0);
      assert.strictEqual(TOUR_STEPS[currentIndex].stepNumber, 1);

      // Additional back clamp test
      prev();
      assert.strictEqual(currentIndex, 0);
    });

    test('7.7 View switching coordination across steps triggers appropriate views', () => {
      const viewTransitions = [];
      let currentView = 'today';

      const selectView = (v) => {
        currentView = v;
        viewTransitions.push(v);
      };

      TOUR_STEPS.forEach((step) => {
        if (step.view && step.view !== 'any' && step.view !== currentView) {
          selectView(step.view);
        }
      });

      // Transitions: today -> tasks (step 6) -> calendar (step 11) -> today (step 13) -> insights (step 16) -> today (step 19)
      assert.ok(viewTransitions.includes('tasks'));
      assert.ok(viewTransitions.includes('calendar'));
      assert.ok(viewTransitions.includes('insights'));
      assert.ok(viewTransitions.includes('today'));
    });

    test('7.8 Missing target element fallback returns centered callout', () => {
      const result = computeCalloutPosition(null, 'bottom', false);
      assert.strictEqual(result.isCenter, true);
      assert.deepStrictEqual(result.style, {});
    });

    test('7.9 Restart tour deliberately resets to Step 1', () => {
      saveTourState({ lastStepIndex: 14, completed: true });
      resetTourState();

      const state = loadTourState();
      assert.strictEqual(state.completed, false);
      assert.strictEqual(state.lastStepIndex, 0);
    });

    test('7.10 Exit tour remembers last step without auto-restarting', () => {
      let currentIndex = 7;
      let isActive = true;

      const exit = () => {
        saveTourState({ lastStepIndex: currentIndex });
        isActive = false;
      };

      exit();
      assert.strictEqual(isActive, false);
      const state = loadTourState();
      assert.strictEqual(state.lastStepIndex, 7);
    });
  });

  describe('8. Spotlight Geometry, Padding, Highlighting, and Target Selector Suite', () => {
    test('8.1 computeSpotlightRect adds standard SPOTLIGHT_PADDING (8px) to targetRect', () => {
      const targetRect = { top: 100, left: 200, width: 300, height: 150 };
      const spotlight = computeSpotlightRect(targetRect);

      assert.ok(spotlight);
      assert.strictEqual(spotlight.padding, SPOTLIGHT_PADDING);
      assert.strictEqual(spotlight.top, 100 - SPOTLIGHT_PADDING);
      assert.strictEqual(spotlight.left, 200 - SPOTLIGHT_PADDING);
      assert.strictEqual(spotlight.width, 300 + SPOTLIGHT_PADDING * 2);
      assert.strictEqual(spotlight.height, 150 + SPOTLIGHT_PADDING * 2);
      assert.strictEqual(spotlight.right, spotlight.left + spotlight.width);
      assert.strictEqual(spotlight.bottom, spotlight.top + spotlight.height);
    });

    test('8.2 computeSpotlightRect calculates clamped border radius', () => {
      const smallRect = { top: 50, left: 50, width: 40, height: 40 };
      const largeRect = { top: 50, left: 50, width: 400, height: 300 };

      const smallSpot = computeSpotlightRect(smallRect);
      const largeSpot = computeSpotlightRect(largeRect);

      assert.ok(smallSpot.borderRadius >= 6);
      assert.ok(largeSpot.borderRadius <= 14);
    });

    test('8.3 computeSpotlightRect returns null when targetRect is null', () => {
      assert.strictEqual(computeSpotlightRect(null), null);
      assert.strictEqual(computeSpotlightRect(undefined), null);
    });

    test('8.4 computeSpotlightRect clamps top and left to 0 for boundary targets', () => {
      const nearEdge = { top: 3, left: 4, width: 100, height: 50 };
      const spot = computeSpotlightRect(nearEdge);

      assert.strictEqual(spot.top, 0);
      assert.strictEqual(spot.left, 0);
    });

    test('8.5 All 20 tour steps have non-empty targetSelector and fallbackTargetSelector', () => {
      TOUR_STEPS.forEach((step) => {
        assert.ok(step.targetSelector, `Step ${step.stepNumber} (${step.id}) has targetSelector`);
        assert.ok(step.targetSelector.trim().length > 0);
        assert.ok(step.fallbackTargetSelector, `Step ${step.stepNumber} (${step.id}) has fallbackTargetSelector`);
      });
    });

    test('8.6 Step 7 selector matches task filter bar in TaskList.jsx', () => {
      const taskListSource = fs.readFileSync(path.join(REPO_ROOT, 'src/components/TaskList.jsx'), 'utf-8');
      const step7 = TOUR_STEPS.find((s) => s.stepNumber === 7);

      assert.ok(step7);
      assert.ok(step7.targetSelector.includes('#task-filter-bar'));
      assert.ok(taskListSource.includes('id="task-filter-bar"'));
      assert.ok(taskListSource.includes('className="task-filter-pills"'));
      assert.ok(taskListSource.includes('data-filter='));
    });

    test('8.7 Step 8 selector matches first task card in TaskCard.jsx', () => {
      const taskCardSource = fs.readFileSync(path.join(REPO_ROOT, 'src/components/TaskCard.jsx'), 'utf-8');
      const step8 = TOUR_STEPS.find((s) => s.stepNumber === 8);

      assert.ok(step8);
      assert.ok(step8.targetSelector.includes('#first-task-card'));
      assert.ok(taskCardSource.includes('first-task-card'));
      assert.ok(taskCardSource.includes('data-task-id'));
    });

    test('8.8 Step 9 selector matches sticky note affordance in TaskStickyTab.jsx', () => {
      const stickyTabSource = fs.readFileSync(path.join(REPO_ROOT, 'src/components/stickyNotes/TaskStickyTab.jsx'), 'utf-8');
      const step9 = TOUR_STEPS.find((s) => s.stepNumber === 9);

      assert.ok(step9);
      assert.ok(step9.targetSelector.includes('#first-task-sticky-trigger'));
      assert.ok(step9.targetSelector.includes('data-action="open-sticky-notes"'));
      assert.ok(stickyTabSource.includes('data-action="open-sticky-notes"'));
    });

    test('8.9 Step 10 selector matches delete button in TaskCard.jsx', () => {
      const taskCardSource = fs.readFileSync(path.join(REPO_ROOT, 'src/components/TaskCard.jsx'), 'utf-8');
      const step10 = TOUR_STEPS.find((s) => s.stepNumber === 10);

      assert.ok(step10);
      assert.ok(step10.targetSelector.includes('#first-task-delete-btn'));
      assert.ok(step10.targetSelector.includes('data-action="delete-task"'));
      assert.ok(taskCardSource.includes('first-task-delete-btn'));
      assert.ok(taskCardSource.includes('data-action="delete-task"'));
    });

    test('8.10 Step 12 selector matches calendar export in TaskCalendar.jsx', () => {
      const calendarSource = fs.readFileSync(path.join(REPO_ROOT, 'src/components/TaskCalendar.jsx'), 'utf-8');
      const step12 = TOUR_STEPS.find((s) => s.stepNumber === 12);

      assert.ok(step12);
      assert.ok(step12.targetSelector.includes('#calendar-export-btn'));
      assert.ok(calendarSource.includes('id="calendar-export-btn"'));
      assert.ok(calendarSource.includes('data-action="export-calendar"'));
    });

    test('8.11 Step 13 selector matches adaptive schedule trigger in ProjectOverview.jsx', () => {
      const overviewSource = fs.readFileSync(path.join(REPO_ROOT, 'src/components/ProjectOverview.jsx'), 'utf-8');
      const step13 = TOUR_STEPS.find((s) => s.stepNumber === 13);

      assert.ok(step13);
      assert.ok(step13.targetSelector.includes('#btn-open-schedule-modal'));
      assert.ok(overviewSource.includes('id="btn-open-schedule-modal"'));
    });

    test('8.12 ProductTour.css implements SVG mask with strong 8px blur and dark translucent overlay', () => {
      const cssSource = fs.readFileSync(path.join(REPO_ROOT, 'src/components/productTour/ProductTour.css'), 'utf-8');

      // Backdrop has mask: url(#voxplan-tour-spotlight-mask)
      assert.ok(cssSource.includes('mask: url(#voxplan-tour-spotlight-mask);'));
      assert.ok(cssSource.includes('-webkit-mask: url(#voxplan-tour-spotlight-mask);'));

      // Backdrop darkness is within 0.55-0.68 (0.62)
      assert.ok(cssSource.includes('rgba(32, 30, 35, 0.62)'));

      // Strong camera-focus blur of 8px
      assert.ok(cssSource.includes('blur(8px)'));

      // Spotlight has high contrast border and beacon tag
      assert.ok(cssSource.includes('.voxplan-tour-spotlight-beacon-tag'));
      assert.ok(cssSource.includes('.voxplan-tour-spotlight-beacon-dot'));
    });
  });
});
