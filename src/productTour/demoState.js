/**
 * VoxPlan Product Tour — Disposable Demonstration Environment (Mode B)
 *
 * Provides isolated in-memory sample data and state handlers for the hands-on demo.
 *
 * STRICT ISOLATION INVARIANT:
 * - Never mutates 'voxplan_tasks' or 'voxplan_notifications' in localStorage.
 * - Operates entirely in volatile React memory or tour-scoped state.
 * - Allows first-time visitors to experiment with task creation, editing, prioritization,
 *   stopwatch tracking, and sticky notes without risk of altering existing user data.
 */

export function getInitialDemoTasks() {
  const today = new Date();
  const formatISO = (d) => d.toISOString().split('T')[0];

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 4);

  return [
    {
      id: 'demo-task-1',
      title: 'Prepare product demonstration showcase',
      description: 'Highlight Kahn DAG topological scheduling, 100% local Bayesian learning, and voice control.',
      priority: 'high',
      dueDate: formatISO(today),
      completed: false,
      category: 'Product',
      estimatedEffort: 2.5,
      dependencies: [],
      createdAt: new Date().toISOString(),
      isDemoTourItem: true,
    },
    {
      id: 'demo-task-2',
      title: 'Review encryption & local privacy guarantees',
      description: 'Audit AES-GCM passphrase export and verify zero third-party cloud LLM network calls.',
      priority: 'medium',
      dueDate: formatISO(tomorrow),
      completed: false,
      category: 'Security',
      estimatedEffort: 1.5,
      dependencies: ['demo-task-1'],
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      isDemoTourItem: true,
    },
    {
      id: 'demo-task-3',
      title: 'Test single-turn voice command recognition',
      description: 'Try speaking "Add task Test schedule due tomorrow" or click the microphone button.',
      priority: 'low',
      dueDate: formatISO(nextWeek),
      completed: false,
      category: 'Engineering',
      estimatedEffort: 1.0,
      dependencies: [],
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      isDemoTourItem: true,
    },
    {
      id: 'demo-task-4',
      title: 'Evaluate daily capacity limit (6.0h / day)',
      description: 'Observe how oversized workloads automatically roll over to prevent burnout.',
      priority: 'high',
      dueDate: formatISO(today),
      completed: true,
      category: 'Planning',
      estimatedEffort: 2.0,
      dependencies: [],
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      isDemoTourItem: true,
    },
  ];
}

export function getInitialDemoStickyNotes() {
  return {
    'demo-task-1': [
      {
        id: 'demo-note-1',
        themeId: 'sakura-bunny',
        title: 'Launch Pitch Notes',
        content: 'Remember to emphasize: 100% local-first, zero cloud leaks, and verified factory scheduler weights (50, 100, 15, 25)!',
        fontId: 'caveat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'demo-note-2',
        themeId: 'morning-sky-bear',
        title: 'Demo Flow',
        content: '1. Voice command\n2. Inline task editing\n3. Topological schedule review',
        fontId: 'shadows',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
}
