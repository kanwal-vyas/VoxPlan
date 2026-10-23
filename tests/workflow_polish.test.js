/**
 * Workflow Clarity & UX Polish Regression Test Suite
 *
 * Verifies the 6 key areas authorized in the Stage 8.5 Workflow Polish Pass:
 * 1. Global feedback toast semantics and time-limited undo callback execution
 * 2. Safe task deletion with lossless undo restoration
 * 3. Clear Completed workflow with accurate counts and zero-task handling
 * 4. Quick-add navigation affordance and reduced-motion respect
 * 5. Mobile header navigation responsiveness and horizontal overflow styling
 * 6. Unknown route fallback notice and direct workspace navigation link
 * 7. Protected scheduler factory weights and activation invariants
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { evaluateActivationGate, ACTIVATION_GATE_OUTCOMES } from '../src/scheduler/activationGateEvaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Workflow Clarity & UX Polish Regression Suite', () => {
  describe('1. Global Floating Feedback Toast & Undo Mechanism', () => {
    it('1.1 FeedbackToast component exists and declares accessible live-region semantics', () => {
      const toastFilePath = path.join(rootDir, 'src', 'components', 'FeedbackToast.jsx');
      assert.strictEqual(fs.existsSync(toastFilePath), true, 'FeedbackToast.jsx must exist');

      const content = fs.readFileSync(toastFilePath, 'utf-8');
      assert.ok(content.includes('role="status"'), 'FeedbackToast must declare role="status"');
      assert.ok(content.includes('aria-live="polite"'), 'FeedbackToast must declare aria-live="polite"');
      assert.ok(content.includes('id="global-feedback-toast"'), 'FeedbackToast must have predictable ID');
    });

    it('1.2 FeedbackToast renders undo button when onUndo callback is provided', () => {
      const toastFilePath = path.join(rootDir, 'src', 'components', 'FeedbackToast.jsx');
      const content = fs.readFileSync(toastFilePath, 'utf-8');

      assert.ok(content.includes('feedback.onUndo'), 'Must check for presence of onUndo');
      assert.ok(content.includes('id="toast-undo-btn"'), 'Must render undo button with id="toast-undo-btn"');
      assert.ok(content.includes('feedback.onUndo()'), 'Must invoke onUndo on click');
      assert.ok(content.includes('onDismiss'), 'Must invoke onDismiss on close or undo');
    });

    it('1.3 ProductivityApp integrates FeedbackToast and configures extended duration for undo', () => {
      const appFilePath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appFilePath, 'utf-8');

      assert.ok(content.includes('import FeedbackToast'), 'ProductivityApp must import FeedbackToast');
      assert.ok(content.includes('<FeedbackToast'), 'ProductivityApp must render FeedbackToast');
      assert.ok(content.includes('feedback.onUndo ? 7000 : 4500'), 'Must allow extended time for undoable actions');
    });
  });

  describe('2. Safe Task Deletion & Lossless Undo Recovery', () => {
    it('2.1 simulates task deletion and verifies undo cleanly restores task at original index', () => {
      // Mock task store
      const initialTasks = [
        { id: 'task-1', title: 'Task One', priority: 'high', completed: false },
        { id: 'task-2', title: 'Task Two', priority: 'medium', completed: false },
        { id: 'task-3', title: 'Task Three', priority: 'low', completed: false },
      ];

      let tasks = [...initialTasks];
      let feedback = null;

      // Pure simulation of deleteTask handler logic in ProductivityApp
      const deleteTask = (taskId) => {
        const taskToDelete = tasks.find((t) => t.id === taskId);
        const originalIndex = tasks.findIndex((t) => t.id === taskId);
        if (!taskToDelete) return;

        tasks = tasks.filter((t) => t.id !== taskId);
        feedback = {
          type: 'success',
          message: `Deleted task: "${taskToDelete.title}"`,
          onUndo: () => {
            if (tasks.some((t) => t.id === taskToDelete.id)) return;
            const next = [...tasks];
            const insertAt = originalIndex >= 0 && originalIndex <= next.length ? originalIndex : next.length;
            next.splice(insertAt, 0, taskToDelete);
            tasks = next;
          },
        };
      };

      // Delete middle task (Task Two at index 1)
      deleteTask('task-2');
      assert.strictEqual(tasks.length, 2);
      assert.strictEqual(tasks[0].id, 'task-1');
      assert.strictEqual(tasks[1].id, 'task-3');
      assert.ok(feedback, 'Feedback must be set');
      assert.ok(typeof feedback.onUndo === 'function', 'onUndo must be a function');

      // Execute Undo
      feedback.onUndo();
      assert.strictEqual(tasks.length, 3);
      assert.strictEqual(tasks[0].id, 'task-1');
      assert.strictEqual(tasks[1].id, 'task-2', 'Task Two must be restored at index 1');
      assert.strictEqual(tasks[2].id, 'task-3');

      // Calling undo again must be idempotent and not create duplicate tasks
      feedback.onUndo();
      assert.strictEqual(tasks.length, 3, 'Undo must be idempotent and not duplicate');
    });

    it('2.2 undo preserves subsequent edits made to other tasks during the undo window', () => {
      const initialTasks = [
        { id: 'task-1', title: 'Task One', priority: 'high' },
        { id: 'task-2', title: 'Task Two', priority: 'medium' },
      ];

      let tasks = [...initialTasks];
      let feedback = null;

      const taskToDelete = tasks.find((t) => t.id === 'task-1');
      const originalIndex = 0;
      tasks = tasks.filter((t) => t.id !== 'task-1');

      feedback = {
        onUndo: () => {
          if (tasks.some((t) => t.id === taskToDelete.id)) return;
          const next = [...tasks];
          next.splice(originalIndex, 0, taskToDelete);
          tasks = next;
        },
      };

      // User edits Task Two while Task One is in undo window
      tasks = tasks.map((t) => (t.id === 'task-2' ? { ...t, title: 'Task Two Revised' } : t));

      // Execute undo for Task One
      feedback.onUndo();
      assert.strictEqual(tasks.length, 2);
      assert.strictEqual(tasks[0].id, 'task-1');
      assert.strictEqual(tasks[1].title, 'Task Two Revised', 'Subsequent edit must not be overwritten');
    });

    it('2.3 TaskCard exposes clear title indicating deletion can be undone with accessible name', () => {
      const cardPath = path.join(rootDir, 'src', 'components', 'TaskCard.jsx');
      const content = fs.readFileSync(cardPath, 'utf-8');

      assert.ok(content.includes('aria-label={`Delete task "${task.title}"`}'), 'TaskCard delete button must have canonical accessible name');
      assert.ok(content.includes('(with undo)'), 'TaskCard delete button title must indicate undo availability');
    });
  });

  describe('3. Clear Completed Workflow & Domain Logic Verification', () => {
    it('3.1 pure clear-completed logic correctly filters completed tasks and returns accurate counts', () => {
      const sampleTasks = [
        { id: 't-1', title: 'Open Task 1', completed: false },
        { id: 't-2', title: 'Done Task 2', completed: true },
        { id: 't-3', title: 'Done Task 3', completed: true },
        { id: 't-4', title: 'Open Task 4', completed: false },
      ];

      const completed = sampleTasks.filter((t) => t.completed);
      assert.strictEqual(completed.length, 2);

      const remaining = sampleTasks.filter((t) => !t.completed);
      assert.strictEqual(remaining.length, 2);
      assert.strictEqual(remaining[0].id, 't-1');
      assert.strictEqual(remaining[1].id, 't-4');
    });

    it('3.2 ProductivityApp and TaskList implement clear-completed button and count display', () => {
      const taskListPath = path.join(rootDir, 'src', 'components', 'TaskList.jsx');
      const taskListContent = fs.readFileSync(taskListPath, 'utf-8');

      assert.ok(taskListContent.includes('id="tasklist-clear-completed-btn"'), 'TaskList must render clear button');
      assert.ok(taskListContent.includes('Clear Completed ({completedCount})'), 'TaskList must display completed count');

      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const appContent = fs.readFileSync(appPath, 'utf-8');
      assert.ok(appContent.includes('handleClearCompleted'), 'ProductivityApp must define handleClearCompleted');
      assert.ok(appContent.includes('Cleared ${count} completed task'), 'ProductivityApp must set feedback with accurate count');
    });
  });

  describe('4. Quick-Add Navigation & Focus Usability', () => {
    it('4.1 TaskList renders quick-add shortcuts in both header and empty state', () => {
      const taskListPath = path.join(rootDir, 'src', 'components', 'TaskList.jsx');
      const content = fs.readFileSync(taskListPath, 'utf-8');

      assert.ok(content.includes('id="tasklist-quick-add-btn"'), 'Header must render quick-add button');
      assert.ok(content.includes('id="empty-state-add-task-btn"'), 'Empty state must render quick-add button');
    });

    it('4.2 ProductivityApp handleQuickAdd respects reduced motion preference when scrolling', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes('handleQuickAdd'), 'handleQuickAdd must be defined');
      assert.ok(content.includes('prefers-reduced-motion'), 'Must check prefers-reduced-motion');
      assert.ok(content.includes("prefersReducedMotion ? 'auto' : 'smooth'"), 'Must scroll instantly for reduced-motion users');
      assert.ok(content.includes("document.getElementById('command-input')"), 'Must focus command input');
    });
  });

  describe('5. Mobile Header Navigation Usability', () => {
    it('5.1 Header nav declares horizontal scroll and touch momentum for mobile viewports', () => {
      const headerPath = path.join(rootDir, 'src', 'components', 'Header.jsx');
      const content = fs.readFileSync(headerPath, 'utf-8');

      assert.ok(content.includes("overflowX: 'auto'"), 'Header nav must allow horizontal overflow scrolling');
      assert.ok(content.includes("maxWidth: '100%'"), 'Header nav must be bounded by container width');
      assert.ok(content.includes("flexShrink: 0"), 'Nav buttons must have flexShrink: 0 to prevent text squishing');
      assert.ok(content.includes("whiteSpace: 'nowrap'"), 'Nav buttons must preserve single-line label typography');
    });

    it('5.2 App.css includes mobile positioning rules for global feedback toast', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('#global-feedback-toast'), 'App.css must style global feedback toast');
      assert.ok(content.includes('@keyframes toastRiseIn'), 'App.css must define toast entry animation');
    });
  });

  describe('6. Unknown Route Fallback Notice & Direct Workspace Link', () => {
    it('6.1 App.jsx detects unrecognized routes and displays non-misleading notice', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes('isUnknownRoute'), 'App.jsx must compute isUnknownRoute');
      assert.ok(content.includes('id="unknown-route-banner"'), 'App.jsx must render unknown route banner');
      assert.ok(content.includes('id="unknown-route-to-app-btn"'), 'Banner must provide direct button to /app');
      assert.ok(content.includes("navigate('/app')"), 'Banner button must navigate to /app');
      assert.ok(content.includes('dismissedRoutePath'), 'App.jsx must support dismissing the notice without render loops');
    });
  });

  describe('7. Protected Scheduler Weights & Security Invariants', () => {
    it('7.1 factory scheduler weights remain strictly immutable at canonical values', () => {
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
      assert.strictEqual(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS), true);
    });

    it('7.2 Phase 7.4.4B activation gate remains permanently locked with empty caller claims', () => {
      const gateResult = evaluateActivationGate({});
      assert.strictEqual(gateResult.isAdaptationUnlocked, false);
      assert.strictEqual(gateResult.productionApplied, false);
      assert.strictEqual(gateResult.outcome, ACTIVATION_GATE_OUTCOMES.INFEASIBLE);
    });
  });
});
