/**
 * VoxPlan Local Notification Store
 *
 * Manages persistent storage, lifecycle, unread tracking, and bounded history
 * for notifications entirely within the client's localStorage.
 */

import { isValidNotification } from './types.js';

export const NOTIFICATIONS_STORAGE_KEY = 'voxplan_notifications';
export const MAX_STORED_NOTIFICATIONS = 100;
export const RETENTION_DAYS = 14;

class NotificationStore {
  constructor() {
    this.notifications = [];
    this.subscribers = new Set();
    this.isLoaded = false;
    this.load();
  }

  /**
   * Loads notifications from localStorage with schema validation and retention cleanup.
   */
  load() {
    if (typeof window === 'undefined' || !window.localStorage) {
      this.notifications = [];
      this.isLoaded = true;
      return;
    }

    try {
      const raw = window.localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (!raw) {
        this.notifications = [];
        this.isLoaded = true;
        return;
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this.notifications = [];
        this.isLoaded = true;
        return;
      }

      const nowMs = Date.now();
      const cutoffMs = nowMs - RETENTION_DAYS * 24 * 60 * 60 * 1000;

      // Filter valid items and prune expired dismissed/read items
      this.notifications = parsed.filter((item) => {
        if (!isValidNotification(item)) return false;
        const itemTime = new Date(item.timestamp).getTime();
        if (isNaN(itemTime)) return false;
        // Keep all unread/active items regardless of age; prune old dismissed/read items past cutoff
        if ((item.dismissed || item.read) && itemTime < cutoffMs) {
          return false;
        }
        return true;
      });

      // Enforce bounded history
      if (this.notifications.length > MAX_STORED_NOTIFICATIONS) {
        this.notifications = this.notifications.slice(0, MAX_STORED_NOTIFICATIONS);
      }
    } catch (err) {
      console.warn('[NotificationStore] Failed to parse notifications from storage, resetting:', err);
      this.notifications = [];
    } finally {
      this.isLoaded = true;
    }
  }

  /**
   * Persists current notifications to localStorage and notifies subscribers.
   */
  save() {
    if (typeof window === 'undefined' || !window.localStorage) {
      this.notifySubscribers();
      return;
    }

    try {
      window.localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(this.notifications));
    } catch (err) {
      console.error('[NotificationStore] Failed to persist notifications:', err);
    }
    this.notifySubscribers();
  }

  /**
   * Adds a notification to the store if it passes validation and deduplication.
   * @param {object} notification
   * @returns {{ added: boolean, notification: object }}
   */
  addNotification(notification) {
    if (!notification || typeof notification !== 'object') {
      return { added: false, reason: 'invalid_schema' };
    }

    const item = {
      ...notification,
      read: Boolean(notification.read),
      dismissed: Boolean(notification.dismissed),
      timestamp: notification.timestamp || new Date().toISOString(),
    };

    if (!isValidNotification(item)) {
      return { added: false, reason: 'invalid_schema' };
    }

    // Check if duplicate exists by dedupKey or ID
    const dedupKey = item.dedupKey || item.id;
    const existingIndex = this.notifications.findIndex(
      (n) => (n.dedupKey && n.dedupKey === dedupKey) || n.id === item.id
    );

    if (existingIndex !== -1) {
      // If already exists and was dismissed, do not re-surface unless explicitly forced
      return { added: false, reason: 'duplicate_dedup_key', existing: this.notifications[existingIndex] };
    }

    // Prepend to list (newest first)
    this.notifications.unshift(item);

    // Enforce max capacity
    if (this.notifications.length > MAX_STORED_NOTIFICATIONS) {
      this.notifications = this.notifications.slice(0, MAX_STORED_NOTIFICATIONS);
    }

    this.save();
    return { added: true, notification: item };
  }

  /**
   * Bulk adds multiple notifications.
   * @param {Array<object>} items
   * @returns {Array<object>} Newly added notifications
   */
  addBatch(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const addedItems = [];

    for (const item of items) {
      const res = this.addNotification(item);
      if (res.added) {
        addedItems.push(res.notification);
      }
    }

    return addedItems;
  }

  /**
   * Marks a specific notification as read.
   * @param {string} id
   */
  markAsRead(id) {
    let changed = false;
    this.notifications = this.notifications.map((n) => {
      if (n.id === id && !n.read) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    });

    if (changed) {
      this.save();
    }
  }

  /**
   * Toggles the read state of a specific notification.
   * @param {string} id
   */
  toggleRead(id) {
    let changed = false;
    this.notifications = this.notifications.map((n) => {
      if (n.id === id) {
        changed = true;
        return { ...n, read: !n.read };
      }
      return n;
    });

    if (changed) {
      this.save();
    }
  }

  /**
   * Marks all non-dismissed notifications as read.
   */
  markAllAsRead() {
    let changed = false;
    this.notifications = this.notifications.map((n) => {
      if (!n.read) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    });

    if (changed) {
      this.save();
    }
  }

  /**
   * Dismisses a specific notification (removes from active view, retains dedup key).
   * @param {string} id
   */
  dismissNotification(id) {
    let changed = false;
    this.notifications = this.notifications.map((n) => {
      if (n.id === id && !n.dismissed) {
        changed = true;
        return { ...n, dismissed: true, read: true };
      }
      return n;
    });
    if (changed) {
      this.save();
    }
  }

  /**
   * Clears/archives all notifications from active view.
   */
  clearAll() {
    let changed = false;
    this.notifications = this.notifications.map((n) => {
      if (!n.dismissed) {
        changed = true;
        return { ...n, dismissed: true, read: true };
      }
      return n;
    });
    if (changed) {
      this.save();
    }
  }

  /**
   * Returns a Set of all deduplication keys currently recorded (including dismissed).
   * @returns {Set<string>}
   */
  getAllDedupKeys() {
    const keys = new Set();
    for (const n of this.notifications) {
      if (n.dedupKey) keys.add(n.dedupKey);
      if (n.id) keys.add(n.id);
    }
    return keys;
  }

  /**
   * Retrieves all notifications filtered by view/category.
   * @param {'all'|'unread'|'deadline'|'schedule'|'dependency'|'system'} [filter='all']
   * @returns {Array<object>}
   */
  getNotifications(filter = 'all') {
    switch (filter) {
      case 'unread':
        return this.notifications.filter((n) => !n.read && !n.dismissed);
      case 'deadline':
        return this.notifications.filter((n) => (n.category === 'deadline' || n.category === 'overdue') && !n.dismissed);
      case 'schedule':
        return this.notifications.filter((n) => n.category === 'schedule' && !n.dismissed);
      case 'dependency':
        return this.notifications.filter((n) => n.category === 'dependency' && !n.dismissed);
      case 'system':
        return this.notifications.filter((n) => n.category === 'system' && !n.dismissed);
      case 'all':
      default:
        return this.notifications.filter((n) => !n.dismissed);
    }
  }

  /**
   * Computes count of unread, non-dismissed notifications.
   * @returns {number}
   */
  getUnreadCount() {
    return this.notifications.filter((n) => !n.read && !n.dismissed).length;
  }

  /**
   * Checks whether a deduplication key has already been recorded.
   * @param {string} dedupKey
   * @returns {boolean}
   */
  hasDedupKey(dedupKey) {
    if (!dedupKey) return false;
    return this.notifications.some((n) => n.dedupKey === dedupKey || n.id === dedupKey);
  }

  /**
   * Subscribes to notification store updates.
   * @param {(notifications: Array<object>, unreadCount: number) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    // Immediately invoke with current state
    try {
      callback([...this.notifications], this.getUnreadCount());
    } catch (e) {
      console.warn('[NotificationStore] Initial subscriber callback error:', e);
    }
    return () => {
      this.subscribers.delete(callback);
    };
  }

  notifySubscribers() {
    const list = [...this.notifications];
    const unread = this.getUnreadCount();
    for (const sub of this.subscribers) {
      try {
        sub(list, unread);
      } catch (err) {
        console.error('[NotificationStore] Subscriber error:', err);
      }
    }
  }
}

export const notificationStore = new NotificationStore();
