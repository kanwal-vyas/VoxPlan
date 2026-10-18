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
 * Validates whether a supplied time zone identifier is a valid IANA time zone.
 * - Rejects arbitrary text, special injection characters, and unknown zones.
 * - Confirms with Intl.DateTimeFormat in supported JS runtimes.
 *
 * @param {string} tzid
 * @returns {boolean}
 */
export function validateIanaTimeZone(tzid) {
  if (!tzid || typeof tzid !== 'string') return false;
  const trimmed = tzid.trim();
  // Safe IANA identifier: e.g. 'America/New_York', 'Europe/London', 'UTC', 'Etc/GMT+5'
  if (!/^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(trimmed)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the time zone offset in minutes from UTC for a specific date and IANA time zone.
 * Positive for zones ahead of UTC (e.g. Asia/Kolkata = +330), negative behind UTC (e.g. America/New_York = -300).
 *
 * @param {Date} date
 * @param {string} timeZone
 * @returns {number} Offset in minutes
 */
export function getTimezoneOffsetMinutes(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
  const targetUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second')
  );
  return Math.round((targetUtc - date.getTime()) / 60000);
}

/**
 * Formats an offset in minutes to RFC 5545 format: [+|-]HHMM
 *
 * @param {number} offsetMinutes
 * @returns {string} e.g. "-0500", "+0530", "+0000"
 */
export function formatIcsOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const mins = String(abs % 60).padStart(2, '0');
  return `${sign}${hours}${mins}`;
}

/**
 * Generates an RFC 5545 compliant VTIMEZONE component for a validated IANA time zone.
 * Includes STANDARD and DAYLIGHT components when daylight saving time is observed.
 *
 * @param {string} tzid - Validated IANA time zone (e.g. 'America/New_York')
 * @param {number} [referenceYear] - Year to evaluate transitions for (default: current year)
 * @returns {Array<string>} VTIMEZONE content lines (without CRLF)
 */
export function generateVtimezoneComponent(tzid, referenceYear = new Date().getFullYear()) {
  if (!validateIanaTimeZone(tzid)) return [];

  // Sample January and July to check if DST exists
  const janDate = new Date(Date.UTC(referenceYear, 0, 15, 12, 0, 0));
  const julDate = new Date(Date.UTC(referenceYear, 6, 15, 12, 0, 0));

  const janOffset = getTimezoneOffsetMinutes(janDate, tzid);
  const julOffset = getTimezoneOffsetMinutes(julDate, tzid);

  const lines = ['BEGIN:VTIMEZONE', `TZID:${tzid}`];

  // If winter and summer offsets are identical, this zone does not observe DST (e.g. Asia/Kolkata, UTC)
  if (janOffset === julOffset) {
    const tzName = new Intl.DateTimeFormat('en-US', { timeZone: tzid, timeZoneName: 'short' })
      .formatToParts(janDate)
      .find((p) => p.type === 'timeZoneName')?.value || tzid;

    lines.push('BEGIN:STANDARD');
    lines.push('DTSTART:19700101T000000');
    lines.push(`TZOFFSETFROM:${formatIcsOffset(janOffset)}`);
    lines.push(`TZOFFSETTO:${formatIcsOffset(janOffset)}`);
    lines.push(`TZNAME:${escapeIcsText(tzName)}`);
    lines.push('END:STANDARD');
    lines.push('END:VTIMEZONE');
    return lines;
  }

  // Zone observes DST: find the transitions during the reference year
  const transitions = [];
  let prevOffset = getTimezoneOffsetMinutes(new Date(Date.UTC(referenceYear, 0, 1)), tzid);

  for (let day = 1; day < 366; day++) {
    const checkDate = new Date(Date.UTC(referenceYear, 0, day));
    const offset = getTimezoneOffsetMinutes(checkDate, tzid);
    if (offset !== prevOffset) {
      let low = Date.UTC(referenceYear, 0, day - 1);
      let high = Date.UTC(referenceYear, 0, day);
      while (high - low > 3600000) {
        const mid = Math.floor((low + high) / 2);
        if (getTimezoneOffsetMinutes(new Date(mid), tzid) === prevOffset) {
          low = mid;
        } else {
          high = mid;
        }
      }
      transitions.push({
        date: new Date(high),
        fromOffset: prevOffset,
        toOffset: offset,
      });
      prevOffset = offset;
    }
  }

  const standardOffset = Math.min(janOffset, julOffset);

  if (transitions.length >= 2) {
    for (const tr of transitions) {
      const isDaylight = tr.toOffset > standardOffset;
      const subComp = isDaylight ? 'DAYLIGHT' : 'STANDARD';
      const tzName = new Intl.DateTimeFormat('en-US', {
        timeZone: tzid,
        timeZoneName: 'short',
      }).formatToParts(tr.date).find((p) => p.type === 'timeZoneName')?.value || (isDaylight ? 'DST' : 'STD');

      const dtStart = formatIcsUtcTimestamp(tr.date).replace('Z', '');

      lines.push(`BEGIN:${subComp}`);
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`TZOFFSETFROM:${formatIcsOffset(tr.fromOffset)}`);
      lines.push(`TZOFFSETTO:${formatIcsOffset(tr.toOffset)}`);
      lines.push(`TZNAME:${escapeIcsText(tzName)}`);
      lines.push(`END:${subComp}`);
    }
  } else {
    // Fallback if transition search yielded < 2 transitions in this year
    lines.push('BEGIN:STANDARD');
    lines.push('DTSTART:19700101T000000');
    lines.push(`TZOFFSETFROM:${formatIcsOffset(janOffset)}`);
    lines.push(`TZOFFSETTO:${formatIcsOffset(janOffset)}`);
    lines.push('END:STANDARD');
    lines.push('BEGIN:DAYLIGHT');
    lines.push('DTSTART:19700101T000000');
    lines.push(`TZOFFSETFROM:${formatIcsOffset(janOffset)}`);
    lines.push(`TZOFFSETTO:${formatIcsOffset(julOffset)}`);
    lines.push('END:DAYLIGHT');
  }

  lines.push('END:VTIMEZONE');
  return lines;
}

/**
 * Derives a stable, deterministic event UID for a scheduled session.
 *
 * Invariants:
 * - Distinguishes multi-day chunks cleanly using placementId, chunkId, or chunkIndex
 * - Retains identical UID across repeated exports of an unchanged schedule
 * - Editing session date or time NEVER changes its UID (no date/time dependencies in fallback)
 * - Reordering chunks preserves each session's identity
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

  // 3. Fallback: derive purely from stable task domain identifiers (never from transient date or time)
  const cleanTaskId = String(placement.taskId || 'task').replace(/[^a-zA-Z0-9_-]/g, '_');

  if (placement.isChunk && placement.chunkIndex !== undefined && placement.chunkIndex !== null) {
    return `chunk_${cleanTaskId}_seg_${placement.chunkIndex}@voxplan.local`;
  }

  return `placement_${cleanTaskId}@voxplan.local`;
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
  const rawPlacements = schedule?.proposedPlacements || schedule?.placements;
  const placements = Array.isArray(rawPlacements) ? rawPlacements : [];
  const taskMap = new Map((tasks || []).map((t) => [t.id, t]));

  const validSessions = [];
  const omittedSessions = [];

  // Track task session counts to ensure distinct placementIds if multiple unindexed placements exist for same task
  const taskSeenCounts = new Map();

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

    // 4. Ensure DTEND > DTSTART (strictly greater)
    if (dtEnd <= dtStart) {
      omittedSessions.push({
        placementId: p.placementId || `end_before_start_${idx}`,
        taskId,
        taskTitle: title,
        reason: 'end_time_not_after_start_time',
      });
      continue;
    }

    // 5. Deduplicate placementId if legacy placement lacks one and multiple exist for same task
    let effectivePlacement = p;
    if (!p.placementId && !p.chunkId && taskId) {
      const seen = taskSeenCounts.get(taskId) || 0;
      taskSeenCounts.set(taskId, seen + 1);
      if (seen > 0) {
        effectivePlacement = {
          ...p,
          placementId: `placement_${taskId}_${seen + 1}`,
        };
      }
    }

    const uid = generateStableSessionUid(effectivePlacement);

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
      description: descParts.join('\n'),
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
 *   uids: Array<string>,
 *   tzidUsed: string|null,
 *   warnings: Array<string>
 * }}
 */
export function generateIcsCalendar(schedule, options = {}) {
  const tasks = options.tasks || [];
  const prodId = options.prodId || DEFAULT_PRODID;
  const calendarName = options.calendarName || 'VoxPlan Schedule';
  const rawTzid = options.tzid && typeof options.tzid === 'string' ? options.tzid.trim() : null;
  const isTzidValid = rawTzid ? validateIanaTimeZone(rawTzid) : false;
  const tzid = isTzidValid ? rawTzid : null;
  const warnings = [];

  if (rawTzid && !isTzidValid) {
    warnings.push(`Invalid time zone identifier "${rawTzid}" was rejected; defaulted to floating local time.`);
  }

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

  // If a valid TZID was specified, inject the RFC 5545 VTIMEZONE definition
  if (tzid) {
    const refYear = validSessions.length > 0
      ? parseInt(validSessions[0].date.slice(0, 4), 10)
      : new Date().getFullYear();
    const vtimezoneLines = generateVtimezoneComponent(tzid, refYear);
    lines.push(...vtimezoneLines);
  }

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
      lines.push(`DESCRIPTION:${escapeIcsText(session.description)}`);
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
    tzidUsed: tzid,
    warnings,
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
