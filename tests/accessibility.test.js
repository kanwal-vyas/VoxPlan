import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { evaluateActivationGate } from '../src/scheduler/activationGateEvaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Calculates relative luminance according to WCAG 2.2 specifications.
 * Formula: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getRelativeLuminance(hexColor) {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Calculates contrast ratio between two colors according to WCAG 2.2 Level AA.
 * Formula: (L1 + 0.05) / (L2 + 0.05)
 */
function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Phase 8, Stage 8.1: Accessibility Audit & Keyboard Navigation Test Suite', () => {
  describe('1. WCAG 2.2 Level AA Color Contrast & Typography Tokens', () => {
    it('1.1 computes WCAG AA contrast ratio for text tokens against warm cream background (#FFF8EF)', () => {
      const bgCream = '#FFF8EF';
      const textDark = '#25242A';
      const textBody = '#4A4852';
      const textMuted = '#686571';

      const darkContrast = getContrastRatio(textDark, bgCream);
      const bodyContrast = getContrastRatio(textBody, bgCream);
      const mutedContrast = getContrastRatio(textMuted, bgCream);

      // WCAG AA requirement for regular text is 4.5:1
      assert.ok(darkContrast >= 7.0, `Dark text contrast ${darkContrast.toFixed(2)}:1 must exceed AAA (7:1)`);
      assert.ok(bodyContrast >= 4.5, `Body text contrast ${bodyContrast.toFixed(2)}:1 must exceed AA (4.5:1)`);
      assert.ok(mutedContrast >= 4.5, `Muted text contrast ${mutedContrast.toFixed(2)}:1 must exceed AA (4.5:1)`);
    });

    it('1.2 verifies index.css specifies accessible tokens, focus rings, and reduced motion', () => {
      const cssContent = fs.readFileSync(path.join(rootDir, 'src', 'index.css'), 'utf-8');

      // Focus visibility (WCAG 2.4.7)
      assert.ok(cssContent.includes(':focus-visible'), 'index.css must include :focus-visible rules');
      assert.ok(cssContent.includes('outline: 3px solid'), 'index.css must specify high-visibility focus outline');

      // Skip-link utility (WCAG 2.4.1)
      assert.ok(cssContent.includes('.skip-link'), 'index.css must include .skip-link styles');
      assert.ok(cssContent.includes('.skip-link:focus'), 'index.css must style active skip-link');

      // Screen-reader-only utility
      assert.ok(cssContent.includes('.sr-only'), 'index.css must include .sr-only utility class');

      // Reduced motion media query (WCAG 2.3.3)
      assert.ok(cssContent.includes('@media (prefers-reduced-motion: reduce)'), 'index.css must support prefers-reduced-motion');
      assert.ok(cssContent.includes('scroll-behavior: auto !important'), 'reduced motion must disable smooth scrolling');
    });
  });

  describe('2. Global Structure, Landmarks, and Bypass Navigation', () => {
    it('2.1 App.jsx renders skip-to-content link pointing to #main-content', () => {
      const appContent = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf-8');
      assert.ok(appContent.includes('className="skip-link"'), 'App.jsx must render .skip-link');
      assert.ok(appContent.includes('href="#main-content"'), 'skip-link must target #main-content');
    });

    it('2.2 App.jsx updates descriptive document.title dynamically per route', () => {
      const appContent = fs.readFileSync(path.join(rootDir, 'src', 'App.jsx'), 'utf-8');
      assert.ok(appContent.includes('document.title ='), 'App.jsx must dynamically set document.title');
      assert.ok(appContent.includes('VoxPlan App — Tasks & Adaptive Scheduling'), 'App.jsx must set title for /app');
      assert.ok(appContent.includes('VoxPlan — Playful Project Intelligence'), 'App.jsx must set title for /');
    });

    it('2.3 LandingPage and ProductivityApp provide main landmark with matching id="main-content"', () => {
      const landingContent = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'LandingPage.jsx'), 'utf-8');
      const prodContent = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx'), 'utf-8');

      assert.ok(landingContent.includes('<main id="main-content"'), 'LandingPage must include <main id="main-content">');
      assert.ok(prodContent.includes('<main id="main-content"'), 'ProductivityApp must include <main id="main-content">');
    });
  });

  describe('3. Landing Page Accessible Semantics & Demonstration Clarity', () => {
    it('3.1 Brand logo is a keyboard-accessible button with aria-label', () => {
      const landingContent = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'LandingPage.jsx'), 'utf-8');
      assert.ok(landingContent.includes('<button\n            type="button"\n            style={styles.brand}'), 'Brand must be a button');
      assert.ok(landingContent.includes('aria-label="VoxPlan home, scroll to top"'), 'Brand must have accessible label');
    });

    it('3.2 Mobile menu toggle exposes aria-expanded and aria-controls', () => {
      const landingContent = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'LandingPage.jsx'), 'utf-8');
      assert.ok(landingContent.includes('aria-expanded={mobileMenuOpen}'), 'Mobile toggle must have aria-expanded');
      assert.ok(landingContent.includes('aria-controls="landing-mobile-menu"'), 'Mobile toggle must have aria-controls');
      assert.ok(landingContent.includes('id="landing-mobile-menu"'), 'Mobile menu container must have matching id');
    });

    it('3.3 Preview showcase exposes ARIA tablist, tab, and tabpanel semantics with arrow navigation', () => {
      const landingContent = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'LandingPage.jsx'), 'utf-8');
      assert.ok(landingContent.includes('role="tablist"'), 'Preview tabs container must have role="tablist"');
      assert.ok(landingContent.includes('role="tab"'), 'Preview tabs must have role="tab"');
      assert.ok(landingContent.includes('aria-selected={activePreviewTab === \'schedule\'}'), 'Tab must expose aria-selected');
      assert.ok(landingContent.includes('role="tabpanel"'), 'Preview bodies must have role="tabpanel"');
      assert.ok(landingContent.includes('ArrowRight'), 'Preview tabs must support ArrowRight key navigation');
      assert.ok(landingContent.includes('ArrowLeft'), 'Preview tabs must support ArrowLeft key navigation');
    });

    it('3.4 Preview stopwatch controls identify themselves as demonstrations via aria-labels', () => {
      const landingContent = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'LandingPage.jsx'), 'utf-8');
      assert.ok(landingContent.includes('aria-label={previewTimerRunning ? \'Pause demonstration stopwatch\' : \'Start demonstration stopwatch\'}'));
      assert.ok(landingContent.includes('aria-label="Reset demonstration stopwatch"'));
    });
  });

  describe('4. Productivity App Accessible Forms, Cards, and Controls', () => {
    it('4.1 Header brand trigger is a keyboard-accessible button', () => {
      const headerContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'Header.jsx'), 'utf-8');
      assert.ok(headerContent.includes('<button\n          type="button"\n          style={styles.brand}'), 'Header brand must be a button');
      assert.ok(headerContent.includes('aria-label={onNavigate ? \'Back to VoxPlan product landing page\' : \'VoxPlan home, scroll to top\'}'));
    });

    it('4.2 CommandBar provides programmatic label and aria-label for command input', () => {
      const commandContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CommandBar.jsx'), 'utf-8');
      assert.ok(commandContent.includes('<label htmlFor="command-input" className="sr-only">'), 'CommandBar must have sr-only label');
      assert.ok(commandContent.includes('aria-label="Planning command or task input"'), 'Command input must have aria-label');
    });

    it('4.3 TaskCard provides task-specific accessible names for actions and interactive fields', () => {
      const taskCardContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'TaskCard.jsx'), 'utf-8');
      assert.ok(taskCardContent.includes('aria-label={`Move task "${task.title}" up`}'));
      assert.ok(taskCardContent.includes('aria-label={`Move task "${task.title}" down`}'));
      assert.ok(taskCardContent.includes('aria-label={task.completed ? `Mark "${task.title}" as incomplete` : `Mark "${task.title}" as complete`}'));
      assert.ok(taskCardContent.includes('aria-label={`Delete task "${task.title}"`}'));
      assert.ok(taskCardContent.includes('aria-label={`Edit title for "${task.title}"`}'));
      assert.ok(taskCardContent.includes('aria-label={`Reschedule due date for "${task.title}". Current due date is ${formatDueDate(task.dueDate)}`}'));
      assert.ok(taskCardContent.includes('aria-label={`Edit effort estimate for "${task.title}". Current effort is ${task.estimatedEffort} hours`}'));
      assert.ok(taskCardContent.includes('aria-label={`View delay risk prediction explanation for "${task.title}"`}'));
    });

    it('4.4 TaskList filters expose aria-pressed status', () => {
      const taskListContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'TaskList.jsx'), 'utf-8');
      assert.ok(taskListContent.includes('aria-pressed={activeFilter === f.id}'), 'Filter buttons must have aria-pressed');
      assert.ok(taskListContent.includes('role="group" aria-label="Task status filters"'), 'Filter container must have role group');
    });

    it('4.5 ProjectOverview progress bar exposes role="progressbar" and numeric values', () => {
      const overviewContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ProjectOverview.jsx'), 'utf-8');
      assert.ok(overviewContent.includes('role="progressbar"'), 'Sprint completion must have role="progressbar"');
      assert.ok(overviewContent.includes('aria-valuenow={progressPercent}'), 'Progressbar must have aria-valuenow');
      assert.ok(overviewContent.includes('aria-valuemin={0}'), 'Progressbar must have aria-valuemin');
      assert.ok(overviewContent.includes('aria-valuemax={100}'), 'Progressbar must have aria-valuemax');
    });
  });

  describe('5. Modal Dialogs, Keyboard Trapping, and Escape Handling', () => {
    it('5.1 TaskExplanationModal exposes role="dialog", aria-modal="true", and Escape key handler', () => {
      const modalContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'TaskExplanationModal.jsx'), 'utf-8');
      assert.ok(modalContent.includes('role="dialog"'), 'TaskExplanationModal must have role="dialog"');
      assert.ok(modalContent.includes('aria-modal="true"'), 'TaskExplanationModal must have aria-modal="true"');
      assert.ok(modalContent.includes('aria-labelledby="task-explanation-title"'), 'TaskExplanationModal must have aria-labelledby');
      assert.ok(modalContent.includes('e.key === \'Escape\''), 'TaskExplanationModal must handle Escape key');
    });

    it('5.2 AdaptiveScheduleModal exposes role="dialog", aria-modal="true", role="tablist", and Escape key handler', () => {
      const modalContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'AdaptiveScheduleModal.jsx'), 'utf-8');
      assert.ok(modalContent.includes('role="dialog"'), 'AdaptiveScheduleModal must have role="dialog"');
      assert.ok(modalContent.includes('aria-modal="true"'), 'AdaptiveScheduleModal must have aria-modal="true"');
      assert.ok(modalContent.includes('role="tablist"'), 'AdaptiveScheduleModal navTabBar must have role="tablist"');
      assert.ok(modalContent.includes('role="tabpanel"'), 'AdaptiveScheduleModal panels must have role="tabpanel"');
      assert.ok(modalContent.includes('e.key === \'Escape\''), 'AdaptiveScheduleModal must handle Escape key');
      assert.ok(modalContent.includes('e.key === \'ArrowRight\''), 'AdaptiveScheduleModal tabs must support arrow navigation');
    });
  });

  describe('6. PWA, Offline & Route Splitting Accessibility Verification', () => {
    it('6.1 RouteLoadingFallback exposes role="status", aria-live="polite", and descriptive label', () => {
      const content = fs.readFileSync(path.join(rootDir, 'src', 'components', 'RouteLoadingFallback.jsx'), 'utf-8');
      assert.ok(content.includes('role="status"'), 'RouteLoadingFallback must have role="status"');
      assert.ok(content.includes('aria-live="polite"'), 'RouteLoadingFallback must have aria-live="polite"');
      assert.ok(content.includes('aria-label='), 'RouteLoadingFallback must have aria-label');
      assert.ok(content.includes('className="sr-only"'), 'RouteLoadingFallback must include sr-only explanation');
    });

    it('6.2 OfflineBanner exposes role="status", aria-live="polite", and accessible dismiss label', () => {
      const content = fs.readFileSync(path.join(rootDir, 'src', 'components', 'OfflineBanner.jsx'), 'utf-8');
      assert.ok(content.includes('role="status"'), 'OfflineBanner must have role="status"');
      assert.ok(content.includes('aria-live="polite"'), 'OfflineBanner must have aria-live="polite"');
      assert.ok(content.includes('aria-label="Dismiss offline notice"'), 'OfflineBanner must provide accessible dismiss label');
    });

    it('6.3 UpdateNotification exposes role="region", aria-label, and keyboard focusable action buttons', () => {
      const content = fs.readFileSync(path.join(rootDir, 'src', 'components', 'UpdateNotification.jsx'), 'utf-8');
      assert.ok(content.includes('role="region"'), 'UpdateNotification must have role="region"');
      assert.ok(content.includes('aria-label="Application update available"'), 'UpdateNotification must provide region label');
      assert.ok(content.includes('aria-label="Refresh now to apply update"'), 'UpdateNotification must provide refresh button label');
      assert.ok(content.includes('aria-label="Dismiss update notification"'), 'UpdateNotification must provide dismiss button label');
    });

    it('6.4 RouteErrorBoundary exposes role="alert" and accessible retry action', () => {
      const content = fs.readFileSync(path.join(rootDir, 'src', 'components', 'RouteErrorBoundary.jsx'), 'utf-8');
      assert.ok(content.includes('role="alert"'), 'RouteErrorBoundary must have role="alert"');
      assert.ok(content.includes('aria-label="Retry loading view"'), 'RouteErrorBoundary must have accessible retry button');
    });
  });

  describe('7. Protected Scheduler Invariants & Production Gate Preservation', () => {
    it('7.1 strictly preserves factory baseline weights and object immutability', () => {
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
      assert.strictEqual(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS), true);
    });

    it('7.2 production activation gate fails closed and adaptation is locked', () => {
      const evalResult = evaluateActivationGate();

      assert.strictEqual(evalResult.isAdaptationUnlocked, false);
      assert.strictEqual(evalResult.productionApplied, false);
      assert.strictEqual(evalResult.productionInvariance.productionApplied, false);
      assert.strictEqual(evalResult.productionInvariance.isAdaptationUnlocked, false);
      assert.notStrictEqual(evalResult.outcome, 'eligible_for_supervised_review');
    });
  });
});
