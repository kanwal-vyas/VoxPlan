import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EDITORIAL_PALETTES,
  hexToRgb,
  lerpColor,
  getMultiStopColor,
} from '../src/animations/scrollStory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Animated Colour Fields Canvas & Visual Safety Test Suite', () => {
  describe('1. Architectural Safety: Presentation-Only Layer & Layout Isolation', () => {
    it('1.1 EditorialBackground component exists and declares presentation-only semantics', () => {
      const compPath = path.join(rootDir, 'src', 'components', 'EditorialBackground.jsx');
      const content = fs.readFileSync(compPath, 'utf-8');

      assert.ok(content.includes('id="voxplan-editorial-canvas"'), 'Must have canvas element id');
      assert.ok(content.includes('className="editorial-canvas-layer"'), 'Must have layer class');
      assert.ok(content.includes('aria-hidden="true"'), 'Must be hidden from assistive technologies');
      assert.ok(content.includes('colour-fields-layer'), 'Must contain colour fields layer');
    });

    it('1.2 App.css enforces pointer-events: none and fixed non-disruptive stacking order', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('.editorial-canvas-layer {'), 'Must declare .editorial-canvas-layer');
      assert.ok(content.includes('pointer-events: none;'), 'Must have pointer-events none');
      assert.ok(content.includes('position: fixed;'), 'Must be fixed to viewport so document flow is untouched');
      assert.ok(content.includes('z-index: 0;'), 'Must sit at z-index 0 behind application content');
      assert.ok(content.includes('overflow: hidden;'), 'Must prevent giant shapes from inducing horizontal or vertical scrollbars');
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

  describe('2. Oversized Abstract Colour Fields & Elimination of Faint Words', () => {
    it('2.1 Replaces faint words with curated oversized colour fields', () => {
      const compPath = path.join(rootDir, 'src', 'components', 'EditorialBackground.jsx');
      const content = fs.readFileSync(compPath, 'utf-8');

      // Faint words must be removed from canvas
      assert.ok(!content.includes('data-word="PLAN"'), 'Must not render faint word PLAN');
      assert.ok(!content.includes('data-word="PREDICT"'), 'Must not render faint word PREDICT');
      assert.ok(!content.includes('data-word="UNDERSTAND"'), 'Must not render faint word UNDERSTAND');
      assert.ok(!content.includes('data-word="ACT"'), 'Must not render faint word ACT');

      // Curated colour fields must be present
      assert.ok(content.includes('id="colour-field-sun"'), 'Must render sun / marigold field');
      assert.ok(content.includes('id="colour-field-lavender"'), 'Must render lavender field');
      assert.ok(content.includes('id="colour-field-sage"'), 'Must render sage field');
      assert.ok(content.includes('id="colour-field-peach"'), 'Must render peach field');
    });

    it('2.2 Shapes use soft gradients, organic curvature, and deliberate negative space', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('.colour-field-sun'), 'Must style sun field');
      assert.ok(content.includes('.colour-field-lavender'), 'Must style lavender field');
      assert.ok(content.includes('.colour-field-sage'), 'Must style sage field');
      assert.ok(content.includes('.colour-field-peach'), 'Must style peach field');

      // Radial gradients and organic curvature
      assert.ok(content.includes('radial-gradient'), 'Must use soft radial gradients');
      assert.ok(content.includes('border-radius'), 'Must declare curved border radius');
      assert.ok(content.includes('filter: blur('), 'Must blend softly with diffuse gaussian blur');
    });

    it('2.3 Declares calm, continuous ambient drift animations that work without scrolling', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('@keyframes driftSun'), 'Must declare ambient drift for sun field');
      assert.ok(content.includes('@keyframes driftLavender'), 'Must declare ambient drift for lavender field');
      assert.ok(content.includes('@keyframes driftSage'), 'Must declare ambient drift for sage field');
      assert.ok(content.includes('@keyframes driftPeach'), 'Must declare ambient drift for peach field');

      assert.ok(content.includes('animation: driftSun'), 'Sun field must apply drift animation');
      assert.ok(content.includes('animation: driftLavender'), 'Lavender field must apply drift animation');
      assert.ok(content.includes('animation: driftSage'), 'Sage field must apply drift animation');
      assert.ok(content.includes('animation: driftPeach'), 'Peach field must apply drift animation');
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
    it('4.1 Canvas coordinates colour field prominence per view tab', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('.editorial-canvas-layer[data-current-view="today"]'), 'Must coordinate today view');
      assert.ok(content.includes('.editorial-canvas-layer[data-current-view="tasks"]'), 'Must coordinate tasks view');
      assert.ok(content.includes('.editorial-canvas-layer[data-current-view="insights"]'), 'Must coordinate insights view');
    });

    it('4.2 ProductivityApp updates scroll story controller when currentView changes', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes('initCinematicScrollStory({ currentView })'), 'Must pass currentView to scroll story initializer');
      assert.ok(content.includes('}, [currentView])'), 'Must re-initialize or adapt when currentView changes');
    });
  });

  describe('5. Mobile Optimization & Reduced Motion Compliance', () => {
    it('5.1 Mobile media query scales down colour fields for compact mobile screens', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('@media (max-width: 768px)'), 'Must declare mobile breakpoint');
      assert.ok(content.includes('.colour-field-sun'), 'Must adapt sun field for mobile');
      assert.ok(content.includes('.colour-field-lavender'), 'Must adapt lavender field for mobile');
    });

    it('5.2 Reduced motion query disables continuous ambient animations and preserves static composition', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const content = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(content.includes('@media (prefers-reduced-motion: reduce)'), 'Must declare reduced motion breakpoint');
      assert.ok(content.includes('.colour-field-item {\n    animation: none !important;'), 'Must disable continuous animations under reduced motion');
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
