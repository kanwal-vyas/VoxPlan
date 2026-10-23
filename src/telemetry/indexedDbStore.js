/**
 * VoxPlan IndexedDB Storage Layer.
 * Provides durable, transactional persistence for behavioral events, tasks, and timer sessions.
 * Includes graceful memory/localStorage fallback for environments without IndexedDB.
 */

const DB_NAME = 'voxplan_db';
const DB_VERSION = 1;
const EVENTS_STORE = 'telemetry_events';
const TASKS_STORE = 'tasks';
const SESSIONS_STORE = 'timer_sessions';

// In-memory fallback stores when IndexedDB is unavailable
const memoryFallback = {
  events: new Map(),
  tasks: new Map(),
  sessions: new Map(),
};

/**
 * Checks if IndexedDB is available in the current environment.
 */
function isIndexedDBAvailable() {
  try {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

let dbInstance = null;
let dbOpenPromise = null;

/**
 * Opens or upgrades the IndexedDB database.
 * @returns {Promise<IDBDatabase|null>}
 */
export async function getDb() {
  if (!isIndexedDBAvailable()) {
    return null;
  }

  if (dbInstance) {
    return dbInstance;
  }

  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  dbOpenPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 1. Telemetry Events Store
        if (!db.objectStoreNames.contains(EVENTS_STORE)) {
          const eventsStore = db.createObjectStore(EVENTS_STORE, { keyPath: 'event_id' });
          eventsStore.createIndex('profile_id', 'profile_id', { unique: false });
          eventsStore.createIndex('task_id', 'task_id', { unique: false });
          eventsStore.createIndex('event_type', 'event_type', { unique: false });
          eventsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 2. Tasks Store
        if (!db.objectStoreNames.contains(TASKS_STORE)) {
          db.createObjectStore(TASKS_STORE, { keyPath: 'id' });
        }

        // 3. Timer Sessions Store
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const sessionsStore = db.createObjectStore(SESSIONS_STORE, { keyPath: 'session_id' });
          sessionsStore.createIndex('task_id', 'task_id', { unique: false });
          sessionsStore.createIndex('profile_id', 'profile_id', { unique: false });
          sessionsStore.createIndex('status', 'status', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        dbInstance.onversionchange = () => {
          dbInstance.close();
          dbInstance = null;
          dbOpenPromise = null;
        };
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.warn('IndexedDB open error, falling back to in-memory store:', event.target.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('Exception opening IndexedDB:', err);
      resolve(null);
    }
  });

  return dbOpenPromise;
}

/**
 * Idempotently saves an event to persistent storage.
 * @param {object} event Validated event object
 * @returns {Promise<boolean>}
 */
export async function saveEvent(event) {
  if (!event || !event.event_id) return false;

  const db = await getDb();
  if (!db) {
    memoryFallback.events.set(event.event_id, { ...event });
    return true;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([EVENTS_STORE], 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      // 'put' ensures idempotency if event_id already exists
      const request = store.put(event);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => {
        console.error('Failed to store event in IndexedDB:', e.target.error);
        memoryFallback.events.set(event.event_id, { ...event });
        resolve(false);
      };
    } catch (err) {
      console.warn('Transaction error, writing to memory fallback:', err);
      memoryFallback.events.set(event.event_id, { ...event });
      resolve(false);
    }
  });
}

/**
 * Saves a batch of events transactionally.
 * @param {object[]} events Array of validated events
 * @returns {Promise<number>} Number of successfully saved events
 */
export async function saveEventsBatch(events) {
  if (!Array.isArray(events) || events.length === 0) return 0;

  const db = await getDb();
  if (!db) {
    let count = 0;
    for (const ev of events) {
      if (ev && ev.event_id) {
        memoryFallback.events.set(ev.event_id, { ...ev });
        count++;
      }
    }
    return count;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([EVENTS_STORE], 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      let count = 0;

      for (const ev of events) {
        if (ev && ev.event_id) {
          store.put(ev);
          count++;
        }
      }

      tx.oncomplete = () => resolve(count);
      tx.onerror = (e) => {
        console.error('Batch transaction failed:', e.target.error);
        resolve(0);
      };
    } catch (err) {
      console.warn('Batch exception:', err);
      resolve(0);
    }
  });
}

/**
 * Retrieves all events for a given profile, sorted by timestamp ascending.
 * @param {string} profileId
 * @returns {Promise<object[]>}
 */
export async function getEventsByProfile(profileId) {
  const db = await getDb();
  if (!db) {
    return Array.from(memoryFallback.events.values())
      .filter((ev) => ev.profile_id === profileId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([EVENTS_STORE], 'readonly');
      const store = tx.objectStore(EVENTS_STORE);
      const index = store.index('profile_id');
      const request = index.getAll(profileId);

      request.onsuccess = (e) => {
        const events = e.target.result || [];
        events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        resolve(events);
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Retrieves all events for a specific task ID.
 * @param {string} taskId
 * @returns {Promise<object[]>}
 */
export async function getEventsByTask(taskId) {
  const db = await getDb();
  if (!db) {
    return Array.from(memoryFallback.events.values())
      .filter((ev) => ev.task_id === taskId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([EVENTS_STORE], 'readonly');
      const store = tx.objectStore(EVENTS_STORE);
      const index = store.index('task_id');
      const request = index.getAll(taskId);

      request.onsuccess = (e) => {
        const events = e.target.result || [];
        events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        resolve(events);
      };
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Permanently deletes all events belonging to a profile ID.
 * Leaves active tasks and other profiles untouched.
 * @param {string} profileId
 * @returns {Promise<boolean>}
 */
export async function clearEventsByProfile(profileId) {
  // Clear from memory fallback
  for (const [key, ev] of memoryFallback.events.entries()) {
    if (ev.profile_id === profileId) {
      memoryFallback.events.delete(key);
    }
  }

  const db = await getDb();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([EVENTS_STORE], 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      const index = store.index('profile_id');
      const request = index.openCursor(IDBKeyRange.only(profileId));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      request.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Deletes ONLY synthetic demo events for a profile, preserving genuine user telemetry events.
 * @param {string} profileId
 * @returns {Promise<boolean>}
 */
export async function clearDemoEventsByProfile(profileId) {
  // Clear demo events from memory fallback
  for (const [key, ev] of memoryFallback.events.entries()) {
    if (
      ev.profile_id === profileId &&
      (ev.isDemoSeed || ev.isSyntheticData || ev.provenanceSource === 'demo_seeding_utility')
    ) {
      memoryFallback.events.delete(key);
    }
  }

  const db = await getDb();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([EVENTS_STORE], 'readwrite');
      const store = tx.objectStore(EVENTS_STORE);
      const index = store.index('profile_id');
      const request = index.openCursor(IDBKeyRange.only(profileId));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const val = cursor.value;
          if (
            val &&
            (val.isDemoSeed || val.isSyntheticData || val.provenanceSource === 'demo_seeding_utility')
          ) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      request.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Saves or updates a timer session in IndexedDB.
 * @param {object} session
 */
export async function saveTimerSession(session) {
  if (!session || !session.session_id) return false;

  const db = await getDb();
  if (!db) {
    memoryFallback.sessions.set(session.session_id, { ...session });
    return true;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.put(session);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Retrieves all timer sessions for a task ID.
 * @param {string} taskId
 * @returns {Promise<object[]>}
 */
export async function getTimerSessionsByTask(taskId) {
  const db = await getDb();
  if (!db) {
    return Array.from(memoryFallback.sessions.values())
      .filter((s) => s.task_id === taskId)
      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([SESSIONS_STORE], 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const index = store.index('task_id');
      const req = index.getAll(taskId);
      req.onsuccess = (e) => {
        const list = e.target.result || [];
        list.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
        resolve(list);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Retrieves all timer sessions for a profile ID.
 * @param {string} profileId
 * @returns {Promise<object[]>}
 */
export async function getTimerSessionsByProfile(profileId) {
  const db = await getDb();
  if (!db) {
    return Array.from(memoryFallback.sessions.values())
      .filter((s) => s.profile_id === profileId)
      .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([SESSIONS_STORE], 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const index = store.index('profile_id');
      const req = index.getAll(profileId);
      req.onsuccess = (e) => {
        const list = e.target.result || [];
        list.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());
        resolve(list);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Clears timer sessions belonging to a profile ID.
 */
export async function clearTimerSessionsByProfile(profileId) {
  for (const [key, s] of memoryFallback.sessions.entries()) {
    if (s.profile_id === profileId) {
      memoryFallback.sessions.delete(key);
    }
  }

  const db = await getDb();
  if (!db) return true;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      const index = store.index('profile_id');
      const req = index.openCursor(IDBKeyRange.only(profileId));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve(true);
        }
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
