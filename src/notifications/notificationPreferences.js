/**
 * VoxPlan Notification Preferences Management
 *
 * Persists and validates user notification settings entirely in localStorage.
 * Governs delivery channels (in-app vs browser), category filters,
 * reminder lead times, and quiet hours.
 */

export const NOTIFICATION_PREFERENCES_KEY = 'voxplan_notification_preferences';

export const DEFAULT_PREFERENCES = Object.freeze({
  masterEnabled: true,
  inAppEnabled: true,
  browserNotificationsEnabled: false, // Requires explicit user permission and opt-in
  categories: {
    deadline: true,
    overdue: true,
    schedule: true,
    dependency: true,
    system: true,
  },
  leadTimeMinutes: 60, // Default: 60 minutes before deadline (options: 0, 15, 60, 1440)
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
  },
});

/**
 * Retrieves the current notification preferences from local storage.
 * Falls back to default preferences if not configured or corrupted.
 * @returns {typeof DEFAULT_PREFERENCES}
 */
export function getNotificationPreferences() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_PREFERENCES };
  }
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw);
    return {
      masterEnabled: typeof parsed.masterEnabled === 'boolean' ? parsed.masterEnabled : DEFAULT_PREFERENCES.masterEnabled,
      inAppEnabled: typeof parsed.inAppEnabled === 'boolean' ? parsed.inAppEnabled : DEFAULT_PREFERENCES.inAppEnabled,
      browserNotificationsEnabled: typeof parsed.browserNotificationsEnabled === 'boolean'
        ? parsed.browserNotificationsEnabled
        : DEFAULT_PREFERENCES.browserNotificationsEnabled,
      categories: {
        ...DEFAULT_PREFERENCES.categories,
        ...(parsed.categories || {}),
      },
      leadTimeMinutes: typeof parsed.leadTimeMinutes === 'number' && !isNaN(parsed.leadTimeMinutes)
        ? parsed.leadTimeMinutes
        : DEFAULT_PREFERENCES.leadTimeMinutes,
      quietHours: {
        ...DEFAULT_PREFERENCES.quietHours,
        ...(parsed.quietHours || {}),
      },
    };
  } catch (err) {
    console.warn('[NotificationPreferences] Failed to load preferences, using defaults:', err);
    return { ...DEFAULT_PREFERENCES };
  }
}

/**
 * Updates notification preferences partially and persists them.
 * @param {Partial<typeof DEFAULT_PREFERENCES>} partial
 * @returns {typeof DEFAULT_PREFERENCES}
 */
export function updateNotificationPreferences(partial) {
  const current = getNotificationPreferences();
  const updated = {
    ...current,
    ...partial,
    categories: {
      ...current.categories,
      ...(partial.categories || {}),
    },
    quietHours: {
      ...current.quietHours,
      ...(partial.quietHours || {}),
    },
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('[NotificationPreferences] Failed to save preferences:', err);
    }
  }

  return updated;
}

/**
 * Evaluates whether quiet hours are currently active.
 * Handles both intra-day (e.g. 13:00 to 15:00) and overnight (e.g. 22:00 to 08:00) intervals.
 * @param {Date} [now=new Date()]
 * @param {object} [quietHoursConfig]
 * @returns {boolean}
 */
export function isQuietHoursActive(now = new Date(), quietHoursConfig = null) {
  const config = quietHoursConfig || getNotificationPreferences().quietHours;
  if (!config || !config.enabled) return false;

  const { start, end } = config;
  if (!start || !end) return false;

  const [startH, startM] = start.split(':').map((v) => parseInt(v, 10));
  const [endH, endM] = end.split(':').map((v) => parseInt(v, 10));

  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Standard intra-day interval (e.g. 09:00 to 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight interval (e.g. 22:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Evaluates whether a notification category is currently enabled for a specific channel.
 * @param {string} category
 * @param {'inApp'|'browser'} [channel='inApp']
 * @param {object} [preferences]
 * @returns {boolean}
 */
export function isNotificationCategoryAllowed(category, channel = 'inApp', preferences = null) {
  const prefs = preferences || getNotificationPreferences();
  if (!prefs.masterEnabled) return false;

  if (channel === 'inApp' && !prefs.inAppEnabled) return false;
  if (channel === 'browser' && !prefs.browserNotificationsEnabled) return false;

  if (prefs.categories && prefs.categories[category] === false) return false;

  return true;
}
