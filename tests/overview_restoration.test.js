import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { evaluateActivationGate } from '../src/scheduler/activationGateEvaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('VoxPlan Overview Page Restoration — Corrective Audit Suite', () => {
  const landingPath = path.join(projectRoot, 'src', 'pages', 'LandingPage.jsx');
  const prodAppPath = path.join(projectRoot, 'src', 'pages', 'ProductivityApp.jsx');
  const appCssPath = path.join(projectRoot, 'src', 'App.css');
  const indexCssPath = path.join(projectRoot, 'src', 'index.css');
  const appJsxPath = path.join(projectRoot, 'src', 'App.jsx');

  const landingContent = fs.readFileSync(landingPath, 'utf-8');
  const prodAppContent = fs.readFileSync(prodAppPath, 'utf-8');
  const appCssContent = fs.readFileSync(appCssPath, 'utf-8');
  const indexCssContent = fs.readFileSync(indexCssPath, 'utf-8');
  const appJsxContent = fs.readFileSync(appJsxPath, 'utf-8');

  describe('1. Current Overview Layout Restored', () => {
    it('1.1 renders accessible landmark <main id="main-content">', () => {
      assert.ok(landingContent.includes('<main id="main-content"'), 'Must provide <main id="main-content">');
    });

    it('1.2 contains the authentic current Overview sections: features, how-it-works, architecture', () => {
      assert.ok(landingContent.includes('id="features"'), 'Must contain section #features');
      assert.ok(landingContent.includes('id="how-it-works"'), 'Must contain section #how-it-works');
      assert.ok(landingContent.includes('id="architecture"'), 'Must contain section #architecture');
    });

    it('1.3 renders hero section with non-overlapping headline lines and composition', () => {
      assert.ok(landingContent.includes('Turn Task Lists Into'), 'Hero must contain headline Turn Task Lists Into');
      assert.ok(landingContent.includes('Executable Plans'), 'Hero must contain highlight Executable Plans');
      assert.ok(landingContent.includes('styles.heroTitleLine'), 'Hero must separate lines to prevent vertical overlap');
      assert.ok(landingContent.includes("flexDirection: 'column'"), 'Hero title must use column flex layout');
      assert.ok(landingContent.includes("gap: '14px'"), 'Hero title must declare explicit gap between lines');
      assert.ok(landingContent.includes('styles.heroCtaGroup'), 'Hero must contain CTA group');
      assert.ok(landingContent.includes('styles.microTagsRow'), 'Hero must contain trust micro-tags row');
    });

    it('1.4 contains interactive preview showcase with tabs and focus stopwatch demo', () => {
      assert.ok(landingContent.includes('role="tablist"'), 'Preview showcase must contain role="tablist"');
      assert.ok(landingContent.includes('id="preview-tab-schedule"'), 'Must contain preview tab schedule');
      assert.ok(landingContent.includes('id="preview-tab-risk"'), 'Must contain preview tab risk');
      assert.ok(landingContent.includes('id="preview-tab-voice"'), 'Must contain preview tab voice');
      assert.ok(landingContent.includes('Interactive Focus Stopwatch'), 'Must contain stopwatch demonstration');
      assert.ok(landingContent.includes('formatTimer'), 'Must use formatTimer for stopwatch digits');
    });

    it('1.5 header provides navigation anchors matching current Overview sections', () => {
      assert.ok(landingContent.includes("scrollToSection('features')"), 'Must anchor to #features');
      assert.ok(landingContent.includes("scrollToSection('how-it-works')"), 'Must anchor to #how-it-works');
      assert.ok(landingContent.includes("scrollToSection('architecture')"), 'Must anchor to #architecture');
    });
  });

  describe('2. Old Application-Specific Sections Are NOT Rendered as the Overview', () => {
    it('2.1 does NOT mistakenly render old application sections (pulse, landscape, intelligence, command)', () => {
      assert.ok(!landingContent.includes('id="pulse"'), 'Must NOT contain old app section #pulse');
      assert.ok(!landingContent.includes('id="landscape"'), 'Must NOT contain old app section #landscape');
      assert.ok(!landingContent.includes('id="intelligence"'), 'Must NOT contain old app section #intelligence');
      assert.ok(!landingContent.includes('id="command"'), 'Must NOT contain old app section #command');
    });

    it('2.2 does NOT import or embed full workspace application components into Overview', () => {
      assert.ok(!landingContent.includes("from '../components/ProjectOverview'"), 'Must NOT import ProjectOverview in Overview');
      assert.ok(!landingContent.includes("from '../components/TaskList'"), 'Must NOT import TaskList in Overview');
      assert.ok(!landingContent.includes("from '../components/MLModelPanel'"), 'Must NOT import MLModelPanel in Overview');
      assert.ok(!landingContent.includes("from '../components/CommandBar'"), 'Must NOT import CommandBar in Overview');
      assert.ok(!landingContent.includes("from '../components/TaskExplanationModal'"), 'Must NOT import TaskExplanationModal in Overview');
    });
  });

  describe('3. Pastel Background Color Transition System on Current Overview', () => {
    it('3.1 includes the complete 5-stop historical pastel palette sequence', () => {
      assert.ok(landingContent.includes('#FFF8EF'), 'Palette must include Cream #FFF8EF');
      assert.ok(landingContent.includes('#FFF9DB'), 'Palette must include Butter Yellow #FFF9DB');
      assert.ok(landingContent.includes('#F3EEFF'), 'Palette must include Soft Lavender #F3EEFF');
      assert.ok(landingContent.includes('#EBF8F1'), 'Palette must include Soft Mint #EBF8F1');
      assert.ok(landingContent.includes('#FFEFEA'), 'Palette must include Soft Peach #FFEFEA');
    });

    it('3.2 implements linear RGB interpolation functions (lerpColor, interpolatePaletteColor)', () => {
      assert.ok(landingContent.includes('function lerpColor'), 'Must implement lerpColor');
      assert.ok(landingContent.includes('function interpolatePaletteColor'), 'Must implement interpolatePaletteColor');
      assert.ok(landingContent.includes('--overview-bg'), 'Must apply via --overview-bg CSS custom property');
    });

    it('3.3 uses passive scroll listener and cancels animation frames cleanly', () => {
      assert.ok(landingContent.includes("addEventListener('scroll', onScroll, { passive: true })"), 'Scroll listener must be passive');
      assert.ok(landingContent.includes('cancelAnimationFrame'), 'Must cancel animation frame on unmount');
    });
  });

  describe('4. Animated Editorial Ribbons & Moving Word System', () => {
    it('4.1 renders all four oversized editorial ribbon words: PLAN, PREDICT, UNDERSTAND, ACT', () => {
      assert.ok(landingContent.includes('>PLAN<') || landingContent.includes('> PLAN <') || landingContent.includes('PLAN\n'), 'Must contain ribbon word PLAN');
      assert.ok(landingContent.includes('>PREDICT<') || landingContent.includes('> PREDICT <') || landingContent.includes('PREDICT\n'), 'Must contain ribbon word PREDICT');
      assert.ok(landingContent.includes('>UNDERSTAND<') || landingContent.includes('> UNDERSTAND <') || landingContent.includes('UNDERSTAND\n'), 'Must contain ribbon word UNDERSTAND');
      assert.ok(landingContent.includes('>ACT<') || landingContent.includes('> ACT <') || landingContent.includes('ACT\n'), 'Must contain ribbon word ACT');
    });

    it('4.2 declares overview ribbon wrap with dedicated visible height and overflow clipping', () => {
      assert.ok(appCssContent.includes('.overview-ribbon-wrap'), 'App.css must define .overview-ribbon-wrap');
      assert.ok(appCssContent.includes('min-height: 140px'), 'overview-ribbon-wrap must have generous visible min-height');
      assert.ok(appCssContent.includes('overflow: hidden'), 'overview-ribbon-wrap must clip overflow');
      assert.ok(appCssContent.includes('.overview-ribbon-word'), 'App.css must define .overview-ribbon-word');
      assert.ok(appCssContent.includes('will-change: transform, opacity'), 'Must declare will-change for GPU compositing');
    });

    it('4.3 provides sufficient text contrast so ribbons are recognizable and discoverable', () => {
      assert.ok(appCssContent.includes('opacity: 0.28'), 'App.css base ribbon opacity must be >= 0.25 for contrast');
      assert.ok(landingContent.includes('baseOpacity = isMobile ? 0.26 : 0.28'), 'JS must initialize baseOpacity >= 0.25');
    });

    it('4.4 respects prefers-reduced-motion for ribbon words and background', () => {
      assert.ok(landingContent.includes('prefers-reduced-motion: reduce'), 'LandingPage must query prefers-reduced-motion');
      assert.ok(appCssContent.includes('@media (prefers-reduced-motion: reduce)'), 'App.css must include reduced motion query');
      assert.ok(appCssContent.includes('transform: none !important'), 'Reduced motion must disable transforms on ribbon words');
      assert.ok(appCssContent.includes('opacity: 0.32 !important'), 'Reduced motion must maintain visible ribbon opacity');
    });
  });

  describe('5. Navigation Actions to Productivity Workspace (/app)', () => {
    it('5.1 provides clear, prominent navigation actions to the productivity workspace (/app)', () => {
      assert.ok(landingContent.includes("onNavigate('/app')") || landingContent.includes("handleOpenApp"), 'Must trigger navigation to /app');
      assert.ok(landingContent.includes('id="landing-open-app-nav-btn"'), 'Must expose #landing-open-app-nav-btn');
      assert.ok(landingContent.includes('id="hero-primary-open-app-btn"'), 'Must expose #hero-primary-open-app-btn');
      assert.ok(landingContent.includes('id="landing-bottom-open-app-btn"'), 'Must expose #landing-bottom-open-app-btn');
    });
  });

  describe('6. Route Separation & Protected Workspace Invariants', () => {
    it('6.1 App.jsx separates Overview (/) from ProductivityApp (/app)', () => {
      assert.ok(appJsxContent.includes("const isApp = currentPath === '/app' || currentPath.startsWith('/app/')"), 'App.jsx must branch on /app');
      assert.ok(appJsxContent.includes('<LandingPage onNavigate={navigate} />'), 'App.jsx must render LandingPage for /');
      assert.ok(appJsxContent.includes('<ProductivityApp onNavigate={navigate} />'), 'App.jsx must render ProductivityApp for /app');
    });

    it('6.2 ProductivityApp (/app) remains functional with task views, calendar, and sticky notes', () => {
      assert.ok(prodAppContent.includes('TaskStickyNotesModal'), 'ProductivityApp must include sticky notes');
      assert.ok(prodAppContent.includes('TaskCalendar'), 'ProductivityApp must include TaskCalendar');
      assert.ok(prodAppContent.includes('AdaptiveScheduleModal'), 'ProductivityApp must include AdaptiveScheduleModal');
    });

    it('6.3 strictly preserves factory baseline weights and object immutability', () => {
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
      assert.strictEqual(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS), true);
    });

    it('6.4 production activation gate remains permanently locked with empty caller claims', () => {
      const evalResult = evaluateActivationGate();
      assert.strictEqual(evalResult.isAdaptationUnlocked, false);
      assert.strictEqual(evalResult.productionApplied, false);
    });
  });

  describe('7. Approved Local Typography Integration (System A3)', () => {
    it('7.1 uses Trade Winds for the brand wordmark', () => {
      assert.ok(landingContent.includes("var(--font-wordmark, 'Trade Winds', cursive)"), 'Brand must use Trade Winds');
      assert.ok(indexCssContent.includes("font-family: 'Trade Winds'"), 'index.css must declare Trade Winds @font-face');
    });

    it('7.2 uses Eagle Lake for display and section headings', () => {
      assert.ok(landingContent.includes("var(--font-heading, 'Eagle Lake', cursive, serif)"), 'Headings must use Eagle Lake');
      assert.ok(indexCssContent.includes("font-family: 'Eagle Lake'"), 'index.css must declare Eagle Lake @font-face');
    });

    it('7.3 uses Unica One for compact labels and badges', () => {
      assert.ok(landingContent.includes("var(--font-compact, 'Unica One', cursive, sans-serif)"), 'Badges must use Unica One');
      assert.ok(indexCssContent.includes("font-family: 'Unica One'"), 'index.css must declare Unica One @font-face');
    });

    it('7.4 verifies hero phrase "Plan with clarity. Act with focus." is removed while hero fonts remain registered', () => {
      assert.ok(!landingContent.includes('Plan with'), 'LandingPage must not contain removed hero motto phrase');
      assert.ok(!landingContent.includes('styles.heroMotto'), 'LandingPage must not retain unused heroMotto style');
      assert.ok(indexCssContent.includes("font-family: 'Shrikhand'"), 'index.css must preserve Shrikhand font-face');
      assert.ok(indexCssContent.includes("font-family: 'Shadows Into Light'"), 'index.css must preserve Shadows Into Light font-face');
    });

    it('7.5 uses Lato for explanatory body copy', () => {
      assert.ok(landingContent.includes("var(--font-sans, 'Lato', sans-serif)"), 'Body copy must use Lato');
      assert.ok(indexCssContent.includes("font-family: 'Lato'"), 'index.css must declare Lato @font-face');
    });

    it('7.6 uses Bigelow Rules for celebratory/tagline accents', () => {
      assert.ok(landingContent.includes("var(--font-accent, 'Bigelow Rules', cursive)"), 'Accents must use Bigelow Rules');
      assert.ok(indexCssContent.includes("font-family: 'Bigelow Rules'"), 'index.css must declare Bigelow Rules @font-face');
    });

    it('7.7 eliminates obsolete font families (Syne, Caveat, Birthstone Bounce)', () => {
      assert.ok(!landingContent.includes("'Syne'"), 'Must not retain obsolete Syne font');
      assert.ok(!landingContent.includes("'Caveat'"), 'Must not retain obsolete Caveat font');
      assert.ok(!landingContent.includes('Birthstone Bounce'), 'Must not retain Birthstone Bounce');
    });
  });

  describe('8. Responsive Design & Accessibility Invariants', () => {
    it('8.1 mobile menu toggle exposes aria-expanded and aria-controls with container #landing-mobile-menu', () => {
      assert.ok(landingContent.includes('aria-expanded={mobileMenuOpen}'), 'Mobile toggle must have aria-expanded');
      assert.ok(landingContent.includes('aria-controls="landing-mobile-menu"'), 'Mobile toggle must have aria-controls');
      assert.ok(landingContent.includes('id="landing-mobile-menu"'), 'Mobile menu container must have matching id');
    });

    it('8.2 brand logo is a keyboard-accessible button with aria-label', () => {
      assert.ok(landingContent.includes('<button\n            type="button"\n            style={styles.brand}'), 'Brand must be a button');
      assert.ok(landingContent.includes('aria-label="VoxPlan home, scroll to top"'), 'Brand must have accessible label');
    });

    it('8.3 prevents horizontal overflow on overview page and ribbon wrap', () => {
      assert.ok(appCssContent.includes('overflow-x: hidden'), 'App.css overview-page must have overflow-x: hidden');
      assert.ok(appCssContent.includes('overflow: hidden'), 'App.css overview-ribbon-wrap must have overflow: hidden');
    });
  });
});
