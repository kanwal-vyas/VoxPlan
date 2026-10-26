import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('VoxPlan Overview Enhancement & Product Tour Promotion Suite', () => {
  const landingPath = path.join(projectRoot, 'src', 'pages', 'LandingPage.jsx');
  const landingContent = fs.readFileSync(landingPath, 'utf-8');

  describe('1. Product Identity & Core Positioning', () => {
    it('1.1 clearly communicates task management, adaptive scheduling, and local ML intelligence', () => {
      assert.ok(landingContent.includes('Kahn’s DAG dependency ordering'), 'Must mention Kahn DAG dependency ordering');
      assert.ok(landingContent.includes('supervised delay-risk machine learning'), 'Must mention supervised ML');
      assert.ok(landingContent.includes('empirical Bayesian habit learning'), 'Must mention Bayesian habit learning');
      assert.ok(landingContent.includes('0 Cloud LLM Calls'), 'Must highlight 0 Cloud LLM calls');
    });

    it('1.2 preserves all 4 editorial ribbon words: PLAN, PREDICT, UNDERSTAND, ACT', () => {
      assert.ok(landingContent.includes('>PLAN<') || landingContent.includes('> PLAN <') || landingContent.includes('PLAN\n'));
      assert.ok(landingContent.includes('>PREDICT<') || landingContent.includes('> PREDICT <') || landingContent.includes('PREDICT\n'));
      assert.ok(landingContent.includes('>UNDERSTAND<') || landingContent.includes('> UNDERSTAND <') || landingContent.includes('UNDERSTAND\n'));
      assert.ok(landingContent.includes('>ACT<') || landingContent.includes('> ACT <') || landingContent.includes('ACT\n'));
    });

    it('1.3 strictly excludes removed hero motto "Plan with clarity. Act with focus."', () => {
      assert.ok(!landingContent.includes('Plan with clarity'), 'Must not contain removed hero motto');
      assert.ok(!landingContent.includes('styles.heroMotto'), 'Must not declare unused heroMotto');
    });
  });

  describe('2. Today\'s Workspace Focus (Answering: "What should I focus on right now?")', () => {
    it('2.1 renders dedicated workspace focus section #workspace-focus', () => {
      assert.ok(landingContent.includes('id="workspace-focus"'), 'Must contain section #workspace-focus');
    });

    it('2.2 does NOT reuse forbidden legacy application section IDs', () => {
      assert.ok(!landingContent.includes('id="pulse"'), 'Must NOT declare id="pulse"');
      assert.ok(!landingContent.includes('id="landscape"'), 'Must NOT declare id="landscape"');
      assert.ok(!landingContent.includes('id="intelligence"'), 'Must NOT declare id="intelligence"');
      assert.ok(!landingContent.includes('id="command"'), 'Must NOT declare id="command"');
    });

    it('2.3 reads genuine task state safely without importing full application components', () => {
      assert.ok(landingContent.includes('function loadWorkspaceSummary'), 'Must define loadWorkspaceSummary helper');
      assert.ok(landingContent.includes("localStorage.getItem('voxplan_tasks')"), 'Must read voxplan_tasks from localStorage');
      assert.ok(!landingContent.includes("from '../components/TaskList'"), 'Must NOT import TaskList');
      assert.ok(!landingContent.includes("from '../components/ProjectOverview'"), 'Must NOT import ProjectOverview');
      assert.ok(!landingContent.includes("from '../components/MLModelPanel'"), 'Must NOT import MLModelPanel');
    });

    it('2.4 provides navigation actions into real workspace views', () => {
      assert.ok(landingContent.includes("handleOpenAppView('today')"), 'Must support opening workspace cockpit');
      assert.ok(landingContent.includes("handleOpenAppView('tasks')"), 'Must support opening backlog view');
    });
  });

  describe('3. Interactive Product Tour Promotion (Prominent First-Class Feature)', () => {
    it('3.1 provides prominent, visually integrated section #product-tour', () => {
      assert.ok(landingContent.includes('id="product-tour"'), 'Must provide section #product-tour');
      assert.ok(landingContent.includes('Take the Interactive Tour'), 'Must feature concise heading');
    });

    it('3.2 integrates isolated tour state from tourStorage helper', () => {
      assert.ok(landingContent.includes("from '../productTour/tourStorage'"), 'Must import from tourStorage');
      assert.ok(landingContent.includes('loadTourState'), 'Must call loadTourState');
      assert.ok(landingContent.includes('tourState.completed'), 'Must check completion status');
      assert.ok(landingContent.includes('tourState.lastStepIndex'), 'Must check progress index');
    });

    it('3.3 exposes primary CTA button #overview-start-tour-btn launching the real 20-step tour', () => {
      assert.ok(landingContent.includes('id="overview-start-tour-btn"'), 'Must expose #overview-start-tour-btn');
      assert.ok(landingContent.includes('/app?tour=1'), 'Must navigate to /app?tour=1');
    });

    it('3.4 exposes secondary demo CTA button #overview-demo-tour-btn for isolated practice', () => {
      assert.ok(landingContent.includes('id="overview-demo-tour-btn"'), 'Must expose #overview-demo-tour-btn');
      assert.ok(landingContent.includes('/app?tour=demo'), 'Must navigate to /app?tour=demo');
    });

    it('3.5 includes authentic visual representation of spotlight isolation and tour callout', () => {
      assert.ok(landingContent.includes('spotlightCutoutBox'), 'Must render spotlight cutout container');
      assert.ok(landingContent.includes('spotlightCalloutSimulation'), 'Must render simulated callout card');
      assert.ok(landingContent.includes('Step 07 of 20'), 'Must demonstrate genuine step counter');
      assert.ok(landingContent.includes('Kahn’s Topological Sort & Daily Bin-Packing'), 'Must show authentic step title');
    });

    it('3.6 articulates optical spotlight isolation, observation vs demo modes, and data safety', () => {
      assert.ok(landingContent.includes('Optical Spotlight Isolation'), 'Must highlight optical spotlight isolation');
      assert.ok(landingContent.includes('Observation vs Hands-on Demo'), 'Must highlight observation vs demo modes');
      assert.ok(landingContent.includes('100% Data Safety & Isolation'), 'Must highlight 100% data safety');
      assert.ok(landingContent.includes('voxplan_product_tour_state'), 'Must cite isolated tour storage key');
    });

    it('3.7 header and bottom CTA include discoverable tour launcher buttons', () => {
      assert.ok(landingContent.includes('id="hero-tour-btn"'), 'Hero must expose #hero-tour-btn');
      assert.ok(landingContent.includes('id="mobile-nav-tour-btn"'), 'Mobile nav must expose #mobile-nav-tour-btn');
      assert.ok(landingContent.includes('id="landing-bottom-tour-btn"'), 'Bottom CTA must expose #landing-bottom-tour-btn');
    });
  });

  describe('4. Feature Discovery to Real Application Views', () => {
    it('4.1 feature cards provide direct navigation actions to specific views', () => {
      assert.ok(landingContent.includes("handleOpenAppView('today')"), 'Features must link to today view');
      assert.ok(landingContent.includes("handleOpenAppView('insights')"), 'Features must link to insights view');
      assert.ok(landingContent.includes("handleOpenAppView('calendar')"), 'Features must link to calendar view');
    });
  });

  describe('5. Accessibility, Invariants & Editorial Styling', () => {
    it('5.1 preserves accessible landmarks and focus attributes', () => {
      assert.ok(landingContent.includes('<main id="main-content" tabIndex={-1}'), 'Must maintain <main id="main-content">');
    });

    it('5.2 maintains editorial fonts (Trade Winds, Eagle Lake, Lato, Unica One, Bigelow Rules)', () => {
      assert.ok(landingContent.includes("var(--font-wordmark, 'Trade Winds', cursive)"));
      assert.ok(landingContent.includes("var(--font-heading, 'Eagle Lake', cursive, serif)"));
      assert.ok(landingContent.includes("var(--font-compact, 'Unica One', cursive, sans-serif)"));
      assert.ok(landingContent.includes("var(--font-sans, 'Lato', sans-serif)"));
      assert.ok(landingContent.includes("var(--font-accent, 'Bigelow Rules', cursive)"));
    });
  });
});
