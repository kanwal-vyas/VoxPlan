/**
 * VoxPlan Sticky Notes Storage & Persistence Utility
 *
 * Provides dedicated, isolated persistence for task-attached sticky notes.
 * Stored in localStorage under 'voxplan_task_sticky_notes' to prevent altering
 * core task attributes or causing race conditions with the scheduling engine.
 */

import { getStationeryById } from '../components/stickyNotes/stationeryCatalog.js';

export const STICKY_NOTES_STORAGE_KEY = 'voxplan_task_sticky_notes';

export const MAX_NOTE_TITLE_LENGTH = 80;
export const MAX_NOTE_BODY_LENGTH = 1200;

/**
 * Resolves localStorage safely across browser and test environments.
 */
export function resolveStorage(injectedStorage) {
  if (injectedStorage) return injectedStorage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Validates and normalizes a single sticky note object.
 */
export function normalizeStickyNote(rawNote, taskIdFallback = '') {
  if (!rawNote || typeof rawNote !== 'object') return null;

  const id = typeof rawNote.id === 'string' && rawNote.id.trim()
    ? rawNote.id.trim()
    : `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const taskId = typeof rawNote.taskId === 'string' && rawNote.taskId.trim()
    ? rawNote.taskId.trim()
    : String(taskIdFallback || '').trim();

  if (!taskId) return null;

  const title = typeof rawNote.title === 'string'
    ? rawNote.title.trim().slice(0, MAX_NOTE_TITLE_LENGTH)
    : '';

  const body = typeof rawNote.body === 'string'
    ? rawNote.body.trim().slice(0, MAX_NOTE_BODY_LENGTH)
    : '';

  if (!body) return null; // Body is required for a valid sticky note

  // Backward compatibility: map legacy or removed handwriting font/stationery references safely
  let targetStationeryId = rawNote.stationeryId;
  if (
    targetStationeryId === 'birthstone-bounce' ||
    rawNote.handwritingFont === 'Birthstone Bounce' ||
    rawNote.font === 'Birthstone Bounce' ||
    (typeof rawNote.fontFamily === 'string' && rawNote.fontFamily.includes('Birthstone Bounce'))
  ) {
    targetStationeryId = 'matcha-leaf'; // Approved 6th stationery style with Rouge Script
  }

  const stationery = getStationeryById(targetStationeryId);
  const stationeryId = stationery.id;

  const motif = typeof rawNote.motif === 'string' && rawNote.motif.trim()
    ? rawNote.motif.trim()
    : stationery.motifType;

  const now = new Date().toISOString();
  const createdAt = rawNote.createdAt && !isNaN(new Date(rawNote.createdAt).getTime())
    ? new Date(rawNote.createdAt).toISOString()
    : now;

  const updatedAt = rawNote.updatedAt && !isNaN(new Date(rawNote.updatedAt).getTime())
    ? new Date(rawNote.updatedAt).toISOString()
    : now;

  return {
    id,
    taskId,
    title,
    body,
    stationeryId,
    motif,
    createdAt,
    updatedAt,
  };
}

/**
 * Loads the complete sticky notes map from storage: { [taskId]: StickyNote[] }.
 */
export function loadAllStickyNotes(injectedStorage = null) {
  const storage = resolveStorage(injectedStorage);
  if (!storage) return {};

  try {
    const raw = storage.getItem(STICKY_NOTES_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const normalizedMap = {};
    for (const [taskId, notesArray] of Object.entries(parsed)) {
      if (typeof taskId === 'string' && Array.isArray(notesArray)) {
        const validNotes = notesArray
          .map((n) => normalizeStickyNote(n, taskId))
          .filter(Boolean);

        if (validNotes.length > 0) {
          normalizedMap[taskId] = validNotes;
        }
      }
    }
    return normalizedMap;
  } catch (err) {
    console.warn('Failed to parse sticky notes from storage:', err);
    return {};
  }
}

/**
 * Persists the complete sticky notes map to storage.
 */
export function persistAllStickyNotes(notesMap, injectedStorage = null) {
  const storage = resolveStorage(injectedStorage);
  if (!storage) return { success: false, reason: 'storage_unavailable' };

  try {
    const cleanMap = {};
    for (const [taskId, notesArray] of Object.entries(notesMap || {})) {
      if (Array.isArray(notesArray) && notesArray.length > 0) {
        const valid = notesArray
          .map((n) => normalizeStickyNote(n, taskId))
          .filter(Boolean);
        if (valid.length > 0) {
          cleanMap[taskId] = valid;
        }
      }
    }

    storage.setItem(STICKY_NOTES_STORAGE_KEY, JSON.stringify(cleanMap));
    return { success: true };
  } catch (err) {
    console.error('Failed to persist sticky notes to storage:', err);
    return { success: false, reason: err.message };
  }
}

/**
 * Retrieves all sticky notes attached to a specific task.
 */
export function getStickyNotesForTask(taskId, injectedStorage = null) {
  if (!taskId) return [];
  const map = loadAllStickyNotes(injectedStorage);
  return map[taskId] || [];
}

/**
 * Saves (creates or updates) a sticky note for a given task.
 */
export function saveStickyNote(taskId, noteData, injectedStorage = null) {
  if (!taskId || typeof taskId !== 'string') {
    return { success: false, error: 'Task ID is required' };
  }

  const trimmedBody = (noteData?.body || '').trim();
  if (!trimmedBody) {
    return { success: false, error: 'Sticky note body cannot be empty' };
  }

  if (trimmedBody.length > MAX_NOTE_BODY_LENGTH) {
    return { success: false, error: `Note exceeds maximum length of ${MAX_NOTE_BODY_LENGTH} characters` };
  }

  const map = loadAllStickyNotes(injectedStorage);
  const taskNotes = [...(map[taskId] || [])];

  const now = new Date().toISOString();
  let updatedNote;

  if (noteData.id) {
    // Edit existing note
    const existingIndex = taskNotes.findIndex((n) => n.id === noteData.id);
    if (existingIndex >= 0) {
      const existing = taskNotes[existingIndex];
      updatedNote = normalizeStickyNote({
        ...existing,
        ...noteData,
        taskId,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: now,
      }, taskId);
      taskNotes[existingIndex] = updatedNote;
    } else {
      // Specified ID not found; create anew
      updatedNote = normalizeStickyNote({
        ...noteData,
        taskId,
        createdAt: now,
        updatedAt: now,
      }, taskId);
      taskNotes.push(updatedNote);
    }
  } else {
    // New note
    updatedNote = normalizeStickyNote({
      ...noteData,
      taskId,
      createdAt: now,
      updatedAt: now,
    }, taskId);
    taskNotes.push(updatedNote);
  }

  map[taskId] = taskNotes;
  const persistResult = persistAllStickyNotes(map, injectedStorage);

  if (!persistResult.success) {
    return { success: false, error: persistResult.reason || 'Storage persistence error' };
  }

  return {
    success: true,
    note: updatedNote,
    notes: taskNotes,
  };
}

/**
 * Deletes a sticky note by ID from a given task.
 */
export function deleteStickyNote(taskId, noteId, injectedStorage = null) {
  if (!taskId || !noteId) {
    return { success: false, error: 'Task ID and Note ID are required' };
  }

  const map = loadAllStickyNotes(injectedStorage);
  const taskNotes = map[taskId] || [];
  const noteToDelete = taskNotes.find((n) => n.id === noteId);

  if (!noteToDelete) {
    return { success: false, error: 'Note not found' };
  }

  const remaining = taskNotes.filter((n) => n.id !== noteId);
  if (remaining.length === 0) {
    delete map[taskId];
  } else {
    map[taskId] = remaining;
  }

  const persistResult = persistAllStickyNotes(map, injectedStorage);
  if (!persistResult.success) {
    return { success: false, error: persistResult.reason || 'Failed to persist note deletion' };
  }

  return {
    success: true,
    deletedNote: noteToDelete,
    remainingNotes: remaining,
  };
}

/**
 * Cleans up orphaned notes whose tasks no longer exist.
 */
export function cleanOrphanedStickyNotes(validTaskIds, injectedStorage = null) {
  if (!Array.isArray(validTaskIds)) return { cleanedCount: 0 };
  const validSet = new Set(validTaskIds);

  const map = loadAllStickyNotes(injectedStorage);
  let cleanedCount = 0;

  for (const taskId of Object.keys(map)) {
    if (!validSet.has(taskId)) {
      cleanedCount += (map[taskId] || []).length;
      delete map[taskId];
    }
  }

  if (cleanedCount > 0) {
    persistAllStickyNotes(map, injectedStorage);
  }

  return { cleanedCount };
}

/**
 * Restores notes for a specific task (e.g., when a task deletion is undone).
 */
export function restoreStickyNotesForTask(taskId, notes, injectedStorage = null) {
  if (!taskId || !Array.isArray(notes) || notes.length === 0) return { success: true };

  const map = loadAllStickyNotes(injectedStorage);
  const valid = notes.map((n) => normalizeStickyNote(n, taskId)).filter(Boolean);

  if (valid.length > 0) {
    map[taskId] = valid;
    return persistAllStickyNotes(map, injectedStorage);
  }
  return { success: true };
}
