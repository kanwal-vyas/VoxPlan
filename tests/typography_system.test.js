import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('VoxPlan — Final Typography Implementation Suite (System A3 + Rouge Script)', () => {
  const indexCssPath = path.join(rootDir, 'src', 'index.css');
  const indexCss = fs.readFileSync(indexCssPath, 'utf-8');

  describe('1. Production Font Registrations & Local Assets', () => {
    it('1.1 registers Trade Winds via @font-face for brand wordmark', () => {
      assert.ok(indexCss.includes("font-family: 'Trade Winds'"), "Must declare @font-face with font-family: 'Trade Winds'");
      assert.ok(indexCss.includes('/fonts/trade-winds/trade-winds-latin.woff2'), 'Must reference local trade-winds-latin.woff2');
      assert.ok(fs.existsSync(path.join(rootDir, 'public', 'fonts', 'trade-winds', 'trade-winds-latin.woff2')), 'trade-winds-latin.woff2 must exist');
    });

    it('1.2 registers Eagle Lake via @font-face for main headings (System A3)', () => {
      assert.ok(indexCss.includes("font-family: 'Eagle Lake'"), "Must declare @font-face with font-family: 'Eagle Lake'");
      assert.ok(indexCss.includes('/fonts/eagle-lake/eagle-lake-latin.woff2'), 'Must reference local eagle-lake-latin.woff2');
      assert.ok(fs.existsSync(path.join(rootDir, 'public', 'fonts', 'eagle-lake', 'eagle-lake-latin.woff2')), 'eagle-lake-latin.woff2 must exist');
    });

    it('1.3 registers Unica One via @font-face for smaller headings and compact labels', () => {
      assert.ok(indexCss.includes("font-family: 'Unica One'"), "Must declare @font-face with font-family: 'Unica One'");
      assert.ok(indexCss.includes('/fonts/unica-one/unica-one-latin.woff2'), 'Must reference local unica-one-latin.woff2');
      assert.ok(fs.existsSync(path.join(rootDir, 'public', 'fonts', 'unica-one', 'unica-one-latin.woff2')), 'unica-one-latin.woff2 must exist');
    });

    it('1.4 registers Lato via @font-face for readable body copy and functional UI (System A3)', () => {
      assert.ok(indexCss.includes("font-family: 'Lato'"), "Must declare @font-face with font-family: 'Lato'");
      assert.ok(indexCss.includes('/fonts/lato/lato-latin-400.woff2'), 'Must reference local regular lato-latin-400.woff2');
      assert.ok(indexCss.includes('/fonts/lato/lato-latin-700.woff2'), 'Must reference local bold lato-latin-700.woff2');
      assert.ok(fs.existsSync(path.join(rootDir, 'public', 'fonts', 'lato', 'lato-latin-400.woff2')), 'lato-latin-400.woff2 must exist');
      assert.ok(fs.existsSync(path.join(rootDir, 'public', 'fonts', 'lato', 'lato-latin-700.woff2')), 'lato-latin-700.woff2 must exist');
    });

    it('1.5 registers Shrikhand via @font-face for hero headline base', () => {
      assert.ok(indexCss.includes("font-family: 'Shrikhand'"), "Must declare @font-face with font-family: 'Shrikhand'");
      assert.ok(indexCss.includes('/fonts/shrikhand/shrikhand-latin.woff2'), 'Must reference local shrikhand-latin.woff2');
      assert.ok(fs.existsSync(path.join(rootDir, 'public', 'fonts', 'shrikhand', 'shrikhand-latin.woff2')), 'shrikhand-latin.woff2 must exist');
    });

    it('1.6 registers Shadows Into Light via @font-face for hero emphasis and sticky notes', () => {
      assert.ok(indexCss.includes("font-family: 'Shadows Into Light'"), "Must declare @font-face with font-family: 'Shadows Into Light'");
      assert.ok(indexCss.includes('/fonts/shadows-into-light/shadows-into-light-latin.woff2'), 'Must reference local shadows-into-light-latin.woff2');
      assert.ok(fs.existsSync(path.join(rootDir, 'public', 'fonts', 'shadows-into-light', 'shadows-into-light-latin.woff2')), 'shadows-into-light-latin.woff2 must exist');
    });

    it('1.7 registers Bigelow Rules via @font-face for selected short decorative accents', () => {
      assert.ok(indexCss.includes("font-family: 'Bigelow Rules'"), "Must declare @font-face with font-family: 'Bigelow Rules'");
      assert.ok(indexCss.includes('/fonts/bigelow-rules/bigelow-rules-latin.woff2'), 'Must reference local bigelow-rules-latin.woff2');
      assert.ok(fs.existsSync(path.join(rootDir, 'public', 'fonts', 'bigelow-rules', 'bigelow-rules-latin.woff2')), 'bigelow-rules-latin.woff2 must exist');
    });

    it('1.8 registers Rouge Script via @font-face and verifies self-hosted licensing record', () => {
      assert.ok(indexCss.includes("font-family: 'Rouge Script'"), "Must declare @font-face with font-family: 'Rouge Script'");
      assert.ok(indexCss.includes('/fonts/rouge-script/rouge-script-latin.woff2'), 'Must reference local rouge-script-latin.woff2 in index.css');
      assert.ok(fs.existsSync(path.join(rootDir, 'public', 'fonts', 'rouge-script', 'rouge-script-latin.woff2')), 'rouge-script-latin.woff2 must exist in production');

      // Verify production license record in public/fonts/LICENSES.md
      const licensePath = path.join(rootDir, 'public', 'fonts', 'LICENSES.md');
      assert.ok(fs.existsSync(licensePath), 'public/fonts/LICENSES.md must exist');
      const licenseContent = fs.readFileSync(licensePath, 'utf-8');
      assert.ok(licenseContent.includes('Rouge Script'), 'LICENSES.md must document Rouge Script');
      assert.ok(licenseContent.includes('SIL Open Font License, Version 1.1'), 'LICENSES.md must verify OFL 1.1 license');
      assert.ok(licenseContent.includes('Brenda Gallo') || licenseContent.includes('Sabrina Mariela Lopez'), 'LICENSES.md must cite original designers');
    });

    it('1.9 ensures all production @font-face declarations include font-display: swap and zero remote URLs', () => {
      assert.ok(!indexCss.includes('fonts.googleapis.com'), 'Must not contain external Google Fonts links');
      assert.ok(!indexCss.includes('fonts.gstatic.com'), 'Must not contain external Google Fonts cdn links');
    });
  });

  describe('2. Design System Tokens (System A3 Resolution)', () => {
    it('2.1 defines --font-wordmark as Trade Winds', () => {
      assert.ok(indexCss.includes("--font-wordmark: 'Trade Winds', cursive"), '--font-wordmark must be Trade Winds');
    });

    it('2.2 defines --font-display and --font-heading as Eagle Lake (System A3)', () => {
      assert.ok(indexCss.includes("--font-display: 'Eagle Lake'"), '--font-display must specify Eagle Lake');
      assert.ok(indexCss.includes("--font-heading: 'Eagle Lake'"), '--font-heading must specify Eagle Lake');
      assert.ok(indexCss.includes("--font-section: 'Eagle Lake'"), '--font-section must specify Eagle Lake');
    });

    it('2.3 defines --font-subheading and --font-compact as Unica One', () => {
      assert.ok(indexCss.includes("--font-subheading: 'Unica One'"), '--font-subheading must specify Unica One');
      assert.ok(indexCss.includes("--font-compact: 'Unica One'"), '--font-compact must specify Unica One');
    });

    it('2.4 defines --font-sans as Lato (replaces Plus Jakarta Sans as production body font)', () => {
      assert.ok(indexCss.includes("--font-sans: 'Lato'"), '--font-sans must specify Lato');
    });

    it('2.5 defines --font-hero as Shrikhand and --font-hero-accent as Shadows Into Light', () => {
      assert.ok(indexCss.includes("--font-hero: 'Shrikhand'"), '--font-hero must specify Shrikhand');
      assert.ok(indexCss.includes("--font-hero-accent: 'Shadows Into Light'"), '--font-hero-accent must specify Shadows Into Light');
    });

    it('2.6 defines --font-accent and --font-tagline as Bigelow Rules', () => {
      assert.ok(indexCss.includes("--font-accent: 'Bigelow Rules'"), '--font-accent must specify Bigelow Rules');
      assert.ok(indexCss.includes("--font-tagline: 'Bigelow Rules'"), '--font-tagline must specify Bigelow Rules');
    });
  });

  describe('3. Application of System A3 in Production Components', () => {
    it('3.1 Brand wordmark uses Trade Winds in Header, LandingPage, and LoadingScreen', () => {
      const headerContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'Header.jsx'), 'utf-8');
      assert.ok(headerContent.includes('--font-wordmark') || headerContent.includes('Trade Winds'), 'Header must use Trade Winds for brand');

      const landingContent = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'LandingPage.jsx'), 'utf-8');
      assert.ok(landingContent.includes('--font-wordmark') || landingContent.includes('Trade Winds'), 'LandingPage must use Trade Winds for brand');

      const loadingContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'LoadingScreen.jsx'), 'utf-8');
      assert.ok(loadingContent.includes('--font-wordmark') || loadingContent.includes('Trade Winds'), 'LoadingScreen must use Trade Winds for brand');
    });

    it('3.2 Hero renders headline in Shrikhand and highlights "clarity" and "focus" in Shadows Into Light', () => {
      const heroContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'Hero.jsx'), 'utf-8');
      assert.ok(heroContent.includes('--font-hero') || heroContent.includes('Shrikhand'), 'Hero must use Shrikhand for headline base');
      assert.ok(heroContent.includes('--font-hero-accent') || heroContent.includes('Shadows Into Light'), 'Hero must use Shadows Into Light for emphasis');
      assert.ok(heroContent.includes('clarity'), 'Must emphasize "clarity"');
      assert.ok(heroContent.includes('focus'), 'Must emphasize "focus"');
      assert.ok(heroContent.includes('#C85A32') || heroContent.includes('terracotta'), 'Terracotta highlight must be preserved');
      assert.ok(heroContent.includes('#E49218') || heroContent.includes('marigold'), 'Marigold highlight must be preserved');
      assert.ok(heroContent.includes('--font-compact') || heroContent.includes('Unica One'), 'Hero eyebrow/preview tag must use Unica One');
    });

    it('3.3 TaskList applies Eagle Lake for titles, Unica One for badges, Lato for tasks, and Bigelow Rules for empty accent', () => {
      const content = fs.readFileSync(path.join(rootDir, 'src', 'components', 'TaskList.jsx'), 'utf-8');
      assert.ok(content.includes('--font-display') || content.includes('Eagle Lake'), 'TaskList title must use Eagle Lake');
      assert.ok(content.includes('--font-subheading') || content.includes('Unica One'), 'TaskList badges must use Unica One');
      assert.ok(content.includes('--font-accent') || content.includes('Bigelow Rules'), 'TaskList empty state must use Bigelow Rules accent');
      assert.ok(content.includes('--font-sans') || content.includes('Lato'), 'TaskList subtitle must use Lato');
    });

    it('3.4 TaskCard applies Lato for task titles and Unica One for compact risk labels', () => {
      const content = fs.readFileSync(path.join(rootDir, 'src', 'components', 'TaskCard.jsx'), 'utf-8');
      assert.ok(content.includes('--font-sans') || content.includes('Lato'), 'TaskCard title must use Lato');
      assert.ok(content.includes('--font-compact') || content.includes('Unica One'), 'TaskCard risk label must use Unica One');
    });

    it('3.5 TaskCalendar applies Eagle Lake for headers, Unica One for badges, and Lato for task details', () => {
      const content = fs.readFileSync(path.join(rootDir, 'src', 'components', 'TaskCalendar.jsx'), 'utf-8');
      assert.ok(content.includes('--font-display') || content.includes('Eagle Lake'), 'Calendar mainHeading must use Eagle Lake');
      assert.ok(content.includes('--font-subheading') || content.includes('Unica One'), 'Calendar badges must use Unica One');
      assert.ok(content.includes('--font-sans') || content.includes('Lato'), 'Calendar detailTitle must use Lato');
    });

    it('3.6 ProjectOverview applies Eagle Lake for title, Unica One for badges, Lato for metrics, and Bigelow Rules for milestone accent', () => {
      const content = fs.readFileSync(path.join(rootDir, 'src', 'components', 'ProjectOverview.jsx'), 'utf-8');
      assert.ok(content.includes('--font-display') || content.includes('Eagle Lake'), 'ProjectOverview title must use Eagle Lake');
      assert.ok(content.includes('--font-subheading') || content.includes('Unica One'), 'ProjectOverview badge must use Unica One');
      assert.ok(content.includes('--font-accent') || content.includes('Bigelow Rules'), 'ProjectOverview must feature Bigelow Rules milestone accent');
      assert.ok(content.includes('--font-sans') || content.includes('Lato'), 'ProjectOverview metrics must use Lato');
    });

    it('3.7 ML and behavioral panels apply Eagle Lake for headers and Unica One for compact badges', () => {
      const mlContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'MLModelPanel.jsx'), 'utf-8');
      assert.ok(mlContent.includes('--font-display') || mlContent.includes('Eagle Lake'), 'MLModelPanel title must use Eagle Lake');
      assert.ok(mlContent.includes('--font-subheading') || mlContent.includes('Unica One'), 'MLModelPanel badge must use Unica One');

      const behContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'BehavioralHistoryPanel.jsx'), 'utf-8');
      assert.ok(behContent.includes('--font-display') || behContent.includes('Eagle Lake'), 'BehavioralHistoryPanel title must use Eagle Lake');
      assert.ok(behContent.includes('--font-subheading') || behContent.includes('Unica One'), 'BehavioralHistoryPanel badge must use Unica One');
    });

    it('3.8 ensures CommandBar, LearningReadinessPanel, and PreferenceSignalsCard do not retain legacy fallbacks', () => {
      const cmdContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'CommandBar.jsx'), 'utf-8');
      assert.ok(!cmdContent.includes('Ruigslay'), 'CommandBar must not fall back to Ruigslay');
      assert.ok(cmdContent.includes('--font-display'), 'CommandBar title must use var(--font-display)');
      assert.ok(cmdContent.includes('--font-sans'), 'CommandBar input must use var(--font-sans)');

      const learnContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'LearningReadinessPanel.jsx'), 'utf-8');
      assert.ok(!learnContent.includes('Zaslia'), 'LearningReadinessPanel must not fall back to Zaslia');
      assert.ok(!learnContent.includes('Plus Jakarta Sans'), 'LearningReadinessPanel must not fall back to Plus Jakarta Sans');

      const prefContent = fs.readFileSync(path.join(rootDir, 'src', 'components', 'PreferenceSignalsCard.jsx'), 'utf-8');
      assert.ok(!prefContent.includes('Zaslia'), 'PreferenceSignalsCard must not fall back to Zaslia');
      assert.ok(!prefContent.includes('Plus Jakarta Sans'), 'PreferenceSignalsCard must not fall back to Plus Jakarta Sans');
    });

    it('3.9 Overview page (LandingPage.jsx) applies approved typography (Eagle Lake, Trade Winds, Unica One, Bigelow Rules, Lato)', () => {
      const landingPath = path.join(rootDir, 'src', 'pages', 'LandingPage.jsx');
      const landingContent = fs.readFileSync(landingPath, 'utf-8');
      assert.ok(landingContent.includes("var(--font-wordmark, 'Trade Winds', cursive)"), 'Wordmark must use Trade Winds');
      assert.ok(landingContent.includes("var(--font-heading, 'Eagle Lake', cursive, serif)"), 'Headings must use Eagle Lake');
      assert.ok(landingContent.includes("var(--font-compact, 'Unica One', cursive, sans-serif)"), 'Badges must use Unica One');
      assert.ok(landingContent.includes("var(--font-accent, 'Bigelow Rules', cursive)"), 'Tagline note must use Bigelow Rules');
      assert.ok(landingContent.includes("var(--font-sans, 'Lato', sans-serif)"), 'Body text must use Lato');
      assert.ok(!landingContent.includes("'Syne'"), 'Must not retain obsolete Syne font');
      assert.ok(!landingContent.includes("'Caveat'"), 'Must not retain obsolete Caveat font');
    });
  });

  describe('4. Sticky-Note Handwriting Fonts Collection & Rouge Script Replacement', () => {
    it('4.1 stationeryCatalog exports exactly the 6 required handwriting fonts', async () => {
      const { STICKY_NOTE_HANDWRITING_FONTS, STATIONERY_STYLES } = await import(
        '../src/components/stickyNotes/stationeryCatalog.js'
      );
      assert.strictEqual(STICKY_NOTE_HANDWRITING_FONTS.length, 6, 'Must have exactly 6 sticky-note handwriting fonts');
      assert.strictEqual(STATIONERY_STYLES.length, 6, 'Must preserve exactly 6 stationery options');

      const expectedFonts = [
        'La Belle Aurore',
        'Sue Ellen Francisco',
        'Indie Flower',
        'Shadows Into Light',
        'Ephesis',
        'Rouge Script',
      ];

      const fontNames = STICKY_NOTE_HANDWRITING_FONTS.map((f) => (typeof f === 'string' ? f : f.name));
      for (const expected of expectedFonts) {
        assert.ok(
          fontNames.includes(expected),
          `STICKY_NOTE_HANDWRITING_FONTS must include ${expected}`
        );
      }
    });

    it('4.2 Serene Matcha (matcha-leaf) is assigned to Rouge Script', async () => {
      const { getStationeryById } = await import('../src/components/stickyNotes/stationeryCatalog.js');
      const matcha = getStationeryById('matcha-leaf');
      assert.ok(matcha, 'matcha-leaf stationery must exist');
      assert.strictEqual(matcha.handwritingName, 'Rouge Script', 'matcha-leaf must be named Rouge Script');
      assert.strictEqual(matcha.handwritingFont, "'Rouge Script', cursive", 'matcha-leaf must use Rouge Script font family');
    });

    it('4.3 Birthstone Bounce is no longer an available sticky-note option', async () => {
      const { STICKY_NOTE_HANDWRITING_FONTS, STATIONERY_STYLES } = await import(
        '../src/components/stickyNotes/stationeryCatalog.js'
      );
      assert.ok(
        !STICKY_NOTE_HANDWRITING_FONTS.includes('Birthstone Bounce'),
        'Birthstone Bounce must NOT be in STICKY_NOTE_HANDWRITING_FONTS'
      );

      for (const style of STATIONERY_STYLES) {
        assert.notStrictEqual(
          style.handwritingName,
          'Birthstone Bounce',
          `Stationery ${style.id} must not use Birthstone Bounce`
        );
        assert.ok(
          !style.handwritingFont.includes('Birthstone Bounce'),
          `Stationery ${style.id} font-family must not reference Birthstone Bounce`
        );
      }
    });

    it('4.4 TaskStickyNotes.css contains theme styling for Rouge Script with readability padding and line-height', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'stickyNotes', 'TaskStickyNotes.css');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      assert.ok(cssContent.includes('.theme-matcha-leaf'), 'TaskStickyNotes.css must have theme-matcha-leaf rule');
      assert.ok(cssContent.includes("'Rouge Script', cursive"), 'TaskStickyNotes.css must assign Rouge Script to matcha-leaf');
      assert.ok(cssContent.includes('line-height: 1.55') || cssContent.includes('line-height: 1.4'), 'Must set adequate line-height for flourishes');
    });

    it('4.5 TaskStickyNotesModal applies handwritingFont to title and body in composer and viewer modes', () => {
      const modalPath = path.join(rootDir, 'src', 'components', 'stickyNotes', 'TaskStickyNotesModal.jsx');
      const modalContent = fs.readFileSync(modalPath, 'utf-8');
      assert.ok(modalContent.includes('previewStationery.handwritingFont'), 'Composer mode must apply previewStationery.handwritingFont');
      assert.ok(modalContent.includes('activeStationery.handwritingFont'), 'Viewer mode must apply activeStationery.handwritingFont');
    });
  });

  describe('5. Clean Global Scope & Isolated Tooling', () => {
    it('5.1 root body font-family is set to var(--font-sans)', () => {
      assert.ok(indexCss.includes('font-family: var(--font-sans);'), ':root body must use var(--font-sans)');
    });

    it('5.2 no indiscriminate wildcard font-family override exists in global CSS', () => {
      assert.ok(!indexCss.match(/\*\s*\{[^}]*font-family/s), '* wildcard must not set font-family');
    });

    it('5.3 FontSpecimenPage is completely decommissioned and not exposed as an application route', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');
      assert.ok(!content.includes('/font-specimen'), 'App.jsx must not route /font-specimen');
      assert.ok(!content.includes('FontSpecimenPage'), 'App.jsx must not import FontSpecimenPage');

      // Verify files do not exist on disk
      assert.ok(!fs.existsSync(path.join(rootDir, 'src', 'pages', 'FontSpecimenPage.jsx')), 'FontSpecimenPage.jsx must not exist');
      assert.ok(!fs.existsSync(path.join(rootDir, 'src', 'pages', 'FontSpecimenPage.css')), 'FontSpecimenPage.css must not exist');
      assert.ok(!fs.existsSync(path.join(rootDir, 'src', 'pages', 'labFontCatalog.js')), 'labFontCatalog.js must not exist');
      assert.ok(!fs.existsSync(path.join(rootDir, 'public', 'fonts', 'lab')), 'public/fonts/lab must not exist');
    });
  });
});
