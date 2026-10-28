import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve('.');

test('Mobile Navigation, Calendar & Task Card Optimization Suite', async (t) => {
  await t.test('1. Mobile Header Navigation Declares 4-Column Grid', () => {
    const headerContent = fs.readFileSync(path.join(projectRoot, 'src/components/Header.jsx'), 'utf-8');
    const appCss = fs.readFileSync(path.join(projectRoot, 'src/App.css'), 'utf-8');

    // Verify all 4 tabs exist
    assert.ok(headerContent.includes('id="nav-tab-today"'), 'Must have Today tab');
    assert.ok(headerContent.includes('id="nav-tab-tasks"'), 'Must have Tasks tab');
    assert.ok(headerContent.includes('id="nav-tab-calendar"'), 'Must have Calendar tab');
    assert.ok(headerContent.includes('id="nav-tab-insights"'), 'Must have Insights tab');

    // Verify 4-column grid in styles
    assert.ok(headerContent.includes("gridTemplateColumns: 'repeat(4, 1fr)'"), 'navMobile must declare 4-column grid');

    // Verify CSS responsive rules
    assert.ok(appCss.includes('.app-header-nav'), 'App.css must have .app-header-nav');
    assert.ok(appCss.includes('grid-template-columns: repeat(4, 1fr) !important;'), 'App.css must declare 4-column grid for mobile nav');
  });

  await t.test('2. Mobile Calendar Declares Compact Containment & Contained Week Scroll', () => {
    const calendarContent = fs.readFileSync(path.join(projectRoot, 'src/components/TaskCalendar.jsx'), 'utf-8');
    const appCss = fs.readFileSync(path.join(projectRoot, 'src/App.css'), 'utf-8');

    // Verify semantic class names
    assert.ok(calendarContent.includes('calendar-control-hub'), 'Must have calendar-control-hub');
    assert.ok(calendarContent.includes('calendar-month-card'), 'Must have calendar-month-card');
    assert.ok(calendarContent.includes('calendar-grid-cell'), 'Must have calendar-grid-cell');
    assert.ok(calendarContent.includes('calendar-task-chip'), 'Must have calendar-task-chip');
    assert.ok(calendarContent.includes('calendar-week-card'), 'Must have calendar-week-card');

    // Verify CSS rules for compact 7-column grid and week view containment
    assert.ok(appCss.includes('.calendar-grid-cell'), 'App.css must style .calendar-grid-cell');
    assert.ok(appCss.includes('.calendar-task-chip'), 'App.css must style .calendar-task-chip');
    assert.ok(appCss.includes('#calendar-week-grid'), 'App.css must style #calendar-week-grid');
    assert.ok(appCss.includes('.calendar-week-columns-row'), 'App.css must style .calendar-week-columns-row');
  });

  await t.test('3. Mobile Task Cards Declare Compact Heights, Padding & Prominent Title', () => {
    const cardContent = fs.readFileSync(path.join(projectRoot, 'src/components/TaskCard.jsx'), 'utf-8');
    const appCss = fs.readFileSync(path.join(projectRoot, 'src/App.css'), 'utf-8');

    // Verify semantic class names
    assert.ok(cardContent.includes('task-card-top-row'), 'Must have task-card-top-row');
    assert.ok(cardContent.includes('task-card-title'), 'Must have task-card-title');
    assert.ok(cardContent.includes('task-card-middle-meta'), 'Must have task-card-middle-meta');
    assert.ok(cardContent.includes('task-card-footer'), 'Must have task-card-footer');

    // Verify CSS rules reduce bulkiness and establish compact density
    assert.ok(appCss.includes('padding: 6px 10px !important;'), 'App.css must reduce task card padding to 6px 10px');
    assert.ok(appCss.includes('font-size: 13.5px !important;'), 'App.css must scale task title on mobile');
    assert.ok(appCss.includes('grid-template-columns: 1fr auto !important;'), 'App.css must use compact 2-column grid');
    assert.ok(appCss.includes('#landscape .task-card button'), 'App.css must scope button heights inside task card');
    assert.ok(appCss.includes('.task-card-obs-badge'), 'App.css must style secondary obs badge');
  });

  await t.test('4. Invariants & Desktop Layout Preservation', () => {
    const headerContent = fs.readFileSync(path.join(projectRoot, 'src/components/Header.jsx'), 'utf-8');
    const calendarContent = fs.readFileSync(path.join(projectRoot, 'src/components/TaskCalendar.jsx'), 'utf-8');
    const cardContent = fs.readFileSync(path.join(projectRoot, 'src/components/TaskCard.jsx'), 'utf-8');

    // Desktop style objects must retain original properties
    assert.ok(headerContent.includes("maxWidth: '1120px'"), 'Desktop headerInner must retain maxWidth 1120px');
    assert.ok(calendarContent.includes("maxWidth: '1200px'"), 'Desktop calendar container must retain maxWidth 1200px');
    assert.ok(calendarContent.includes("minHeight: '122px'"), 'Desktop month cell must retain minHeight 122px in base styles');
    assert.ok(cardContent.includes("padding: '22px 24px'"), 'Desktop card must retain padding 22px 24px in base styles');
  });
});
