/**
 * VoxPlan Intraday Time-Blocking & Focus Window Engine (Phase 6, Stage 2).
 *
 * Implements deterministic intraday scheduling with:
 * 1. Half-open time interval arithmetic [start, end) avoiding adjacent boundary collisions.
 * 2. User-configurable working hours [workStart, workEnd) as hard outer bounds.
 * 3. Meeting blackouts and unavailable intervals as hard zero-capacity exclusion zones.
 * 4. Focus windows as soft placement preferences (or optional hard constraints).
 * 5. Full integration with multi-day task chunking: sessions fit cleanly within continuous
 *    intraday windows and NEVER cross meeting blackouts.
 * 6. Local-first persistence and 100% backward-compatibility for date-only proposals.
 *
 * Guarantees:
 * - 100% Deterministic: Identical inputs produce identical timestamped placements.
 * - Interval Safety: Start < End, positive duration, adjacent intervals (e.g. 10:00-11:00 & 11:00-12:00) do not overlap.
 * - Blackout Invariant: No work session is ever scheduled during an unavailable blackout interval.
 * - Working Hours Invariant: No work session is scheduled before workDayStart or after workDayEnd.
 * - Capacity Agreement: Schedulable capacity strictly equals min(dailyCapacityHours, sum(available interval hours)).
 */

export const DEFAULT_WORK_DAY_START = '09:00';
export const DEFAULT_WORK_DAY_END = '17:00';
export const TIME_BLOCK_STORAGE_KEY = 'voxplan_time_block_settings';

export const DEFAULT_TIME_BLOCK_SETTINGS = Object.freeze({
  enableIntraday: false,
  workingHours: {
    start: DEFAULT_WORK_DAY_START,
    end: DEFAULT_WORK_DAY_END,
  },
  blackouts: [
    {
      id: 'default_lunch',
      label: 'Lunch Break',
      start: '13:00',
      end: '14:00',
      recurring: 'daily',
    },
  ],
  focusWindows: [
    {
      id: 'default_morning_focus',
      label: 'Morning Deep Work',
      start: '09:00',
      end: '12:00',
      isMandatory: false,
      recurring: 'daily',
    },
  ],
});

/**
 * Parses a time string (HH:mm, H:mm, or 12-hour AM/PM) into minutes from midnight (0..1440).
 *
 * @param {string|number} timeInput Time string or numeric minutes
 * @returns {number|null} Minutes from midnight, or null if invalid
 */
export function parseTimeToMinutes(timeInput) {
  if (typeof timeInput === 'number' && Number.isFinite(timeInput)) {
    if (timeInput >= 0 && timeInput <= 1440) {
      return Math.round(timeInput);
    }
    return null;
  }

  if (typeof timeInput !== 'string') return null;
  const trimmed = timeInput.trim();
  if (!trimmed) return null;

  // 1. Check 12-hour AM/PM format (e.g. "9 AM", "9:30 AM", "1:00 pm", "12 PM", "12:00 AM")
  const ampmMatch = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const mins = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const period = ampmMatch[3].toLowerCase();

    if (hours < 1 || hours > 12 || mins < 0 || mins > 59) return null;

    if (period === 'pm' && hours < 12) {
      hours += 12;
    } else if (period === 'am' && hours === 12) {
      hours = 0;
    }

    return hours * 60 + mins;
  }

  // 2. Check 24-hour HH:mm format (e.g. "09:00", "9:00", "13:30", "24:00")
  const militaryMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (militaryMatch) {
    const hours = parseInt(militaryMatch[1], 10);
    const mins = parseInt(militaryMatch[2], 10);

    if (hours === 24 && mins === 0) return 1440;
    if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null;

    return hours * 60 + mins;
  }

  return null;
}

/**
 * Converts minutes from midnight into 24-hour HH:mm string.
 *
 * @param {number} minutes Minutes from midnight (0..1440)
 * @returns {string} HH:mm string
 */
export function minutesToTimeString(minutes) {
  if (typeof minutes !== 'number' || isNaN(minutes)) return '00:00';
  const clamped = Math.max(0, Math.min(1440, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Formats time in minutes or HH:mm into user-friendly AM/PM string.
 *
 * @param {number|string} time Minutes or HH:mm string
 * @returns {string} e.g. "9:00 AM", "1:30 PM"
 */
export function formatTimeAmPm(time) {
  const mins = typeof time === 'number' ? time : parseTimeToMinutes(time);
  if (mins === null) return String(time || '');

  const hours24 = Math.floor(mins / 60);
  const minutes = mins % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;

  return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Converts decimal hours to minutes.
 * @param {number} hours
 * @returns {number}
 */
export function hoursToMinutes(hours) {
  if (typeof hours !== 'number' || isNaN(hours)) return 0;
  return Math.round(hours * 60);
}

/**
 * Converts minutes to decimal hours rounded to 1 decimal place.
 * @param {number} minutes
 * @returns {number}
 */
export function minutesToHours(minutes) {
  if (typeof minutes !== 'number' || isNaN(minutes)) return 0;
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * Creates and validates a half-open time interval [start, end).
 *
 * @param {string|number} start Start time (HH:mm, AM/PM, or minutes)
 * @param {string|number} end End time (HH:mm, AM/PM, or minutes)
 * @param {object} [metadata={}] Optional interval metadata (label, id, etc.)
 * @returns {{
 *   start: string,
 *   end: string,
 *   startMinutes: number,
 *   endMinutes: number,
 *   durationMinutes: number,
 *   durationHours: number,
 * }|null} Validated interval object or null if invalid
 */
export function createTimeInterval(start, end, metadata = {}) {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  // Interval must have positive duration: start < end
  if (startMinutes >= endMinutes) {
    return null;
  }

  const durationMinutes = endMinutes - startMinutes;
  const durationHours = Math.round((durationMinutes / 60) * 10) / 10;

  return {
    start: minutesToTimeString(startMinutes),
    end: minutesToTimeString(endMinutes),
    startMinutes,
    endMinutes,
    durationMinutes,
    durationHours,
    ...metadata,
  };
}

/**
 * Determines whether two half-open intervals [startA, endA) and [startB, endB) overlap.
 * Adjacent intervals touching at boundaries (e.g. 10:00-11:00 and 11:00-12:00) DO NOT overlap.
 *
 * @param {object} intA Interval A
 * @param {object} intB Interval B
 * @returns {boolean} True if intervals overlap
 */
export function intervalsOverlap(intA, intB) {
  if (!intA || !intB) return false;
  const aStart = intA.startMinutes ?? parseTimeToMinutes(intA.startTime ?? intA.start);
  const aEnd = intA.endMinutes ?? parseTimeToMinutes(intA.endTime ?? intA.end);
  const bStart = intB.startMinutes ?? parseTimeToMinutes(intB.startTime ?? intB.start);
  const bEnd = intB.endMinutes ?? parseTimeToMinutes(intB.endTime ?? intB.end);

  if (aStart === null || aEnd === null || bStart === null || bEnd === null) {
    return false;
  }

  return aStart < bEnd && bStart < aEnd;
}

/**
 * Merges an array of intervals into a canonical, sorted list of disjoint intervals.
 * Overlapping and contiguous adjacent intervals are coalesced.
 *
 * @param {Array<object>} intervals Array of interval objects or {start, end}
 * @returns {Array<object>} Sorted, disjoint, merged intervals
 */
export function mergeIntervals(intervals = []) {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];

  // 1. Validate and convert all intervals
  const valid = [];
  for (const item of intervals) {
    if (!item) continue;
    const startM = item.startMinutes ?? parseTimeToMinutes(item.startTime ?? item.start);
    const endM = item.endMinutes ?? parseTimeToMinutes(item.endTime ?? item.end);
    if (startM !== null && endM !== null && startM < endM) {
      valid.push({
        ...item,
        startMinutes: startM,
        endMinutes: endM,
        start: minutesToTimeString(startM),
        end: minutesToTimeString(endM),
        startTime: minutesToTimeString(startM),
        endTime: minutesToTimeString(endM),
        label: item.title || item.label || '',
        title: item.title || item.label || '',
        id: item.id || '',
      });
    }
  }

  if (valid.length === 0) return [];

  // 2. Sort by startMinutes ascending, then endMinutes ascending
  valid.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) {
      return a.startMinutes - b.startMinutes;
    }
    return a.endMinutes - b.endMinutes;
  });

  // 3. Merge overlapping or adjacent intervals
  const merged = [valid[0]];

  for (let i = 1; i < valid.length; i++) {
    const current = valid[i];
    const prev = merged[merged.length - 1];

    if (current.startMinutes <= prev.endMinutes) {
      // Overlap or adjacency: extend previous interval
      prev.endMinutes = Math.max(prev.endMinutes, current.endMinutes);
      prev.end = minutesToTimeString(prev.endMinutes);
      prev.endTime = prev.end;
      if (current.label && prev.label && !prev.label.includes(current.label)) {
        prev.label = `${prev.label}, ${current.label}`;
        prev.title = prev.label;
      } else if (!prev.label && current.label) {
        prev.label = current.label;
        prev.title = current.label;
      }
    } else {
      merged.push(current);
    }
  }

  // 4. Return standard interval objects
  return merged.map((m) => {
    const durM = m.endMinutes - m.startMinutes;
    return {
      ...m,
      start: minutesToTimeString(m.startMinutes),
      end: minutesToTimeString(m.endMinutes),
      startTime: minutesToTimeString(m.startMinutes),
      endTime: minutesToTimeString(m.endMinutes),
      startMinutes: m.startMinutes,
      endMinutes: m.endMinutes,
      durationMinutes: durM,
      durationHours: Math.round((durM / 60) * 10) / 10,
    };
  });
}

/**
 * Subtracts an array of exclusion intervals (e.g. blackouts) from a base interval (or array of base intervals).
 * Returns the disjoint, available schedulable intervals.
 *
 * @param {object|Array<object>} baseInterval { start, end } or createTimeInterval or array
 * @param {Array<object>} cutIntervals Blackout intervals to exclude
 * @returns {Array<object>} Array of available time intervals
 */
export function subtractIntervals(baseInterval, cutIntervals = []) {
  if (Array.isArray(baseInterval)) {
    let currentWindows = baseInterval;
    const cuts = Array.isArray(cutIntervals) ? cutIntervals : [cutIntervals];
    for (const cut of cuts) {
      const nextWindows = [];
      for (const win of currentWindows) {
        nextWindows.push(...subtractIntervals(win, [cut]));
      }
      currentWindows = nextWindows;
    }
    return currentWindows;
  }

  const baseStart = baseInterval?.startMinutes ?? parseTimeToMinutes(baseInterval?.startTime ?? baseInterval?.start);
  const baseEnd = baseInterval?.endMinutes ?? parseTimeToMinutes(baseInterval?.endTime ?? baseInterval?.end);

  if (baseStart === null || baseEnd === null || baseStart >= baseEnd) {
    return [];
  }

  // Merge and clip cut intervals so they lie strictly within [baseStart, baseEnd)
  const mergedCuts = mergeIntervals(cutIntervals);
  const clippedCuts = [];

  for (const cut of mergedCuts) {
    if (cut.endMinutes <= baseStart || cut.startMinutes >= baseEnd) {
      // Completely outside base window; ignore
      continue;
    }
    const clampedStart = Math.max(baseStart, cut.startMinutes);
    const clampedEnd = Math.min(baseEnd, cut.endMinutes);
    if (clampedStart < clampedEnd) {
      clippedCuts.push({
        startMinutes: clampedStart,
        endMinutes: clampedEnd,
      });
    }
  }

  if (clippedCuts.length === 0) {
    // No exclusions inside base interval: entire base interval is available
    const durM = baseEnd - baseStart;
    return [
      {
        start: minutesToTimeString(baseStart),
        end: minutesToTimeString(baseEnd),
        startTime: minutesToTimeString(baseStart),
        endTime: minutesToTimeString(baseEnd),
        startMinutes: baseStart,
        endMinutes: baseEnd,
        durationMinutes: durM,
        durationHours: Math.round((durM / 60) * 10) / 10,
      },
    ];
  }

  // Segment the base interval around the clipped exclusions
  const available = [];
  let currentPos = baseStart;

  for (const cut of clippedCuts) {
    if (cut.startMinutes > currentPos) {
      const durM = cut.startMinutes - currentPos;
      available.push({
        start: minutesToTimeString(currentPos),
        end: minutesToTimeString(cut.startMinutes),
        startTime: minutesToTimeString(currentPos),
        endTime: minutesToTimeString(cut.startMinutes),
        startMinutes: currentPos,
        endMinutes: cut.startMinutes,
        durationMinutes: durM,
        durationHours: Math.round((durM / 60) * 10) / 10,
      });
    }
    currentPos = Math.max(currentPos, cut.endMinutes);
  }

  if (currentPos < baseEnd) {
    const durM = baseEnd - currentPos;
    available.push({
      start: minutesToTimeString(currentPos),
      end: minutesToTimeString(baseEnd),
      startTime: minutesToTimeString(currentPos),
      endTime: minutesToTimeString(baseEnd),
      startMinutes: currentPos,
      endMinutes: baseEnd,
      durationMinutes: durM,
      durationHours: Math.round((durM / 60) * 10) / 10,
    });
  }

  return available;
}

/**
 * Validates and normalizes working hours configuration.
 *
 * @param {object} [workingHours] User-configured working hours { start, end }
 * @returns {{
 *   start: string,
 *   end: string,
 *   startMinutes: number,
 *   endMinutes: number,
 *   totalHours: number,
 * }}
 */
export function normalizeWorkingHours(workingHours = {}) {
  const startStr = workingHours?.start || workingHours?.startTime || DEFAULT_WORK_DAY_START;
  const endStr = workingHours?.end || workingHours?.endTime || DEFAULT_WORK_DAY_END;

  let startMinutes = parseTimeToMinutes(startStr);
  let endMinutes = parseTimeToMinutes(endStr);

  if (startMinutes === null || endMinutes === null || startMinutes >= endMinutes) {
    // Fall back safely to standard 9:00 - 17:00
    startMinutes = parseTimeToMinutes(DEFAULT_WORK_DAY_START);
    endMinutes = parseTimeToMinutes(DEFAULT_WORK_DAY_END);
  }

  const durMinutes = endMinutes - startMinutes;
  return {
    start: minutesToTimeString(startMinutes),
    end: minutesToTimeString(endMinutes),
    startMinutes,
    endMinutes,
    totalHours: Math.round((durMinutes / 60) * 10) / 10,
  };
}

/**
 * Filters and validates blackouts applicable for a specific calendar date and weekday.
 *
 * @param {Array<object>|string} arg1 Blackouts array or date string
 * @param {string|Array<object>} arg2 Date string or blackouts array
 * @param {number} [arg3=-1] Day of week (0=Sun, ..., 6=Sat)
 * @returns {Array<object>} Validated blackout intervals for this date
 */
export function getBlackoutsForDate(arg1, arg2, arg3 = -1) {
  let blackouts = [];
  let dateStr = '';
  let dayOfWeek = typeof arg3 === 'number' ? arg3 : -1;

  if (Array.isArray(arg1)) {
    blackouts = arg1;
    dateStr = typeof arg2 === 'string' ? arg2 : '';
  } else if (typeof arg1 === 'string') {
    dateStr = arg1;
    blackouts = Array.isArray(arg2) ? arg2 : [];
  }

  if (dayOfWeek === -1 && dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    if (!isNaN(d.getTime())) {
      dayOfWeek = d.getUTCDay();
    }
  }

  if (!Array.isArray(blackouts) || blackouts.length === 0) return [];

  const applicable = [];

  for (const b of blackouts) {
    if (!b || typeof b !== 'object') continue;

    // 1. Date match: specific date
    if (b.date && b.date === dateStr) {
      applicable.push(b);
      continue;
    }

    // 2. Weekday match: specific dayOfWeek number
    if (typeof b.dayOfWeek === 'number' && b.dayOfWeek === dayOfWeek) {
      applicable.push(b);
      continue;
    }

    // 3. Recurring types
    if (b.recurring === 'daily' || (b.recurring === true && (!b.daysOfWeek && !b.days))) {
      applicable.push(b);
    } else if (b.recurring === 'workdays' && dayOfWeek >= 1 && dayOfWeek <= 5) {
      applicable.push(b);
    } else if (Array.isArray(b.daysOfWeek) && b.daysOfWeek.includes(dayOfWeek)) {
      applicable.push(b);
    } else if (Array.isArray(b.days) && b.days.includes(dayOfWeek)) {
      applicable.push(b);
    }
  }

  return mergeIntervals(applicable);
}

/**
 * Computes available working windows and total available hours for a given date.
 *
 * @param {string} dateStr ISO date YYYY-MM-DD
 * @param {number|object} arg2 Day of week (0=Sun, ..., 6=Sat) or options object
 * @param {object} [arg3={}] Intraday options
 * @returns {{
 *   availableWindows: Array<object>,
 *   totalAvailableHours: number,
 *   schedulableCapacityHours: number,
 *   blackoutsApplied: Array<object>,
 * }}
 */
export function computeAvailableWindowsForDate(dateStr, arg2, arg3 = {}) {
  let dayOfWeek = -1;
  let options = {};

  if (typeof arg2 === 'number') {
    dayOfWeek = arg2;
    options = arg3 || {};
  } else if (typeof arg2 === 'object' && arg2 !== null) {
    options = arg2;
  }

  if (dayOfWeek === -1 && dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    if (!isNaN(d.getTime())) {
      dayOfWeek = d.getUTCDay();
    }
  }

  const normWork = normalizeWorkingHours(options.workingHours);
  const blackoutsForDay = getBlackoutsForDate(options.blackouts || [], dateStr, dayOfWeek);

  const availableWindows = subtractIntervals(normWork, blackoutsForDay);

  const totalAvailableMinutes = availableWindows.reduce((sum, w) => sum + w.durationMinutes, 0);
  const totalAvailableHours = Math.round((totalAvailableMinutes / 60) * 10) / 10;

  // Schedulable capacity is bounded by both configured daily capacity and physical interval availability
  const requestedDailyCapacity = typeof options.dailyCapacityHours === 'number' && options.dailyCapacityHours > 0
    ? options.dailyCapacityHours
    : normWork.totalHours;

  const schedulableCapacityHours = Math.min(requestedDailyCapacity, totalAvailableHours);

  return {
    availableWindows,
    totalAvailableHours,
    totalWindowHours: totalAvailableHours,
    schedulableCapacityHours,
    effectiveCapacityHours: schedulableCapacityHours,
    blackoutsApplied: blackoutsForDay,
  };
}

/**
 * Allocates a work session into available calendar windows, respecting focus preferences.
 *
 * @param {object|Array<object>|number} arg1 Calendar slot / available windows array OR requiredHours
 * @param {number|object|Array<object>} arg2 Duration in hours OR calendar slot / windows array
 * @param {object} [options={}] Scheduling options including focusWindows and task preferences
 * @returns {{
 *   allocated: boolean,
 *   startTime: string|null,
 *   endTime: string|null,
 *   durationHours: number,
 *   inFocusWindow: boolean,
 *   focusWindowLabel: string|null,
 *   reason?: string,
 * }}
 */
export function allocateIntradaySession(arg1, arg2, options = {}) {
  let slot;
  let requiredHours;

  if (typeof arg1 === 'number') {
    requiredHours = arg1;
    slot = arg2;
  } else {
    slot = arg1;
    requiredHours = arg2;
  }

  const winList = Array.isArray(slot)
    ? slot
    : Array.isArray(slot?.availableWindows)
    ? slot.availableWindows
    : null;

  if (!winList || winList.length === 0) {
    return {
      allocated: false,
      startTime: null,
      endTime: null,
      durationHours: 0,
      inFocusWindow: false,
      focusWindowLabel: null,
      reason: 'no_available_windows',
    };
  }

  const reqMinutes = hoursToMinutes(requiredHours);
  if (reqMinutes <= 0) {
    return {
      allocated: false,
      startTime: null,
      endTime: null,
      durationHours: 0,
      inFocusWindow: false,
      focusWindowLabel: null,
      reason: 'zero_duration',
    };
  }

  const focusWindows = Array.isArray(options.focusWindows) ? options.focusWindows : [];

  // Check windows that fit the required session
  // Score windows: prioritize windows overlapping preferred focus windows
  let bestWindowIdx = -1;
  let bestScore = -1;
  let matchedFocusLabel = null;

  for (let i = 0; i < winList.length; i++) {
    const win = winList[i];
    if (win.durationMinutes < reqMinutes) {
      continue;
    }

    let score = 100; // Base score for fitting
    let focusLabel = null;

    // Check overlap with focus windows
    for (const fw of focusWindows) {
      const fwStart = parseTimeToMinutes(fw.startTime ?? fw.start);
      const fwEnd = parseTimeToMinutes(fw.endTime ?? fw.end);
      if (fwStart !== null && fwEnd !== null) {
        if (intervalsOverlap(win, { startMinutes: fwStart, endMinutes: fwEnd })) {
          score += 500; // Strong bonus for preferred focus window
          focusLabel = fw.title || fw.label || 'Focus Window';
          break;
        }
      }
    }

    // Earlier windows prioritized when scores are tied
    score -= i * 10;

    if (score > bestScore) {
      bestScore = score;
      bestWindowIdx = i;
      matchedFocusLabel = focusLabel;
    }
  }

  if (bestWindowIdx === -1) {
    return {
      allocated: false,
      startTime: null,
      endTime: null,
      durationHours: 0,
      inFocusWindow: false,
      focusWindowLabel: null,
      reason: 'no_window_fits_duration',
    };
  }

  const targetWin = winList[bestWindowIdx];
  const startM = targetWin.startMinutes;
  const endM = startM + reqMinutes;

  const startTime = minutesToTimeString(startM);
  const endTime = minutesToTimeString(endM);

  // Shrink the target window or remove it if exhausted
  if (endM >= targetWin.endMinutes) {
    winList.splice(bestWindowIdx, 1);
  } else {
    targetWin.startMinutes = endM;
    targetWin.start = minutesToTimeString(endM);
    targetWin.startTime = targetWin.start;
    targetWin.durationMinutes = targetWin.endMinutes - endM;
    targetWin.durationHours = Math.round((targetWin.durationMinutes / 60) * 10) / 10;
  }

  return {
    allocated: true,
    startTime,
    endTime,
    durationHours: requiredHours,
    inFocusWindow: Boolean(matchedFocusLabel),
    focusWindowLabel: matchedFocusLabel,
  };
}

// In-memory fallback store for Node.js test environments or when localStorage is unavailable
const memoryFallbackStore = new Map();

/**
 * Loads time block and intraday availability settings from storage.
 *
 * @param {object} [storage] Storage provider (defaults to window.localStorage or in-memory)
 * @returns {object} Normalized time-block settings
 */
export function loadTimeBlockSettings(storage = null) {
  let raw = null;
  if (storage && typeof storage.getItem === 'function') {
    raw = storage.getItem(TIME_BLOCK_STORAGE_KEY);
  } else if (typeof window !== 'undefined' && window.localStorage) {
    raw = window.localStorage.getItem(TIME_BLOCK_STORAGE_KEY);
  } else {
    raw = memoryFallbackStore.get(TIME_BLOCK_STORAGE_KEY);
  }

  if (!raw) {
    return { ...DEFAULT_TIME_BLOCK_SETTINGS };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_TIME_BLOCK_SETTINGS };
    }

    return {
      enableIntraday: Boolean(parsed.enableIntraday),
      workingHours: normalizeWorkingHours(parsed.workingHours),
      blackouts: Array.isArray(parsed.blackouts) ? parsed.blackouts : [...DEFAULT_TIME_BLOCK_SETTINGS.blackouts],
      focusWindows: Array.isArray(parsed.focusWindows) ? parsed.focusWindows : [...DEFAULT_TIME_BLOCK_SETTINGS.focusWindows],
    };
  } catch {
    return { ...DEFAULT_TIME_BLOCK_SETTINGS };
  }
}

/**
 * Persists time block settings to storage safely.
 *
 * @param {object} settings Settings object
 * @param {object} [storage] Storage provider (defaults to window.localStorage or in-memory)
 * @returns {boolean} True if successfully saved
 */
export function saveTimeBlockSettings(settings, storage = null) {
  if (!settings) return false;

  try {
    const sanitized = {
      enableIntraday: Boolean(settings.enableIntraday),
      workingHours: normalizeWorkingHours(settings.workingHours),
      blackouts: Array.isArray(settings.blackouts) ? settings.blackouts : [],
      focusWindows: Array.isArray(settings.focusWindows) ? settings.focusWindows : [],
    };
    const jsonStr = JSON.stringify(sanitized);

    if (storage && typeof storage.setItem === 'function') {
      storage.setItem(TIME_BLOCK_STORAGE_KEY, jsonStr);
      return true;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(TIME_BLOCK_STORAGE_KEY, jsonStr);
      return true;
    } else {
      memoryFallbackStore.set(TIME_BLOCK_STORAGE_KEY, jsonStr);
      return true;
    }
  } catch {
    return false;
  }
}
