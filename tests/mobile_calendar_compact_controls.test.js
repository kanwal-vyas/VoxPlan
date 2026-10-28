import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');

test('Phase 8.26: Mobile Calendar Header & Controls Compaction Test Suite', async (t) => {
  const calendarContent = fs.readFileSync(path.join(projectRoot, 'src/components/TaskCalendar.jsx'), 'utf-8');
  const appCss = fs.readFileSync(path.join(projectRoot, 'src/App.css'), 'utf-8');

  await t.test('1. Semantic Mobile Container Classes Declared in TaskCalendar.jsx', () => {
    // Top bar & navigation classes
    assert.ok(calendarContent.includes('calendar-top-bar'), 'Must declare calendar-top-bar');
    assert.ok(calendarContent.includes('calendar-heading-group'), 'Must declare calendar-heading-group');
    assert.ok(calendarContent.includes('calendar-title-row'), 'Must declare calendar-title-row');
    assert.ok(calendarContent.includes('calendar-today-pill'), 'Must declare calendar-today-pill');
    assert.ok(calendarContent.includes('calendar-toolbar-controls'), 'Must declare calendar-toolbar-controls');
    assert.ok(calendarContent.includes('calendar-nav-and-view-row'), 'Must declare calendar-nav-and-view-row');
    assert.ok(calendarContent.includes('calendar-action-buttons'), 'Must declare calendar-action-buttons');

    // Filter & legend classes
    assert.ok(calendarContent.includes('calendar-filter-and-legend-row'), 'Must declare calendar-filter-and-legend-row');
    assert.ok(calendarContent.includes('calendar-filter-pills-area'), 'Must declare calendar-filter-pills-area');
    assert.ok(calendarContent.includes('calendar-priority-filter-group'), 'Must declare calendar-priority-filter-group');
    assert.ok(calendarContent.includes('calendar-status-and-unscheduled-group'), 'Must declare calendar-status-and-unscheduled-group');
    assert.ok(calendarContent.includes('calendar-status-filter-group'), 'Must declare calendar-status-filter-group');
    assert.ok(calendarContent.includes('calendar-filter-pill'), 'Must declare calendar-filter-pill');
    assert.ok(calendarContent.includes('calendar-unscheduled-btn'), 'Must declare calendar-unscheduled-btn');
    assert.ok(calendarContent.includes('calendar-legend-bar'), 'Must declare calendar-legend-bar');
    assert.ok(calendarContent.includes('calendar-legend-item'), 'Must declare calendar-legend-item');
    assert.ok(calendarContent.includes('calendar-legend-dot'), 'Must declare calendar-legend-dot');
  });

  await t.test('2. Desktop Preservation: Sub-Container Display Contents Invariants', () => {
    // In inline styles, sub-containers must use display: 'contents' so desktop layout is unaffected
    assert.ok(calendarContent.includes("navAndViewRow: {\n    display: 'contents',"), 'navAndViewRow must default to display: contents for desktop');
    assert.ok(calendarContent.includes("actionButtonGroup: {\n    display: 'contents',"), 'actionButtonGroup must default to display: contents for desktop');
    assert.ok(calendarContent.includes("statusAndUnscheduledGroup: {\n    display: 'contents',"), 'statusAndUnscheduledGroup must default to display: contents for desktop');

    // Baseline desktop metrics preserved
    assert.ok(calendarContent.includes("maxWidth: '1200px'"), 'Desktop calendar container must retain maxWidth 1200px');
    assert.ok(calendarContent.includes("minHeight: '122px'"), 'Desktop month cell must retain minHeight 122px');
    assert.ok(calendarContent.includes("padding: '20px 24px'"), 'Desktop controlHub must retain base padding 20px 24px');
  });

  await t.test('3. Mobile Media Queries Declare Compact Spacing & Heights in App.css', () => {
    // Control hub padding reduction
    assert.ok(appCss.includes('.calendar-control-hub'), 'Must style .calendar-control-hub in App.css');
    assert.ok(appCss.includes('padding: 8px 10px !important;'), 'Must compact control hub padding to 8px 10px on mobile');

    // Heading font size reduction
    assert.ok(appCss.includes('#calendar-view-heading'), 'Must style #calendar-view-heading');
    assert.ok(appCss.includes('font-size: 16px !important;'), 'Must scale calendar heading to 16px on mobile');

    // Nav and view row layout
    assert.ok(appCss.includes('.calendar-nav-and-view-row'), 'Must style .calendar-nav-and-view-row');
    assert.ok(appCss.includes('.calendar-action-buttons'), 'Must style .calendar-action-buttons');

    // Action buttons flex distribution
    assert.ok(appCss.includes('#calendar-export-btn,\n  #calendar-back-to-tasks-btn'), 'Must group export and back buttons');
    assert.ok(appCss.includes('flex: 1 !important;'), 'Action buttons must flex 1 to fill row symmetrically');

    // Priority and Status rows
    assert.ok(appCss.includes('.calendar-priority-filter-group'), 'Must style .calendar-priority-filter-group');
    assert.ok(appCss.includes('.calendar-status-and-unscheduled-group'), 'Must style .calendar-status-and-unscheduled-group');
    assert.ok(appCss.includes('.calendar-unscheduled-btn'), 'Must style .calendar-unscheduled-btn');

    // Compact theme-matched legend
    assert.ok(appCss.includes('.calendar-legend-bar'), 'Must style .calendar-legend-bar');
    assert.ok(appCss.includes('.calendar-legend-dot'), 'Must style .calendar-legend-dot');
    assert.ok(appCss.includes('width: 6px !important;'), 'Legend dots must be compact 6px');
  });

  await t.test('4. Functional Buttons & Accessible Names Remain Intact', () => {
    assert.ok(calendarContent.includes('id="calendar-today-btn"'), 'Today button exists');
    assert.ok(calendarContent.includes('id="calendar-prev-btn"'), 'Prev button exists');
    assert.ok(calendarContent.includes('id="calendar-next-btn"'), 'Next button exists');
    assert.ok(calendarContent.includes('id="calendar-view-month-btn"'), 'Month view button exists');
    assert.ok(calendarContent.includes('id="calendar-view-week-btn"'), 'Week view button exists');
    assert.ok(calendarContent.includes('id="calendar-view-day-btn"'), 'Day view button exists');
    assert.ok(calendarContent.includes('id="calendar-export-btn"'), 'Export button exists');
    assert.ok(calendarContent.includes('id="calendar-back-to-tasks-btn"'), 'Tasks List button exists');
    assert.ok(calendarContent.includes('id="calendar-toggle-unscheduled-btn"'), 'Unscheduled toggle exists');
    assert.ok(calendarContent.includes('aria-label="Task priority color legend"'), 'Legend has accessible label');
  });
});
