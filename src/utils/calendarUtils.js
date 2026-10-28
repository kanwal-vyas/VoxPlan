/**
 * VoxPlan — Calendar Date & Priority Utilities
 *
 * Responsibilities:
 * 1. Pure, deterministic calendar math (month grids, week spans, leap years).
 * 2. Strict local-date handling avoiding UTC timezone offset drift.
 * 3. Consistent, accessible priority color mapping and event groupings.
 */

import { formatISODate } from '../conversation/compoundCommandParser.js';

/**
 * Returns today's date formatted as YYYY-MM-DD in local time.
 * @returns {string}
 */
export function getTodayDateString() {
  return formatISODate(new Date());
}

/**
 * Parses a YYYY-MM-DD string into year, month (0-indexed), and day numbers without UTC drift.
 * @param {string} dateStr
 * @returns {{ year: number, month: number, day: number } | null}
 */
export function parseDateComponents(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const match = dateStr.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    month: parseInt(match[2], 10) - 1, // 0-indexed for JS Date
    day: parseInt(match[3], 10),
  };
}

/**
 * Creates a local Date object from YYYY-MM-DD.
 * @param {string} dateStr
 * @returns {Date}
 */
export function dateStringToDate(dateStr) {
  const comp = parseDateComponents(dateStr);
  if (!comp) return new Date();
  return new Date(comp.year, comp.month, comp.day);
}

/**
 * Formats numeric year, month (0-indexed), and day to YYYY-MM-DD.
 * @param {number} year
 * @param {number} month - 0-indexed
 * @param {number} day
 * @returns {string}
 */
export function formatDateComponents(year, month, day) {
  const y = String(year).padStart(4, '0');
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns the number of days in a given month (accounting for leap years).
 * @param {number} year
 * @param {number} month - 0-indexed
 * @returns {number}
 */
export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Generates the full calendar grid (typically 35 or 42 cells) for a month,
 * including leading days from the previous month and trailing days from the next month.
 * Starts on Sunday (0) through Saturday (6).
 *
 * @param {number} year
 * @param {number} month - 0-indexed
 * @param {string} [todayStr] - Defaults to current local date
 * @returns {Array<{ dateStr: string, year: number, month: number, day: number, isCurrentMonth: boolean, isToday: boolean, dayOfWeek: number }>}
 */
export function getMonthGrid(year, month, todayStr = getTodayDateString()) {
  const daysInCurrent = getDaysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun, 6 = Sat
  const daysInPrevious = getDaysInMonth(year, month - 1);

  const cells = [];

  // 1. Leading dates from previous month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const prevDay = daysInPrevious - i;
    const prevMonthDate = new Date(year, month - 1, prevDay);
    const dateStr = formatISODate(prevMonthDate);
    cells.push({
      dateStr,
      year: prevMonthDate.getFullYear(),
      month: prevMonthDate.getMonth(),
      day: prevDay,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayOfWeek: prevMonthDate.getDay(),
    });
  }

  // 2. Days of current month
  for (let d = 1; d <= daysInCurrent; d++) {
    const curDate = new Date(year, month, d);
    const dateStr = formatDateComponents(year, month, d);
    cells.push({
      dateStr,
      year,
      month,
      day: d,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      dayOfWeek: curDate.getDay(),
    });
  }

  // 3. Trailing dates to complete the 7-column grid rows (multiple of 7)
  const remaining = (7 - (cells.length % 7)) % 7;
  // If month view has 5 rows (35) or 6 rows (42), fill out to full complete rows
  const targetTotal = cells.length + remaining < 35 ? 35 : cells.length + remaining;
  const trailingNeeded = targetTotal - cells.length;

  for (let t = 1; t <= trailingNeeded; t++) {
    const nextMonthDate = new Date(year, month + 1, t);
    const dateStr = formatISODate(nextMonthDate);
    cells.push({
      dateStr,
      year: nextMonthDate.getFullYear(),
      month: nextMonthDate.getMonth(),
      day: t,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      dayOfWeek: nextMonthDate.getDay(),
    });
  }

  return cells;
}

/**
 * Returns 7 days corresponding to the week containing anchorDateStr (Sunday to Saturday).
 * @param {string} anchorDateStr
 * @param {string} [todayStr]
 * @returns {Array<{ dateStr: string, year: number, month: number, day: number, dayName: string, isToday: boolean, isAnchor: boolean }>}
 */
export function getWeekDays(anchorDateStr, todayStr = getTodayDateString()) {
  const anchor = dateStringToDate(anchorDateStr);
  const dayOfWeek = anchor.getDay(); // 0 = Sun
  const weekStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dayOfWeek);

  const days = [];
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    const dateStr = formatISODate(d);
    days.push({
      dateStr,
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
      dayName: DAY_NAMES[i],
      isToday: dateStr === todayStr,
      isAnchor: dateStr === anchorDateStr,
    });
  }

  return days;
}

/**
 * Formats Month and Year heading for display (e.g. "October 2026").
 * @param {number} year
 * @param {number} month - 0-indexed
 * @returns {string}
 */
export function formatMonthYearHeading(year, month) {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * Formats a Date string into full human friendly date (e.g. "Wednesday, October 24, 2026").
 * @param {string} dateStr
 * @returns {string}
 */
export function formatFullDateHeading(dateStr) {
  if (!dateStr) return '';
  const d = dateStringToDate(dateStr);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Maps task priority to VoxPlan's warm editorial color palette.
 * Critical: Muted crimson / Terracotta-red
 * High: Amber / Marigold
 * Medium: Dusty Lavender / Plum
 * Low: Muted Sage Green
 *
 * @param {string} priority - 'critical' | 'urgent' | 'high' | 'medium' | 'low'
 * @param {boolean} [completed=false]
 * @returns {{
 *   priority: string,
 *   label: string,
 *   bg: string,
 *   border: string,
 *   text: string,
 *   chipBg: string,
 *   accentStrip: string,
 *   icon: string
 * }}
 */
export function getPriorityPalette(priority, completed = false) {
  const norm = String(priority || 'medium').toLowerCase();

  let base;
  if (norm === 'critical' || norm === 'urgent') {
    base = {
      priority: 'critical',
      label: 'Critical Priority',
      bg: 'rgba(217, 56, 58, 0.12)',
      border: '#D9383A',
      text: '#9E1C1E',
      chipBg: '#FDF0ED',
      accentStrip: '#D9383A',
      icon: '🔥',
      motifName: 'priority-urgent',
    };
  } else if (norm === 'high') {
    base = {
      priority: 'high',
      label: 'High Priority',
      bg: 'rgba(229, 168, 59, 0.16)',
      border: '#E5A83B',
      text: '#8D4203',
      chipBg: '#FFF9EB',
      accentStrip: '#E5A83B',
      icon: '⚡',
      motifName: 'priority-high',
    };
  } else if (norm === 'low') {
    base = {
      priority: 'low',
      label: 'Low Priority',
      bg: 'rgba(45, 106, 79, 0.14)',
      border: '#2D6A4F',
      text: '#1E4E39',
      chipBg: '#F0F8F3',
      accentStrip: '#2D6A4F',
      icon: '🌱',
      motifName: 'priority-low',
    };
  } else {
    // Medium is default
    base = {
      priority: 'medium',
      label: 'Medium Priority',
      bg: 'rgba(182, 150, 204, 0.18)',
      border: '#8E5FA8',
      text: '#3D2645',
      chipBg: '#F8F3FA',
      accentStrip: '#8E5FA8',
      icon: '◆',
      motifName: 'priority-medium',
    };
  }

  if (completed) {
    return {
      ...base,
      bg: 'rgba(112, 109, 115, 0.08)',
      text: '#59555C',
      border: 'rgba(61, 38, 69, 0.18)',
      isCompleted: true,
    };
  }

  return base;
}

/**
 * Organizes tasks by their due date string (YYYY-MM-DD).
 * Also returns undated tasks in an unscheduled bucket.
 *
 * @param {Array<Object>} tasks
 * @returns {{
 *   dateMap: Map<string, Array<Object>>,
 *   unscheduled: Array<Object>,
 *   overdueCount: number,
 *   dueTodayCount: number
 * }}
 */
export function groupTasksForCalendar(tasks = [], todayStr = getTodayDateString()) {
  const dateMap = new Map();
  const unscheduled = [];
  let overdueCount = 0;
  let dueTodayCount = 0;

  for (const task of tasks) {
    if (!task) continue;

    // Normalizing due date
    const rawDue = task.dueDate || task.due_date;
    const comp = parseDateComponents(rawDue);

    if (comp) {
      const dateStr = formatDateComponents(comp.year, comp.month, comp.day);
      if (!dateMap.has(dateStr)) {
        dateMap.set(dateStr, []);
      }
      dateMap.get(dateStr).push(task);

      if (!task.completed) {
        if (dateStr < todayStr) {
          overdueCount++;
        } else if (dateStr === todayStr) {
          dueTodayCount++;
        }
      }
    } else {
      unscheduled.push(task);
    }
  }

  return {
    dateMap,
    unscheduled,
    overdueCount,
    dueTodayCount,
  };
}
