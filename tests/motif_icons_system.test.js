import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Motif Icon System & Zero-Emoji UI Verification', () => {
  const rootDir = process.cwd();
  const motifIconPath = path.join(rootDir, 'src', 'components', 'MotifIcon.jsx');

  it('1. MotifIcon component defines clean outline SVG structure with uniform tokens', () => {
    assert.ok(fs.existsSync(motifIconPath), 'MotifIcon.jsx must exist in src/components');
    const content = fs.readFileSync(motifIconPath, 'utf8');

    assert.ok(content.includes('viewBox="0 0 24 24"'), 'Must define standard 24x24 viewBox');
    assert.ok(content.includes('strokeWidth={strokeWidth}'), 'Must accept configurable strokeWidth (default 1.75)');
    assert.ok(content.includes('strokeLinecap="round"'), 'Must specify rounded stroke caps');
    assert.ok(content.includes('strokeLinejoin="round"'), 'Must specify rounded stroke joins');
    assert.ok(content.includes('fill="none"'), 'Must enforce outline style with fill="none"');
    assert.ok(content.includes('stroke={color}'), 'Must inherit stroke color token (default currentColor)');
    assert.ok(content.includes('aria-hidden'), 'Must support aria-hidden for decorative use');
  });

  it('2. MotifIcon registry includes all core functional motifs', () => {
    const content = fs.readFileSync(motifIconPath, 'utf8');
    const requiredMotifs = [
      'check', 'close', 'plus', 'pencil', 'trash',
      'task-sheet', 'memo', 'clipboard',
      'flame', 'bolt', 'flag', 'leaf',
      'calendar', 'clock', 'timer', 'hourglass',
      'play', 'pause', 'history', 'refresh',
      'lock', 'shield', 'eye', 'sparkle', 'lightbulb',
      'bell', 'settings', 'sliders', 'chart', 'trending-up',
      'search', 'cloud-upload', 'cloud-download', 'download', 'upload',
      'target', 'scale', 'flask', 'tag', 'chat', 'mic',
      'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'arrow-up-right',
      'chevron-left', 'chevron-right', 'chevron-up', 'chevron-down',
      'circle', 'warning', 'info'
    ];

    for (const name of requiredMotifs) {
      const motifPattern = new RegExp(`['"]?${name}['"]?\\s*:`, 'm');
      assert.ok(
        motifPattern.test(content),
        `MotifIcon must define motif "${name}" in MOTIFS registry`
      );
    }
  });

  it('3. Zero application UI emojis exist in any src/ component JSX files', () => {
    const srcDir = path.join(rootDir, 'src');
    // Unicode regex matching emoji pictographs and symbol characters
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}]|\uFE0F/u;

    function findJsxFiles(dir, files = []) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findJsxFiles(fullPath, files);
        } else if (entry.name.endsWith('.jsx')) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const jsxFiles = findJsxFiles(srcDir);
    assert.ok(jsxFiles.length > 20, 'Must audit all frontend JSX components');

    const violations = [];
    for (const file of jsxFiles) {
      const fileContent = fs.readFileSync(file, 'utf8');
      const lines = fileContent.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Ignore single line comments
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;
        if (emojiRegex.test(line)) {
          violations.push({
            file: path.relative(rootDir, file),
            line: idx + 1,
            text: trimmed
          });
        }
      });
    }

    assert.equal(
      violations.length,
      0,
      `Found ${violations.length} remaining emoji(s) in JSX UI files: ${JSON.stringify(violations, null, 2)}`
    );
  });
});
