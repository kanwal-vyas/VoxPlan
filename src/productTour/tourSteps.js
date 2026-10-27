/**
 * VoxPlan Product Tour — Curated Step Inventory
 *
 * Defines the complete, authoritative sequence of 20 guided tour steps covering:
 * 1. Orientation & Navigation
 * 2. Today's Sprint Cockpit & Focus Card
 * 3. Natural Language Command Dock
 * 4. Voice Recognition Controller (Microphone & Web Speech API)
 * 5. Speech Synthesis Output (Audible Audio Feedback)
 * 6. Tasks Backlog & Organization
 * 7. Smart Backlog Filtering & Triaging
 * 8. Interactive Task Cards & Inline Editing
 * 9. Illustrated Stationery Sticky Notes (Memos)
 * 10. Safe Deletion & Lossless Undo Recovery
 * 11. Interactive Task Calendar & Timeline
 * 12. RFC 5545 iCalendar (.ics) Export
 * 13. Topological Adaptive Scheduling Engine (Kahn DAG)
 * 14. Real-time Notification Center & Reminders
 * 15. Notification Preferences & Quiet Hours
 * 16. Model Intelligence & ML Delay Prediction
 * 17. Personal Duration Estimator & Bayesian Shrinkage
 * 18. Schedule Safeguards & Locked Adaptation Gate
 * 19. Encrypted Workspace Backup & Local-First Privacy
 * 20. Tour Graduation & Practice Modes
 */

export const TOUR_STEPS = [
  {
    id: 'step-orientation',
    stepNumber: 1,
    category: 'Orientation & Workspace',
    title: 'Welcome to VoxPlan',
    badge: 'CORE WORKSPACE',
    view: 'today',
    targetSelector: '#header-nav-landing-btn',
    fallbackTargetSelector: 'button[title*="Landing Page"], .brand',
    placement: 'bottom',
    description:
      'Local-first predictive planner that calculates delay risk and sequences tasks using topological dependency algorithms.',
    actionPrompt:
      'Use the tabs to switch views anytime, or tap Overview to return to the landing page.',
    whenToUse: 'Quickly navigate between daily focus, backlog, calendar, and model insights.',
    limitations: 'All computations run 100% locally in your browser. No personal data is sent to external cloud servers.',
  },
  {
    id: 'step-today-cockpit',
    stepNumber: 2,
    category: 'Daily Planning',
    title: "Today's Active Sprint Focus",
    badge: 'DAILY COCKPIT',
    view: 'today',
    targetSelector: '#today-focus-card',
    fallbackTargetSelector: '.digital-card',
    placement: 'left',
    description:
      'Your daily command center showing high-priority initiatives with delay risk estimates and one-click stopwatch time-tracking.',
    actionPrompt:
      'Click Track to log real working time, or + New Task to schedule an initiative.',
    whenToUse: 'Stay focused on today’s highest-impact deliverables without cognitive overload.',
    limitations: 'Highlights up to 4 priority tasks to protect against sprint fatigue; full backlog is in Tasks view.',
  },
  {
    id: 'step-command-dock',
    stepNumber: 3,
    category: 'Voice & Commands',
    title: 'Natural Language Command Dock',
    badge: 'COMMAND CENTER',
    view: 'today',
    targetSelector: '#command',
    fallbackTargetSelector: '#command-input',
    placement: 'top',
    description:
      'Type or speak plain English commands like "Add task Budget due Friday" or "Mark budget complete".',
    actionPrompt:
      'Type a command in the dock input and hit Enter, or tap the mic to dictate.',
    whenToUse: 'Fast, keyboard-first or hands-free productivity without nested form modals.',
    limitations: 'Operates deterministically. Prompts for clarification if a command is ambiguous.',
  },
  {
    id: 'step-voice-mic',
    stepNumber: 4,
    category: 'Voice & Commands',
    title: 'Voice Recognition Controller',
    badge: 'VOICE ENGINE',
    view: 'today',
    targetSelector: '#voice-mic-btn',
    fallbackTargetSelector: '#command button[aria-label*="microphone"]',
    placement: 'top',
    description:
      'Speak planning instructions naturally with live transcript mirroring and immediate execution.',
    actionPrompt:
      'Click the microphone button to start listening (glows red) and speak your instruction clearly.',
    whenToUse: 'Hands-free capture when away from the keyboard or multi-tasking.',
    limitations:
      'Requires microphone permission. Native Web Speech is supported in Chrome, Edge, Safari, and Brave.',
  },
  {
    id: 'step-speech-toggle',
    stepNumber: 5,
    category: 'Voice & Commands',
    title: 'Speech Output (Text-to-Speech)',
    badge: 'AUDIO FEEDBACK',
    view: 'today',
    targetSelector: '#speech-toggle-btn',
    fallbackTargetSelector: '#command button[aria-label*="speech"]',
    placement: 'top',
    description:
      'Reads command confirmations, schedule debriefs, and risk explanations aloud using local speech synthesis.',
    actionPrompt:
      'Click the speaker icon to toggle spoken audio feedback on or off.',
    whenToUse: 'Auditory confirmation during reviews or hands-free workflows.',
    limitations: 'Disabled by default for quiet office environments. Runs locally without external audio streaming.',
  },
  {
    id: 'step-tasks-workspace',
    stepNumber: 6,
    category: 'Task Management',
    title: 'Task Workspace & Backlog',
    badge: 'BACKLOG',
    view: 'tasks',
    targetSelector: '#nav-tab-tasks',
    fallbackTargetSelector: '#view-tasks',
    placement: 'bottom',
    description:
      'Your comprehensive project backlog with transparent due dates, effort estimates, and dependencies.',
    actionPrompt:
      'Click the Tasks tab in the header to switch to your full backlog.',
    whenToUse: 'Backlog grooming, sprint planning, and structuring complex dependencies.',
    limitations: 'Tasks are persisted automatically to local IndexedDB and localStorage with zero cloud lag.',
  },
  {
    id: 'step-task-filters',
    stepNumber: 7,
    category: 'Task Management',
    title: 'Smart Backlog Filtering',
    badge: 'TRIAGE',
    view: 'tasks',
    targetSelector: '#task-filter-bar, .task-filter-pills, [data-filter="all"]',
    fallbackTargetSelector: '#view-tasks',
    placement: 'bottom',
    description:
      'Instant client-side filtering by priority (High, Medium, Low), deadlines (Overdue, Today), or completed state.',
    actionPrompt:
      'Click any filter pill to narrow your focus or review finished milestones.',
    whenToUse: 'Triaging large backlogs, auditing bottlenecks, and celebrating finished tasks.',
    limitations: 'Filtering is non-destructive and preserves task ordering and dependency structures.',
  },
  {
    id: 'step-task-card',
    stepNumber: 8,
    category: 'Task Management',
    title: 'Interactive Task Cards & Inline Editing',
    badge: 'INTERACTIVE CARDS',
    view: 'tasks',
    targetSelector: '#first-task-card, .task-card-item:first-child, .task-card:first-child, [data-task-id]',
    fallbackTargetSelector: '#view-tasks',
    placement: 'top',
    description:
      'Click the title to rename, priority badge to cycle urgency, or due date to reschedule inline.',
    actionPrompt:
      'Click the priority badge to cycle urgency, or hover over the dual duration indicator.',
    whenToUse: 'Rapid inline adjustments during standups or when deadlines shift.',
    limitations: 'Inline edits are saved immediately to local storage with immediate visual feedback.',
  },
  {
    id: 'step-sticky-notes',
    stepNumber: 9,
    category: 'Sticky Notes',
    title: 'Illustrated Stationery Sticky Notes',
    badge: 'ILLUSTRATED MEMOS',
    view: 'tasks',
    targetSelector: '#first-task-sticky-trigger, [data-action="open-sticky-notes"], .task-sticky-affordance, .task-sticky-tab, .task-sticky-empty-trigger',
    fallbackTargetSelector: '#first-task-card, .task-card-item:first-child',
    placement: 'top',
    description:
      'Attach stationery memos across 6 curated themes including Morning Sky Bear and Sakura Blush Bunny.',
    actionPrompt:
      'Click the peeking memo tab on any task card to open your stationery notes.',
    whenToUse: 'Capture quick thoughts, checklists, links, or meeting notes attached to a task.',
    limitations: 'Notes are bound directly to their parent task ID. Deleting a task preserves notes in undo history.',
  },
  {
    id: 'step-delete-undo',
    stepNumber: 10,
    category: 'Task Management',
    title: 'Safe Deletion & Lossless Undo',
    badge: 'SAFETY & RECOVERY',
    view: 'tasks',
    targetSelector: '#first-task-delete-btn, .task-delete-btn, [data-action="delete-task"]',
    fallbackTargetSelector: '#first-task-card, .task-card-item:first-child',
    placement: 'bottom',
    description:
      'Deleting a task triggers a floating Undo toast, instantly restoring the task and its attached sticky notes.',
    actionPrompt:
      'Prune obsolete tasks safely — the floating feedback toast guarantees lossless restoration.',
    whenToUse: 'Pruning completed or cancelled initiatives with complete confidence.',
    limitations: 'Undo is available for 8 seconds after deletion; undo preserves original task ordering.',
  },
  {
    id: 'step-calendar-nav',
    stepNumber: 11,
    category: 'Calendar & Time-Blocking',
    title: 'Interactive Task Calendar',
    badge: 'CALENDAR TIMELINE',
    view: 'calendar',
    targetSelector: '#nav-tab-calendar',
    fallbackTargetSelector: '#view-calendar',
    placement: 'bottom',
    description:
      'Visualizes your workload across days and weeks with priority color bars, deadline clustering, and task density.',
    actionPrompt:
      'Click the Calendar tab in the header to view monthly and weekly schedules.',
    whenToUse: 'Planning multi-week project milestones and verifying deadline distribution.',
    limitations: 'All dates are parsed strictly as ISO-8601 (YYYY-MM-DD) to prevent timezone drift across calendar views.',
  },
  {
    id: 'step-ical-export',
    stepNumber: 12,
    category: 'Calendar & Time-Blocking',
    title: 'RFC 5545 iCalendar (.ics) Export',
    badge: 'CALENDAR EXPORT',
    view: 'calendar',
    targetSelector: '#calendar-export-btn, [data-action="export-calendar"]',
    fallbackTargetSelector: '#view-calendar',
    placement: 'bottom',
    description:
      'Export scheduled sprint tasks into standard RFC 5545 .ics calendar files for Google, Apple, or Outlook.',
    actionPrompt:
      'Click "Export .ics" to download a calendar snapshot of your scheduled sprint tasks.',
    whenToUse: 'Sync your optimized VoxPlan schedule into your primary work or personal calendar.',
    limitations: 'Produces a static RFC 5545 snapshot file. Continuous two-way synchronization requires importing into your calendar client.',
  },
  {
    id: 'step-adaptive-scheduler',
    stepNumber: 13,
    category: 'Adaptive Planning',
    title: 'Topological Adaptive Scheduler',
    badge: 'KAHN DAG ENGINE',
    view: 'today',
    targetSelector: '#btn-open-schedule-modal, [data-action="optimize-schedule"]',
    fallbackTargetSelector: '#today-focus-card',
    placement: 'bottom',
    description:
      'Sequences tasks using Kahn topological DAG analysis under a realistic 6.0 hours/day capacity limit.',
    actionPrompt:
      'Click "Adaptive Schedule" or type "optimize schedule" to generate a proposal.',
    whenToUse: 'Complex dependencies and shifting deadlines requiring a mathematically verified plan.',
    limitations:
      'Always presents a proposal for user review. VoxPlan NEVER modifies your active task dates without your explicit acceptance.',
  },
  {
    id: 'step-notifications-bell',
    stepNumber: 14,
    category: 'Notifications & Reminders',
    title: 'Notification Center & Unread Alerts',
    badge: 'ALERT CENTER',
    view: 'today',
    targetSelector: '#header-notification-bell-btn',
    fallbackTargetSelector: 'button[aria-label*="Notification"]',
    placement: 'bottom',
    description:
      'Alert drawer for upcoming deadlines, overdue items, schedule proposals, and backup reminders.',
    actionPrompt:
      'Click the notification bell to view active alerts and jump to affected tasks.',
    whenToUse: 'Review approaching deadlines, act on schedule recommendations, or clear notices.',
    limitations: 'Notifications are evaluated locally in your browser session with zero remote push servers.',
  },
  {
    id: 'step-notifications-prefs',
    stepNumber: 15,
    category: 'Notifications & Reminders',
    title: 'Notification Preferences & Quiet Hours',
    badge: 'PREFERENCES',
    view: 'today',
    targetSelector: '#notif-settings-btn, #header-notification-bell-btn',
    fallbackTargetSelector: '#header-notification-bell-btn',
    placement: 'bottom',
    description:
      'Configure reminder lead times (1h, 3h, 24h, morning-of), native browser permissions, and quiet hours.',
    actionPrompt:
      'Open Settings from the notification drawer to customize your preferred alert timing.',
    whenToUse: 'Tune alert timing to your work style or silence notifications outside work hours.',
    limitations:
      'Local-first reminders run when the application is open or active in a browser tab. Reminders cannot trigger while the browser is completely closed without external cloud push infrastructure.',
  },
  {
    id: 'step-insights-nav',
    stepNumber: 16,
    category: 'Machine Learning',
    title: 'Model Intelligence & Delay Prediction',
    badge: 'PREDICTIVE ML',
    view: 'insights',
    targetSelector: '#nav-tab-insights',
    fallbackTargetSelector: '#view-insights',
    placement: 'bottom',
    description:
      'Inspect supervised machine learning delay-risk estimates trained on deadline pressure, depth, and effort.',
    actionPrompt:
      'Click the Insights tab in the header to inspect feature importances and local model status.',
    whenToUse: 'Understand why a task was flagged as high risk and review historical completion patterns.',
    limitations: 'Predictive models evaluate risk based on structure and history; they do not replace human judgment.',
  },
  {
    id: 'step-personal-model',
    stepNumber: 17,
    category: 'Machine Learning',
    title: 'Personal Duration Estimator (Bayesian Shrinkage)',
    badge: 'BAYESIAN ESTIMATOR',
    view: 'insights',
    targetSelector: '#personal-model-dashboard, #personal-model, .personal-model-card',
    fallbackTargetSelector: '#view-insights',
    placement: 'top',
    description:
      'Learns your personal pace using empirical Bayesian shrinkage (K=3.0), combining estimates with category medians.',
    actionPrompt:
      'Review your category duration adjustments and walk-forward chronological evaluation metrics.',
    whenToUse: 'See how closely self-reported estimates match actual stopwatch completion times.',
    limitations: 'Requires at least 3 completed tasks in a category before personalized shrinkage is activated; defaults to honest cold-start tiers.',
  },
  {
    id: 'step-adaptation-gate',
    stepNumber: 18,
    category: 'Machine Learning',
    title: 'Schedule Safeguards & Factory Weights',
    badge: 'SAFETY INVARIANT',
    view: 'insights',
    targetSelector: '#adaptation-gate-status, .ml-model-card, #intelligence',
    fallbackTargetSelector: '#view-insights',
    placement: 'top',
    description:
      'Locked factory scheduler weights (Urgency: 50.0, Priority: 100.0, Unblock: 15.0, Risk: 25.0) for reproducible plans.',
    actionPrompt:
      'Review the Stage 7.4.4B locked adaptation gate, guaranteeing immunity to chaotic heuristic drift.',
    whenToUse: 'Verify mathematical determinism and stability of planning algorithms.',
    limitations: 'Autonomous weight adaptation is intentionally locked to protect plan quality against synthetic drift.',
  },
  {
    id: 'step-backup-privacy',
    stepNumber: 19,
    category: 'Security & Privacy',
    title: 'Encrypted Backup & Local-First Privacy',
    badge: 'AES-GCM ENCRYPTION',
    view: 'today',
    targetSelector: '#header-backup-btn',
    fallbackTargetSelector: 'button[aria-label*="Backup"]',
    placement: 'bottom',
    description:
      'Export tasks, sticky notes, accepted schedules, and telemetry into an AES-GCM 256-bit encrypted snapshot file (.voxplan.enc).',
    actionPrompt:
      'Click Backup in the header to export an encrypted snapshot of your private workspace.',
    whenToUse: 'Before clearing browser data, switching devices, or migrating browser profiles.',
    limitations:
      'Because VoxPlan stores zero data in remote cloud databases, clearing browser site data without a backup file will erase local workspace data.',
  },
  {
    id: 'step-graduation',
    stepNumber: 20,
    category: 'Graduation',
    title: "You're Ready to Plan with VoxPlan!",
    badge: 'TOUR COMPLETE',
    view: 'today',
    targetSelector: '#header-nav-landing-btn',
    fallbackTargetSelector: '.brand',
    placement: 'bottom',
    description:
      'You are ready! You can now navigate views, speak commands, manage notes, generate topological schedules, and backup data.',
    actionPrompt:
      'Click Finish Tour to jump into your tasks, or switch to Demo mode to experiment with sample data.',
    whenToUse: 'Restart this interactive tour anytime from the Overview page or the header options.',
    limitations: 'Completed status is remembered locally in tour storage so you are never interrupted again.',
  },
];
