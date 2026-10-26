import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITIES,
  isValidNotification,
} from '../src/notifications/types.js';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  isQuietHoursActive,
  isNotificationCategoryAllowed,
} from '../src/notifications/notificationPreferences.js';
import {
  notificationStore,
  MAX_STORED_NOTIFICATIONS,
} from '../src/notifications/notificationStore.js';
import {
  detectNotificationEvents,
} from '../src/notifications/eventDetector.js';
import {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  showBrowserNotification,
} from '../src/notifications/browserNotifier.js';
import { notificationManager } from '../src/notifications/notificationManager.js';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { evaluateActivationGate } from '../src/scheduler/activationGateEvaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// In-memory mock localStorage for unit testing
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('VoxPlan Notification Subsystem — Comprehensive Verification Suite', () => {
  let mockStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    global.window = {
      localStorage: mockStorage,
    };
    global.localStorage = mockStorage;
    notificationStore.notifications = [];
    notificationStore.subscribers.clear();
  });

  describe('1. Types, Schemas & Validation', () => {
    it('1.1 exports canonical notification categories and priorities as frozen objects', () => {
      assert.strictEqual(NOTIFICATION_CATEGORIES.DEADLINE, 'deadline');
      assert.strictEqual(NOTIFICATION_CATEGORIES.OVERDUE, 'overdue');
      assert.strictEqual(NOTIFICATION_CATEGORIES.SCHEDULE, 'schedule');
      assert.strictEqual(NOTIFICATION_CATEGORIES.DEPENDENCY, 'dependency');
      assert.strictEqual(NOTIFICATION_CATEGORIES.SYSTEM, 'system');
      assert.strictEqual(Object.isFrozen(NOTIFICATION_CATEGORIES), true);

      assert.strictEqual(NOTIFICATION_PRIORITIES.CRITICAL, 'critical');
      assert.strictEqual(NOTIFICATION_PRIORITIES.HIGH, 'high');
      assert.strictEqual(NOTIFICATION_PRIORITIES.NORMAL, 'normal');
      assert.strictEqual(NOTIFICATION_PRIORITIES.LOW, 'low');
      assert.strictEqual(Object.isFrozen(NOTIFICATION_PRIORITIES), true);
    });

    it('1.2 validates notification schemas accurately', () => {
      assert.strictEqual(isValidNotification(null), false);
      assert.strictEqual(isValidNotification({}), false);
      assert.strictEqual(isValidNotification({ id: '1', title: 'Test' }), false);

      const validNotif = {
        id: 'notif-1',
        category: NOTIFICATION_CATEGORIES.DEADLINE,
        title: 'Task due soon',
        message: 'Your task is due in 30 minutes',
        timestamp: new Date().toISOString(),
      };
      assert.strictEqual(isValidNotification(validNotif), true);
    });
  });

  describe('2. Notification Preferences & Quiet Hours', () => {
    it('2.1 provides sensible default preferences with browser notifications disabled by default', () => {
      const prefs = getNotificationPreferences();
      assert.strictEqual(prefs.masterEnabled, true);
      assert.strictEqual(prefs.inAppEnabled, true);
      assert.strictEqual(prefs.browserNotificationsEnabled, false);
      assert.strictEqual(prefs.leadTimeMinutes, 60);
      assert.strictEqual(prefs.quietHours.enabled, false);
    });

    it('2.2 updates and persists preferences into localStorage', () => {
      updateNotificationPreferences({ leadTimeMinutes: 15, masterEnabled: false });
      const prefs = getNotificationPreferences();
      assert.strictEqual(prefs.leadTimeMinutes, 15);
      assert.strictEqual(prefs.masterEnabled, false);
    });

    it('2.3 evaluates quiet hours correctly across overnight intervals', () => {
      const overnightConfig = { enabled: true, start: '22:00', end: '08:00' };

      // 23:30 (during quiet hours)
      const lateNight = new Date(2026, 9, 25, 23, 30);
      assert.strictEqual(isQuietHoursActive(lateNight, overnightConfig), true);

      // 06:15 (during quiet hours)
      const earlyMorning = new Date(2026, 9, 25, 6, 15);
      assert.strictEqual(isQuietHoursActive(earlyMorning, overnightConfig), true);

      // 14:00 (outside quiet hours)
      const afternoon = new Date(2026, 9, 25, 14, 0);
      assert.strictEqual(isQuietHoursActive(afternoon, overnightConfig), false);
    });

    it('2.4 evaluates intra-day quiet hours correctly', () => {
      const intraDayConfig = { enabled: true, start: '13:00', end: '15:00' };

      // 13:45 (inside quiet hours)
      const inside = new Date(2026, 9, 25, 13, 45);
      assert.strictEqual(isQuietHoursActive(inside, intraDayConfig), true);

      // 16:00 (outside quiet hours)
      const outside = new Date(2026, 9, 25, 16, 0);
      assert.strictEqual(isQuietHoursActive(outside, intraDayConfig), false);
    });

    it('2.5 respects channel and category allowances', () => {
      const prefs = {
        masterEnabled: true,
        inAppEnabled: true,
        browserNotificationsEnabled: false,
        categories: {
          deadline: true,
          overdue: true,
          schedule: false,
        },
      };

      assert.strictEqual(isNotificationCategoryAllowed('deadline', 'inApp', prefs), true);
      assert.strictEqual(isNotificationCategoryAllowed('schedule', 'inApp', prefs), false);
      assert.strictEqual(isNotificationCategoryAllowed('deadline', 'browser', prefs), false);
    });
  });

  describe('3. Event Detection Engine', () => {
    const fixedNow = new Date(2026, 9, 25, 12, 0, 0); // Oct 25, 2026 12:00 PM

    it('3.1 detects upcoming deadlines within lead time window', () => {
      const tasks = [
        {
          id: 'task-1',
          title: 'Prepare executive slides',
          dueDate: '2026-10-25T12:45:00', // 45m from now
          completed: false,
        },
      ];

      const candidates = detectNotificationEvents({
        tasks,
        now: fixedNow,
        preferences: { leadTimeMinutes: 60, categories: { deadline: true } },
      });

      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].category, NOTIFICATION_CATEGORIES.DEADLINE);
      assert.strictEqual(candidates[0].priority, NOTIFICATION_PRIORITIES.HIGH);
      assert.ok(candidates[0].title.includes('Prepare executive slides'));
    });

    it('3.2 detects overdue tasks and marks with critical priority', () => {
      const tasks = [
        {
          id: 'task-overdue',
          title: 'Submit tax compliance report',
          dueDate: '2026-10-24T18:00:00', // Yesterday
          completed: false,
        },
      ];

      const candidates = detectNotificationEvents({
        tasks,
        now: fixedNow,
        preferences: { categories: { overdue: true } },
      });

      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].category, NOTIFICATION_CATEGORIES.OVERDUE);
      assert.strictEqual(candidates[0].priority, NOTIFICATION_PRIORITIES.CRITICAL);
      assert.ok(candidates[0].title.includes('Submit tax compliance report'));
    });

    it('3.3 suppresses notifications for completed tasks', () => {
      const tasks = [
        {
          id: 'task-done',
          title: 'Completed research doc',
          dueDate: '2026-10-24T18:00:00',
          completed: true,
        },
      ];

      const candidates = detectNotificationEvents({
        tasks,
        now: fixedNow,
      });

      assert.strictEqual(candidates.length, 0);
    });

    it('3.4 suppresses duplicates present in existing dedup keys', () => {
      const tasks = [
        {
          id: 'task-1',
          title: 'Review PR',
          dueDate: '2026-10-24T18:00:00',
          completed: false,
        },
      ];

      const existingKeys = new Set(['overdue:task-1:2026-10-24T18:00:00']);

      const candidates = detectNotificationEvents({
        tasks,
        existingDedupKeys: existingKeys,
        now: fixedNow,
      });

      assert.strictEqual(candidates.length, 0);
    });

    it('3.5 detects newly unblocked tasks when all prerequisites are completed', () => {
      const tasks = [
        { id: 'prereq-1', title: 'Design mockup', completed: true },
        { id: 'dependent-1', title: 'Implement frontend component', dependencies: ['prereq-1'], completed: false },
      ];

      const candidates = detectNotificationEvents({
        tasks,
        now: fixedNow,
        preferences: { categories: { dependency: true } },
      });

      const unblocked = candidates.find((c) => c.category === NOTIFICATION_CATEGORIES.DEPENDENCY);
      assert.ok(unblocked, 'Should detect unblocked dependency event');
      assert.ok(unblocked.title.includes('Implement frontend component'));
    });

    it('3.6 detects schedule feasibility warnings for overconstrained plans', () => {
      const acceptedSchedule = {
        acceptedAt: '2026-10-25T10:00:00Z',
        summary: {
          scheduleId: 'sched-test-1',
          feasibilityStatus: 'infeasible_overconstrained',
          infeasibleTasksCount: 2,
        },
      };

      const candidates = detectNotificationEvents({
        tasks: [],
        acceptedSchedule,
        now: fixedNow,
        preferences: { categories: { schedule: true } },
      });

      assert.strictEqual(candidates.length, 1);
      assert.strictEqual(candidates[0].category, NOTIFICATION_CATEGORIES.SCHEDULE);
      assert.ok(candidates[0].message.includes('tight capacity or deadline constraints'));
    });
  });

  describe('4. Store Persistence, Unread Tracking & Lifecycle', () => {
    it('4.1 adds valid notifications and updates unread count', () => {
      const notif = {
        id: 'notif-1',
        category: NOTIFICATION_CATEGORIES.DEADLINE,
        title: 'Task due soon',
        message: 'Sprint review is in 1 hour',
        timestamp: new Date().toISOString(),
      };

      const res = notificationStore.addNotification(notif);
      assert.strictEqual(res.added, true);
      assert.strictEqual(notificationStore.getUnreadCount(), 1);
      assert.strictEqual(notificationStore.getNotifications('all').length, 1);
    });

    it('4.2 prevents duplicate insertion with same dedupKey', () => {
      const notif1 = {
        id: 'notif-1',
        category: NOTIFICATION_CATEGORIES.DEADLINE,
        title: 'Task due soon',
        message: 'Sprint review is in 1 hour',
        dedupKey: 'unique-dedup-1',
        timestamp: new Date().toISOString(),
      };
      const notif2 = {
        id: 'notif-2',
        category: NOTIFICATION_CATEGORIES.DEADLINE,
        title: 'Task due soon (duplicate)',
        message: 'Sprint review is in 1 hour',
        dedupKey: 'unique-dedup-1',
        timestamp: new Date().toISOString(),
      };

      notificationStore.addNotification(notif1);
      const res = notificationStore.addNotification(notif2);
      assert.strictEqual(res.added, false);
      assert.strictEqual(notificationStore.getNotifications('all').length, 1);
    });

    it('4.3 marks individual notification as read', () => {
      notificationStore.addNotification({
        id: 'notif-1',
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        title: 'System update',
        message: 'Version 2.0 available',
        timestamp: new Date().toISOString(),
      });

      assert.strictEqual(notificationStore.getUnreadCount(), 1);
      notificationStore.markAsRead('notif-1');
      assert.strictEqual(notificationStore.getUnreadCount(), 0);
      assert.strictEqual(notificationStore.getNotifications('unread').length, 0);
    });

    it('4.4 marks all notifications as read', () => {
      notificationStore.addNotification({
        id: 'notif-1',
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        title: 'Notice 1',
        message: 'Body 1',
        timestamp: new Date().toISOString(),
      });
      notificationStore.addNotification({
        id: 'notif-2',
        category: NOTIFICATION_CATEGORIES.DEADLINE,
        title: 'Notice 2',
        message: 'Body 2',
        timestamp: new Date().toISOString(),
      });

      assert.strictEqual(notificationStore.getUnreadCount(), 2);
      notificationStore.markAllAsRead();
      assert.strictEqual(notificationStore.getUnreadCount(), 0);
    });

    it('4.5 dismisses and clears notifications', () => {
      notificationStore.addNotification({
        id: 'notif-1',
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        title: 'Notice 1',
        message: 'Body 1',
        timestamp: new Date().toISOString(),
      });

      notificationStore.dismissNotification('notif-1');
      assert.strictEqual(notificationStore.getNotifications('all').length, 0);

      notificationStore.addNotification({
        id: 'notif-2',
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        title: 'Notice 2',
        message: 'Body 2',
        timestamp: new Date().toISOString(),
      });
      notificationStore.clearAll();
      assert.strictEqual(notificationStore.getNotifications('all').length, 0);
    });

    it('4.6 enforces maximum bounded capacity limit of 100 items', () => {
      for (let i = 0; i < 110; i++) {
        notificationStore.addNotification({
          id: `notif-${i}`,
          category: NOTIFICATION_CATEGORIES.SYSTEM,
          title: `Notice ${i}`,
          message: `Body ${i}`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
        });
      }

      assert.strictEqual(notificationStore.notifications.length, MAX_STORED_NOTIFICATIONS);
      assert.strictEqual(notificationStore.notifications.length, 100);
    });

    it('4.7 notifies subscribers immediately on change', () => {
      let notifiedCount = 0;
      let lastUnread = 0;

      const unsub = notificationStore.subscribe((list, unread) => {
        notifiedCount++;
        lastUnread = unread;
      });

      notificationStore.addNotification({
        id: 'notif-sub-test',
        category: NOTIFICATION_CATEGORIES.DEADLINE,
        title: 'Sub test',
        message: 'Test message',
        timestamp: new Date().toISOString(),
      });

      assert.ok(notifiedCount >= 1);
      assert.strictEqual(lastUnread, 1);
      unsub();
    });
  });

  describe('5. Browser Notification API Integration & Graceful Fallback', () => {
    it('5.1 handles unsupported environments gracefully without crashing', () => {
      delete global.window.Notification;
      assert.strictEqual(isBrowserNotificationSupported(), false);
      assert.strictEqual(getBrowserNotificationPermission(), 'unsupported');
    });

    it('5.2 returns permission status when Notification API is present', () => {
      global.window.Notification = {
        permission: 'default',
        requestPermission: async () => 'granted',
      };
      assert.strictEqual(isBrowserNotificationSupported(), true);
      assert.strictEqual(getBrowserNotificationPermission(), 'default');
    });

    it('5.3 suppresses browser notifications when user preference is disabled', async () => {
      global.window.Notification = {
        permission: 'granted',
      };
      updateNotificationPreferences({ browserNotificationsEnabled: false });

      const res = await showBrowserNotification({
        title: 'Test',
        body: 'Message',
      });
      assert.strictEqual(res.delivered, false);
      assert.strictEqual(res.reason, 'preferences_disabled');
    });
  });

  describe('6. Notification Manager Orchestration', () => {
    it('6.1 syncAndEvaluate surfaces eligible candidate events into the store', () => {
      notificationManager.init();

      const overdueTask = {
        id: 'overdue-task-mgr',
        title: 'Client Invoice',
        dueDate: '2026-10-20T18:00:00',
        completed: false,
      };

      notificationManager.syncAndEvaluate({
        tasks: [overdueTask],
      });

      const unread = notificationStore.getNotifications('unread');
      assert.ok(unread.some((n) => n.id === 'notif-overdue-overdue-task-mgr'));
      notificationManager.destroy();
    });

    it('6.2 manual notify method dispatches explicit notifications safely', () => {
      notificationManager.init();

      const res = notificationManager.notify({
        id: 'notif-backup-success',
        category: NOTIFICATION_CATEGORIES.SYSTEM,
        title: 'Backup Created',
        message: 'Encrypted backup snapshot was saved successfully.',
      });

      assert.strictEqual(res.added, true);
      const all = notificationStore.getNotifications('all');
      assert.ok(all.some((n) => n.id === 'notif-backup-success'));
      notificationManager.destroy();
    });
  });

  describe('7. UI Component Code & Accessibility Invariants', () => {
    const bellPath = path.join(projectRoot, 'src', 'components', 'notifications', 'NotificationBell.jsx');
    const centerPath = path.join(projectRoot, 'src', 'components', 'notifications', 'NotificationCenter.jsx');
    const prefsModalPath = path.join(projectRoot, 'src', 'components', 'notifications', 'NotificationPreferencesModal.jsx');
    const headerPath = path.join(projectRoot, 'src', 'components', 'Header.jsx');
    const swPath = path.join(projectRoot, 'public', 'sw.js');
    const landingPath = path.join(projectRoot, 'src', 'pages', 'LandingPage.jsx');
    const appCssPath = path.join(projectRoot, 'src', 'App.css');

    const bellContent = fs.readFileSync(bellPath, 'utf-8');
    const centerContent = fs.readFileSync(centerPath, 'utf-8');
    const prefsModalContent = fs.readFileSync(prefsModalPath, 'utf-8');
    const headerContent = fs.readFileSync(headerPath, 'utf-8');
    const swContent = fs.readFileSync(swPath, 'utf-8');
    const landingContent = fs.readFileSync(landingPath, 'utf-8');
    const appCssContent = fs.readFileSync(appCssPath, 'utf-8');

    it('7.1 NotificationBell exposes aria-expanded and dynamic aria-label', () => {
      assert.ok(bellContent.includes('aria-expanded={isOpen}'), 'Bell must expose aria-expanded');
      assert.ok(bellContent.includes('Notifications, ${unreadCount} unread'), 'Bell must announce unread count to screen readers');
      assert.ok(bellContent.includes('id="header-notification-badge"'), 'Badge must have unique id');
    });

    it('7.2 NotificationCenter exposes dialog semantics, filter tabs, and bulk actions', () => {
      assert.ok(centerContent.includes('role="dialog"'), 'Center must declare role="dialog"');
      assert.ok(centerContent.includes('aria-modal="true"'), 'Center must declare aria-modal="true"');
      assert.ok(centerContent.includes('role="tablist"'), 'Filter tabs must declare role="tablist"');
      assert.ok(centerContent.includes('id="notif-mark-all-read-btn"'), 'Must provide mark-all-read action');
      assert.ok(centerContent.includes('id="notif-clear-all-btn"'), 'Must provide clear-all action');
    });

    it('7.3 NotificationPreferencesModal includes pre-permission explainer and local privacy notice', () => {
      assert.ok(prefsModalContent.includes('role="dialog"'), 'Modal must declare role="dialog"');
      assert.ok(prefsModalContent.includes('100% Local-First Privacy'), 'Must explain local-first privacy before permission request');
      assert.ok(prefsModalContent.includes('id="request-browser-permission-btn"'), 'Must provide permission request button');
      assert.ok(prefsModalContent.includes('id="pref-master-toggle"'), 'Must provide master enable toggle');
      assert.ok(prefsModalContent.includes('id="pref-lead-time-select"'), 'Must provide reminder lead time selector');
    });

    it('7.4 Header integrates NotificationBell, NotificationCenter, and preferences modal', () => {
      assert.ok(headerContent.includes('<NotificationBell'), 'Header must render NotificationBell');
      assert.ok(headerContent.includes('<NotificationCenter'), 'Header must render NotificationCenter');
      assert.ok(headerContent.includes('<NotificationPreferencesModal'), 'Header must render NotificationPreferencesModal');
      assert.ok(headerContent.includes('id="mobile-notifications-btn"'), 'Mobile menu must include notifications button');
    });

    it('7.5 Service Worker includes notificationclick event handler', () => {
      assert.ok(swContent.includes("addEventListener('notificationclick'"), 'sw.js must handle notificationclick');
      assert.ok(swContent.includes('event.notification.close()'), 'Must close notification on click');
      assert.ok(swContent.includes('/app'), 'Must navigate to /app on notification click');
    });

    it('7.6 App.css includes reduced-motion overrides for notification drawer and modal', () => {
      assert.ok(appCssContent.includes('#notification-center-drawer'), 'App.css must style notification center');
      assert.ok(appCssContent.includes('#notification-preferences-modal'), 'App.css must style preferences modal');
      assert.ok(appCssContent.includes('@keyframes drawerSlide'), 'App.css must define drawerSlide animation');
    });

    it('7.7 Phase 9: Decorative hero phrase "Plan with clarity. Act with focus." is removed from LandingPage', () => {
      assert.ok(!landingContent.includes('Plan with clarity'), 'LandingPage must not contain decorative hero phrase');
      assert.ok(!landingContent.includes('heroMotto'), 'LandingPage must not contain unused heroMotto styles');
    });
  });

  describe('8. Protected Invariants & Scheduler Security Gates', () => {
    it('8.1 factory scheduler weights remain strictly unchanged and frozen', () => {
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
      assert.strictEqual(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS), true);
    });

    it('8.2 production adaptation gate remains permanently locked with empty caller claims', () => {
      const gateResult = evaluateActivationGate();
      assert.strictEqual(gateResult.isAdaptationUnlocked, false);
      assert.strictEqual(gateResult.productionApplied, false);
    });
  });

  describe('9. Reliability Audit: Dedup Persistence, Auto-resolution, Lead-Time Separation, & Quiet Hours Overrides', () => {
    it('9.1 dismissed notification retains dedupKey and is not resurrected on subsequent evaluation', () => {
      notificationStore.clearAll();
      const notif = {
        id: 'notif-audit-1',
        category: NOTIFICATION_CATEGORIES.DEADLINE,
        title: 'Impending Deadline',
        message: 'Task is due soon',
        dedupKey: 'audit-dedup-key-1',
        timestamp: new Date().toISOString(),
      };
      notificationStore.addNotification(notif);
      assert.strictEqual(notificationStore.getNotifications('all').length, 1);

      // Dismiss the notification
      notificationStore.dismissNotification('notif-audit-1');
      assert.strictEqual(notificationStore.getNotifications('all').length, 0);

      // Verify dedup keys retain dismissed keys
      const allDedupKeys = notificationStore.getAllDedupKeys();
      assert.ok(allDedupKeys.has('audit-dedup-key-1'));

      // Re-evaluation should not produce duplicates
      const candidates = detectNotificationEvents({
        tasks: [{ id: 'audit-1', title: 'Task', dueDate: '2026-10-25T12:30:00', completed: false }],
        existingDedupKeys: allDedupKeys,
        now: new Date('2026-10-25T12:00:00'),
        preferences: { leadTimeMinutes: 60, categories: { deadline: true } },
      });
      const wouldReAdd = candidates.filter((c) => c.dedupKey === 'audit-dedup-key-1');
      assert.strictEqual(wouldReAdd.length, 0);
    });

    it('9.2 auto-resolves (dismisses) active notifications when a task is completed', () => {
      notificationStore.clearAll();
      notificationStore.addNotification({
        id: 'notif-task-x',
        category: NOTIFICATION_CATEGORIES.OVERDUE,
        title: 'Overdue Task: Physics',
        message: 'Physics was due yesterday',
        target: { type: 'task', id: 'task-physics' },
        meta: { taskId: 'task-physics' },
        dedupKey: 'overdue:task-physics:2026-10-24',
      });
      assert.strictEqual(notificationStore.getNotifications('all').length, 1);

      // Now sync tasks with task-physics marked completed
      notificationManager.syncAndEvaluate({
        tasks: [{ id: 'task-physics', title: 'Physics', completed: true }],
      });

      // Active notification should have been auto-dismissed
      assert.strictEqual(notificationStore.getNotifications('all').length, 0);
    });

    it('9.3 evaluates separate lead-time and day-of reminders without key collisions', () => {
      const now = new Date('2026-10-25T10:00:00'); // 10:00 AM
      const taskDueEvening = {
        id: 'task-evening',
        title: 'Evening Report',
        dueDate: '2026-10-25T18:00:00', // 8h away, due today
        completed: false,
      };

      // At 10 AM, task is due today, but not within 60m lead time
      const candidatesMorning = detectNotificationEvents({
        tasks: [taskDueEvening],
        now,
        preferences: { leadTimeMinutes: 60, categories: { deadline: true } },
      });
      assert.strictEqual(candidatesMorning.length, 1);
      assert.strictEqual(candidatesMorning[0].dedupKey, 'deadline:today:task-evening:2026-10-25T18:00:00');

      // Now simulate 17:15 (45m before due date, inside 60m lead time)
      const nowNearDeadline = new Date('2026-10-25T17:15:00');
      const candidatesNearDeadline = detectNotificationEvents({
        tasks: [taskDueEvening],
        existingDedupKeys: new Set(['deadline:today:task-evening:2026-10-25T18:00:00']),
        now: nowNearDeadline,
        preferences: { leadTimeMinutes: 60, categories: { deadline: true } },
      });
      assert.strictEqual(candidatesNearDeadline.length, 1);
      assert.strictEqual(candidatesNearDeadline[0].dedupKey, 'deadline:task-evening:2026-10-25T18:00:00:60');
      assert.ok(candidatesNearDeadline[0].message.includes('45 minutes'));
    });

    it('9.4 allows critical-priority notification overrides during quiet hours', async () => {
      // Mock Notification API for testing browser delivery
      global.window = global.window || {};
      global.window.Notification = class MockNotification {
        static permission = 'granted';
        constructor(title, options) {
          this.title = title;
          this.options = options;
        }
      };

      // In quiet hours (e.g. 23:00)
      const lateTime = new Date('2026-10-25T23:00:00');
      updateNotificationPreferences({
        masterEnabled: true,
        browserNotificationsEnabled: true,
        quietHours: { enabled: true, start: '22:00', end: '08:00', allowCriticalOverrides: true },
      });

      // Normal priority notification during quiet hours -> suppressed
      const normalRes = await showBrowserNotification({
        title: 'Normal notice',
        body: 'Check schedule',
        category: 'schedule',
        data: { priority: 'normal' },
        now: lateTime,
      });
      assert.strictEqual(normalRes.delivered, false);
      assert.strictEqual(normalRes.reason, 'quiet_hours_active');

      // Critical priority overdue notification during quiet hours -> delivered
      const criticalRes = await showBrowserNotification({
        title: 'Critical Overdue Alert',
        body: 'Important deadline passed',
        category: 'overdue',
        data: { priority: 'critical' },
        now: lateTime,
      });
      assert.strictEqual(criticalRes.delivered, true);
    });
  });
});
