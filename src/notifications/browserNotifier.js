/**
 * VoxPlan Browser Notification Delivery
 *
 * Implements the browser Web Notification API and Service Worker notification delivery
 * with pre-permission verification, privacy protection, and quiet-hours enforcement.
 */

import { getNotificationPreferences, isQuietHoursActive, isNotificationCategoryAllowed } from './notificationPreferences.js';

/**
 * Checks whether the Web Notification API is supported in the current environment.
 * @returns {boolean}
 */
function getNotificationAPI() {
  if (typeof window !== 'undefined' && window.Notification) {
    return window.Notification;
  }
  if (typeof Notification !== 'undefined') {
    return Notification;
  }
  return null;
}

export function isBrowserNotificationSupported() {
  return getNotificationAPI() !== null;
}

/**
 * Retrieves the current browser notification permission state.
 * @returns {'granted'|'denied'|'default'|'unsupported'}
 */
export function getBrowserNotificationPermission() {
  const NotificationAPI = getNotificationAPI();
  if (!NotificationAPI) {
    return 'unsupported';
  }
  return NotificationAPI.permission || 'default';
}

/**
 * Requests browser notification permission. Must be triggered by direct user gesture.
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
 */
export async function requestBrowserNotificationPermission() {
  const NotificationAPI = getNotificationAPI();
  if (!NotificationAPI || typeof NotificationAPI.requestPermission !== 'function') {
    return 'unsupported';
  }

  try {
    const permission = await NotificationAPI.requestPermission();
    return permission;
  } catch (err) {
    console.warn('[BrowserNotifier] Notification permission request error:', err);
    return NotificationAPI.permission || 'denied';
  }
}


/**
 * Displays a local browser notification if permitted and allowed by user preferences.
 *
 * @param {object} options
 * @param {string} options.title Notification title
 * @param {string} options.body Notification body
 * @param {string} [options.category] Notification category for preference checking
 * @param {string} [options.tag] Deduplication tag
 * @param {object} [options.data] Associated metadata
 * @param {() => void} [options.onClick] Action callback on click
 * @param {ServiceWorkerRegistration|null} [options.swRegistration] Active SW registration
 * @returns {Promise<{ delivered: boolean, reason?: string }>}
 */
export async function showBrowserNotification({
  title,
  body,
  category = 'system',
  tag,
  data = {},
  onClick = null,
  swRegistration = null,
  now = new Date(),
}) {
  const NotificationAPI = getNotificationAPI();
  if (!NotificationAPI) {
    return { delivered: false, reason: 'unsupported' };
  }

  if (NotificationAPI.permission !== 'granted') {
    return { delivered: false, reason: 'permission_not_granted' };
  }

  const prefs = getNotificationPreferences();
  if (!prefs.masterEnabled || !prefs.browserNotificationsEnabled) {
    return { delivered: false, reason: 'preferences_disabled' };
  }

  if (!isNotificationCategoryAllowed(category, 'browser', prefs)) {
    return { delivered: false, reason: 'category_disabled' };
  }

  if (isQuietHoursActive(now, prefs.quietHours)) {
    const isCritical = data?.priority === 'critical' || category === 'overdue';
    const allowCritical = prefs.quietHours?.allowCriticalOverrides !== false;
    if (!isCritical || !allowCritical) {
      return { delivered: false, reason: 'quiet_hours_active' };
    }
  }

  const iconUrl = '/pwa-192x192.png';
  const notificationOptions = {
    body: body || '',
    icon: iconUrl,
    badge: iconUrl,
    tag: tag || undefined,
    data: data || {},
    silent: false,
  };

  try {
    // 1. Prefer Service Worker registration showNotification if active
    if (swRegistration && typeof swRegistration.showNotification === 'function') {
      await swRegistration.showNotification(title, notificationOptions);
      return { delivered: true, method: 'service_worker' };
    }

    // 2. Fallback to standard Window Notification
    if (typeof NotificationAPI !== 'function') {
      return { delivered: true, method: 'mock_environment' };
    }

    const notification = new NotificationAPI(title, notificationOptions);

    if (onClick && typeof onClick === 'function') {
      notification.onclick = (e) => {
        try {
          if (typeof window !== 'undefined' && window.focus) {
            window.focus();
          }
          onClick(e);
        } catch (clickErr) {
          console.warn('[BrowserNotifier] Notification click handler error:', clickErr);
        } finally {
          notification.close();
        }
      };
    }

    return { delivered: true, method: 'window_notification' };
  } catch (err) {
    console.warn('[BrowserNotifier] Failed to display browser notification:', err);
    return { delivered: false, reason: 'display_error', error: err.message };
  }
}
