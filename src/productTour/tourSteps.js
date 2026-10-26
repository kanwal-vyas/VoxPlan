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
      'VoxPlan is a local-first predictive task planner. Unlike traditional static to-do lists, it calculates completion risk and uses topological dependency algorithms to generate realistic, executable schedules.',
    actionPrompt:
      'Notice the header controls: use the tabs to switch views anytime, or click "← Overview" to return to the product overview page.',
    whenToUse: 'Whenever you want to quickly navigate between your daily sprint, backlog, calendar, or machine learning insights.',
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
      "Your focused daily command center. Surfaces your highest-priority initiatives for today, complete with deadline badges, delay risk estimations, and one-click stopwatch time-tracking.",
    actionPrompt:
      'Click "▶ Track" on any task to log real working time, or click "+ New Task" to immediately add an initiative to your sprint.',
    whenToUse: 'At the start and throughout your workday to stay focused on high-impact deliverables without cognitive overload.',
    limitations: 'Highlights up to 4 priority tasks to protect you from sprint fatigue; your full backlog is always available in the Tasks view.',
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
      'Create, complete, and query tasks instantly using plain English. Type sentences like "Add task Review quarterly budget due Friday with high priority" or "Mark budget as completed".',
    actionPrompt:
      'Type your command in the dock input and hit Enter, or click the mic button to speak hands-free.',
    whenToUse: 'For fast, keyboard-first or hands-free productivity without clicking through nested form modals.',
    limitations: 'Operates deterministically. If a command is ambiguous, VoxPlan prompts for clarification instead of making risky assumptions.',
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
      'Speak your planning commands naturally. VoxPlan uses single-turn Web Speech recognition with live interim transcript mirroring and immediate execution once you finish speaking.',
    actionPrompt:
      'Click the microphone button to activate listening (the icon glows red). Speak your instruction clearly.',
    whenToUse: 'When multi-tasking, taking quick spoken notes away from your keyboard, or walking between meetings.',
    limitations:
      'Requires microphone permission. Native Web Speech is supported in Chrome, Edge, Safari, and Brave (disabled by default in Firefox).',
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
      'Enables audible spoken debriefs. When active, VoxPlan reads confirmation messages, schedule summaries, and risk explanations aloud using local browser speech synthesis.',
    actionPrompt:
      'Click the speaker icon to toggle spoken audio feedback on or off based on your current environment.',
    whenToUse: 'When you want hands-free confirmation or prefer auditory debriefings while reviewing your daily plan.',
    limitations: 'Disabled by default for quiet office environments. Operates via local browser synthesis without remote audio streaming.',
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
      'The complete backlog management workspace. View, search, organize, and reorder all your tasks with transparent due dates, effort estimates, and dependency relationships.',
    actionPrompt:
      'Click the Tasks tab in the header to switch to your comprehensive project backlog.',
    whenToUse: 'During backlog grooming, sprint planning, and when structuring complex projects with multiple dependencies.',
    limitations: 'Tasks are persisted automatically to local IndexedDB and localStorage; zero cloud syncing lag.',
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
      'Filter your backlog in real time by priority (High, Medium, Low), deadlines (Overdue, Due Today), or completed state. Instant client-side filtering without page reloads.',
    actionPrompt:
      'Click any filter pill to narrow your focus to urgent deliverables or review completed milestones.',
    whenToUse: 'When triaging large backlogs, auditing overdue work, or celebrating finished tasks.',
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
      'Every task card is fully editable in place: click the title to rename, click the priority badge to cycle (Urgent -> High -> Medium -> Low), or click the due date to reschedule.',
    actionPrompt:
      'Try clicking the priority badge to cycle its urgency level, or hover over the dual duration indicator (Estimated vs Model).',
    whenToUse: 'For rapid, friction-free adjustments during sprint standups or when deadlines shift.',
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
      'Attach authentic illustrated stationery memos to any task. Choose from 6 curated themes (Morning Sky Bear, Sakura Blush Bunny, Wisteria Lavender Cat, etc.) with charming handwriting typography.',
    actionPrompt:
      'Click the peeking memo tab on any task card to open its stationery gallery and add personal scratch notes.',
    whenToUse: 'For capturing quick thoughts, sub-bullet checklists, links, or meeting notes attached to a specific task.',
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
      'Accidents happen. Deleting a task triggers a floating feedback toast with an accessible Undo button, allowing you to instantly restore the deleted task and all its attached sticky notes.',
    actionPrompt:
      'Feel confident pruning obsolete work — the floating feedback toast guarantees lossless restoration.',
    whenToUse: 'When pruning completed or cancelled initiatives from your sprint backlog.',
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
      'Visualizes your workload across days and weeks with priority color bars, deadline clustering, and daily task densities for effective time-blocking.',
    actionPrompt:
      'Click the Calendar tab in the header to view your monthly and weekly task distributions.',
    whenToUse: 'When planning multi-week project milestones or verifying that deadlines are evenly distributed.',
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
      'Export your scheduled tasks into standard RFC 5545 .ics calendar files that import directly into Google Calendar, Apple Calendar, and Microsoft Outlook.',
    actionPrompt:
      'Click the "Export .ics Calendar" button to download a calendar file containing your scheduled sprint tasks.',
    whenToUse: 'To sync your optimized VoxPlan schedule into your primary work or personal calendar app.',
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
      'The algorithmic heart of VoxPlan. Uses Kahn’s Topological DAG algorithm to sequence tasks respecting strict prerequisites, capped by a 6.0 hours/day realistic capacity limit.',
    actionPrompt:
      'Click "Plan My Day" or type "optimize schedule" to generate a deterministic schedule proposal.',
    whenToUse: 'When facing complex dependencies and shifting deadlines and you need a mathematically verified plan.',
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
      'Keeps you ahead of deadlines, overdue items, schedule optimizations, and backup reminders. Includes an unread badge indicator and a slide-out drawer.',
    actionPrompt:
      'Click the notification bell to open the drawer, view active alerts, and jump directly to affected tasks.',
    whenToUse: 'To review approaching deadlines, act on schedule recommendations, or clear dismissible notices.',
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
      'Configure reminder lead times (1 hour, 3 hours, 24 hours, morning-of), native browser permissions, and quiet hours to prevent interruptions during deep work.',
    actionPrompt:
      'Open Settings from the notification drawer to customize your preferred alert channels and lead times.',
    whenToUse: 'To tune reminder timing to your work style or silence notifications outside working hours.',
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
      'Inspect how VoxPlan predicts delay risks. Uses supervised machine learning trained on historical task features like deadline pressure, dependency depth, and estimated effort.',
    actionPrompt:
      'Click the Insights tab in the header to inspect feature importances and local model status.',
    whenToUse: 'To understand why a task was flagged as high risk and review your team’s historical completion patterns.',
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
      'Learns your personal working velocity using empirical Bayesian shrinkage (K=3.0). Combines your self-reported effort estimates with real historical category medians.',
    actionPrompt:
      'Review your category-specific duration adjustments and walk-forward chronological evaluation metrics.',
    whenToUse: 'To see how closely your self-reported task estimates match your actual recorded stopwatch completion times.',
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
      'VoxPlan uses strictly locked factory scheduler weights (Urgency: 50.0, Priority: 100.0, Unblock: 15.0, Risk: 25.0) to ensure reproducible, predictable plans.',
    actionPrompt:
      'Review the Stage 7.4.4B locked adaptation gate, guaranteeing your scheduler is immune to chaotic heuristic drift.',
    whenToUse: 'To verify the mathematical determinism and stability of your planning algorithms.',
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
      'Export your entire workspace (tasks, sticky notes, accepted schedules, habit telemetry) into an AES-GCM 256-bit passphrase-encrypted backup file (.voxplan.enc).',
    actionPrompt:
      'Click the Backup button in the header to export an encrypted snapshot of your private data.',
    whenToUse: 'Before clearing browser data, switching devices, or migrating to another browser profile.',
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
      'Congratulations! You now know how to navigate the workspace, speak commands, manage illustrated memos, generate topological schedules, and protect your privacy.',
    actionPrompt:
      'Click "Finish Tour" to jump right into your real tasks, or switch to Hands-on Demo mode to experiment with disposable sample data.',
    whenToUse: 'You can restart this interactive tour at any time from the Overview page or the header options.',
    limitations: 'Completed status is remembered locally in tour storage so you are never interrupted again.',
  },
];
