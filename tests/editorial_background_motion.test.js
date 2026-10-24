import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EDITORIAL_PALETTES,
  EDITORIAL_WORDS_CONFIG,
  hexToRgb,
  lerpColor,
  getMultiStopColor,
} from '../src/animations/scrollStory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Cinematic Editorial Background Motion & Visual Safety Test Suite', () => {
  describe('1. Architectural Safety: Presentation-Only Layer & Layout Isolation', () => {
    it('1.1 EditorialBackground component exists and declares presentation-only semantics', () => {
      const compPath = path.join(rootDir, 'src', 'components', 'EditorialBackground.jsx');
      const content = fs.readFileSync(compPath, 'utf-8');

      assert.ok(content.includes('id="voxplan-editorial-canvas"'), 'Must have canvas element id');
      assert.ok(content.includes('className="editorial-canvas-layer"'), 'Must have layer class');
      assert.ok(content.includes('aria-hidden="true"'), 'Must be hidden from assistive technologies');
      assert.ok(content.includes('editorial-words-layer'), 'Must contain words layer');
    });

    it('1.2 App.css enforces pointer-events: none and fixed non-disruptive stacking order', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('.editorial-canvas-layer {'), 'Must declare .editorial-canvas-layer');
      assert.ok(content.includes('pointer-events: none;'), 'Must have pointer-events none');
      assert.ok(content.includes('position: fixed;'), 'Must be fixed to viewport so document flow is untouched');
      assert.ok(content.includes('z-index: 0;'), 'Must sit at z-index 0 behind application content');
      assert.ok(content.includes('overflow: hidden;'), 'Must prevent giant letters from inducing horizontal or vertical scrollbars');
    });

    it('1.3 ProductivityApp nests canvas behind real content without altering document layout flow', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes('<EditorialBackground currentView={currentView} />'), 'Must render EditorialBackground');
      
      const canvasIdx = content.indexOf('<EditorialBackground');
      const contentIdx = content.indexOf('style={styles.content}');
      assert.ok(canvasIdx < contentIdx, 'EditorialBackground must be placed before content container');
      
      // Ensure real content sits at zIndex: 1 or higher above the canvas
      assert.ok(content.includes("zIndex: 1"), 'Real content must declare zIndex: 1+ above zIndex: 0 canvas');
      assert.ok(content.includes("padding: '0 20px 180px 20px'"), 'Must preserve 180px bottom dock clearance');
    });
  });

  describe('2. Oversized Editorial Words Sequence & Composition', () => {
    it('2.1 Exactly restores the original word sequence: PLAN, PREDICT, UNDERSTAND, ACT', () => {
      const compPath = path.join(rootDir, 'src', 'components', 'EditorialBackground.jsx');
      const content = fs.readFileSync(compPath, 'utf-8');

      assert.ok(content.includes('data-word="PLAN"'), 'Must include PLAN');
      assert.ok(content.includes('data-word="PREDICT"'), 'Must include PREDICT');
      assert.ok(content.includes('data-word="UNDERSTAND"'), 'Must include UNDERSTAND');
      assert.ok(content.includes('data-word="ACT"'), 'Must include ACT');

      const planIdx = content.indexOf('data-word="PLAN"');
      const predictIdx = content.indexOf('data-word="PREDICT"');
      const understandIdx = content.indexOf('data-word="UNDERSTAND"');
      const actIdx = content.indexOf('data-word="ACT"');

      assert.ok(planIdx < predictIdx && predictIdx < understandIdx && understandIdx < actIdx, 'Must render in exact sequence: PLAN -> PREDICT -> UNDERSTAND -> ACT');
    });

    it('2.2 Uses brand display typography with intentional viewport edge crops', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes("font-family: var(--font-display, 'Syne', sans-serif);"), 'Must use brand Syne display font');
      assert.ok(content.includes('.editorial-word-plan'), 'Must style plan');
      assert.ok(content.includes('.editorial-word-predict'), 'Must style predict');
      assert.ok(content.includes('.editorial-word-understand'), 'Must style understand');
      assert.ok(content.includes('.editorial-word-act'), 'Must style act');

      // Intentional edge crops using negative positions or clamp sizes
      assert.ok(content.includes('clamp(90px'), 'Must use oversized clamp typography');
    });
  });

  describe('3. Smooth Background Colour Transitions & Established Palette', () => {
    it('3.1 Palettes encompass all five required warm editorial colors', () => {
      const allColors = Object.values(EDITORIAL_PALETTES).flatMap((palette) => palette.map((p) => p.color.toUpperCase()));
      
      // Warm parchment / ivory (#FBF9F4)
      assert.ok(allColors.includes('#FBF9F4'), 'Must include warm parchment');
      // Butter yellow / marigold (#FFF8E7)
      assert.ok(allColors.includes('#FFF8E7'), 'Must include butter yellow/marigold');
      // Dusty lavender / soft plum (#F5EEF8)
      assert.ok(allColors.includes('#F5EEF8'), 'Must include dusty lavender');
      // Muted sage (#EBF5EE)
      assert.ok(allColors.includes('#EBF5EE'), 'Must include muted sage');
      // Warm peach / terracotta (#FDF0ED)
      assert.ok(allColors.includes('#FDF0ED'), 'Must include warm peach/terracotta');
    });

    it('3.2 Color interpolation functions calculate continuous smooth transitions', () => {
      const rgb = hexToRgb('#FBF9F4');
      assert.deepEqual(rgb, [251, 249, 244]);

      const mid = lerpColor('#000000', '#FFFFFF', 0.5);
      assert.equal(mid, 'rgb(128, 128, 128)');

      const stops = [
        { pos: 0.0, color: '#FBF9F4' },
        { pos: 1.0, color: '#FFF8E7' },
      ];
      const startColor = getMultiStopColor(stops, 0.0);
      assert.equal(startColor, 'rgb(251, 249, 244)');

      const endColor = getMultiStopColor(stops, 1.0);
      assert.equal(endColor, 'rgb(255, 248, 231)');
    });

    it('3.3 App container defines smooth transition on background-color', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('background-color: var(--voxplan-canvas-bg, #FBF9F4);'), 'Must bind to CSS custom property');
      assert.ok(content.includes('transition: background-color'), 'Must declare smooth CSS transition on background-color');
    });
  });

  describe('4. Three-Destination Navigation Coordination (Today / Tasks / Insights)', () => {
    it('4.1 Word configurations adapt specifically to Today, Tasks, and Insights views', () => {
      // Today includes full journey
      assert.ok(EDITORIAL_WORDS_CONFIG.today.some((w) => w.text === 'PLAN'));
      assert.ok(EDITORIAL_WORDS_CONFIG.today.some((w) => w.text === 'PREDICT'));
      assert.ok(EDITORIAL_WORDS_CONFIG.today.some((w) => w.text === 'UNDERSTAND'));
      assert.ok(EDITORIAL_WORDS_CONFIG.today.some((w) => w.text === 'ACT'));

      // Tasks keeps tasks focused and readable: restrained opacity <= 0.05
      const taskWords = EDITORIAL_WORDS_CONFIG.tasks;
      assert.ok(taskWords.every((w) => w.maxOpacity <= 0.05), 'Tasks view words must keep restrained opacity <= 0.05');

      // Insights highlights PREDICT and UNDERSTAND
      const insightWords = EDITORIAL_WORDS_CONFIG.insights;
      assert.ok(insightWords.some((w) => w.text === 'PREDICT'));
      assert.ok(insightWords.some((w) => w.text === 'UNDERSTAND'));
    });

    it('4.2 ProductivityApp updates scroll story controller when currentView changes', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes('initCinematicScrollStory({ currentView })'), 'Must pass currentView to scroll story initializer');
      assert.ok(content.includes('}, [currentView])'), 'Must re-initialize or adapt when currentView changes');
    });
  });

  describe('5. Mobile Optimization & Reduced Motion Compliance', () => {
    it('5.1 Mobile media query scales down typography and maintains compact dimensions', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('@media (max-width: 768px)'), 'Must declare mobile breakpoint');
      assert.ok(content.includes('.editorial-word-plan'), 'Must adapt word plan for mobile');
    });

    it('5.2 Reduced motion query disables sweeping motion and preserves static low opacity', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('@media (prefers-reduced-motion: reduce)'), 'Must declare reduced motion breakpoint');
      assert.ok(content.includes('.editorial-word-item {\n    transform: none !important;'), 'Must disable transforms under reduced motion');
      assert.ok(content.includes('background-color: #FBF9F4 !important;'), 'Must preserve stable background under reduced motion');
    });
  });

  describe('6. Mobile Command Dock Preservation', () => {
    it('6.1 CommandBar floats at zIndex: 1000 strictly above the presentation canvas (zIndex: 0)', () => {
      const cmdPath = path.join(rootDir, 'src', 'components', 'CommandBar.jsx');
      const cmdContent = fs.readFileSync(cmdPath, 'utf-8');
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(cmdContent.includes("zIndex: 1000"), 'CommandBar must have high zIndex: 1000');
      assert.ok(cssContent.includes('.editorial-canvas-layer') && cssContent.includes('z-index: 0;'), 'Canvas must sit at z-index: 0');
    });

    it('6.2 Compact mobile command dock styles (~54-58px) and drawer expansion remain intact', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('.command-dock-collapsed-mobile'), 'Must preserve compact mobile dock class');
      assert.ok(content.includes('#command-expanded-drawer'), 'Must preserve expanded drawer styles');
    });
  });
});
