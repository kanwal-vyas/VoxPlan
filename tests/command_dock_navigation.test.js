import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Stage 1 — Command Discoverability & Global Dock Navigation Regression Suite', () => {
  describe('1. Primary Three-Destination Navigation Architecture', () => {
    it('1.1 Header exposes Today, Tasks, and Insights destination tabs with accessible IDs and aria-current', () => {
      const headerPath = path.join(rootDir, 'src', 'components', 'Header.jsx');
      const content = fs.readFileSync(headerPath, 'utf-8');

      assert.ok(content.includes('id="nav-tab-today"'), 'Must have nav tab for Today');
      assert.ok(content.includes('id="nav-tab-tasks"'), 'Must have nav tab for Tasks');
      assert.ok(content.includes('id="nav-tab-insights"'), 'Must have nav tab for Insights');
      assert.ok(content.includes("aria-current={currentView === 'today' ? 'page' : undefined}"), 'Must set aria-current on active view tab');
      assert.ok(content.includes('currentView === tab.id ? styles.activeNavLink : styles.navLink') || content.includes('currentView === \'today\' ? styles.activeNavLink'), 'Must apply distinct active styling to selected tab');
    });

    it('1.2 ProductivityApp preserves component state and dialogue context across views without unmounting', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes("const [currentView, setCurrentView] = useState('today')"), 'Must track currentView state');
      assert.ok(content.includes('id="view-today"'), 'Must render view-today tabpanel');
      assert.ok(content.includes('id="view-tasks"'), 'Must render view-tasks tabpanel');
      assert.ok(content.includes('id="view-insights"'), 'Must render view-insights tabpanel');

      // Crucial: Must use CSS display toggling rather than conditional destruction so timers, ML cache, and tasks are preserved
      assert.ok(content.includes("display: currentView === 'today' ? 'flex' : 'none'"), 'Must toggle today display without unmounting');
      assert.ok(content.includes("display: currentView === 'tasks' ? 'flex' : 'none'"), 'Must toggle tasks display without unmounting');
      assert.ok(content.includes("display: currentView === 'insights' ? 'flex' : 'none'"), 'Must toggle insights display without unmounting');
    });

    it('1.3 View navigation handles scroll-to-section requests smoothly', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes("handleSelectView('today')"), 'Must support switching to today view');
      assert.ok(content.includes("handleSelectView('tasks')"), 'Must support switching to tasks view');
      assert.ok(content.includes("handleSelectView('insights')"), 'Must support switching to insights view');
      assert.ok(content.includes('ScrollTrigger.refresh()'), 'Must refresh layout calculations after view switch');
    });
  });

  describe('2. Globally Accessible Two-Layer Command Dock', () => {
    it('2.1 Collapsed command dock is permanently visible across views and never nested inside an individual view container', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      const todayIdx = content.indexOf('id="view-today"');
      const tasksIdx = content.indexOf('id="view-tasks"');
      const insightsIdx = content.indexOf('id="view-insights"');
      const commandIdx = content.indexOf('<CommandBar');

      assert.ok(todayIdx !== -1 && tasksIdx !== -1 && insightsIdx !== -1 && commandIdx !== -1);
      assert.ok(commandIdx > todayIdx && commandIdx > tasksIdx && commandIdx > insightsIdx, 'CommandBar must sit globally after view tabpanels');
    });

    it('2.2 CommandBar styles define fixed floating dock wrapper and prevent click blocking', () => {
      const commandPath = path.join(rootDir, 'src', 'components', 'CommandBar.jsx');
      const content = fs.readFileSync(commandPath, 'utf-8');

      assert.ok(content.includes("position: 'fixed'"), 'Dock wrapper must be fixed at viewport bottom');
      assert.ok(content.includes("pointerEvents: 'none'"), 'Dock outer wrapper must have pointerEvents none to allow clicks through surrounding space');
      assert.ok(content.includes("pointerEvents: 'auto'"), 'Interactive notebook card and drawer must set pointerEvents auto');
      assert.ok(content.includes("zIndex: 1000"), 'Dock must have high zIndex to float above background layers');
    });

    it('2.3 App container defines safe bottom clearance to prevent dock/content overlap', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes("padding: '0 20px 180px 20px'"), 'App container must provide 180px bottom clearance for fixed dock');
    });

    it('2.4 App.css includes mobile safe area insets and responsive padding for dock and drawer', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('.command-dock-container'), 'App.css must style command-dock-container');
      assert.ok(content.includes('env(safe-area-inset-bottom'), 'Must support mobile safe area inset');
      assert.ok(content.includes('#command-expanded-drawer'), 'App.css must style expanded drawer');
      assert.ok(content.includes('@keyframes drawerSlideUp'), 'App.css must animate drawer upward expansion');
    });
  });

  describe('3. Upward-Expanding Assistant Panel & User Experience', () => {
    it('3.1 Upward drawer contains header with minimize button, transcripts, and clarification/proposal cards', () => {
      const commandPath = path.join(rootDir, 'src', 'components', 'CommandBar.jsx');
      const content = fs.readFileSync(commandPath, 'utf-8');

      assert.ok(content.includes('id="command-expanded-drawer"'), 'Must have command-expanded-drawer container');
      assert.ok(content.includes('id="command-collapse-drawer-btn"'), 'Must have collapse/minimize button in drawer');
      assert.ok(content.includes('id="command-expand-toggle-btn"'), 'Must have expand/collapse toggle button in dock');
      assert.ok(content.includes('id="voice-active-indicator"'), 'Must render active voice session in drawer');
      assert.ok(content.includes('id="clarification-card"'), 'Must render persistent clarification card in drawer');
      assert.ok(content.includes('id="proposal-apply-btn"'), 'Must render proposal apply button in drawer');
    });

    it('3.2 Minimized dock displays alert pill when an interactive event is awaiting user response', () => {
      const commandPath = path.join(rootDir, 'src', 'components', 'CommandBar.jsx');
      const content = fs.readFileSync(commandPath, 'utf-8');

      assert.ok(content.includes('id="command-dock-alert-pill"'), 'Must render dock alert pill when collapsed with pending item');
    });
  });

  describe('4. Accessibility and First-Time Discoverability', () => {
    it('4.1 Command input has accessible label and plain-language placeholder', () => {
      const commandPath = path.join(rootDir, 'src', 'components', 'CommandBar.jsx');
      const content = fs.readFileSync(commandPath, 'utf-8');

      assert.ok(content.includes('<label htmlFor="command-input" className="sr-only">'), 'Must have sr-only label element');
      assert.ok(content.includes('Planning command or task input'), 'Must have label text');
      assert.ok(content.includes('Tell VoxPlan what you need… (or click mic to speak)'), 'Must have friendly default placeholder');
    });

    it('4.2 Voice microphone button provides accessible state names and distinct visual indicators without relying solely on color', () => {
      const commandPath = path.join(rootDir, 'src', 'components', 'CommandBar.jsx');
      const content = fs.readFileSync(commandPath, 'utf-8');

      assert.ok(content.includes('id="voice-mic-btn"'), 'Must have voice-mic-btn');
      assert.ok(content.includes('Stop voice listening'), 'Must label stop state');
      assert.ok(content.includes('Connecting microphone... click to cancel'), 'Must label starting state');
      assert.ok(content.includes('Processing voice command'), 'Must label processing state');
      assert.ok(content.includes('Microphone error. Click to retry'), 'Must label error state');
      assert.ok(content.includes('Speech recognition not supported in this browser'), 'Must label unsupported state');
      assert.ok(content.includes('waveBars'), 'Must render waveBars animation during listening');
    });

    it('4.3 Empty state provides welcoming onboarding prompt with voice instructions', () => {
      const taskListPath = path.join(rootDir, 'src', 'components', 'TaskList.jsx');
      const content = fs.readFileSync(taskListPath, 'utf-8');

      assert.ok(content.includes('Your workspace is ready — no tasks created yet.'), 'Must have encouraging empty state headline');
      assert.ok(content.includes('Speak or type your instructions into the command dock below.'), 'Must explain how to speak or type');
      assert.ok(content.includes('id="empty-state-add-task-btn"'), 'Must have empty state action button');
    });
  });

  describe('5. Preservation of Local-First, Security, and Pipeline Invariants', () => {
    it('5.1 Typed and voice command pipelines both route through executeCommand into DialogueManager', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes('onExecuteCommand={executeCommand}'), 'CommandBar must receive executeCommand');
      assert.ok(content.includes('dialogueManager.processInput(rawText'), 'Must route into DialogueManager');
    });

    it('5.2 Voice Privacy notice assures user of local processing and 0 third-party AI transmission', () => {
      const commandPath = path.join(rootDir, 'src', 'components', 'CommandBar.jsx');
      const content = fs.readFileSync(commandPath, 'utf-8');

      assert.ok(content.includes('Voice Privacy:'), 'Must display privacy notice');
      assert.ok(content.includes('Web Speech API'), 'Must specify browser native Web Speech API');
      assert.ok(content.includes('never sent to third-party AI services'), 'Must guarantee zero third-party AI exposure');
    });
  });
});
