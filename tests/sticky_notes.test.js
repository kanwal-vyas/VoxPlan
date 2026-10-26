import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  STICKY_NOTES_STORAGE_KEY,
  MAX_NOTE_TITLE_LENGTH,
  MAX_NOTE_BODY_LENGTH,
  normalizeStickyNote,
  loadAllStickyNotes,
  persistAllStickyNotes,
  getStickyNotesForTask,
  saveStickyNote,
  deleteStickyNote,
  cleanOrphanedStickyNotes,
  restoreStickyNotesForTask,
} from '../src/utils/stickyNotesStorage.js';

import {
  STATIONERY_STYLES,
  getStationeryById,
  STICKY_NOTE_HANDWRITING_FONTS,
} from '../src/components/stickyNotes/stationeryCatalog.js';

/**
 * In-memory Mock Storage for unit tests
 */
class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe('VoxPlan — Illustrated Stationery Sticky Notes Suite', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  describe('1. Stationery Catalog & Visual Direction', () => {
    test('1.1 catalog provides all required illustrated stationery styles with scattered artwork', () => {
      const requiredIds = [
        'powder-blue',
        'blush-bunny',
        'lavender-cat',
        'mint-bear',
        'butter-yellow',
        'matcha-leaf',
      ];

      assert.equal(STATIONERY_STYLES.length, 6, 'Must provide exactly 6 styles in the end');
      for (const id of requiredIds) {
        const found = STATIONERY_STYLES.find((s) => s.id === id);
        assert.ok(found, `Required style "${id}" must exist in catalog`);
        assert.ok(found.name, `Style "${id}" must have a name`);
        assert.ok(found.ariaLabel, `Style "${id}" must have a descriptive accessible label`);
        assert.ok(found.paperBg, `Style "${id}" must have a paper background`);
        assert.notEqual(found.paperBg.toUpperCase(), '#FFFFFF', `Style "${id}" paperBg must be a soft pastel tint, not pure white`);
        assert.ok(found.frameBorder, `Style "${id}" must have an outer frame border color`);
        assert.ok(found.borderPatternColor, `Style "${id}" must have a border pattern color`);
        assert.ok(found.inputBorder, `Style "${id}" must have an input border color`);
        assert.ok(found.tabBg, `Style "${id}" must have a tab background`);
        assert.ok(found.motifSvg.includes('<svg'), `Style "${id}" must have an inline SVG motif`);
        assert.ok(found.topDecorSvg.includes('<svg'), `Style "${id}" must have scattered top artwork`);
        assert.ok(found.bottomDecorSvg.includes('<svg'), `Style "${id}" must have scattered bottom artwork`);
      }
    });

    test('1.2 getStationeryById returns target style or graceful fallback', () => {
      const bunny = getStationeryById('blush-bunny');
      assert.equal(bunny.id, 'blush-bunny');
      assert.equal(bunny.motifType, 'bunny');

      const fallback = getStationeryById('non-existent-style');
      assert.equal(fallback.id, 'powder-blue', 'Unknown styles fallback gracefully to Morning Sky Bear');

      const oldFloralFallback = getStationeryById('floral-cream');
      assert.equal(oldFloralFallback.id, 'powder-blue', 'Older floral-cream notes fallback gracefully to Morning Sky Bear');
    });

    test('1.3 verifies bunny ear closed paths, yellow chick palette, daisy floral-cream removal, and almond bear recolour', () => {
      // 1. Bunny ears: both outer ears and inner ears must be closed continuous loops (ending with Z)
      const bunny = getStationeryById('blush-bunny');
      assert.ok(bunny.bottomDecorSvg.includes('M18 38 C14 26 14 8 20 2 C24 2 27 6 28 36 Z'), 'Left ear must be a complete closed loop');
      assert.ok(bunny.bottomDecorSvg.includes('M38 36 C39 6 42 2 46 2 C52 8 52 26 48 38 Z'), 'Right ear must be a complete closed loop');
      assert.ok(bunny.bottomDecorSvg.includes('fill="#FFCCD5" stroke="#D95C78"'), 'Inner ears must have pink fill and outline');

      // 2. Chick stationery: paper, frame, and bows must be visibly yellow
      const chick = getStationeryById('butter-yellow');
      assert.equal(chick.paperBg, '#FFF4B8', 'Chick paper surface must be soft buttery yellow');
      assert.equal(chick.frameBg, '#FFF0A8', 'Chick frame must be warm yellow');
      assert.ok(chick.topDecorSvg.includes('fill="#FFD268"'), 'Bow loops in top decor must use golden yellow');
      assert.ok(chick.bottomDecorSvg.includes('fill="#FFD268"'), 'Bow loops in bottom decor must use golden yellow');

      // 3. Daisy paper design (floral-cream) completely removed: exactly 6 styles left
      assert.equal(STATIONERY_STYLES.some((s) => s.id === 'floral-cream'), false, 'floral-cream must be completely removed');
      assert.equal(STATIONERY_STYLES.length, 6, 'There must be exactly 6 designs left');

      // 4. Almond Bear: mint-bear recoloured to almond/cream/beige palette
      const bear = getStationeryById('mint-bear');
      assert.equal(bear.paperBg, '#FAF6EE', 'Bear paper must be warm almond');
      assert.equal(bear.frameBg, '#F7F1E6', 'Bear frame must be warm almond');
      assert.equal(bear.lineArtColor, '#4A3828', 'Bear line art must be warm almond brown');

      // 5. Matcha frog stationery must remain green
      const matcha = getStationeryById('matcha-leaf');
      assert.equal(matcha.frameBg, '#EEF6E6', 'Matcha frog stationery must remain green');
    });
  });

  describe('2. Sticky Note Normalization & Validation', () => {
    test('2.1 normalizes valid note and generates stable id and timestamps', () => {
      const raw = {
        taskId: 'task-101',
        title: 'Review checklist',
        body: 'Confirm wireframe typography and spacing.',
        stationeryId: 'mint-bear',
      };
      const note = normalizeStickyNote(raw);
      assert.ok(note, 'Must normalize to valid object');
      assert.equal(note.taskId, 'task-101');
      assert.equal(note.title, 'Review checklist');
      assert.equal(note.body, 'Confirm wireframe typography and spacing.');
      assert.equal(note.stationeryId, 'mint-bear');
      assert.ok(note.id.startsWith('note-'), 'Must have generated ID prefix');
      assert.ok(note.createdAt, 'Must have createdAt timestamp');
      assert.ok(note.updatedAt, 'Must have updatedAt timestamp');
    });

    test('2.2 rejects empty or whitespace-only note body', () => {
      assert.equal(normalizeStickyNote({ taskId: 't1', body: '' }), null);
      assert.equal(normalizeStickyNote({ taskId: 't1', body: '   ' }), null);
      assert.equal(normalizeStickyNote({ taskId: 't1' }), null);
    });

    test('2.3 rejects note with missing taskId', () => {
      assert.equal(normalizeStickyNote({ body: 'Some note text' }), null);
      assert.equal(normalizeStickyNote({ taskId: '   ', body: 'Some note text' }), null);
    });

    test('2.4 enforces maximum length constraints for title and body', () => {
      const oversizedTitle = 'A'.repeat(MAX_NOTE_TITLE_LENGTH + 50);
      const oversizedBody = 'B'.repeat(MAX_NOTE_BODY_LENGTH + 100);
      const note = normalizeStickyNote({
        taskId: 'task-clamp',
        title: oversizedTitle,
        body: oversizedBody,
      });

      assert.equal(note.title.length, MAX_NOTE_TITLE_LENGTH, 'Title must be clamped to max length');
      assert.equal(note.body.length, MAX_NOTE_BODY_LENGTH, 'Body must be clamped to max length');
    });
  });

  describe('3. Core CRUD & Multi-Note Stacking', () => {
    test('3.1 creates a note for an existing task', () => {
      const res = saveStickyNote('task-alpha', {
        title: 'Initial memo',
        body: 'Remember to verify edge cases.',
        stationeryId: 'blush-bunny',
      }, mockStorage);

      assert.equal(res.success, true);
      assert.ok(res.note);
      assert.equal(res.note.taskId, 'task-alpha');
      assert.equal(res.notes.length, 1);

      const saved = getStickyNotesForTask('task-alpha', mockStorage);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].body, 'Remember to verify edge cases.');
      assert.equal(saved[0].stationeryId, 'blush-bunny');
    });

    test('3.2 creates multiple notes attached to the same task (note stack)', () => {
      saveStickyNote('task-beta', { body: 'First note on Beta', stationeryId: 'floral-cream' }, mockStorage);
      saveStickyNote('task-beta', { body: 'Second note on Beta', stationeryId: 'lavender-cat' }, mockStorage);
      const res = saveStickyNote('task-beta', { body: 'Third note on Beta', stationeryId: 'powder-blue' }, mockStorage);

      assert.equal(res.success, true);
      assert.equal(res.notes.length, 3);

      const allNotes = getStickyNotesForTask('task-beta', mockStorage);
      assert.equal(allNotes.length, 3);
      assert.equal(allNotes[0].body, 'First note on Beta');
      assert.equal(allNotes[1].body, 'Second note on Beta');
      assert.equal(allNotes[2].body, 'Third note on Beta');
    });

    test('3.3 edits an existing note without changing its id or creation timestamp', () => {
      const created = saveStickyNote('task-gamma', {
        title: 'Draft Spec',
        body: 'Initial rough thoughts.',
        stationeryId: 'mint-bear',
      }, mockStorage);

      const noteId = created.note.id;
      const initialCreatedAt = created.note.createdAt;

      // Edit the note
      const edited = saveStickyNote('task-gamma', {
        id: noteId,
        title: 'Final Spec',
        body: 'Refined and finalized thoughts.',
        stationeryId: 'butter-yellow',
      }, mockStorage);

      assert.equal(edited.success, true);
      assert.equal(edited.note.id, noteId);
      assert.equal(edited.note.title, 'Final Spec');
      assert.equal(edited.note.body, 'Refined and finalized thoughts.');
      assert.equal(edited.note.stationeryId, 'butter-yellow');
      assert.equal(edited.note.createdAt, initialCreatedAt);
    });

    test('3.4 changes a note stationery style smoothly', () => {
      const created = saveStickyNote('task-delta', {
        body: 'Note with changing stationery',
        stationeryId: 'powder-blue',
      }, mockStorage);

      const changed = saveStickyNote('task-delta', {
        id: created.note.id,
        body: 'Note with changing stationery',
        stationeryId: 'matcha-leaf',
      }, mockStorage);

      assert.equal(changed.note.stationeryId, 'matcha-leaf');
      assert.equal(getStickyNotesForTask('task-delta', mockStorage)[0].stationeryId, 'matcha-leaf');
    });

    test('3.5 deletes a note and updates remaining stack cleanly', () => {
      const n1 = saveStickyNote('task-epsilon', { body: 'First' }, mockStorage).note;
      const n2 = saveStickyNote('task-epsilon', { body: 'Second' }, mockStorage).note;

      const delRes = deleteStickyNote('task-epsilon', n1.id, mockStorage);
      assert.equal(delRes.success, true);
      assert.equal(delRes.deletedNote.id, n1.id);
      assert.equal(delRes.remainingNotes.length, 1);
      assert.equal(delRes.remainingNotes[0].id, n2.id);

      // Delete the last remaining note
      const delRes2 = deleteStickyNote('task-epsilon', n2.id, mockStorage);
      assert.equal(delRes2.success, true);
      assert.equal(delRes2.remainingNotes.length, 0);

      const after = getStickyNotesForTask('task-epsilon', mockStorage);
      assert.equal(after.length, 0);
    });
  });

  describe('4. Persistence, Task Isolation & Orphan Handling', () => {
    test('4.1 survives application reinitialization across separate store reads', () => {
      assert.equal(STICKY_NOTES_STORAGE_KEY, 'voxplan_task_sticky_notes');
      persistAllStickyNotes({ 'task-init': [] }, mockStorage);

      saveStickyNote('task-persist-1', {
        title: 'Persistent Title',
        body: 'Persistent Body',
        stationeryId: 'lavender-cat',
      }, mockStorage);

      // Re-read storage directly from another caller
      const freshMap = loadAllStickyNotes(mockStorage);
      assert.ok(freshMap['task-persist-1']);
      assert.equal(freshMap['task-persist-1'][0].title, 'Persistent Title');
      assert.equal(freshMap['task-persist-1'][0].body, 'Persistent Body');
    });

    test('4.2 preserves task independence: notes never alter task records', () => {
      const sampleTasks = [
        { id: 'task-a', title: 'Task A', priority: 'high', completed: false },
        { id: 'task-b', title: 'Task B', priority: 'medium', completed: true },
      ];
      mockStorage.setItem('voxplan_tasks', JSON.stringify(sampleTasks));

      // Add sticky note to task-a
      saveStickyNote('task-a', { body: 'Note on A' }, mockStorage);

      // Verify voxplan_tasks remained completely unchanged
      const rawTasks = JSON.parse(mockStorage.getItem('voxplan_tasks'));
      assert.deepEqual(rawTasks, sampleTasks, 'Original task storage must remain byte-identical');
    });

    test('4.3 tasks without notes remain completely lightweight and return empty array', () => {
      const notes = getStickyNotesForTask('task-without-notes', mockStorage);
      assert.deepEqual(notes, []);
    });

    test('4.4 cleanOrphanedStickyNotes removes notes for deleted tasks', () => {
      saveStickyNote('task-kept', { body: 'Keep this note' }, mockStorage);
      saveStickyNote('task-orphan-1', { body: 'Delete this note' }, mockStorage);
      saveStickyNote('task-orphan-2', { body: 'Delete this note too' }, mockStorage);

      const activeTaskIds = ['task-kept', 'task-unrelated'];
      const { cleanedCount } = cleanOrphanedStickyNotes(activeTaskIds, mockStorage);

      assert.equal(cleanedCount, 2);
      const after = loadAllStickyNotes(mockStorage);
      assert.ok(after['task-kept']);
      assert.equal(after['task-orphan-1'], undefined);
      assert.equal(after['task-orphan-2'], undefined);
    });

    test('4.5 restoreStickyNotesForTask cleanly restores notes on task deletion undo', () => {
      const original = saveStickyNote('task-restored', {
        title: 'Restored Title',
        body: 'Restored content.',
        stationeryId: 'blush-bunny',
      }, mockStorage).notes;

      // Simulate task deletion cleanup
      cleanOrphanedStickyNotes([], mockStorage);
      assert.equal(getStickyNotesForTask('task-restored', mockStorage).length, 0);

      // Restore via undo
      restoreStickyNotesForTask('task-restored', original, mockStorage);
      const restored = getStickyNotesForTask('task-restored', mockStorage);
      assert.equal(restored.length, 1);
      assert.equal(restored[0].title, 'Restored Title');
      assert.equal(restored[0].stationeryId, 'blush-bunny');
    });
  });

  describe('5. Error Handling & Edge Cases', () => {
    test('5.1 handles empty or invalid inputs gracefully with clear error messages', () => {
      const errEmpty = saveStickyNote('task-x', { body: '   ' }, mockStorage);
      assert.equal(errEmpty.success, false);
      assert.match(errEmpty.error, /cannot be empty/i);

      const errMissingTask = saveStickyNote('', { body: 'Valid body' }, mockStorage);
      assert.equal(errMissingTask.success, false);
      assert.match(errMissingTask.error, /Task ID is required/i);
    });

    test('5.2 handles simulated storage write failure gracefully', () => {
      const failingStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      };

      const res = saveStickyNote('task-fail', { body: 'Will fail' }, failingStorage);
      assert.equal(res.success, false);
      assert.match(res.error, /QuotaExceededError/i);
    });

    test('5.3 deleting a non-existent note returns safe error without crashing', () => {
      const res = deleteStickyNote('task-any', 'non-existent-note-id', mockStorage);
      assert.equal(res.success, false);
      assert.match(res.error, /not found/i);
    });
  });

  describe('6. Handwriting Typography & Rouge Script Replacement', () => {
    test('6.1 exports exactly the six approved sticky-note handwriting fonts', () => {
      assert.equal(STICKY_NOTE_HANDWRITING_FONTS.length, 6, 'Must contain exactly 6 handwriting fonts');
      const expected = [
        'La Belle Aurore',
        'Sue Ellen Francisco',
        'Indie Flower',
        'Shadows Into Light',
        'Ephesis',
        'Rouge Script',
      ];
      const fontNames = STICKY_NOTE_HANDWRITING_FONTS.map((f) => (typeof f === 'string' ? f : f.name));
      assert.deepEqual(fontNames, expected, 'The 6 fonts must match approved list in order');
    });

    test('6.2 Serene Matcha (matcha-leaf) is assigned to Rouge Script', () => {
      const matcha = getStationeryById('matcha-leaf');
      assert.equal(matcha.handwritingName, 'Rouge Script', 'matcha-leaf handwritingName must be Rouge Script');
      assert.equal(matcha.handwritingFont, "'Rouge Script', cursive", 'matcha-leaf handwritingFont must be Rouge Script');
    });

    test('6.3 Birthstone Bounce is not present in any active stationery style', () => {
      const fontNames = STICKY_NOTE_HANDWRITING_FONTS.map((f) => (typeof f === 'string' ? f : f.name));
      assert.equal(fontNames.includes('Birthstone Bounce'), false, 'Birthstone Bounce must not be in active fonts');
      for (const style of STATIONERY_STYLES) {
        assert.notEqual(style.handwritingName, 'Birthstone Bounce');
        assert.equal(style.handwritingFont.includes('Birthstone Bounce'), false);
      }
    });

    test('6.4 all six stationery styles define non-empty handwritingName and handwritingFont', () => {
      assert.equal(STATIONERY_STYLES.length, 6);
      for (const style of STATIONERY_STYLES) {
        assert.ok(style.handwritingName, `Style ${style.id} must have handwritingName`);
        assert.ok(style.handwritingFont, `Style ${style.id} must have handwritingFont`);
        assert.ok(style.handwritingFont.includes('cursive'), `Style ${style.id} font should specify cursive fallback`);
      }
    });

    test('6.5 backward compatibility: legacy note with Birthstone Bounce safely maps to matcha-leaf with Rouge Script', () => {
      const legacyNote = {
        id: 'legacy-note-1',
        taskId: 'task-123',
        title: 'Legacy Note',
        body: 'Notes written before font replacement',
        stationeryId: 'birthstone-bounce',
        handwritingFont: 'Birthstone Bounce',
      };
      const normalized = normalizeStickyNote(legacyNote);
      assert.ok(normalized, 'Legacy note must normalize successfully');
      assert.equal(normalized.stationeryId, 'matcha-leaf', 'Legacy stationeryId must map to matcha-leaf');
      const style = getStationeryById(normalized.stationeryId);
      assert.equal(style.handwritingName, 'Rouge Script', 'Mapped style must provide Rouge Script');
    });
  });
});
