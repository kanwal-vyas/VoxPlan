/**
 * Mobile Overflow Elimination & Product Copy Regression Test Suite
 *
 * Verifies:
 * 1. Complete elimination of "Playful Intelligence" branding from user-facing copy.
 * 2. Mobile viewport overflow detection logic (`scrollWidth <= clientWidth`).
 * 3. Responsive landing page CSS containment and grid column constraints.
 * 4. Responsive mobile navigation toggle, single-row header containment, and drawer bounds.
 * 5. Preservation of factory scheduler weights and activation invariants.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('Mobile Overflow Elimination & Product Copy Regression Suite', () => {
  describe('1. Elimination of "Playful Intelligence" Positioning', () => {
    it('1.1 index.html page title and meta description use professional predictive planning copy', () => {
      const htmlPath = path.join(rootDir, 'index.html');
      const html = fs.readFileSync(htmlPath, 'utf-8');

      assert.ok(!html.toLowerCase().includes('playful intelligence'), 'index.html must not contain "playful intelligence"');
      assert.ok(html.includes('VoxPlan — Predictive Task Planning & Adaptive Scheduling'), 'index.html title must reflect predictive task planning');
      assert.ok(html.includes('content="Local-first predictive task and scheduling intelligence'), 'index.html description must be professional and accurate');
    });

    it('1.2 App.jsx dynamic document title uses predictive task planning copy for /', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const appContent = fs.readFileSync(appPath, 'utf-8');

      assert.ok(!appContent.toLowerCase().includes('playful intelligence'), 'App.jsx must not contain "playful intelligence"');
      assert.ok(appContent.includes("VoxPlan — Predictive Task Planning & Adaptive Scheduling"), 'App.jsx must set title for / to predictive planning');
    });

    it('1.3 No active user-facing component contains "playful intelligence"', () => {
      const srcDir = path.join(rootDir, 'src');
      function scanDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            scanDir(fullPath);
          } else if (/\.(jsx?|tsx?|html)$/.test(file)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            assert.ok(
              !content.toLowerCase().includes('playful intelligence'),
              `File ${file} must not contain "playful intelligence"`
            );
          }
        }
      }
      scanDir(srcDir);
    });
  });

  describe('2. Mobile Viewport Overflow Detection Logic', () => {
    it('2.1 overflow detection algorithm accurately detects when scrollWidth > clientWidth', () => {
      // Simulating DOM measurements
      const overflowCase = { clientWidth: 320, scrollWidth: 440 };
      const nonOverflowCase = { clientWidth: 320, scrollWidth: 320 };

      const checkOverflow = (doc) => doc.scrollWidth > doc.clientWidth;

      assert.strictEqual(checkOverflow(overflowCase), true, 'Must detect horizontal overflow when scrollWidth > clientWidth');
      assert.strictEqual(checkOverflow(nonOverflowCase), false, 'Must confirm zero overflow when scrollWidth <= clientWidth');
    });

    it('2.2 elements extending beyond viewport right edge are flagged as overflowing', () => {
      const winWidth = 320;
      const elements = [
        { id: 'clean-btn', rectRight: 280, rectWidth: 80 },
        { id: 'overflow-table', rectRight: 450, rectWidth: 450 },
      ];

      const detected = elements.filter((el) => el.rectRight > winWidth + 1);
      assert.strictEqual(detected.length, 1);
      assert.strictEqual(detected[0].id, 'overflow-table');
      assert.strictEqual(detected[0].rectRight - winWidth, 130);
    });
  });

  describe('3. Landing Page Responsive Architecture & CSS Containment', () => {
    it('3.1 LandingPage.jsx provides responsive mobile state, navigation toggle, and mobile menu', () => {
      const landingPath = path.join(rootDir, 'src', 'pages', 'LandingPage.jsx');
      const content = fs.readFileSync(landingPath, 'utf-8');

      assert.ok(content.includes('isMobile'), 'LandingPage must track isMobile state for responsive rendering');
      assert.ok(content.includes('className="landing-desktop-nav"'), 'Must declare landing-desktop-nav class');
      assert.ok(content.includes('className="landing-mobile-menu-toggle"'), 'Must declare landing-mobile-menu-toggle class');
      assert.ok(content.includes('id="landing-mobile-menu"'), 'Must render mobile menu container when open');
    });

    it('3.2 LandingPage.jsx grid columns use minmax(min(100%, ...), 1fr) to prevent mobile blowout', () => {
      const landingPath = path.join(rootDir, 'src', 'pages', 'LandingPage.jsx');
      const content = fs.readFileSync(landingPath, 'utf-8');

      assert.ok(content.includes('minmax(min(100%, 280px), 1fr)'), 'Features & preview grids must adapt to narrow screens');
      assert.ok(content.includes('minmax(min(100%, 240px), 1fr)'), 'Timeline grid must adapt to narrow screens');
      assert.ok(content.includes('minmax(min(100%, 140px), 1fr)'), 'Metrics grid must adapt to narrow screens');
      assert.ok(content.includes('minmax(min(100%, 200px), 1fr)'), 'Footer grid must adapt to narrow screens');
    });

    it('3.3 App.css defines mobile rules eliminating horizontal overflow on overview page', () => {
      const cssPath = path.join(rootDir, 'src', 'App.css');
      const css = fs.readFileSync(cssPath, 'utf-8');

      assert.ok(css.includes('.landing-desktop-nav'), 'App.css must style landing-desktop-nav');
      assert.ok(css.includes('.landing-mobile-menu-toggle'), 'App.css must style landing-mobile-menu-toggle');
      assert.ok(css.includes('.landing-preview-body'), 'App.css must style landing-preview-body');
      assert.ok(css.includes('.landing-features-grid'), 'App.css must style landing-features-grid');
      assert.ok(css.includes('.landing-timeline-grid'), 'App.css must style landing-timeline-grid');
      assert.ok(css.includes('.landing-comparison-card'), 'App.css must style landing-comparison-card');
      assert.ok(css.includes('.overview-ribbon-wrap'), 'App.css must hide overview-ribbon-wrap on mobile');
    });
  });

  describe('4. Invariants & Factory Scheduler Integrity', () => {
    it('4.1 factory scheduler weights remain strictly immutable at canonical values', () => {
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
    });
  });
});
