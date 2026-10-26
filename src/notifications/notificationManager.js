/**
 * VoxPlan Unified Notification Manager
 *
 * Coordinates event detection, persistent storage, browser notification dispatch,
 * user preference enforcement, and lifecycle reconciliation across reloads and tab focus.
 */

import { notificationStore } from './notificationStore.js';
import { getNotificationPreferences, isNotificationCategoryAllowed } from './notificationPreferences.js';
import { detectNotificationEvents } from './eventDetector.js';
import { showBrowserNotification } from './browserNotifier.js';

class NotificationManager {
  constructor() {
    this.intervalId = null;
    this.visibilityHandler = null;
    this.isInitialized = false;
    this.latestTasks = [];
    this.latestSchedule = null;
    this.navigationHandler = null;
    this.swRegistration = null;
  }

  /**
   * Initializes the notification engine with event listeners and periodic evaluation.
   *
   * @param {object} [options]
   * @param {(to: string) => void} [options.onNavigate] Programmatic route navigation callback
   * @param {ServiceWorkerRegistration|null} [options.swRegistration] Service worker registration
   */
  init(options = {}) {
    if (options.onNavigate) this.navigationHandler = options.onNavigate;
    if (options.swRegistration) this.swRegistration = options.swRegistration;
    if (this.isInitialized) return;

    // 1. Passive periodic check every 60 seconds (conservative, battery-friendly)
    const setIntervalFn = typeof window !== 'undefined' && typeof window.setInterval === 'function'
      ? window.setInterval
      : typeof setInterval === 'function'
      ? setInterval
      : null;

    if (setIntervalFn) {
      this.intervalId = setIntervalFn(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          this.evaluateCurrentState();
        }
      }, 60 * 1000);
    }

    // 2. Reconcile missed notifications when tab becomes visible or focused
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          this.evaluateCurrentState();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('focus', this.visibilityHandler);
      }
    }

    this.isInitialized = true;
  }

  /**
   * Updates cached tasks and schedule, and runs event detection.
   *
   * @param {object} params
   * @param {Array<object>} params.tasks
   * @param {object|null} [params.acceptedSchedule]
   * @param {(to: string) => void} [params.onNavigate]
   * @param {ServiceWorkerRegistration|null} [params.swRegistration]
   */
  syncAndEvaluate({ tasks, acceptedSchedule = null, onNavigate = null, swRegistration = null }) {
    if (Array.isArray(tasks)) {
      this.latestTasks = tasks;
    }
    if (acceptedSchedule !== undefined) {
      this.latestSchedule = acceptedSchedule;
    }
    if (onNavigate) {
      this.navigationHandler = onNavigate;
    }
    if (swRegistration) {
      this.swRegistration = swRegistration;
    }

    // Auto-resolve / dismiss notifications for tasks that have been completed or removed
    if (Array.isArray(this.latestTasks)) {
      const activeTaskMap = new Map(this.latestTasks.map((t) => [t.id, t]));
      for (const notif of notificationStore.notifications) {
        if (notif.dismissed) continue;
        const taskId = notif.meta?.taskId || (notif.target?.type === 'task' ? notif.target.id : null);
        if (taskId) {
          const task = activeTaskMap.get(taskId);
          if (!task || task.completed) {
            notificationStore.dismissNotification(notif.id);
          }
        }
      }
    }

    this.evaluateCurrentState();
  }

  /**
   * Evaluates notifications against latest state.
   */
  evaluateCurrentState() {
    const prefs = getNotificationPreferences();
    if (!prefs.masterEnabled) return [];

    const existingKeys = notificationStore.getAllDedupKeys();

    const candidates = detectNotificationEvents({
      tasks: this.latestTasks,
      acceptedSchedule: this.latestSchedule,
      existingDedupKeys: existingKeys,
      preferences: prefs,
      now: new Date(),
    });

    const addedList = [];
    for (const candidate of candidates) {
      // Check in-app category allowance
      if (!isNotificationCategoryAllowed(candidate.category, 'inApp', prefs)) {
        continue;
      }

      const res = notificationStore.addNotification(candidate);
      if (res.added) {
        addedList.push(res.notification);

        // Forward to browser notifications if enabled for this category
        if (isNotificationCategoryAllowed(candidate.category, 'browser', prefs)) {
          showBrowserNotification({
            title: candidate.title,
            body: candidate.message,
            category: candidate.category,
            tag: candidate.dedupKey,
            data: { ...candidate.target, priority: candidate.priority },
            swRegistration: this.swRegistration,
            onClick: () => {
              this.handleNotificationAction(candidate);
            },
          });
        }
      }
    }

    return addedList;
  }

  /**
   * Manually dispatches an explicit notification (e.g. backup, update, or action result).
   *
   * @param {object} notificationData
   * @param {object} [options]
   * @param {boolean} [options.showBrowser=false]
   * @returns {object}
   */
  notify(notificationData, options = {}) {
    const prefs = getNotificationPreferences();
    if (!prefs.masterEnabled) {
      return { added: false, reason: 'master_disabled' };
    }

    const category = notificationData.category || 'system';
    if (!isNotificationCategoryAllowed(category, 'inApp', prefs)) {
      return { added: false, reason: 'category_disabled' };
    }

    const res = notificationStore.addNotification({
      id: notificationData.id || `notif-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      category,
      priority: notificationData.priority || 'normal',
      title: notificationData.title || 'VoxPlan Notice',
      message: notificationData.message || '',
      timestamp: new Date().toISOString(),
      read: false,
      dismissed: false,
      dedupKey: notificationData.dedupKey || undefined,
      target: notificationData.target || {},
      meta: notificationData.meta || {},
    });

    if (res.added && (options.showBrowser || isNotificationCategoryAllowed(category, 'browser', prefs))) {
      showBrowserNotification({
        title: notificationData.title,
        body: notificationData.message,
        category,
        tag: notificationData.dedupKey,
        data: { ...(notificationData.target || {}), priority: category === 'overdue' ? 'critical' : (notificationData.priority || 'normal') },
        swRegistration: this.swRegistration,
        onClick: () => {
          this.handleNotificationAction(res.notification);
        },
      });
    }

    return res;
  }

  /**
   * Handles user interaction with a notification's action target.
   * @param {object} notification
   */
  handleNotificationAction(notification) {
    if (!notification || !notification.target) return;
    const { target } = notification;

    // Mark as read upon interaction
    notificationStore.markAsRead(notification.id);

    if (this.navigationHandler && target.view) {
      this.navigationHandler(`/app#view-${target.view}`);
    }

    // If target specifies focusing a task element
    if (target.type === 'task' && target.id && typeof document !== 'undefined') {
      setTimeout(() => {
        const elem = document.getElementById(`task-card-${target.id}`) || document.querySelector(`[data-task-id="${target.id}"]`);
        if (elem) {
          elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
          elem.focus?.();
        }
      }, 100);
    }
  }

  /**
   * Cleans up timers and event listeners.
   */
  destroy() {
    if (this.intervalId) {
      if (typeof window !== 'undefined' && typeof window.clearInterval === 'function') {
        window.clearInterval(this.intervalId);
      } else if (typeof clearInterval === 'function') {
        clearInterval(this.intervalId);
      }
      this.intervalId = null;
    }
    if (this.visibilityHandler) {
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', this.visibilityHandler);
      }
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('focus', this.visibilityHandler);
      }
      this.visibilityHandler = null;
    }
    this.isInitialized = false;
  }
}

export const notificationManager = new NotificationManager();
