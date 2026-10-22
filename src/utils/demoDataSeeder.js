/**
 * VoxPlan Demo Data Seeding & Reset Utility.
 *
 * PURPOSE:
 * Generates a deterministic, schema-compliant synthetic demonstration dataset
 * for pre-demo preparation and live walk-throughs.
 *
 * GUARANTEES & SAFETY CONSTRAINTS:
 * 1. Explicitly synthetic: Every record is tagged with `isSyntheticData: true`,
 *    `isDemoSeed: true`, and `provenanceSource: 'demo_seeding_utility'`.
 * 2. Invariant preservation: Never touches factory scheduler weights, never alters
 *    production activation flags (`isAdaptationUnlocked`, `productionApplied`), and
 *    never qualifies as genuine production sampling assurance.
 * 3. Overwrite protection: Refuses to overwrite existing user data without explicit confirmation.
 * 4. Idempotency & Repeatability: Always generates identical, internally coherent tasks and
 *    telemetry event streams for a given reference date and profile ID.
 * 5. Clean teardown: Exposes `clearDemoSeed()` to restore the application to clean default state.
 */

import { SCHEMA_VERSION } from '../telemetry/eventSchema.js';
import { formatISODate } from '../conversation/compoundCommandParser.js';

export const DEMO_SEED_KEY = 'voxplan_demo_seed_active';
export const DEMO_STORAGE_TASKS_KEY = 'voxplan_tasks';
export const DEMO_STORAGE_ACCEPTED_SCHEDULE_KEY = 'voxplan_accepted_schedule';
export const DEMO_BACKUP_TASKS_KEY = 'voxplan_user_tasks_backup';

/**
 * Generates deterministic demo tasks and corresponding Schema v2 telemetry events.
 *
 * @param {object} [options={}]
 * @param {Date} [options.referenceDate=new Date()]
 * @param {string} [options.profileId='prof_demo_showcase']
 * @returns {{ tasks: object[], events: object[], metadata: object }}
 */
export function generateDemoDataset(options = {}) {
  const refDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const profileId = typeof options.profileId === 'string' && options.profileId.trim()
    ? options.profileId
    : 'prof_demo_showcase';

  const refTime = refDate.getTime();
  const dayMs = 86400000;

  // Helper to format ISO dates YYYY-MM-DD
  const formatOffset = (days) => formatISODate(new Date(refTime + days * dayMs));
  const timestampOffset = (days, hours = 9, minutes = 0) => {
    const d = new Date(refTime + days * dayMs);
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
  };

  // 1. Eight completed tasks across 4 categories to satisfy:
  //    - Section 04 Habit Insights (N >= 3)
  //    - Section 05 Personal Duration Estimator walk-forward holdout (min 3 train, min 5 held-out => N >= 8)
  const completedTaskDefs = [
    {
      id: 'demo-c-1',
      title: 'Initialize repository & CI configuration',
      category: 'Engineering',
      priority: 'high',
      estimatedEffort: 3.0,
      actualHours: 2.8,
      durationSource: 'tracked',
      dayOffset: -10,
      dependencies: [],
    },
    {
      id: 'demo-c-2',
      title: 'Define domain data models & schemas',
      category: 'Engineering',
      priority: 'high',
      estimatedEffort: 4.0,
      actualHours: 3.6,
      durationSource: 'tracked',
      dayOffset: -9,
      dependencies: ['demo-c-1'],
    },
    {
      id: 'demo-c-3',
      title: 'Design pastel design system & cards',
      category: 'Design',
      priority: 'medium',
      estimatedEffort: 2.5,
      actualHours: 2.4,
      durationSource: 'tracked',
      dayOffset: -8,
      dependencies: [],
    },
    {
      id: 'demo-c-4',
      title: 'Draft user guide & onboarding steps',
      category: 'Documentation',
      priority: 'low',
      estimatedEffort: 1.5,
      actualHours: 1.5,
      durationSource: 'self_reported',
      dayOffset: -7,
      dependencies: [],
    },
    {
      id: 'demo-c-5',
      title: 'Implement Kahn topological scheduler DAG',
      category: 'Engineering',
      priority: 'high',
      estimatedEffort: 5.0,
      actualHours: 5.4,
      durationSource: 'tracked',
      dayOffset: -6,
      dependencies: ['demo-c-2'],
    },
    {
      id: 'demo-c-6',
      title: 'Integrate Web Speech API voice controls',
      category: 'Engineering',
      priority: 'medium',
      estimatedEffort: 3.5,
      actualHours: 3.2,
      durationSource: 'tracked',
      dayOffset: -5,
      dependencies: [],
    },
    {
      id: 'demo-c-7',
      title: 'Refactor calendar date parsing & timezones',
      category: 'Maintenance',
      priority: 'medium',
      estimatedEffort: 2.0,
      actualHours: 2.1,
      durationSource: 'tracked',
      dayOffset: -4,
      dependencies: [],
    },
    {
      id: 'demo-c-8',
      title: 'Write test suite for scheduler invariants',
      category: 'Testing',
      priority: 'high',
      estimatedEffort: 4.0,
      actualHours: 3.8,
      durationSource: 'tracked',
      dayOffset: -3,
      dependencies: ['demo-c-5', 'demo-c-7'],
    },
  ];

  // 2. Four active tasks ready for the live schedule demonstration:
  //    - Task A1: Urgent, due today
  //    - Task A2: High priority dependent on A1, due tomorrow
  //    - Task A3: Oversized 8.0h task (triggers multi-day chunking across daily capacity)
  //    - Task A4: Normal low priority task due next week
  const activeTaskDefs = [
    {
      id: 'demo-a-1',
      title: 'Review weekly sprint milestones & deliverables',
      description: 'Audit active milestones and ensure prerequisites are identified.',
      category: 'Planning',
      priority: 'high',
      estimatedEffort: 2.0,
      dueDate: formatOffset(0),
      dependencies: [],
      createdAt: timestampOffset(-2, 10, 0),
    },
    {
      id: 'demo-a-2',
      title: 'Prepare executive demo presentation deck',
      description: 'Synthesize architecture milestones and showcase live scheduling capabilities.',
      category: 'Planning',
      priority: 'high',
      estimatedEffort: 3.5,
      dueDate: formatOffset(1),
      dependencies: ['demo-a-1'],
      createdAt: timestampOffset(-1, 11, 30),
    },
    {
      id: 'demo-a-3',
      title: 'Benchmark multi-strategy schedule optimization',
      description: 'Run 12 scenario benchmarks comparing Adaptive, EDF, and Priority models.',
      category: 'Engineering',
      priority: 'medium',
      estimatedEffort: 8.0,
      dueDate: formatOffset(3),
      dependencies: [],
      chunkable: true,
      createdAt: timestampOffset(-1, 14, 0),
    },
    {
      id: 'demo-a-4',
      title: 'Conduct interactive user feedback debrief',
      description: 'Review schedule placements and verify proposal override canvas.',
      category: 'Design',
      priority: 'low',
      estimatedEffort: 1.5,
      dueDate: formatOffset(5),
      dependencies: [],
      createdAt: timestampOffset(0, 9, 0),
    },
  ];

  // Assemble task objects
  const tasks = [];
  const events = [];

  // Build completed tasks & events
  completedTaskDefs.forEach((def, idx) => {
    const taskCreatedAt = timestampOffset(def.dayOffset - 2, 9, 0);
    const taskDueDate = formatOffset(def.dayOffset);
    const taskCompletedAt = timestampOffset(def.dayOffset, 16, 30);
    const elapsedSeconds = Math.round(def.actualHours * 3600);

    const task = {
      id: def.id,
      title: def.title,
      description: `Historical completed task for demo calibration (${def.category}).`,
      priority: def.priority,
      dueDate: taskDueDate,
      completed: true,
      completedAt: taskCompletedAt,
      category: def.category,
      estimatedEffort: def.estimatedEffort,
      dependencies: def.dependencies,
      createdAt: taskCreatedAt,
      isSyntheticData: true,
      isDemoSeed: true,
      provenanceSource: 'demo_seeding_utility',
    };
    tasks.push(task);

    // Schema v2 event stream:
    // 1. task_created
    events.push({
      event_id: `demo-ev-create-${idx + 1}`,
      profile_id: profileId,
      event_type: 'task_created',
      task_id: def.id,
      timestamp: taskCreatedAt,
      schema_version: SCHEMA_VERSION,
      isSyntheticData: true,
      isDemoSeed: true,
      provenanceSource: 'demo_seeding_utility',
      payload: {
        title: def.title,
        priority: def.priority,
        estimated_effort: def.estimatedEffort,
        due_date: taskDueDate,
        category: def.category,
      },
    });

    // 2. task_started
    const startedAt = timestampOffset(def.dayOffset, 10, 0);
    const sessionId = `demo-sess-${idx + 1}`;
    events.push({
      event_id: `demo-ev-start-${idx + 1}`,
      profile_id: profileId,
      event_type: 'task_started',
      task_id: def.id,
      timestamp: startedAt,
      schema_version: SCHEMA_VERSION,
      isSyntheticData: true,
      isDemoSeed: true,
      provenanceSource: 'demo_seeding_utility',
      payload: {
        session_id: sessionId,
        started_at: startedAt,
      },
    });

    // 3. task_paused
    const pausedAt = timestampOffset(def.dayOffset, 14, 0);
    events.push({
      event_id: `demo-ev-pause-${idx + 1}`,
      profile_id: profileId,
      event_type: 'task_paused',
      task_id: def.id,
      timestamp: pausedAt,
      schema_version: SCHEMA_VERSION,
      isSyntheticData: true,
      isDemoSeed: true,
      provenanceSource: 'demo_seeding_utility',
      payload: {
        session_id: sessionId,
        elapsed_seconds: Math.round(elapsedSeconds * 0.6),
      },
    });

    // 4. task_completed
    events.push({
      event_id: `demo-ev-comp-${idx + 1}`,
      profile_id: profileId,
      event_type: 'task_completed',
      task_id: def.id,
      timestamp: taskCompletedAt,
      schema_version: SCHEMA_VERSION,
      isSyntheticData: true,
      isDemoSeed: true,
      provenanceSource: 'demo_seeding_utility',
      payload: {
        duration_source: def.durationSource,
        tracked_duration_seconds: def.durationSource === 'tracked' ? elapsedSeconds : null,
        self_reported_duration_seconds: def.durationSource === 'self_reported' ? elapsedSeconds : null,
        completed_at: taskCompletedAt,
      },
    });
  });

  // Build active tasks & events
  activeTaskDefs.forEach((def, idx) => {
    const task = {
      id: def.id,
      title: def.title,
      description: def.description,
      priority: def.priority,
      dueDate: def.dueDate,
      completed: false,
      category: def.category,
      estimatedEffort: def.estimatedEffort,
      dependencies: def.dependencies,
      createdAt: def.createdAt,
      chunkable: Boolean(def.chunkable),
      isSyntheticData: true,
      isDemoSeed: true,
      provenanceSource: 'demo_seeding_utility',
    };
    tasks.push(task);

    events.push({
      event_id: `demo-ev-active-${idx + 1}`,
      profile_id: profileId,
      event_type: 'task_created',
      task_id: def.id,
      timestamp: def.createdAt,
      schema_version: SCHEMA_VERSION,
      isSyntheticData: true,
      isDemoSeed: true,
      provenanceSource: 'demo_seeding_utility',
      payload: {
        title: def.title,
        priority: def.priority,
        estimated_effort: def.estimatedEffort,
        due_date: def.dueDate,
        category: def.category,
      },
    });
  });

  return {
    tasks,
    events,
    metadata: {
      generatedAt: refDate.toISOString(),
      profileId,
      completedTaskCount: completedTaskDefs.length,
      activeTaskCount: activeTaskDefs.length,
      totalTaskCount: tasks.length,
      totalEventCount: events.length,
      isSyntheticData: true,
      isDemoSeed: true,
      provenanceSource: 'demo_seeding_utility',
    },
  };
}

/**
 * Checks whether user data is present in localStorage.
 * Distinguishes untouched initial welcome tasks from genuine user modifications.
 *
 * @returns {boolean} True if user tasks or modifications exist
 */
export function hasExistingUserData() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return false;
  }
  const raw = window.localStorage.getItem(DEMO_STORAGE_TASKS_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return false;
    // If all tasks are welcome tasks, it is considered fresh default
    const isOnlyWelcome = parsed.every(
      (t) => typeof t.id === 'string' && (t.id.startsWith('task-welcome-') || t.isDemoSeed)
    );
    return !isOnlyWelcome;
  } catch {
    return true;
  }
}

/**
 * Applies the demo dataset to localStorage and IndexedDB with overwrite protection.
 * Backs up existing genuine user data before seeding to allow flawless restoration on reset.
 *
 * @param {object} [options={}]
 * @param {boolean} [options.confirmOverwrite=false]
 * @param {Function} [options.saveEventFn] Optional injected IndexedDB event saver
 * @returns {Promise<{ success: boolean, message: string, taskCount: number, eventCount: number }>}
 */
export async function applyDemoSeed(options = {}) {
  const { confirmOverwrite = false, saveEventFn = null } = options;

  if (typeof window === 'undefined' || !window.localStorage) {
    return { success: false, message: 'LocalStorage unavailable in current environment.', taskCount: 0, eventCount: 0 };
  }

  // 1. Overwrite protection
  if (hasExistingUserData() && !confirmOverwrite) {
    return {
      success: false,
      message: 'Existing user tasks detected. Pass confirmOverwrite: true or confirm in dialog to proceed.',
      taskCount: 0,
      eventCount: 0,
    };
  }

  // Backup existing genuine user data before seeding so it can be restored on reset
  if (hasExistingUserData()) {
    const existingRaw = window.localStorage.getItem(DEMO_STORAGE_TASKS_KEY);
    if (existingRaw) {
      window.localStorage.setItem(DEMO_BACKUP_TASKS_KEY, existingRaw);
    }
  }

  // 2. Generate deterministic dataset
  const profileId = window.localStorage.getItem('voxplan_profile_id') || 'prof_demo_showcase';
  const dataset = generateDemoDataset({ referenceDate: new Date(), profileId });

  // 3. Persist tasks to localStorage
  window.localStorage.setItem(DEMO_STORAGE_TASKS_KEY, JSON.stringify(dataset.tasks));
  window.localStorage.setItem(DEMO_SEED_KEY, 'true');

  // Clear any existing accepted schedule so demo begins fresh
  window.localStorage.removeItem(DEMO_STORAGE_ACCEPTED_SCHEDULE_KEY);

  // 4. Persist events to IndexedDB if saveEventFn or global indexedDB is available
  let persistedEvents = 0;
  if (typeof saveEventFn === 'function') {
    for (const ev of dataset.events) {
      await saveEventFn(ev);
      persistedEvents++;
    }
  }

  return {
    success: true,
    message: `Demo profile seeded successfully with ${dataset.tasks.length} tasks and ${dataset.events.length} events.`,
    taskCount: dataset.tasks.length,
    eventCount: dataset.events.length,
    persistedEvents,
  };
}

/**
 * Checks whether a task is owned by the demo seeder.
 * @param {object} t Task object
 * @returns {boolean}
 */
export function isDemoTask(t) {
  if (!t || typeof t !== 'object') return false;
  return Boolean(
    t.isDemoSeed ||
    t.isSyntheticData ||
    t.provenanceSource === 'demo_seeding_utility' ||
    (typeof t.id === 'string' && t.id.startsWith('demo-'))
  );
}

/**
 * Clears demo data and restores clean state.
 * If user tasks were backed up before demo seeding, restores the backed-up user tasks.
 * If any non-demo tasks exist, preserves them while removing only demo-owned records.
 *
 * @param {object} [options={}]
 * @param {Function} [options.clearEventsFn] Optional injected function to delete demo events
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function clearDemoSeed(options = {}) {
  const { clearEventsFn = null } = options;

  if (typeof window === 'undefined' || !window.localStorage) {
    return { success: false, message: 'LocalStorage unavailable.' };
  }

  const profileId =
    options.profileId ||
    window.localStorage.getItem('voxplan_profile_id') ||
    'prof_demo_showcase';

  // 1. Task teardown: Restore backed-up user tasks if available, or remove only demo-owned tasks
  const backedUpTasks = window.localStorage.getItem(DEMO_BACKUP_TASKS_KEY);
  if (backedUpTasks) {
    try {
      const parsed = JSON.parse(backedUpTasks);
      if (Array.isArray(parsed) && parsed.length > 0) {
        window.localStorage.setItem(DEMO_STORAGE_TASKS_KEY, backedUpTasks);
      } else {
        window.localStorage.removeItem(DEMO_STORAGE_TASKS_KEY);
      }
    } catch {
      window.localStorage.removeItem(DEMO_STORAGE_TASKS_KEY);
    }
    window.localStorage.removeItem(DEMO_BACKUP_TASKS_KEY);
  } else {
    // If no backup was created, check if non-demo tasks exist in storage
    const currentTasksRaw = window.localStorage.getItem(DEMO_STORAGE_TASKS_KEY);
    if (currentTasksRaw) {
      try {
        const parsed = JSON.parse(currentTasksRaw);
        if (Array.isArray(parsed)) {
          const nonDemoTasks = parsed.filter((t) => !isDemoTask(t));
          if (nonDemoTasks.length > 0) {
            window.localStorage.setItem(DEMO_STORAGE_TASKS_KEY, JSON.stringify(nonDemoTasks));
          } else {
            window.localStorage.removeItem(DEMO_STORAGE_TASKS_KEY);
          }
        } else {
          window.localStorage.removeItem(DEMO_STORAGE_TASKS_KEY);
        }
      } catch {
        window.localStorage.removeItem(DEMO_STORAGE_TASKS_KEY);
      }
    } else {
      window.localStorage.removeItem(DEMO_STORAGE_TASKS_KEY);
    }
  }

  // Remove demo active marker and demo schedule
  window.localStorage.removeItem(DEMO_STORAGE_ACCEPTED_SCHEDULE_KEY);
  window.localStorage.removeItem(DEMO_SEED_KEY);

  // 2. Clear IndexedDB events: clearEventsFn deletes only demo-seeded events
  if (typeof clearEventsFn === 'function') {
    await clearEventsFn(profileId);
  }

  return {
    success: true,
    message: 'Demo dataset cleared. Application restored to clean state.',
  };
}
