import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getTodayDateString,
  parseDateComponents,
  dateStringToDate,
  formatDateComponents,
  getDaysInMonth,
  getMonthGrid,
  getWeekDays,
  formatMonthYearHeading,
  formatFullDateHeading,
  getPriorityPalette,
  groupTasksForCalendar,
} from '../src/utils/calendarUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('TaskCalendar — Interactive Task Calendar Test Suite', () => {
  describe('1. Calendar Date Math, Month Boundaries & Leap Years', () => {
    it('1.1 Computes correct days in month for regular and leap years', () => {
      // February in non-leap years (2025: 28 days)
      assert.equal(getDaysInMonth(2025, 1), 28);
      // February in leap year (2024: 29 days)
      assert.equal(getDaysInMonth(2024, 1), 29);
      // February in future leap year (2028: 29 days)
      assert.equal(getDaysInMonth(2028, 1), 29);
      // Months with 31 days (January: 0, March: 2, May: 4, July: 6, August: 7, October: 9, December: 11)
      assert.equal(getDaysInMonth(2026, 0), 31);
      assert.equal(getDaysInMonth(2026, 9), 31);
      // Months with 30 days (April: 3, June: 5, September: 8, November: 10)
      assert.equal(getDaysInMonth(2026, 8), 30);
      assert.equal(getDaysInMonth(2026, 10), 30);
    });

    it('1.2 Generates accurate 7-column month grid with leading and trailing dates', () => {
      // October 2026 starts on Thursday (index 4)
      const gridOct2026 = getMonthGrid(2026, 9, '2026-10-24');
      assert.equal(gridOct2026.length % 7, 0, 'Grid must be a multiple of 7 columns');
      assert.ok(gridOct2026.length >= 35, 'Grid must have at least 5 rows (35 cells)');

      // First cell should be Sunday leading date from September
      assert.equal(gridOct2026[0].dayOfWeek, 0, 'First column must be Sunday');
      assert.equal(gridOct2026[0].isCurrentMonth, false, 'Leading day is not in current month');

      // October 1 must be present and marked current month
      const oct1 = gridOct2026.find((c) => c.dateStr === '2026-10-01');
      assert.ok(oct1, 'October 1 must exist');
      assert.equal(oct1.isCurrentMonth, true);
      assert.equal(oct1.dayOfWeek, 4, 'October 1, 2026 is a Thursday');

      // October 24 must be marked as today
      const todayCell = gridOct2026.find((c) => c.dateStr === '2026-10-24');
      assert.ok(todayCell, 'Today cell must exist');
      assert.equal(todayCell.isToday, true);

      // Trailing days from November to complete row
      const lastCell = gridOct2026[gridOct2026.length - 1];
      assert.equal(lastCell.dayOfWeek, 6, 'Last column must be Saturday');
    });

    it('1.3 Generates 7-day week span starting on Sunday and ending on Saturday', () => {
      const weekDays = getWeekDays('2026-10-24', '2026-10-24');
      assert.equal(weekDays.length, 7);
      assert.equal(weekDays[0].dayName, 'Sun');
      assert.equal(weekDays[6].dayName, 'Sat');

      const anchor = weekDays.find((d) => d.dateStr === '2026-10-24');
      assert.ok(anchor, 'Week must contain anchor date 2026-10-24');
      assert.equal(anchor.isAnchor, true);
      assert.equal(anchor.isToday, true);
    });

    it('1.4 Formats friendly headings accurately without UTC drift', () => {
      const heading = formatMonthYearHeading(2026, 9);
      assert.ok(heading.includes('October'), 'Must include October');
      assert.ok(heading.includes('2026'), 'Must include 2026');

      const fullHeading = formatFullDateHeading('2026-10-24');
      assert.ok(fullHeading.includes('October 24, 2026') || fullHeading.includes('24 October 2026'));
    });
  });

  describe('2. Local Timezone Handling & Strict Date-Only Integrity', () => {
    it('2.1 parseDateComponents accurately parses YYYY-MM-DD without UTC offset subtraction', () => {
      const parsed = parseDateComponents('2026-10-24');
      assert.deepEqual(parsed, { year: 2026, month: 9, day: 24 });

      // Leap year boundary check
      const leap = parseDateComponents('2024-02-29');
      assert.deepEqual(leap, { year: 2024, month: 1, day: 29 });

      // Year-end boundary check
      const yearEnd = parseDateComponents('2026-12-31');
      assert.deepEqual(yearEnd, { year: 2026, month: 11, day: 31 });

      const newYear = parseDateComponents('2027-01-01');
      assert.deepEqual(newYear, { year: 2027, month: 0, day: 1 });
    });

    it('2.2 formatDateComponents produces zero-padded YYYY-MM-DD strings', () => {
      assert.equal(formatDateComponents(2026, 9, 24), '2026-10-24');
      assert.equal(formatDateComponents(2026, 0, 5), '2026-01-05');
      assert.equal(formatDateComponents(2026, 11, 31), '2026-12-31');
    });

    it('2.3 dateStringToDate creates a Date with matching local calendar properties', () => {
      const d = dateStringToDate('2026-10-24');
      assert.equal(d.getFullYear(), 2026);
      assert.equal(d.getMonth(), 9);
      assert.equal(d.getDate(), 24);
    });
  });

  describe('3. Task Grouping, Deadlines, Overdue, and Unscheduled Handling', () => {
    it('3.1 Accurately groups tasks by date and segregates undated tasks', () => {
      const sampleTasks = [
        { id: 't1', title: 'Task 1', dueDate: '2026-10-24', priority: 'high', completed: false },
        { id: 't2', title: 'Task 2', dueDate: '2026-10-24', priority: 'medium', completed: true },
        { id: 't3', title: 'Task 3', dueDate: '2026-10-20', priority: 'critical', completed: false }, // Overdue
        { id: 't4', title: 'Task 4', dueDate: '2026-10-30', priority: 'low', completed: false },
        { id: 't5', title: 'Task 5', dueDate: null, priority: 'medium', completed: false }, // Unscheduled
        { id: 't6', title: 'Task 6', dueDate: '', priority: 'low', completed: false }, // Unscheduled
      ];

      const { dateMap, unscheduled, overdueCount, dueTodayCount } = groupTasksForCalendar(sampleTasks, '2026-10-24');

      assert.equal(dateMap.get('2026-10-24').length, 2, '2026-10-24 must have 2 tasks');
      assert.equal(dateMap.get('2026-10-20').length, 1, '2026-10-20 must have 1 task');
      assert.equal(unscheduled.length, 2, 'Must have 2 unscheduled tasks');
      assert.equal(overdueCount, 1, 'Task 3 must be counted as overdue');
      assert.equal(dueTodayCount, 1, 'Task 1 must be counted as uncompleted due today');
    });

    it('3.2 Completed overdue tasks are not counted in overdueCount', () => {
      const tasks = [
        { id: 't1', title: 'Past task', dueDate: '2026-10-15', completed: true },
      ];
      const { overdueCount } = groupTasksForCalendar(tasks, '2026-10-24');
      assert.equal(overdueCount, 0, 'Completed tasks must never be counted as overdue');
    });

    it('3.3 Does not fabricate times for date-only deadlines', () => {
      const tasks = [
        { id: 't1', title: 'Review Sprint', dueDate: '2026-10-24' },
      ];
      const { dateMap } = groupTasksForCalendar(tasks, '2026-10-24');
      const retrieved = dateMap.get('2026-10-24')[0];
      assert.equal(retrieved.dueDate, '2026-10-24');
      assert.equal(retrieved.startTime, undefined);
    });
  });

  describe('4. Priority Colour Coding & Completion Semantics', () => {
    it('4.1 Maps priorities to distinct accessible editorial palette colors', () => {
      const crit = getPriorityPalette('critical');
      assert.equal(crit.priority, 'critical');
      assert.equal(crit.border, '#D9383A');
      assert.ok(crit.icon.includes('🔥'));

      const urgent = getPriorityPalette('urgent');
      assert.equal(urgent.priority, 'critical');

      const high = getPriorityPalette('high');
      assert.equal(high.priority, 'high');
      assert.equal(high.border, '#E5A83B');
      assert.ok(high.icon.includes('⚡'));

      const med = getPriorityPalette('medium');
      assert.equal(med.priority, 'medium');
      assert.equal(med.border, '#8E5FA8');

      const low = getPriorityPalette('low');
      assert.equal(low.priority, 'low');
      assert.equal(low.border, '#2D6A4F');
      assert.ok(low.icon.includes('🌱'));
    });

    it('4.2 Completed tasks retain their original priority identity while showing distinct completion styling', () => {
      const completedHigh = getPriorityPalette('high', true);
      assert.equal(completedHigh.priority, 'high');
      assert.equal(completedHigh.isCompleted, true);
      assert.equal(completedHigh.accentStrip, '#E5A83B', 'Retains original priority accent');
    });
  });

  describe('5. Component Integration & Navigation Architecture', () => {
    it('5.1 Header exposes Calendar destination tab alongside Today, Tasks, and Insights', () => {
      const headerPath = path.join(rootDir, 'src', 'components', 'Header.jsx');
      const content = fs.readFileSync(headerPath, 'utf-8');

      assert.ok(content.includes('id="nav-tab-today"'), 'Must have Today tab');
      assert.ok(content.includes('id="nav-tab-tasks"'), 'Must have Tasks tab');
      assert.ok(content.includes('id="nav-tab-calendar"'), 'Must have Calendar tab');
      assert.ok(content.includes('id="nav-tab-insights"'), 'Must have Insights tab');
      assert.ok(content.includes("currentView === 'calendar' ? 'page' : undefined"), 'Must set aria-current on calendar tab');
    });

    it('5.2 ProductivityApp renders view-calendar tabpanel with non-destructive display toggling', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(content.includes('id="view-calendar"'), 'Must render view-calendar tabpanel');
      assert.ok(content.includes('aria-labelledby="nav-tab-calendar"'), 'Must associate tabpanel with nav-tab-calendar');
      assert.ok(content.includes("display: currentView === 'calendar' ? 'flex' : 'none'"), 'Must toggle calendar display without unmounting');
      assert.ok(content.includes('<TaskCalendar'), 'Must render TaskCalendar component inside tabpanel');
    });

    it('5.3 TaskCalendar provides Month, Week, and Day view switchers and accessible controls', () => {
      const calPath = path.join(rootDir, 'src', 'components', 'TaskCalendar.jsx');
      const content = fs.readFileSync(calPath, 'utf-8');

      assert.ok(content.includes('id="calendar-view-month-btn"'), 'Must have month view button');
      assert.ok(content.includes('id="calendar-view-week-btn"'), 'Must have week view button');
      assert.ok(content.includes('id="calendar-view-day-btn"'), 'Must have day view button');
      assert.ok(content.includes('id="calendar-today-btn"'), 'Must have today navigation button');
      assert.ok(content.includes('id="calendar-prev-btn"'), 'Must have previous button');
      assert.ok(content.includes('id="calendar-next-btn"'), 'Must have next button');
      assert.ok(content.includes('id="calendar-month-grid"'), 'Must render calendar month grid');
      assert.ok(content.includes('id="calendar-selected-agenda"'), 'Must render selected agenda section');
    });

    it('5.4 TaskCalendar includes priority legend and quick task creation modal', () => {
      const calPath = path.join(rootDir, 'src', 'components', 'TaskCalendar.jsx');
      const content = fs.readFileSync(calPath, 'utf-8');

      assert.ok(content.includes('Legend:'), 'Must display priority legend label');
      assert.ok(content.includes('Critical / Urgent'), 'Must include Critical in legend');
      assert.ok(content.includes('High'), 'Must include High in legend');
      assert.ok(content.includes('Medium'), 'Must include Medium in legend');
      assert.ok(content.includes('Low'), 'Must include Low in legend');
      assert.ok(content.includes('calendar-quick-add-title-input'), 'Must provide quick-add title input');
      assert.ok(content.includes('calendar-quick-add-priority-select'), 'Must provide quick-add priority selector');
    });

    it('5.5 Command dock bottom clearance is preserved so dock does not cover calendar content', () => {
      const appPath = path.join(rootDir, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');
      assert.ok(content.includes("padding: '0 20px 180px 20px'"), 'Must maintain 180px bottom safe clearance');
    });
  });
});
