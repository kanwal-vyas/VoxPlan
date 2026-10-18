import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeIcsText,
  foldIcsLine,
  unfoldIcsText,
  formatIcsUtcTimestamp,
  formatIcsLocalDateTime,
  generateStableSessionUid,
  extractExportableSessions,
  generateIcsCalendar,
  validateIanaTimeZone,
  getTimezoneOffsetMinutes,
  formatIcsOffset,
  generateVtimezoneComponent,
  saveAcceptedSchedule,
  loadAcceptedSchedule,
  clearAcceptedSchedule,
  CRLF,
} from '../src/scheduler/icalExporter.js';

import { generateAdaptiveSchedule } from '../src/scheduler/adaptiveScheduler.js';

describe('Phase 6.4: RFC 5545 Calendar Export (.ics)', () => {
  const fixedTimestamp = '2026-10-18T10:30:00Z';

  // --- 1. ICS Structure & Calendar Basics ---

  test('1. Valid calendar with zero events', () => {
    const emptySchedule = { proposedPlacements: [] };
    const result = generateIcsCalendar(emptySchedule, {
      exportTimestamp: fixedTimestamp,
    });

    assert.equal(result.sessionCount, 0);
    assert.equal(result.omittedCount, 0);

    const ics = result.ics;
    assert.ok(ics.startsWith(`BEGIN:VCALENDAR${CRLF}`));
    assert.ok(ics.includes(`VERSION:2.0${CRLF}`));
    assert.ok(ics.includes(`PRODID:-//VoxPlan//VoxPlan Scheduler 1.0//EN${CRLF}`));
    assert.ok(ics.includes(`CALSCALE:GREGORIAN${CRLF}`));
    assert.ok(ics.includes(`METHOD:PUBLISH${CRLF}`));
    assert.ok(ics.includes(`X-WR-CALNAME:VoxPlan Schedule${CRLF}`));
    assert.ok(ics.endsWith(`END:VCALENDAR${CRLF}`));
    assert.ok(!ics.includes('BEGIN:VEVENT'));
  });

  test('2. Valid calendar containing one single session', () => {
    const singleSchedule = {
      proposedPlacements: [
        {
          placementId: 'placement_task-1',
          taskId: 'task-1',
          taskTitle: 'Code Review',
          proposedDate: '2026-10-19',
          startTime: '09:00',
          endTime: '11:00',
          status: 'on_time',
          chunkDuration: 2.0,
          taskCategory: 'Engineering',
          taskPriority: 'high',
        },
      ],
    };

    const result = generateIcsCalendar(singleSchedule, {
      exportTimestamp: fixedTimestamp,
    });

    assert.equal(result.sessionCount, 1);
    assert.equal(result.omittedCount, 0);
    assert.equal(result.uids.length, 1);
    assert.equal(result.uids[0], 'placement_task-1@voxplan.local');

    const ics = result.ics;
    assert.ok(ics.includes(`BEGIN:VEVENT${CRLF}`));
    assert.ok(ics.includes(`UID:placement_task-1@voxplan.local${CRLF}`));
    assert.ok(ics.includes(`DTSTAMP:20261018T103000Z${CRLF}`));
    assert.ok(ics.includes(`DTSTART:20261019T090000${CRLF}`));
    assert.ok(ics.includes(`DTEND:20261019T110000${CRLF}`));
    assert.ok(ics.includes(`SUMMARY:Code Review${CRLF}`));
    assert.ok(ics.includes(`STATUS:CONFIRMED${CRLF}`));
    assert.ok(ics.includes(`END:VEVENT${CRLF}`));
  });

  test('3. Multiple sessions on different dates', () => {
    const schedule = {
      proposedPlacements: [
        {
          placementId: 'placement_task-1',
          taskId: 'task-1',
          taskTitle: 'Database Schema',
          proposedDate: '2026-10-19',
          startTime: '09:00',
          endTime: '11:00',
          status: 'on_time',
        },
        {
          placementId: 'placement_task-2',
          taskId: 'task-2',
          taskTitle: 'API Route Implementation',
          proposedDate: '2026-10-20',
          startTime: '14:00',
          endTime: '16:30',
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(schedule, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 2);
    assert.equal(result.omittedCount, 0);

    const unfolded = unfoldIcsText(result.ics);
    assert.ok(unfolded.includes('DTSTART:20261019T090000'));
    assert.ok(unfolded.includes('DTSTART:20261020T140000'));
  });

  // --- 2. Multi-Day Chunking & Workload Modeling ---

  test('4. Multi-day chunked tasks export each session with NO duplicate parent event', () => {
    const chunkedSchedule = {
      proposedPlacements: [
        {
          placementId: 'placement_task-3_chunk_0',
          taskId: 'task-3',
          taskTitle: 'Major Refactoring',
          proposedDate: '2026-10-19',
          startTime: '09:00',
          endTime: '12:00',
          status: 'on_time',
          isChunk: true,
          chunkIndex: 0,
          totalChunks: 2,
          chunkDuration: 3.0,
          parentTotalEffort: 6.0,
        },
        {
          placementId: 'placement_task-3_chunk_1',
          taskId: 'task-3',
          taskTitle: 'Major Refactoring',
          proposedDate: '2026-10-20',
          startTime: '09:00',
          endTime: '12:00',
          status: 'on_time',
          isChunk: true,
          chunkIndex: 1,
          totalChunks: 2,
          chunkDuration: 3.0,
          parentTotalEffort: 6.0,
        },
      ],
    };

    const result = generateIcsCalendar(chunkedSchedule, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 2);
    assert.equal(result.omittedCount, 0);

    const unfolded = unfoldIcsText(result.ics);
    // Each chunk session has its own VEVENT with session indicator
    assert.ok(unfolded.includes('SUMMARY:Major Refactoring (Session 1 of 2)'));
    assert.ok(unfolded.includes('SUMMARY:Major Refactoring (Session 2 of 2)'));

    // Count VEVENT occurrences: exactly 2, zero duplicate parent event
    const veventCount = (result.ics.match(/BEGIN:VEVENT/g) || []).length;
    assert.equal(veventCount, 2);

    // Verify distinct UIDs
    assert.equal(result.uids.length, 2);
    assert.notEqual(result.uids[0], result.uids[1]);
    assert.ok(result.uids[0].includes('chunk_0'));
    assert.ok(result.uids[1].includes('chunk_1'));
  });

  test('5. Partial allocation exports valid chunks and omits unscheduled effort', () => {
    const partialSchedule = {
      proposedPlacements: [
        {
          placementId: 'placement_task-big_chunk_0',
          taskId: 'task-big',
          taskTitle: 'Massive Migration',
          proposedDate: '2026-10-19',
          startTime: '09:00',
          endTime: '13:00',
          status: 'on_time',
          isChunk: true,
          chunkIndex: 0,
          totalChunks: 1,
          chunkDuration: 4.0,
        },
        {
          placementId: 'placement_task-big_unscheduled',
          taskId: 'task-big',
          taskTitle: 'Massive Migration',
          proposedDate: null,
          startTime: null,
          endTime: null,
          status: 'unscheduled',
          effectiveHours: 4.0,
        },
      ],
    };

    const result = generateIcsCalendar(partialSchedule, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 1);
    assert.equal(result.omittedCount, 1);
    assert.equal(result.omittedSessions[0].reason, 'unscheduled_effort');
    assert.equal(result.omittedSessions[0].taskId, 'task-big');
  });

  test('6. Blocked tasks and oversized tasks are excluded from calendar export', () => {
    const mixedSchedule = {
      proposedPlacements: [
        {
          placementId: 'blocked_task-dep',
          taskId: 'task-dep',
          taskTitle: 'Blocked Dependent',
          status: 'blocked_by_dependency',
          proposedDate: null,
        },
        {
          placementId: 'oversized_task-huge',
          taskId: 'task-huge',
          taskTitle: 'Oversized Monolith',
          status: 'oversized_exceeds_capacity',
          proposedDate: null,
        },
        {
          placementId: 'placement_task-ok',
          taskId: 'task-ok',
          taskTitle: 'Normal Task',
          status: 'on_time',
          proposedDate: '2026-10-21',
          startTime: '10:00',
          endTime: '12:00',
        },
      ],
    };

    const result = generateIcsCalendar(mixedSchedule, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 1);
    assert.equal(result.omittedCount, 2);

    const reasons = result.omittedSessions.map((s) => s.reason);
    assert.ok(reasons.includes('blocked_by_dependency'));
    assert.ok(reasons.includes('oversized_exceeds_capacity'));
    assert.ok(result.ics.includes('SUMMARY:Normal Task'));
    assert.ok(!result.ics.includes('Blocked Dependent'));
    assert.ok(!result.ics.includes('Oversized Monolith'));
  });

  test('7. Distinct sessions with identical task titles remain distinct in export', () => {
    const duplicateTitles = {
      proposedPlacements: [
        {
          placementId: 'placement_task-english-1',
          taskId: 'task-english-1',
          taskTitle: 'English Essay',
          proposedDate: '2026-10-19',
          startTime: '09:00',
          endTime: '10:30',
          status: 'on_time',
        },
        {
          placementId: 'placement_task-english-2',
          taskId: 'task-english-2',
          taskTitle: 'English Essay',
          proposedDate: '2026-10-20',
          startTime: '14:00',
          endTime: '15:30',
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(duplicateTitles, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 2);
    assert.notEqual(result.uids[0], result.uids[1]);
    assert.equal(result.uids[0], 'placement_task-english-1@voxplan.local');
    assert.equal(result.uids[1], 'placement_task-english-2@voxplan.local');
  });

  // --- 3. Date, Time & Timezone Correctness ---

  test('8. DTEND strictly follows DTSTART; invalid ranges are excluded', () => {
    const invalidTimeRange = {
      proposedPlacements: [
        {
          placementId: 'placement_bad-time',
          taskId: 'task-bad',
          taskTitle: 'Bad Time Task',
          proposedDate: '2026-10-19',
          startTime: '15:00',
          endTime: '14:00', // End before start
          status: 'on_time',
        },
        {
          placementId: 'placement_equal-time',
          taskId: 'task-equal',
          taskTitle: 'Zero Duration Task',
          proposedDate: '2026-10-19',
          startTime: '10:00',
          endTime: '10:00', // Zero duration
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(invalidTimeRange, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 0);
    assert.equal(result.omittedCount, 2);
    assert.equal(result.omittedSessions[0].reason, 'end_time_not_after_start_time');
    assert.equal(result.omittedSessions[1].reason, 'end_time_not_after_start_time');
  });

  test('9. Local calendar date and wall-clock time representation prevents UTC drift', () => {
    // Tests that 2026-10-18 at 09:00 is serialized as floating local time without 'Z'
    // This prevents positive timezones (+05:30) or negative timezones from shifting dates to Oct 17 or Oct 19
    const formatted = formatIcsLocalDateTime('2026-10-18', '09:00');
    assert.equal(formatted, '20261018T090000');
    assert.ok(!formatted.endsWith('Z'), 'Never append Z to local wall-clock time');

    const schedule = {
      proposedPlacements: [
        {
          placementId: 'p1',
          taskId: 't1',
          taskTitle: 'Morning Session',
          proposedDate: '2026-10-18',
          startTime: '09:00',
          endTime: '12:00',
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(schedule, { exportTimestamp: fixedTimestamp });
    const unfolded = unfoldIcsText(result.ics);
    assert.ok(unfolded.includes('DTSTART:20261018T090000'));
    assert.ok(unfolded.includes('DTEND:20261018T120000'));
    assert.ok(!unfolded.includes('DTSTART:20261018T090000Z'));
  });

  test('10. Optional TZID parameter serializes correctly when provided', () => {
    const schedule = {
      proposedPlacements: [
        {
          placementId: 'p1',
          taskId: 't1',
          taskTitle: 'Morning Session',
          proposedDate: '2026-10-18',
          startTime: '09:00',
          endTime: '12:00',
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(schedule, {
      exportTimestamp: fixedTimestamp,
      tzid: 'America/New_York',
    });

    const unfolded = unfoldIcsText(result.ics);
    assert.ok(unfolded.includes('DTSTART;TZID=America/New_York:20261018T090000'));
    assert.ok(unfolded.includes('DTEND;TZID=America/New_York:20261018T120000'));
  });

  test('11. Missing timing information does not invent arbitrary times', () => {
    const missingTimingSchedule = {
      proposedPlacements: [
        {
          placementId: 'p-no-time',
          taskId: 't-no-time',
          taskTitle: 'Untimed Task',
          proposedDate: '2026-10-22',
          startTime: null,
          endTime: null,
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(missingTimingSchedule, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 0);
    assert.equal(result.omittedCount, 1);
    assert.equal(result.omittedSessions[0].reason, 'missing_timing');
  });

  // --- 4. UID Stability & Repeated Exports ---

  test('12. Repeated exports of an unchanged schedule produce identical UIDs', () => {
    const schedule = {
      proposedPlacements: [
        {
          placementId: 'placement_task-alpha',
          taskId: 'task-alpha',
          taskTitle: 'Alpha Session',
          proposedDate: '2026-10-20',
          startTime: '09:00',
          endTime: '11:00',
          status: 'on_time',
        },
        {
          placementId: 'placement_task-beta_chunk_0',
          taskId: 'task-beta',
          taskTitle: 'Beta Session',
          proposedDate: '2026-10-21',
          startTime: '10:00',
          endTime: '13:00',
          status: 'on_time',
          isChunk: true,
          chunkIndex: 0,
        },
      ],
    };

    const export1 = generateIcsCalendar(schedule, { exportTimestamp: '2026-10-18T10:00:00Z' });
    const export2 = generateIcsCalendar(schedule, { exportTimestamp: '2026-10-18T15:00:00Z' });

    // DTSTAMP can change
    assert.ok(export1.ics.includes('DTSTAMP:20261018T100000Z'));
    assert.ok(export2.ics.includes('DTSTAMP:20261018T150000Z'));

    // UIDs MUST remain completely identical across exports
    assert.deepEqual(export1.uids, export2.uids);
    assert.equal(export1.uids[0], 'placement_task-alpha@voxplan.local');
    assert.equal(export1.uids[1], 'placement_task-beta_chunk_0@voxplan.local');
  });

  // --- 5. RFC 5545 Text Escaping & Injection Protection ---

  test('13. Text escaping handles backslashes, semicolons, commas, and newlines', () => {
    const escaped = escapeIcsText('Notes: Chapter 1, Section 2; see \\important\\ items.\nNext paragraph.');
    assert.equal(escaped, 'Notes: Chapter 1\\, Section 2\\; see \\\\important\\\\ items.\\nNext paragraph.');
  });

  test('14. Malicious text cannot inject calendar components or new properties', () => {
    const maliciousSchedule = {
      proposedPlacements: [
        {
          placementId: 'p-exploit',
          taskId: 't-exploit',
          taskTitle: 'Legit Task\r\nBEGIN:VEVENT\r\nUID:injected@hacker.com\r\nSUMMARY:Hacked\r\nEND:VEVENT',
          proposedDate: '2026-10-20',
          startTime: '09:00',
          endTime: '10:00',
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(maliciousSchedule, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 1);

    // Verify there is strictly ONE BEGIN:VEVENT component line in the file
    const logicalLines = unfoldIcsText(result.ics).split(CRLF);
    const veventComponents = logicalLines.filter((line) => line === 'BEGIN:VEVENT');
    assert.equal(veventComponents.length, 1, 'Only one BEGIN:VEVENT component should exist');

    // Verify there is strictly ONE UID property and it belongs to p-exploit
    const uidProperties = logicalLines.filter((line) => line.startsWith('UID:'));
    assert.equal(uidProperties.length, 1, 'Only one UID property should exist');
    assert.equal(uidProperties[0], 'UID:p-exploit@voxplan.local');

    // The injected content must be converted to literal escaped text inside SUMMARY
    assert.ok(!result.ics.includes(`UID:injected@hacker.com${CRLF}`));
    const unfolded = unfoldIcsText(result.ics);
    assert.ok(unfolded.includes('SUMMARY:Legit Task\\nBEGIN:VEVENT\\nUID:injected@hacker.com'));
  });

  // --- 6. UTF-8 Octet Line Folding & Unfolding ---

  test('15. Content lines adhere to the 75-octet limit and fold without breaking multibyte characters', () => {
    // English ASCII line longer than 75 octets
    const longAscii = 'SUMMARY:This is an extremely long task title designed to test the RFC 5545 seventy-five octet content line folding behavior';
    const foldedAscii = foldIcsLine(longAscii, 75);

    // Verify each physical line is <= 75 octets (excluding CRLF)
    const lines = foldedAscii.split(CRLF).filter(Boolean);
    const encoder = new TextEncoder();
    for (const l of lines) {
      assert.ok(encoder.encode(l).length <= 75, `Line exceeds 75 octets: ${l}`);
    }
    // Verify continuation line begins with space
    assert.ok(lines[1].startsWith(' '));

    // Verify round-trip unfolding
    const unfolded = unfoldIcsText(foldedAscii);
    assert.equal(unfolded.trim(), longAscii);
  });

  test('16. Multibyte UTF-8 characters (emojis, CJK, accents) are never split mid-character', () => {
    // Japanese text + emojis + symbols (each emoji is 4 bytes, Japanese characters are 3 bytes each)
    const complexUnicode = 'SUMMARY:プロジェクト計画書レビュー 🎯 🚀 — 重要なマイルストーン確認と次のスプリントのタスク優先順位付けのミーティング';
    const foldedUnicode = foldIcsLine(complexUnicode, 75);

    const lines = foldedUnicode.split(CRLF).filter(Boolean);
    const encoder = new TextEncoder();
    for (const l of lines) {
      assert.ok(encoder.encode(l).length <= 75, `Line exceeds 75 octets: ${l}`);
    }

    // Verify continuation lines begin with space
    assert.ok(lines.length > 1, 'Should have folded into multiple lines');
    for (let i = 1; i < lines.length; i++) {
      assert.ok(lines[i].startsWith(' '), 'Continuation line must start with space');
    }

    // Verify round-trip unfolding recovers exact original Unicode string
    const unfolded = unfoldIcsText(foldedUnicode);
    assert.equal(unfolded.trim(), complexUnicode);
  });

  test('17. Generated calendar uses CRLF endings exclusively', () => {
    const schedule = {
      proposedPlacements: [
        {
          placementId: 'placement_crlf_test',
          taskId: 'task-crlf',
          taskTitle: 'Check Line Endings',
          proposedDate: '2026-10-20',
          startTime: '10:00',
          endTime: '11:00',
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(schedule, { exportTimestamp: fixedTimestamp });

    // Check that every newline in the string is part of CRLF (\r\n), with no bare \n
    const withoutCrlf = result.ics.replace(/\r\n/g, '');
    assert.ok(!withoutCrlf.includes('\n'), 'Output contains bare LF');
    assert.ok(!withoutCrlf.includes('\r'), 'Output contains bare CR');
  });

  // --- 7. End-to-End Integration with Adaptive Scheduler ---

  test('18. End-to-end integration: adaptive schedule output generates valid RFC 5545 export', () => {
    const tasks = [
      {
        id: 'task-e2e-1',
        title: 'Architecture Review',
        estimatedEffort: 3.0,
        priority: 'high',
        category: 'Engineering',
        description: 'Review system design documents',
        dueDate: '2026-10-22',
      },
      {
        id: 'task-e2e-2',
        title: 'Component Implementation',
        estimatedEffort: 8.0, // Exceeds daily capacity (6.0h), will be chunked
        priority: 'medium',
        category: 'Frontend',
        dueDate: '2026-10-25',
      },
    ];

    const proposal = generateAdaptiveSchedule(tasks, {
      scheduleId: 'sched_e2e_test',
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      enableChunking: true,
      enableIntraday: true,
      workingHours: { start: '09:00', end: '17:00' },
    });

    assert.ok(proposal.proposedPlacements.length >= 2);

    const exportResult = generateIcsCalendar(proposal, {
      tasks,
      exportTimestamp: fixedTimestamp,
    });

    assert.ok(exportResult.sessionCount >= 2);
    assert.ok(exportResult.ics.includes('BEGIN:VCALENDAR'));
    assert.ok(exportResult.ics.includes('SUMMARY:Architecture Review'));
    assert.ok(exportResult.ics.includes('Component Implementation (Session 1 of'));

    // Check that descriptions and categories are included
    const unfolded = unfoldIcsText(exportResult.ics);
    assert.ok(unfolded.includes('Description: Review system design documents'));
    assert.ok(unfolded.includes('Category: Engineering'));
    assert.ok(unfolded.includes('VoxPlan local schedule snapshot (static export).'));
  });

  // --- 8. Persistence & Local-First State ---

  test('19. Local-first persistence helpers save, load, and clear accepted schedule', () => {
    // Mock localStorage for test environment
    const storageMap = new Map();
    const mockLocalStorage = {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, val) => storageMap.set(key, String(val)),
      removeItem: (key) => storageMap.delete(key),
    };

    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = mockLocalStorage;

    try {
      const scheduleToSave = {
        summary: { scheduleId: 'sched_accepted_test_1', feasibilityStatus: 'feasible' },
        proposedPlacements: [
          {
            placementId: 'placement_task-saved',
            taskId: 'task-saved',
            taskTitle: 'Saved Session',
            proposedDate: '2026-10-20',
            startTime: '09:00',
            endTime: '12:00',
            status: 'on_time',
          },
        ],
      };

      saveAcceptedSchedule(scheduleToSave);

      const loaded = loadAcceptedSchedule();
      assert.ok(loaded);
      assert.equal(loaded.summary.scheduleId, 'sched_accepted_test_1');
      assert.equal(loaded.status, 'accepted');
      assert.ok(loaded.acceptedAt);
      assert.equal(loaded.proposedPlacements.length, 1);

      clearAcceptedSchedule();
      const cleared = loadAcceptedSchedule();
      assert.equal(cleared, null);
    } finally {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  test('20. Safe handling of corrupted or null input in schedule generator', () => {
    // Null schedule
    const nullResult = generateIcsCalendar(null);
    assert.equal(nullResult.sessionCount, 0);
    assert.ok(nullResult.ics.includes('BEGIN:VCALENDAR'));

    // Empty object
    const emptyResult = generateIcsCalendar({});
    assert.equal(emptyResult.sessionCount, 0);

    // Corrupted placements array with non-object items
    const corruptedResult = generateIcsCalendar({
      proposedPlacements: [null, undefined, 'garbage', 123, {}],
    });
    assert.equal(corruptedResult.sessionCount, 0);
    assert.ok(corruptedResult.omittedCount >= 1);
  });

  test('21. Helper functions test coverage: formatIcsUtcTimestamp, generateStableSessionUid, extractExportableSessions', () => {
    // formatIcsUtcTimestamp
    const utcStamp = formatIcsUtcTimestamp(new Date('2026-10-18T12:00:00Z'));
    assert.equal(utcStamp, '20261018T120000Z');

    // generateStableSessionUid
    const uidFromPlacement = generateStableSessionUid({ placementId: 'custom_id_123' });
    assert.equal(uidFromPlacement, 'custom_id_123@voxplan.local');

    // Hardened fallback does not include transient date or time
    const uidFromFallback = generateStableSessionUid({ taskId: 't-1', proposedDate: '2026-10-19', startTime: '10:00' });
    assert.equal(uidFromFallback, 'placement_t-1@voxplan.local');

    const uidFromChunkFallback = generateStableSessionUid({ taskId: 't-1', isChunk: true, chunkIndex: 1 });
    assert.equal(uidFromChunkFallback, 'chunk_t-1_seg_1@voxplan.local');

    // extractExportableSessions
    const extracted = extractExportableSessions({
      proposedPlacements: [
        {
          placementId: 'p1',
          taskId: 't1',
          taskTitle: 'Extracted Session',
          proposedDate: '2026-10-19',
          startTime: '09:00',
          endTime: '11:00',
          status: 'on_time',
        },
      ],
    });
    assert.equal(extracted.validSessions.length, 1);
    assert.equal(extracted.omittedSessions.length, 0);
  });

  // --- 9. Time Zone Validation & VTIMEZONE Hardening ---

  test('22. validateIanaTimeZone accurately accepts valid IANA zones and rejects invalid/injection strings', () => {
    // Valid zones
    assert.equal(validateIanaTimeZone('America/New_York'), true);
    assert.equal(validateIanaTimeZone('Europe/London'), true);
    assert.equal(validateIanaTimeZone('Asia/Kolkata'), true);
    assert.equal(validateIanaTimeZone('Australia/Sydney'), true);
    assert.equal(validateIanaTimeZone('UTC'), true);
    assert.equal(validateIanaTimeZone('Etc/GMT+5'), true);

    // Invalid zones & injection payloads
    assert.equal(validateIanaTimeZone(''), false);
    assert.equal(validateIanaTimeZone(null), false);
    assert.equal(validateIanaTimeZone(undefined), false);
    assert.equal(validateIanaTimeZone('Invalid/Unknown_Zone_12345'), false);
    assert.equal(validateIanaTimeZone('America/New_York\nINJECT:TRUE'), false);
    assert.equal(validateIanaTimeZone('America/New_York;DROP TABLE'), false);
    assert.equal(validateIanaTimeZone('../../../etc/passwd'), false);

    // Offset calculation and formatting
    const dWinter = new Date('2026-01-15T12:00:00Z');
    assert.equal(getTimezoneOffsetMinutes(dWinter, 'Asia/Kolkata'), 330);
    assert.equal(formatIcsOffset(330), '+0530');
    assert.equal(getTimezoneOffsetMinutes(dWinter, 'America/New_York'), -300);
    assert.equal(formatIcsOffset(-300), '-0500');
    assert.equal(formatIcsOffset(0), '+0000');
  });

  test('23. VTIMEZONE generation for non-DST zone emits STANDARD without DAYLIGHT', () => {
    const lines = generateVtimezoneComponent('Asia/Kolkata', 2026);
    assert.ok(lines.length > 0);
    assert.equal(lines[0], 'BEGIN:VTIMEZONE');
    assert.equal(lines[1], 'TZID:Asia/Kolkata');

    const vtzText = lines.join('\n');
    assert.ok(vtzText.includes('BEGIN:STANDARD'));
    assert.ok(vtzText.includes('TZOFFSETFROM:+0530'));
    assert.ok(vtzText.includes('TZOFFSETTO:+0530'));
    assert.ok(!vtzText.includes('BEGIN:DAYLIGHT'));
    assert.ok(vtzText.includes('END:VTIMEZONE'));
  });

  test('24. VTIMEZONE generation for DST zone emits both STANDARD and DAYLIGHT components', () => {
    const lines = generateVtimezoneComponent('America/New_York', 2026);
    assert.ok(lines.length > 0);
    assert.equal(lines[0], 'BEGIN:VTIMEZONE');
    assert.equal(lines[1], 'TZID:America/New_York');

    const vtzText = lines.join('\n');
    assert.ok(vtzText.includes('BEGIN:STANDARD'));
    assert.ok(vtzText.includes('BEGIN:DAYLIGHT'));
    assert.ok(vtzText.includes('TZOFFSETFROM:-0500') || vtzText.includes('TZOFFSETFROM:-0400'));
    assert.ok(vtzText.includes('TZOFFSETTO:-0400') || vtzText.includes('TZOFFSETTO:-0500'));
    assert.ok(vtzText.includes('END:VTIMEZONE'));
  });

  test('25. Invalid TZID parameter passed to generator falls back to floating time with warning', () => {
    const schedule = {
      proposedPlacements: [
        {
          placementId: 'placement_safe_tz',
          taskId: 'task-safe',
          taskTitle: 'Safe Session',
          proposedDate: '2026-10-19',
          startTime: '10:00',
          endTime: '11:00',
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(schedule, {
      tzid: 'Malicious/Zone\nBEGIN:HACK',
      exportTimestamp: fixedTimestamp,
    });

    assert.equal(result.sessionCount, 1);
    assert.equal(result.tzidUsed, null);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes('Invalid time zone identifier'));

    // Verify it fell back safely to floating time without injection
    const ics = result.ics;
    assert.ok(!ics.includes('TZID=Malicious'));
    assert.ok(!ics.includes('BEGIN:HACK'));
    assert.ok(ics.includes(`DTSTART:20261019T100000${CRLF}`));
    assert.ok(ics.includes(`DTEND:20261019T110000${CRLF}`));
  });

  test('26. Near-midnight sessions serialize accurately without shifting date', () => {
    const schedule = {
      proposedPlacements: [
        {
          placementId: 'p_early_morning',
          taskId: 't_early',
          taskTitle: 'Midnight Early Work',
          proposedDate: '2026-10-19',
          startTime: '00:00',
          endTime: '01:00',
          status: 'on_time',
        },
        {
          placementId: 'p_late_night',
          taskId: 't_late',
          taskTitle: 'Midnight Late Work',
          proposedDate: '2026-10-19',
          startTime: '23:00',
          endTime: '23:45',
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(schedule, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 2);

    const ics = result.ics;
    assert.ok(ics.includes(`DTSTART:20261019T000000${CRLF}`));
    assert.ok(ics.includes(`DTEND:20261019T010000${CRLF}`));
    assert.ok(ics.includes(`DTSTART:20261019T230000${CRLF}`));
    assert.ok(ics.includes(`DTEND:20261019T234500${CRLF}`));
  });

  test('27. Reversed local session (end before start) is omitted safely', () => {
    const schedule = {
      proposedPlacements: [
        {
          placementId: 'p_invalid_range',
          taskId: 't_invalid',
          taskTitle: 'Inverted Session',
          proposedDate: '2026-10-19',
          startTime: '15:00',
          endTime: '13:00', // invalid
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(schedule, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 0);
    assert.equal(result.omittedCount, 1);
    assert.equal(result.omittedSessions[0].reason, 'end_time_not_after_start_time');
  });

  // --- 10. Stable Event Identity Across Edits & Regeneration ---

  test('28. Editing session date or start/end time preserves identical UID', () => {
    const originalPlacement = {
      placementId: 'placement_task-focus',
      taskId: 'task-focus',
      taskTitle: 'Focus Block',
      proposedDate: '2026-10-19',
      startTime: '09:00',
      endTime: '11:00',
      status: 'on_time',
    };

    const editedPlacement = {
      ...originalPlacement,
      proposedDate: '2026-10-22', // shifted 3 days
      startTime: '14:00',        // shifted to afternoon
      endTime: '16:00',
    };

    const uidOriginal = generateStableSessionUid(originalPlacement);
    const uidEdited = generateStableSessionUid(editedPlacement);

    assert.equal(uidOriginal, uidEdited);
    assert.equal(uidOriginal, 'placement_task-focus@voxplan.local');
  });

  test('29. Reordering chunks in schedule array preserves each chunk\'s stable UID', () => {
    const chunkA = {
      placementId: 'chunk_task-m1_seg_0',
      chunkId: 'chunk_task-m1_seg_0',
      taskId: 'task-m1',
      taskTitle: 'Multi-day Task',
      isChunk: true,
      chunkIndex: 0,
      totalChunks: 2,
      proposedDate: '2026-10-19',
      startTime: '09:00',
      endTime: '12:00',
      status: 'on_time',
    };

    const chunkB = {
      placementId: 'chunk_task-m1_seg_1',
      chunkId: 'chunk_task-m1_seg_1',
      taskId: 'task-m1',
      taskTitle: 'Multi-day Task',
      isChunk: true,
      chunkIndex: 1,
      totalChunks: 2,
      proposedDate: '2026-10-20',
      startTime: '09:00',
      endTime: '12:00',
      status: 'on_time',
    };

    // Forward order: [A, B]
    const resForward = generateIcsCalendar({ proposedPlacements: [chunkA, chunkB] }, { exportTimestamp: fixedTimestamp });
    // Reversed order in array: [B, A]
    const resReversed = generateIcsCalendar({ proposedPlacements: [chunkB, chunkA] }, { exportTimestamp: fixedTimestamp });

    assert.deepEqual(resForward.uids.sort(), resReversed.uids.sort());
    assert.ok(resForward.uids.includes('chunk_task-m1_seg_0@voxplan.local'));
    assert.ok(resForward.uids.includes('chunk_task-m1_seg_1@voxplan.local'));
  });

  test('30. Regenerating schedule with identical tasks preserves stable session UIDs', () => {
    const tasks = [
      {
        id: 'task-regen-1',
        title: 'Task Alpha',
        estimatedEffort: 3.0,
        priority: 'high',
        dueDate: '2026-10-22',
      },
      {
        id: 'task-regen-2',
        title: 'Task Beta (Chunked)',
        estimatedEffort: 8.0,
        priority: 'medium',
        dueDate: '2026-10-25',
      },
    ];

    const proposal1 = generateAdaptiveSchedule(tasks, {
      scheduleId: 'sched_run_1',
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      enableChunking: true,
      enableIntraday: true,
    });

    const proposal2 = generateAdaptiveSchedule(tasks, {
      scheduleId: 'sched_run_2',
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      enableChunking: true,
      enableIntraday: true,
    });

    const export1 = generateIcsCalendar(proposal1, { tasks, exportTimestamp: fixedTimestamp });
    const export2 = generateIcsCalendar(proposal2, { tasks, exportTimestamp: '2026-10-18T16:00:00Z' });

    assert.equal(export1.sessionCount, export2.sessionCount);
    assert.deepEqual(export1.uids, export2.uids);
  });

  test('31. Two sessions with identical task titles have distinct, non-colliding UIDs', () => {
    const schedule = {
      proposedPlacements: [
        {
          placementId: 'placement_task-dup-1',
          taskId: 'task-dup-1',
          taskTitle: 'Weekly Sync',
          proposedDate: '2026-10-19',
          startTime: '09:00',
          endTime: '10:00',
          status: 'on_time',
        },
        {
          placementId: 'placement_task-dup-2',
          taskId: 'task-dup-2',
          taskTitle: 'Weekly Sync', // identical title
          proposedDate: '2026-10-20',
          startTime: '09:00',
          endTime: '10:00',
          status: 'on_time',
        },
      ],
    };

    const result = generateIcsCalendar(schedule, { exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 2);
    assert.equal(result.uids.length, 2);
    assert.notEqual(result.uids[0], result.uids[1]);
    assert.equal(result.uids[0], 'placement_task-dup-1@voxplan.local');
    assert.equal(result.uids[1], 'placement_task-dup-2@voxplan.local');
  });

  test('32. Distinct chunks of same parent task have distinct UIDs', () => {
    const chunk0 = {
      placementId: 'chunk_task-p1_seg_0',
      taskId: 'task-p1',
      taskTitle: 'Large Project',
      isChunk: true,
      chunkIndex: 0,
      totalChunks: 3,
      proposedDate: '2026-10-19',
      startTime: '09:00',
      endTime: '12:00',
      status: 'on_time',
    };
    const chunk1 = {
      placementId: 'chunk_task-p1_seg_1',
      taskId: 'task-p1',
      taskTitle: 'Large Project',
      isChunk: true,
      chunkIndex: 1,
      totalChunks: 3,
      proposedDate: '2026-10-20',
      startTime: '09:00',
      endTime: '12:00',
      status: 'on_time',
    };

    const uid0 = generateStableSessionUid(chunk0);
    const uid1 = generateStableSessionUid(chunk1);
    assert.notEqual(uid0, uid1);
    assert.equal(uid0, 'chunk_task-p1_seg_0@voxplan.local');
    assert.equal(uid1, 'chunk_task-p1_seg_1@voxplan.local');
  });

  test('33. Deleted session followed by newly created session gets new distinct identity', () => {
    const oldSession = { placementId: 'placement_task-old', taskId: 'task-old' };
    const newSession = { placementId: 'placement_task-new', taskId: 'task-new' };

    const oldUid = generateStableSessionUid(oldSession);
    const newUid = generateStableSessionUid(newSession);

    assert.notEqual(oldUid, newUid);
    assert.equal(oldUid, 'placement_task-old@voxplan.local');
    assert.equal(newUid, 'placement_task-new@voxplan.local');
  });

  test('34. Legacy placements lacking placement IDs receive stable, collision-free UIDs without date/time dependencies', () => {
    const p1 = { taskId: 'task-legacy', proposedDate: '2026-10-19', startTime: '09:00', endTime: '10:00' };
    const p1Edited = { taskId: 'task-legacy', proposedDate: '2026-10-21', startTime: '15:00', endTime: '16:00' };

    const uid1 = generateStableSessionUid(p1);
    const uid1Edited = generateStableSessionUid(p1Edited);

    // UID must NOT change just because date or time changed
    assert.equal(uid1, uid1Edited);
    assert.equal(uid1, 'placement_task-legacy@voxplan.local');
  });

  // --- 11. Accepted Schedule Integrity & Mutation Prevention ---

  test('35. Export never mutates input schedule, proposal, or task list', () => {
    const originalPlacement = {
      placementId: 'p_freeze_test',
      taskId: 't_freeze',
      taskTitle: 'Freeze Test',
      proposedDate: '2026-10-19',
      startTime: '09:00',
      endTime: '11:00',
      status: 'on_time',
    };

    const schedule = {
      summary: { scheduleId: 'sched_immutable' },
      proposedPlacements: [Object.freeze({ ...originalPlacement })],
    };
    Object.freeze(schedule);
    Object.freeze(schedule.proposedPlacements);

    const tasks = [Object.freeze({ id: 't_freeze', title: 'Freeze Test', priority: 'high' })];
    Object.freeze(tasks);

    // Must execute cleanly without attempting to mutate frozen objects
    const result = generateIcsCalendar(schedule, { tasks, exportTimestamp: fixedTimestamp });
    assert.equal(result.sessionCount, 1);
    assert.equal(schedule.proposedPlacements[0].taskTitle, 'Freeze Test');
  });

  test('36. Safe handling of corrupted or malformed localStorage accepted schedule', () => {
    const storageMap = new Map();
    const mockLocalStorage = {
      getItem: (key) => storageMap.get(key) || null,
      setItem: (key, val) => storageMap.set(key, String(val)),
      removeItem: (key) => storageMap.delete(key),
    };

    const originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = mockLocalStorage;

    try {
      // 1. Invalid JSON
      storageMap.set('voxplan_accepted_schedule', 'INVALID_JSON_CORRUPT{{');
      const loaded1 = loadAcceptedSchedule();
      assert.equal(loaded1, null);

      // 2. Non-object string/number safely returns null
      storageMap.set('voxplan_accepted_schedule', JSON.stringify(12345));
      const loaded2 = loadAcceptedSchedule();
      assert.equal(loaded2, null);
      const res2 = generateIcsCalendar(loaded2);
      assert.equal(res2.sessionCount, 0);

      // 3. Object with non-array proposedPlacements
      storageMap.set('voxplan_accepted_schedule', JSON.stringify({ proposedPlacements: 'not an array' }));
      const loaded3 = loadAcceptedSchedule();
      const res3 = generateIcsCalendar(loaded3);
      assert.equal(res3.sessionCount, 0);
    } finally {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  // --- 12. RFC 5545 Round-Trip Parser Validation ---

  test('37. Full RFC 5545 parser round-trip validation', () => {
    /**
     * Dedicated RFC 5545 Calendar Parser for test assertion
     */
    function parseIcsCalendar(icsContent) {
      assert.ok(icsContent.includes('\r\n'), 'ICS must use CRLF endings');
      const unfolded = unfoldIcsText(icsContent);
      const rawLines = unfolded.split('\r\n').filter((l) => l.trim().length > 0);

      const calendar = {
        components: [],
        properties: {},
      };

      const stack = [calendar];

      for (const line of rawLines) {
        if (line.startsWith('BEGIN:')) {
          const type = line.slice(6);
          const comp = { type, properties: {}, components: [] };
          stack[stack.length - 1].components.push(comp);
          stack.push(comp);
        } else if (line.startsWith('END:')) {
          const type = line.slice(4);
          const top = stack.pop();
          assert.equal(top.type, type, `Mismatched END:${type} in parser`);
        } else {
          const colonIdx = line.indexOf(':');
          assert.ok(colonIdx > 0, `Invalid content line: ${line}`);
          const propNameWithParams = line.slice(0, colonIdx);
          const propValue = line.slice(colonIdx + 1);

          const semiIdx = propNameWithParams.indexOf(';');
          let propName = propNameWithParams;
          let params = {};
          if (semiIdx > 0) {
            propName = propNameWithParams.slice(0, semiIdx);
            const rawParams = propNameWithParams.slice(semiIdx + 1).split(';');
            for (const rp of rawParams) {
              const [k, v] = rp.split('=');
              if (k && v) params[k.toUpperCase()] = v;
            }
          }

          const target = stack[stack.length - 1];
          if (!target.properties[propName]) {
            target.properties[propName] = [];
          }
          target.properties[propName].push({ value: propValue, params });
        }
      }

      assert.equal(stack.length, 1, 'Unbalanced calendar components');
      return calendar.components[0];
    }

    const schedule = {
      proposedPlacements: [
        {
          placementId: 'placement_parse_1',
          taskId: 'task-parse-1',
          taskTitle: 'Architecture Sync: Core & Plugins',
          proposedDate: '2026-10-19',
          startTime: '09:00',
          endTime: '11:00',
          status: 'on_time',
          chunkDuration: 2.0,
          taskCategory: 'Engineering',
          taskPriority: 'high',
        },
      ],
    };

    const tasks = [
      {
        id: 'task-parse-1',
        title: 'Architecture Sync: Core & Plugins',
        description: 'Meeting notes, topics: DB; API; and schema\\models.',
      },
    ];

    const result = generateIcsCalendar(schedule, {
      tasks,
      tzid: 'America/New_York',
      exportTimestamp: fixedTimestamp,
    });

    const parsed = parseIcsCalendar(result.ics);
    assert.equal(parsed.type, 'VCALENDAR');
    assert.equal(parsed.properties['VERSION'][0].value, '2.0');
    assert.equal(parsed.properties['PRODID'][0].value, '-//VoxPlan//VoxPlan Scheduler 1.0//EN');

    // VTIMEZONE component present
    const vtimezone = parsed.components.find((c) => c.type === 'VTIMEZONE');
    assert.ok(vtimezone, 'VTIMEZONE component must be present when TZID is used');
    assert.equal(vtimezone.properties['TZID'][0].value, 'America/New_York');

    // VEVENT component present
    const vevent = parsed.components.find((c) => c.type === 'VEVENT');
    assert.ok(vevent, 'VEVENT component must be present');
    assert.equal(vevent.properties['UID'][0].value, 'placement_parse_1@voxplan.local');
    assert.equal(vevent.properties['DTSTAMP'][0].value, '20261018T103000Z');
    assert.equal(vevent.properties['DTSTART'][0].value, '20261019T090000');
    assert.equal(vevent.properties['DTSTART'][0].params['TZID'], 'America/New_York');
    assert.equal(vevent.properties['DTEND'][0].value, '20261019T110000');
    assert.equal(vevent.properties['DTEND'][0].params['TZID'], 'America/New_York');
    assert.equal(vevent.properties['SUMMARY'][0].value, 'Architecture Sync: Core & Plugins');

    // Escaped characters in description
    const rawDesc = vevent.properties['DESCRIPTION'][0].value;
    assert.ok(rawDesc.includes('DB\\; API\\; and schema\\\\models'));
    assert.ok(rawDesc.includes('Meeting notes\\, topics:'));
  });
});
