/**
 * RFC 5545 iCalendar (.ics) Generator & Local Exporter
 * Phase 6.4 — Standard Calendar Export
 *
 * Provides a pure, local-first calendar exporter for VoxPlan accepted schedules.
 * Generates standards-compliant .ics files with:
 * - Proper VCALENDAR and VEVENT structures (RFC 5545 §3.4, §3.6)
 * - Safe text escaping for backslashes, semicolons, commas, and newlines (§3.3.11)
 * - True octet-based line folding adhering to the 75-octet limit without splitting UTF-8 multibyte sequences (§3.1)
 * - Stable, deterministic session UIDs preserving event identity across repeated exports
 * - Accurate local wall-clock floating time representation avoiding timezone offset drift (§3.3.5)
 * - Clean multi-day task chunking handling: exports individual sessions with zero duplicate parent events
 * - Clear omission tracking for unscheduled effort, blocked tasks, and sessions lacking timing
 * - Zero external calendar accounts, OAuth, cloud APIs, or network dependencies
 */

export const ACCEPTED_SCHEDULE_STORAGE_KEY = 'voxplan_accepted_schedule';
export const DEFAULT_PRODID = '-//VoxPlan//VoxPlan Scheduler 1.0//EN';
export const DEFAULT_CALSCALE = 'GREGORIAN';
export const DEFAULT_METHOD = 'PUBLISH';
export const ICS_MIME_TYPE = 'text/calendar;charset=utf-8';
export const CRLF = '\r\n';

/**
 * Escapes text values according to RFC 5545 §3.3.11.
 * - Backslashes are escaped as '\\'
 * - Semicolons are escaped as '\;'
 * - Commas are escaped as '\,'
 * - Newlines (\r\n, \n, \r) are converted to literal '\n'
 * Prevents newline injection of arbitrary calendar properties.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeIcsText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/**
 * Folds a content line according to RFC 5545 §3.1.
 * Lines SHOULD NOT be longer than 75 octets (excluding CRLF).
 * Long lines are split between characters by inserting CRLF followed by a single space (0x20).
 *
 * Measures UTF-8 octets via TextEncoder, never splitting multibyte character sequences.
 *
 * @param {string} line - Single logical content line (without trailing CRLF)
 * @param {number} [maxOctets=75] - Maximum octets per physical line
 * @returns {string} - Folded line terminated by CRLF
 */
export function foldIcsLine(line, maxOctets = 75) {
  if (typeof line !== 'string') return CRLF;
  const encoder = new TextEncoder();
  const lineBytes = encoder.encode(line);

  if (lineBytes.length <= maxOctets) {
    return line + CRLF;
  }

  // Iterate by Unicode code points to avoid splitting surrogate pairs or multibyte characters
  const codePoints = Array.from(line);
  let result = '';
  let currentLineBytes = 0;
  let isFirstLine = true;
  const continuationSpaceBytes = 1; // ' ' is 1 octet in UTF-8

  for (const cp of codePoints) {
    const cpBytes = encoder.encode(cp).length;
    const limit = isFirstLine ? maxOctets : maxOctets - continuationSpaceBytes;

    if (currentLineBytes + cpBytes > limit && currentLineBytes > 0) {
      result += CRLF + ' ';
      currentLineBytes = 0;
      isFirstLine = false;
    }

    result += cp;
    currentLineBytes += cpBytes;
  }

  return result + CRLF;
}

/**
 * Unfolds folded RFC 5545 content lines to recover the original logical text.
 * Used for testing and validation.
 *
 * @param {string} icsText
 * @returns {string}
 */
export function unfoldIcsText(icsText) {
  if (typeof icsText !== 'string') return '';
  return icsText.replace(/\r\n[ \t]/g, '');
}

/**
 * Formats a Date or ISO date string into a UTC timestamp string with Z suffix:
 * YYYYMMDDTHHMMSSZ
 *
 * @param {Date|string|number} [dateInput]
 * @returns {string}
 */
export function formatIcsUtcTimestamp(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) {
    return new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Formats a local calendar date (YYYY-MM-DD) and wall-clock time (HH:MM)
 * into an RFC 5545 DATE-TIME value: YYYYMMDDTHHMMSS
 *
 * Preserves the exact intended local calendar date and time without UTC offset drift.
 *
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {string} timeStr - 'HH:MM'
 * @returns {string|null} - 'YYYYMMDDTHHMMSS' or null if invalid
 */
export function formatIcsLocalDateTime(dateStr, timeStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  if (!timeStr || typeof timeStr !== 'string') return null;

  const dateMatch = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;

  const timeMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) return null;

  const [, year, month, day] = dateMatch;
  const hours = String(parseInt(timeMatch[1], 10)).padStart(2, '0');
  const minutes = String(parseInt(timeMatch[2], 10)).padStart(2, '0');
  const seconds = '00';

  const hNum = parseInt(hours, 10);
  const mNum = parseInt(minutes, 10);
  if (hNum < 0 || hNum > 23 || mNum < 0 || mNum > 59) return null;

  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

/**
 * Derives a stable, deterministic event UID for a scheduled session.
 *
 * Invariants:
 * - Distinguishes multi-day chunks cleanly using placementId or chunkIndex
 * - Retains identical UID across repeated exports of an unchanged schedule
 * - Never includes personal file paths or sensitive system metadata
 * - Avoids collisions between different tasks and different sessions of the same task
 *
 * @param {Object} placement
 * @returns {string}
 */
export function generateStableSessionUid(placement) {
  if (!placement) return `session_unknown_${Date.now()}@voxplan.local`;

  // 1. If placement has a stable placementId (from Phase 6.1 / 6.3 engine)
  if (typeof placement.placementId === 'string' && placement.placementId.trim()) {
    const cleanId = placement.placementId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${cleanId}@voxplan.local`;
  }

  // 2. If placement has a chunkId
  if (typeof placement.chunkId === 'string' && placement.chunkId.trim()) {
    const cleanId = placement.chunkId.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${cleanId}@voxplan.local`;
  }

  // 3. Fallback combining taskId, date, and chunkIndex / startTime
  const cleanTaskId = String(placement.taskId || 'task').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = String(placement.proposedDate || 'date').replace(/[^0-9]/g, '');
  const timeStr = String(placement.startTime || 'time').replace(/[^0-9]/g, '');

  if (placement.isChunk && placement.chunkIndex !== undefined) {
    return `placement_${cleanTaskId}_chunk_${placement.chunkIndex}@voxplan.local`;
  }

  return `placement_${cleanTaskId}_${dateStr}_${timeStr}@voxplan.local`;
}

/**
 * Validates and extracts exportable sessions from an accepted schedule.
 *
 * Filters out:
 * - Unscheduled workloads and partially unallocated tails
 * - Tasks blocked by dependency cycles or missing prerequisites
 * - Oversized tasks exceeding capacity
 * - Placements with missing or invalid date/time timing
 * - Placements where endTime <= startTime
 *
 * @param {Object} schedule - Schedule proposal or accepted schedule object
 * @param {Array} [tasks=[]] - Underlying task array for enriched metadata
 * @returns {{ validSessions: Array, omittedSessions: Array }}
 */
export function extractExportableSessions(schedule, tasks = []) {
  const placements = schedule?.proposedPlacements || schedule?.placements || [];
  const taskMap = new Map((tasks || []).map((t) => [t.id, t]));

  const validSessions = [];
  const omittedSessions = [];

  for (let idx = 0; idx < placements.length; idx++) {
    const p = placements[idx];
    if (!p || typeof p !== 'object') {
      omittedSessions.push({
        placementId: `corrupted_${idx}`,
        taskId: null,
        taskTitle: 'Corrupted Placement Item',
        reason: 'corrupted_placement_item',
      });
      continue;
    }
    const taskId = p.taskId;
    const task = taskMap.get(taskId);
    const title = p.taskTitle || task?.title || 'Untitled Session';

    // 1. Exclude unscheduled or blocked items
    if (p.status === 'unscheduled') {
      omittedSessions.push({
        placementId: p.placementId || `unscheduled_${idx}`,
        taskId,
        taskTitle: title,
        reason: 'unscheduled_effort',
      });
      continue;
    }

    if (p.status === 'blocked_by_dependency') {
      omittedSessions.push({
        placementId: p.placementId || `blocked_${idx}`,
        taskId,
        taskTitle: title,
        reason: 'blocked_by_dependency',
      });
      continue;
    }

    if (p.status === 'oversized_exceeds_capacity') {
      omittedSessions.push({
        placementId: p.placementId || `oversized_${idx}`,
        taskId,
        taskTitle: title,
        reason: 'oversized_exceeds_capacity',
      });
      continue;
    }

    // 2. Must have valid proposedDate
    if (!p.proposedDate || typeof p.proposedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.proposedDate)) {
      omittedSessions.push({
        placementId: p.placementId || `missing_date_${idx}`,
        taskId,
        taskTitle: title,
        reason: 'missing_date',
      });
      continue;
    }

    // 3. Must have valid session timing (startTime and endTime)
    if (!p.startTime || !p.endTime || typeof p.startTime !== 'string' || typeof p.endTime !== 'string') {
      omittedSessions.push({
        placementId: p.placementId || `missing_time_${idx}`,
        taskId,
        taskTitle: title,
        reason: 'missing_timing',
      });
      continue;
    }

    const dtStart = formatIcsLocalDateTime(p.proposedDate, p.startTime);
    const dtEnd = formatIcsLocalDateTime(p.proposedDate, p.endTime);

    if (!dtStart || !dtEnd) {
      omittedSessions.push({
        placementId: p.placementId || `invalid_time_format_${idx}`,
        taskId,
        taskTitle: title,
        reason: 'invalid_time_format',
      });
      continue;
    }

    // 4. Ensure DTEND > DTSTART
    if (dtEnd <= dtStart) {
      omittedSessions.push({
        placementId: p.placementId || `end_before_start_${idx}`,
        taskId,
        taskTitle: title,
        reason: 'end_time_not_after_start_time',
      });
      continue;
    }

    // 5. Construct valid session object
    const uid = generateStableSessionUid(p);

    // Build human-friendly SUMMARY
    let summaryText = title;
    if (p.isChunk && (p.totalChunks > 1 || (p.chunkIndex !== undefined && p.chunkIndex >= 0))) {
      const chunkNum = (p.chunkIndex ?? 0) + 1;
      const totalNum = p.totalChunks || 0;
      if (totalNum > 1) {
        summaryText = `${title} (Session ${chunkNum} of ${totalNum})`;
      } else {
        summaryText = `${title} (Session ${chunkNum})`;
      }
    }

    // Build structured, useful DESCRIPTION
    const descParts = [];
    if (task?.description && typeof task.description === 'string' && task.description.trim()) {
      descParts.push(`Description: ${task.description.trim()}`);
    }
    const category = p.taskCategory || task?.category;
    if (category) {
      descParts.push(`Category: ${category}`);
    }
    const priority = p.taskPriority || task?.priority;
    if (priority) {
      descParts.push(`Priority: ${priority.toUpperCase()}`);
    }
    const durationHours = p.chunkDuration ?? p.effectiveHours;
    if (typeof durationHours === 'number' && durationHours > 0) {
      descParts.push(`Duration: ${durationHours}h`);
    }
    if (p.focusWindowLabel) {
      descParts.push(`Focus Window: ${p.focusWindowLabel}`);
    }
    descParts.push('VoxPlan local schedule snapshot (static export).');

    validSessions.push({
      uid,
      dtStart,
      dtEnd,
      date: p.proposedDate,
      startTime: p.startTime,
      endTime: p.endTime,
      summary: summaryText,
      description: descParts.join('\\n'),
      priority: priority || 'medium',
      category: category || '',
      taskId,
      placementId: p.placementId || uid,
      isChunk: Boolean(p.isChunk),
      chunkIndex: p.chunkIndex,
      totalChunks: p.totalChunks,
      hours: durationHours,
    });
  }

  // Sort sessions chronologically by date and start time
  validSessions.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  return { validSessions, omittedSessions };
}

/**
 * Generates an RFC 5545 compliant .ics calendar string from an accepted schedule.
 *
 * @param {Object} schedule - The accepted schedule object
 * @param {Object} [options={}]
 * @param {Array} [options.tasks=[]] - Underlying task list for enriched descriptions
 * @param {Date|string} [options.exportTimestamp] - Deterministic export timestamp for DTSTAMP
 * @param {string} [options.prodId] - PRODID identifier
 * @param {string} [options.calendarName='VoxPlan Schedule'] - X-WR-CALNAME
 * @param {string} [options.tzid] - Optional time zone identifier (e.g. 'America/New_York')
 * @returns {{
 *   ics: string,
 *   sessionCount: number,
 *   omittedCount: number,
 *   omittedSessions: Array,
 *   uids: Array<string>
 * }}
 */
export function generateIcsCalendar(schedule, options = {}) {
  const tasks = options.tasks || [];
  const prodId = options.prodId || DEFAULT_PRODID;
  const calendarName = options.calendarName || 'VoxPlan Schedule';
  const tzid = options.tzid && typeof options.tzid === 'string' ? options.tzid.trim() : null;
  const dtStamp = formatIcsUtcTimestamp(options.exportTimestamp);

  const { validSessions, omittedSessions } = extractExportableSessions(schedule, tasks);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    `CALSCALE:${DEFAULT_CALSCALE}`,
    `METHOD:${DEFAULT_METHOD}`,
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  const uids = [];

  for (const session of validSessions) {
    uids.push(session.uid);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${session.uid}`);
    lines.push(`DTSTAMP:${dtStamp}`);

    if (tzid) {
      lines.push(`DTSTART;TZID=${tzid}:${session.dtStart}`);
      lines.push(`DTEND;TZID=${tzid}:${session.dtEnd}`);
    } else {
      // Floating local wall-clock time (RFC 5545 FORM #1)
      lines.push(`DTSTART:${session.dtStart}`);
      lines.push(`DTEND:${session.dtEnd}`);
    }

    lines.push(`SUMMARY:${escapeIcsText(session.summary)}`);
    if (session.description) {
      // Note: session.description already contains literal \n delimiters
      lines.push(`DESCRIPTION:${session.description}`);
    }
    lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  // Fold all lines to adhere to the 75-octet limit with CRLF endings
  const ics = lines.map((line) => foldIcsLine(line, 75)).join('');

  return {
    ics,
    sessionCount: validSessions.length,
    omittedCount: omittedSessions.length,
    omittedSessions,
    uids,
    sessions: validSessions,
  };
}

/**
 * Triggers a client-side download of the generated .ics calendar file.
 * Releases the temporary object URL immediately after download initiation.
 *
 * @param {string} icsContent - Raw .ics calendar string
 * @param {string} [filename] - Target filename (default: voxplan-schedule-YYYY-MM-DD.ics)
 * @returns {{ success: boolean, filename: string, sizeBytes: number }}
 */
export function downloadIcsFile(icsContent, filename) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('downloadIcsFile can only be executed in a browser DOM environment.');
  }

  const dateSuffix = new Date().toISOString().slice(0, 10);
  const finalFilename = filename || `voxplan-schedule-${dateSuffix}.ics`;

  const blob = new Blob([icsContent], { type: ICS_MIME_TYPE });
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = finalFilename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Cleanly release the temporary object URL
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);

  return {
    success: true,
    filename: finalFilename,
    sizeBytes: blob.size,
  };
}

/**
 * Durable Local-First Persistence for the Accepted Schedule
 */

/**
 * Persists the accepted schedule snapshot to localStorage.
 *
 * @param {Object} schedule
 */
export function saveAcceptedSchedule(schedule) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!schedule) {
      localStorage.removeItem(ACCEPTED_SCHEDULE_STORAGE_KEY);
      return;
    }
    const toSave = {
      ...schedule,
      status: 'accepted',
      acceptedAt: schedule.acceptedAt || new Date().toISOString(),
    };
    localStorage.setItem(ACCEPTED_SCHEDULE_STORAGE_KEY, JSON.stringify(toSave));
  } catch (err) {
    console.warn('Failed to save accepted schedule to localStorage:', err);
  }
}

/**
 * Loads the persisted accepted schedule from localStorage.
 *
 * @returns {Object|null}
 */
export function loadAcceptedSchedule() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(ACCEPTED_SCHEDULE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to load accepted schedule from localStorage:', err);
  }
  return null;
}

/**
 * Clears the persisted accepted schedule from localStorage.
 */
export function clearAcceptedSchedule() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(ACCEPTED_SCHEDULE_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear accepted schedule from localStorage:', err);
  }
}
