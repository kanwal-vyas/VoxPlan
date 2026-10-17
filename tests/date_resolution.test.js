import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEnhancedDate,
  formatISODate,
} from '../src/conversation/compoundCommandParser.js';
import { parseDateExpression } from '../src/conversation/dialogueManager.js';

describe('Gate 1 — Deterministic Date Resolution & Consistency Audit', () => {
  // Reference date: Saturday, October 17, 2026
  const refDate = new Date(2026, 9, 17, 12, 0, 0); // Month is 0-indexed: 9 = October

  test('Mandatory reference date table (Saturday, October 17, 2026)', () => {
    // today -> October 17, 2026
    assert.equal(parseEnhancedDate('today', refDate), '2026-10-17');
    assert.equal(parseDateExpression('today', refDate), '2026-10-17');

    // tomorrow -> October 18, 2026
    assert.equal(parseEnhancedDate('tomorrow', refDate), '2026-10-18');
    assert.equal(parseDateExpression('tomorrow', refDate), '2026-10-18');

    // the 19th -> October 19, 2026
    assert.equal(parseEnhancedDate('the 19th', refDate), '2026-10-19');
    assert.equal(parseDateExpression('the 19th', refDate), '2026-10-19');

    // the 19th of October -> October 19, 2026
    assert.equal(parseEnhancedDate('the 19th of October', refDate), '2026-10-19');
    assert.equal(parseDateExpression('the 19th of October', refDate), '2026-10-19');

    // 19th October -> October 19, 2026
    assert.equal(parseEnhancedDate('19th October', refDate), '2026-10-19');
    assert.equal(parseDateExpression('19th October', refDate), '2026-10-19');

    // October 19 -> October 19, 2026
    assert.equal(parseEnhancedDate('October 19', refDate), '2026-10-19');
    assert.equal(parseDateExpression('October 19', refDate), '2026-10-19');

    // next Monday -> October 19, 2026 (next occurrence of Monday from Saturday Oct 17)
    assert.equal(parseEnhancedDate('next Monday', refDate), '2026-10-19');
    assert.equal(parseDateExpression('next Monday', refDate), '2026-10-19');
  });

  test('Prepositional date expressions ("for today", "for tomorrow", "for the 19th", "due Friday")', () => {
    assert.equal(parseEnhancedDate('for today', refDate), '2026-10-17');
    assert.equal(parseEnhancedDate('for tomorrow', refDate), '2026-10-18');
    assert.equal(parseEnhancedDate('for the 19th', refDate), '2026-10-19');
    assert.equal(parseEnhancedDate('due Friday', refDate), '2026-10-23'); // Next Friday: Oct 23
    assert.equal(parseEnhancedDate('for Friday', refDate), '2026-10-23');
    assert.equal(parseEnhancedDate('by October 19', refDate), '2026-10-19');
  });

  test('Ordinal date rollover semantics across month boundaries', () => {
    // Current date is Oct 17. Asking for "the 5th" should roll to upcoming November 5
    assert.equal(parseEnhancedDate('the 5th', refDate), '2026-11-05');
    assert.equal(parseEnhancedDate('the 17th', refDate), '2026-10-17'); // Today
    assert.equal(parseEnhancedDate('the 18th', refDate), '2026-10-18'); // Tomorrow
  });

  test('Year boundary rollover (December 31 -> January 1)', () => {
    const newYearsEve = new Date(2026, 11, 31, 23, 0, 0); // Dec 31, 2026
    assert.equal(parseEnhancedDate('today', newYearsEve), '2026-12-31');
    assert.equal(parseEnhancedDate('tomorrow', newYearsEve), '2027-01-01');
    assert.equal(parseEnhancedDate('the 5th', newYearsEve), '2027-01-05'); // Upcoming 5th is Jan 5, 2027
  });

  test('Timezone consistency: formatISODate uses local calendar components without UTC shift', () => {
    // Construct local midnight date
    const d = new Date(2026, 9, 19, 0, 0, 0);
    // formatISODate extracts local getFullYear, getMonth, getDate
    assert.equal(formatISODate(d), '2026-10-19');
  });

  test('Invalid and ambiguous calendar strings return null safely', () => {
    assert.equal(parseEnhancedDate('invalid-date', refDate), null);
    assert.equal(parseEnhancedDate('never', refDate), null);
    assert.equal(parseEnhancedDate('32nd of October', refDate), null);
    assert.equal(parseEnhancedDate('February 30', refDate), null);
  });
});
