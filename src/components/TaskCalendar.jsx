import React, { useState, useMemo, useCallback } from 'react';
import MotifIcon from './MotifIcon';
import {
  getTodayDateString,
  parseDateComponents,
  dateStringToDate,
  formatDateComponents,
  getMonthGrid,
  getWeekDays,
  formatMonthYearHeading,
  formatFullDateHeading,
  getPriorityPalette,
  groupTasksForCalendar,
} from '../utils/calendarUtils.js';
import TaskStickyTab from './stickyNotes/TaskStickyTab';

/**
 * TaskCalendar Component
 *
 * An interactive, Google Calendar-style task management view for VoxPlan.
 * Displays existing tasks on their scheduled dates using VoxPlan's warm editorial
 * palette, priority color codes, and responsive month/week/day navigation.
 */
export default function TaskCalendar({
  tasks = [],
  predictionsMap = {},
  onSelectView,
  onCreateTask,
  onToggleComplete,
  onReschedule,
  onCyclePriority,
  onUpdateTitle,
  onDeleteTask,
  onOpenExplanation,
  _acceptedSchedule = null,
  stickyNotesMap = {},
  onOpenStickyNotes,
  onExportCalendar,
}) {
  const todayStr = useMemo(() => getTodayDateString(), []);
  const todayComp = useMemo(() => parseDateComponents(todayStr) || { year: 2026, month: 9, day: 24 }, [todayStr]);

  // Calendar View State: 'month' | 'week' | 'day'
  const [calendarView, setCalendarView] = useState('month');

  // Currently viewed year and month (0-indexed)
  const [viewYear, setViewYear] = useState(todayComp.year);
  const [viewMonth, setViewMonth] = useState(todayComp.month);

  // Selected date (defaults to today)
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Filter state
  const [priorityFilter, setPriorityFilter] = useState('all'); // 'all' | 'critical' | 'high' | 'medium' | 'low'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'incomplete' | 'completed'

  // Modal / Drawer state for creating a task on a specific date
  const [quickAddModalDate, setQuickAddModalDate] = useState(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddPriority, setQuickAddPriority] = useState('medium');
  const [quickAddEffort, setQuickAddEffort] = useState('');

  // Unscheduled drawer toggle
  const [showUnscheduled, setShowUnscheduled] = useState(false);

  // Task detail popup / editing state
  const [selectedTask, setSelectedTask] = useState(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [rescheduleInput, setRescheduleInput] = useState('');

  // Group tasks by date
  const { dateMap, unscheduled, overdueCount, dueTodayCount } = useMemo(() => {
    return groupTasksForCalendar(tasks, todayStr);
  }, [tasks, todayStr]);

  // Filtered task helper
  const filterTask = useCallback((task) => {
    if (!task) return false;
    if (statusFilter === 'incomplete' && task.completed) return false;
    if (statusFilter === 'completed' && !task.completed) return false;

    if (priorityFilter !== 'all') {
      const p = String(task.priority || 'medium').toLowerCase();
      if (priorityFilter === 'critical' && p !== 'critical' && p !== 'urgent') return false;
      if (priorityFilter === 'high' && p !== 'high') return false;
      if (priorityFilter === 'medium' && p !== 'medium') return false;
      if (priorityFilter === 'low' && p !== 'low') return false;
    }
    return true;
  }, [statusFilter, priorityFilter]);

  // Tasks for the selected date
  const selectedDateTasks = useMemo(() => {
    const list = dateMap.get(selectedDate) || [];
    return list.filter(filterTask);
  }, [dateMap, selectedDate, filterTask]);

  // Navigation handlers
  const handlePrev = () => {
    if (calendarView === 'month') {
      if (viewMonth === 0) {
        setViewYear((y) => y - 1);
        setViewMonth(11);
      } else {
        setViewMonth((m) => m - 1);
      }
    } else if (calendarView === 'week') {
      const cur = dateStringToDate(selectedDate);
      cur.setDate(cur.getDate() - 7);
      const nextDateStr = formatDateComponents(cur.getFullYear(), cur.getMonth(), cur.getDate());
      setSelectedDate(nextDateStr);
      setViewYear(cur.getFullYear());
      setViewMonth(cur.getMonth());
    } else if (calendarView === 'day') {
      const cur = dateStringToDate(selectedDate);
      cur.setDate(cur.getDate() - 1);
      const nextDateStr = formatDateComponents(cur.getFullYear(), cur.getMonth(), cur.getDate());
      setSelectedDate(nextDateStr);
      setViewYear(cur.getFullYear());
      setViewMonth(cur.getMonth());
    }
  };

  const handleNext = () => {
    if (calendarView === 'month') {
      if (viewMonth === 11) {
        setViewYear((y) => y + 1);
        setViewMonth(0);
      } else {
        setViewMonth((m) => m + 1);
      }
    } else if (calendarView === 'week') {
      const cur = dateStringToDate(selectedDate);
      cur.setDate(cur.getDate() + 7);
      const nextDateStr = formatDateComponents(cur.getFullYear(), cur.getMonth(), cur.getDate());
      setSelectedDate(nextDateStr);
      setViewYear(cur.getFullYear());
      setViewMonth(cur.getMonth());
    } else if (calendarView === 'day') {
      const cur = dateStringToDate(selectedDate);
      cur.setDate(cur.getDate() + 1);
      const nextDateStr = formatDateComponents(cur.getFullYear(), cur.getMonth(), cur.getDate());
      setSelectedDate(nextDateStr);
      setViewYear(cur.getFullYear());
      setViewMonth(cur.getMonth());
    }
  };

  const handleToday = () => {
    setSelectedDate(todayStr);
    setViewYear(todayComp.year);
    setViewMonth(todayComp.month);
  };

  // Open Quick Add Dialog
  const handleOpenQuickAdd = (dateStr) => {
    setQuickAddModalDate(dateStr || selectedDate);
    setQuickAddTitle('');
    setQuickAddPriority('medium');
    setQuickAddEffort('');
  };

  const handleCloseQuickAdd = () => {
    setQuickAddModalDate(null);
  };

  const handleSubmitQuickAdd = async (e) => {
    e.preventDefault();
    if (!quickAddTitle.trim()) return;

    if (onCreateTask) {
      await onCreateTask({
        title: quickAddTitle.trim(),
        priority: quickAddPriority,
        dueDate: quickAddModalDate,
        estimatedEffort: quickAddEffort ? parseFloat(quickAddEffort) : null,
      });
    }
    handleCloseQuickAdd();
  };

  // Open Task Detail Popover
  const handleOpenTaskDetail = (task, e) => {
    if (e) e.stopPropagation();
    setSelectedTask(task);
    setIsEditingTitle(false);
    setEditTitleValue(task.title);
    setRescheduleInput(task.dueDate || '');
  };

  const handleSaveTitleEdit = () => {
    if (!selectedTask || !editTitleValue.trim()) return;
    if (onUpdateTitle && editTitleValue.trim() !== selectedTask.title) {
      onUpdateTitle(selectedTask.id, editTitleValue.trim());
      setSelectedTask((prev) => (prev ? { ...prev, title: editTitleValue.trim() } : null));
    }
    setIsEditingTitle(false);
  };

  const handleSaveReschedule = () => {
    if (!selectedTask) return;
    if (onReschedule && rescheduleInput !== selectedTask.dueDate) {
      onReschedule(selectedTask.id, rescheduleInput || null);
      setSelectedTask((prev) => (prev ? { ...prev, dueDate: rescheduleInput || null } : null));
    }
  };

  // Month grid cells
  const monthGrid = useMemo(() => {
    return getMonthGrid(viewYear, viewMonth, todayStr);
  }, [viewYear, viewMonth, todayStr]);

  // Week days
  const weekDays = useMemo(() => {
    return getWeekDays(selectedDate, todayStr);
  }, [selectedDate, todayStr]);

  const WEEK_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <section id="calendar-workspace" style={styles.section} aria-label="Task Calendar Workspace">
      <div style={styles.container}>
        {/* Consolidated Desktop Calendar Control Hub */}
        <div style={styles.controlHub} className="digital-card calendar-control-hub">
          {/* Top Row: Heading, Period Nav, View Switcher, Tasks shortcut */}
          <div style={styles.topBar} className="calendar-top-bar">
            <div style={styles.headingGroup} className="calendar-heading-group">
              <span style={styles.badge} className="calendar-badge">WORKSPACE CALENDAR</span>
              <div style={styles.titleRow} className="calendar-title-row">
                <h2 style={styles.mainHeading} id="calendar-view-heading">
                  {calendarView === 'month' && formatMonthYearHeading(viewYear, viewMonth)}
                  {calendarView === 'week' && `Week of ${formatMonthYearHeading(viewYear, viewMonth)}`}
                  {calendarView === 'day' && formatFullDateHeading(selectedDate)}
                </h2>
                {selectedDate === todayStr && (
                  <span style={styles.todayPill}>TODAY</span>
                )}
              </div>
              <p style={styles.subHeading} className="calendar-subheading">
                {overdueCount > 0 && (
                  <span style={styles.overdueNotice}>
                    <MotifIcon name="warning" size={13} color="#D9383A" style={{ marginRight: '4px' }} />
                    <span>{overdueCount} overdue task{overdueCount === 1 ? '' : 's'} · </span>
                  </span>
                )}
                {dueTodayCount > 0
                  ? `${dueTodayCount} task${dueTodayCount === 1 ? '' : 's'} scheduled for today.`
                  : 'Plan and track sprint deadlines across months, weeks, and days.'}
              </p>
            </div>

            {/* Right Toolbar Controls */}
            <div style={styles.toolbarControls} className="calendar-toolbar-controls">
              {/* Navigation buttons */}
              <div style={styles.navButtonGroup} className="calendar-nav-buttons" role="group" aria-label="Calendar navigation">
                <button
                  type="button"
                  id="calendar-today-btn"
                  onClick={handleToday}
                  style={styles.todayBtn}
                  title="Jump to today's date"
                  aria-label="Jump to today"
                >
                  Today
                </button>
                <button
                  type="button"
                  id="calendar-prev-btn"
                  onClick={handlePrev}
                  style={styles.navArrowBtn}
                  title="Previous period"
                  aria-label="Previous period"
                >
                  ‹
                </button>
                <button
                  type="button"
                  id="calendar-next-btn"
                  onClick={handleNext}
                  style={styles.navArrowBtn}
                  title="Next period"
                  aria-label="Next period"
                >
                  ›
                </button>
              </div>

              {/* View Switcher: Month / Week / Day */}
              <div style={styles.viewSwitcherGroup} className="calendar-view-switcher" role="group" aria-label="Calendar view switcher">
                <button
                  type="button"
                  id="calendar-view-month-btn"
                  onClick={() => setCalendarView('month')}
                  style={{
                    ...styles.viewBtn,
                    ...(calendarView === 'month' ? styles.activeViewBtn : {}),
                  }}
                  aria-pressed={calendarView === 'month'}
                >
                  Month
                </button>
                <button
                  type="button"
                  id="calendar-view-week-btn"
                  onClick={() => setCalendarView('week')}
                  style={{
                    ...styles.viewBtn,
                    ...(calendarView === 'week' ? styles.activeViewBtn : {}),
                  }}
                  aria-pressed={calendarView === 'week'}
                >
                  Week
                </button>
                <button
                  type="button"
                  id="calendar-view-day-btn"
                  onClick={() => setCalendarView('day')}
                  style={{
                    ...styles.viewBtn,
                    ...(calendarView === 'day' ? styles.activeViewBtn : {}),
                  }}
                  aria-pressed={calendarView === 'day'}
                >
                  Day
                </button>
              </div>

              {/* RFC 5545 iCalendar (.ics) Export Button */}
              {onExportCalendar && (
                <button
                  type="button"
                  id="calendar-export-btn"
                  data-action="export-calendar"
                  onClick={() => onExportCalendar()}
                  style={styles.exportBtn}
                  title="Export scheduled tasks to RFC 5545 .ics calendar"
                  aria-label="Export scheduled tasks to RFC 5545 .ics calendar"
                >
                  <MotifIcon name="calendar" size={14} style={{ marginRight: '6px' }} />
                  <span>Export .ics</span>
                </button>
              )}

              {/* Shortcut back to Tasks workspace */}
              {onSelectView && (
                <button
                  type="button"
                  id="calendar-back-to-tasks-btn"
                  onClick={() => onSelectView('tasks')}
                  style={styles.backTasksBtn}
                  title="Return to Tasks list"
                  aria-label="Return to Tasks list view"
                >
                  <MotifIcon name="arrow-left" size={13} style={{ marginRight: '6px' }} />
                  <span>Tasks List</span>
                </button>
              )}
            </div>
          </div>

          {/* Integrated Divider */}
          <div style={styles.hubDivider} className="calendar-hub-divider" />

          {/* Bottom Row: Filter Pills & Priority Legend */}
          <div style={styles.filterAndLegendRow} className="calendar-filter-and-legend-row">
            <div style={styles.filterPillsArea} className="calendar-filter-pills-area">
              {/* Priority Filters */}
              <div style={styles.filterGroup}>
                <span style={styles.filterLabel}>Priority:</span>
                {['all', 'critical', 'high', 'medium', 'low'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    id={`calendar-filter-priority-${p}`}
                    onClick={() => setPriorityFilter(p)}
                    style={{
                      ...styles.filterPill,
                      ...(priorityFilter === p ? styles.activeFilterPill : {}),
                    }}
                    aria-pressed={priorityFilter === p}
                  >
                    {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <div style={styles.filterGroup}>
                <span style={styles.filterLabel}>Status:</span>
                {['all', 'incomplete', 'completed'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    id={`calendar-filter-status-${s}`}
                    onClick={() => setStatusFilter(s)}
                    style={{
                      ...styles.filterPill,
                      ...(statusFilter === s ? styles.activeFilterPill : {}),
                    }}
                    aria-pressed={statusFilter === s}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {/* Unscheduled Drawer Toggle */}
              <button
                type="button"
                id="calendar-toggle-unscheduled-btn"
                onClick={() => setShowUnscheduled(!showUnscheduled)}
                style={{
                  ...styles.unscheduledBtn,
                  ...(showUnscheduled ? styles.activeUnscheduledBtn : {}),
                }}
                title="View tasks without scheduled deadlines"
                aria-expanded={showUnscheduled}
              >
                <MotifIcon name="task-sheet" size={13} style={{ marginRight: '6px' }} />
                <span>Unscheduled ({unscheduled.length})</span>
              </button>
            </div>

            {/* Priority Legend */}
            <div style={styles.legendBar} aria-label="Task priority color legend">
              <span style={styles.legendLabel}>Legend:</span>
              <span style={styles.legendItem}>
                <span style={{ ...styles.legendDot, backgroundColor: '#D9383A' }} />
                Critical / Urgent
              </span>
              <span style={styles.legendItem}>
                <span style={{ ...styles.legendDot, backgroundColor: '#E5A83B' }} />
                High
              </span>
              <span style={styles.legendItem}>
                <span style={{ ...styles.legendDot, backgroundColor: '#8E5FA8' }} />
                Medium
              </span>
              <span style={styles.legendItem}>
                <span style={{ ...styles.legendDot, backgroundColor: '#2D6A4F' }} />
                Low
              </span>
              <span style={styles.legendItem}>
                <span style={{ ...styles.legendDot, backgroundColor: '#706D73' }} />
                Completed <MotifIcon name="check" size={11} style={{ marginLeft: '3px' }} />
              </span>
            </div>
          </div>
        </div>


        {/* Unscheduled Tasks Panel (Collapsible) */}
        {showUnscheduled && (
          <div id="calendar-unscheduled-drawer" style={styles.unscheduledDrawer} className="digital-card">
            <div style={styles.unscheduledHeader}>
              <h4 style={styles.unscheduledTitle}>
                <MotifIcon name="task-sheet" size={16} style={{ marginRight: '6px' }} />
                <span>Tasks Without Deadlines ({unscheduled.length})</span>
              </h4>
              <p style={styles.unscheduledSub}>
                These tasks have no due date set. Assign a date or schedule them into your sprint calendar.
              </p>
            </div>
            {unscheduled.length === 0 ? (
              <p style={styles.noUnscheduledText}>
                <span>All tasks currently have scheduled deadlines!</span>
                <MotifIcon name="celebrate" size={15} style={{ marginLeft: '6px' }} />
              </p>
            ) : (
              <div style={styles.unscheduledGrid}>
                {unscheduled.map((task) => {
                  const palette = getPriorityPalette(task.priority, task.completed);
                  return (
                    <div
                      key={task.id}
                      style={{
                        ...styles.unscheduledCard,
                        borderLeft: `4px solid ${palette.border}`,
                      }}
                      onClick={() => handleOpenTaskDetail(task)}
                    >
                      <div style={styles.unscheduledCardTop}>
                        <span style={{ ...styles.priorityMiniBadge, color: palette.text, backgroundColor: palette.bg }}>
                          {palette.icon} {task.priority.toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onReschedule) onReschedule(task.id, selectedDate);
                          }}
                          style={styles.assignDateBtn}
                          title={`Schedule for selected date: ${selectedDate}`}
                          aria-label={`Schedule task "${task.title}" for ${selectedDate}`}
                        >
                          + Set to {selectedDate}
                        </button>
                      </div>
                      <span style={styles.unscheduledCardTitle}>{task.title}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 1: MONTH VIEW (Conventional 7-column calendar grid)           */}
        {/* ------------------------------------------------------------------ */}
        {calendarView === 'month' && (
          <div style={styles.monthViewWrapper} className="digital-card calendar-month-card" id="calendar-month-grid">
            {/* Day of Week Headers */}
            <div style={styles.gridHeaderRow} className="calendar-grid-header-row" role="row">
              {WEEK_DAY_LABELS.map((name) => (
                <div key={name} style={styles.gridHeaderCell} className="calendar-grid-header-cell" role="columnheader">
                  {name}
                </div>
              ))}
            </div>

            {/* Grid Days */}
            <div style={styles.gridBody} className="calendar-grid-body" role="grid">
              {monthGrid.map((cell) => {
                const cellTasks = (dateMap.get(cell.dateStr) || []).filter(filterTask);
                const isSelected = cell.dateStr === selectedDate;
                const isPast = cell.dateStr < todayStr && !cell.isToday;

                return (
                  <div
                    key={cell.dateStr}
                    data-date={cell.dateStr}
                    onClick={() => setSelectedDate(cell.dateStr)}
                    className="calendar-grid-cell"
                    style={{
                      ...styles.gridCell,
                      ...(cell.isCurrentMonth ? {} : styles.gridCellOutside),
                      ...(cell.isToday ? styles.gridCellToday : {}),
                      ...(isSelected ? styles.gridCellSelected : {}),
                    }}
                    role="gridcell"
                    aria-label={`${cell.dateStr}, ${cellTasks.length} task${cellTasks.length === 1 ? '' : 's'}`}
                  >
                    {/* Date Cell Header */}
                    <div style={styles.cellHeader} className="calendar-cell-header">
                      <span
                        className="calendar-cell-day-num"
                        style={{
                          ...styles.cellDayNumber,
                          ...(cell.isToday ? styles.cellDayTodayBadge : {}),
                          ...(isSelected && !cell.isToday ? styles.cellDaySelectedBadge : {}),
                          ...(isSelected && cell.isToday ? styles.cellDayTodaySelectedBadge : {}),
                          ...(!cell.isCurrentMonth ? styles.cellDayMuted : {}),
                        }}
                      >
                        {cell.day}
                      </span>

                      {cell.isCurrentMonth && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenQuickAdd(cell.dateStr);
                          }}
                          className="calendar-cell-add-btn"
                          style={styles.cellAddBtn}
                          title={`Add task for ${cell.dateStr}`}
                          aria-label={`Add task on ${cell.dateStr}`}
                        >
                          +
                        </button>
                      )}
                    </div>

                    {/* Task Chips inside cell (compact, priority-colored) */}
                    <div style={styles.cellTaskContainer} className="calendar-cell-task-container">
                      {cellTasks.slice(0, 3).map((task) => {
                        const palette = getPriorityPalette(task.priority, task.completed);
                        const isTaskOverdue = isPast && !task.completed;

                        return (
                          <div
                            key={task.id}
                            className="calendar-task-chip"
                            style={{
                              ...styles.taskChip,
                              backgroundColor: palette.chipBg,
                              borderLeft: `3px solid ${palette.border}`,
                              color: palette.text,
                              textDecoration: task.completed ? 'line-through' : 'none',
                              opacity: task.completed ? 0.75 : 1,
                            }}
                            onClick={(e) => handleOpenTaskDetail(task, e)}
                            title={`${task.title} (${task.priority} priority)${isTaskOverdue ? ' · OVERDUE' : ''}${task.completed ? ' · Completed' : ''}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`${task.title}, ${task.priority} priority${task.completed ? ', completed' : ''}`}
                          >
                            <span style={styles.taskChipIcon} className="calendar-task-chip-icon">
                              {task.completed ? (
                                <MotifIcon name="check" size={11} />
                              ) : isTaskOverdue ? (
                                <MotifIcon name="warning" size={11} color="#D9383A" />
                              ) : (
                                <MotifIcon name={palette.motifName || 'circle'} size={11} color={palette.border} />
                              )}
                            </span>
                            <span style={styles.taskChipTitle} className="calendar-task-chip-title">{task.title}</span>
                            {stickyNotesMap[task.id]?.length > 0 && (
                              <span className="calendar-task-chip-sticky">
                                <TaskStickyTab
                                  notes={stickyNotesMap[task.id]}
                                  taskTitle={task.title}
                                  onOpen={() => onOpenStickyNotes && onOpenStickyNotes(task)}
                                  compact={true}
                                  showAddPrompt={false}
                                />
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Overflow Indicator (+N more) */}
                      {cellTasks.length > 3 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(cell.dateStr);
                          }}
                          className="calendar-overflow-btn"
                          style={styles.overflowBtn}
                          aria-label={`View ${cellTasks.length - 3} more tasks for ${cell.dateStr}`}
                        >
                          +{cellTasks.length - 3} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 2: WEEK VIEW (7-day columns with all-day & timed sessions)    */}
        {/* ------------------------------------------------------------------ */}
        {calendarView === 'week' && (
          <div style={styles.weekViewWrapper} className="digital-card calendar-week-card" id="calendar-week-grid">
            <div style={styles.weekGridHeader} className="calendar-week-header-row">
              {weekDays.map((d) => {
                const isSelected = d.dateStr === selectedDate;
                return (
                  <div
                    key={d.dateStr}
                    style={{
                      ...styles.weekDayHeaderCell,
                      ...(d.isToday ? styles.weekDayHeaderToday : {}),
                      ...(isSelected ? styles.weekDayHeaderSelected : {}),
                    }}
                    onClick={() => setSelectedDate(d.dateStr)}
                  >
                    <span style={styles.weekDayName}>{d.dayName}</span>
                    <span
                      style={{
                        ...styles.weekDayNumber,
                        ...(d.isToday ? styles.weekDayNumberToday : {}),
                      }}
                    >
                      {d.day}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Week Columns Body */}
            <div style={styles.weekColumnsRow} className="calendar-week-columns-row">
              {weekDays.map((d) => {
                const dayTasks = (dateMap.get(d.dateStr) || []).filter(filterTask);
                const isSelected = d.dateStr === selectedDate;

                return (
                  <div
                    key={d.dateStr}
                    data-date={d.dateStr}
                    onClick={() => setSelectedDate(d.dateStr)}
                    style={{
                      ...styles.weekColumnCell,
                      ...(isSelected ? styles.weekColumnCellSelected : {}),
                    }}
                  >
                    <div style={styles.weekColumnTop}>
                      <span style={styles.weekTaskCountBadge}>
                        {dayTasks.length} task{dayTasks.length === 1 ? '' : 's'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenQuickAdd(d.dateStr);
                        }}
                        style={styles.cellAddBtn}
                        title={`Add task for ${d.dateStr}`}
                      >
                        +
                      </button>
                    </div>

                    <div style={styles.weekTaskList}>
                      {dayTasks.length === 0 ? (
                        <div style={styles.emptyDayPlaceholder}>No tasks</div>
                      ) : (
                        dayTasks.map((task) => {
                          const palette = getPriorityPalette(task.priority, task.completed);
                          return (
                            <div
                              key={task.id}
                              style={{
                                ...styles.weekTaskCard,
                                backgroundColor: palette.chipBg,
                                borderLeft: `3px solid ${palette.border}`,
                                color: palette.text,
                                textDecoration: task.completed ? 'line-through' : 'none',
                              }}
                              onClick={(e) => handleOpenTaskDetail(task, e)}
                            >
                              <div style={styles.weekTaskCardHeader}>
                                <span style={styles.taskChipIcon}>
                                  {task.completed ? (
                                    <MotifIcon name="check" size={11} />
                                  ) : (
                                    <MotifIcon name={palette.motifName || 'circle'} size={11} color={palette.border} />
                                  )}
                                </span>
                                <span style={styles.weekTaskPriorityLabel}>
                                  {task.priority.toUpperCase()}
                                </span>
                                {stickyNotesMap[task.id]?.length > 0 && (
                                  <TaskStickyTab
                                    notes={stickyNotesMap[task.id]}
                                    taskTitle={task.title}
                                    onOpen={() => onOpenStickyNotes && onOpenStickyNotes(task)}
                                    compact={true}
                                    showAddPrompt={false}
                                  />
                                )}
                              </div>
                              <span style={styles.weekTaskTitle}>{task.title}</span>
                              {task.estimatedEffort && (
                                <span style={styles.weekTaskEffort}>
                                  <MotifIcon name="clock" size={11} style={{ marginRight: '3px' }} />
                                  <span>{task.estimatedEffort}h</span>
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 3: DAY VIEW (Focused single-date layout)                       */}
        {/* ------------------------------------------------------------------ */}
        {calendarView === 'day' && (
          <div style={styles.dayViewWrapper} className="digital-card calendar-day-card" id="calendar-day-grid">
            <div style={styles.dayViewHeader} className="calendar-day-header">
              <div>
                <h3 style={styles.dayViewDateTitle}>{formatFullDateHeading(selectedDate)}</h3>
                <span style={styles.dayViewMeta}>
                  {selectedDate === todayStr ? 'Today’s Agenda · ' : ''}
                  {selectedDateTasks.length} task{selectedDateTasks.length === 1 ? '' : 's'} scheduled
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleOpenQuickAdd(selectedDate)}
                style={styles.primaryAddBtn}
                id="calendar-day-add-task-btn"
              >
                + Add Task for This Date
              </button>
            </div>

            {selectedDateTasks.length === 0 ? (
              <div style={styles.dayEmptyState}>
                <span style={styles.dayEmptyIcon}>
                  <MotifIcon name="calendar" size={32} color="#8E5FA8" />
                </span>
                <h4 style={styles.dayEmptyTitle}>No tasks scheduled for this date</h4>
                <p style={styles.dayEmptySub}>
                  Keep your sprint on track by assigning commitments or click below to create a new task.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenQuickAdd(selectedDate)}
                  style={styles.primaryAddBtn}
                >
                  + Create Task on {selectedDate}
                </button>
              </div>
            ) : (
              <div style={styles.dayTaskList}>
                {selectedDateTasks.map((task) => {
                  const palette = getPriorityPalette(task.priority, task.completed);
                  const pred = predictionsMap[task.id];

                  return (
                    <div
                      key={task.id}
                      style={{
                        ...styles.dayTaskCard,
                        borderLeft: `5px solid ${palette.border}`,
                      }}
                      onClick={() => handleOpenTaskDetail(task)}
                    >
                      <div style={styles.dayTaskMainRow}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleComplete) onToggleComplete(task.id);
                          }}
                          style={{
                            ...styles.dayTaskCheckbox,
                            backgroundColor: task.completed ? '#2D6A4F' : '#FFFFFF',
                            borderColor: task.completed ? '#2D6A4F' : 'rgba(61, 38, 69, 0.3)',
                          }}
                          aria-label={`Mark "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`}
                        >
                          {task.completed && <MotifIcon name="check" size={12} color="#FFF" strokeWidth={3} />}
                        </button>

                        <div style={styles.dayTaskContent}>
                          <div style={styles.dayTaskTopMeta}>
                            <span style={{ ...styles.dayTaskPriorityBadge, color: palette.text, backgroundColor: palette.bg }}>
                              <MotifIcon name={palette.motifName || 'circle'} size={11} style={{ marginRight: '4px' }} />
                              <span>{task.priority.toUpperCase()} PRIORITY</span>
                            </span>
                            <span style={styles.dayTaskCategory}>{task.category || 'General'}</span>
                            {task.estimatedEffort && (
                              <span style={styles.dayTaskEffort}>
                                <MotifIcon name="clock" size={11} style={{ marginRight: '4px' }} />
                                <span>{task.estimatedEffort}h effort</span>
                              </span>
                            )}
                            <TaskStickyTab
                              notes={stickyNotesMap[task.id] || []}
                              taskTitle={task.title}
                              onOpen={() => onOpenStickyNotes && onOpenStickyNotes(task)}
                              compact={true}
                            />
                          </div>
                          <h4
                            style={{
                              ...styles.dayTaskTitle,
                              textDecoration: task.completed ? 'line-through' : 'none',
                              color: task.completed ? '#706D73' : '#201E23',
                            }}
                          >
                            {task.title}
                          </h4>
                          {task.description && (
                            <p style={styles.dayTaskDescription}>{task.description}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={styles.dayTaskActions} onClick={(e) => e.stopPropagation()}>
                          {onCyclePriority && (
                            <button
                              type="button"
                              onClick={() => onCyclePriority(task.id)}
                              style={styles.smallActionBtn}
                              title="Cycle task priority"
                            >
                              Priority: {task.priority}
                            </button>
                          )}
                          {onOpenExplanation && pred && (
                            <button
                              type="button"
                              onClick={() => onOpenExplanation(task, pred)}
                              style={styles.smallActionBtn}
                              title="View ML risk prediction"
                            >
                              <span>Details</span>
                              <MotifIcon name="arrow-right" size={11} style={{ marginLeft: '3px' }} />
                            </button>
                          )}
                          {onDeleteTask && (
                            <button
                              type="button"
                              onClick={() => onDeleteTask(task.id)}
                              style={styles.deleteActionBtn}
                              title="Delete task"
                              aria-label={`Delete "${task.title}"`}
                            >
                              <MotifIcon name="close" size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* SELECTED DATE AGENDA STRIP (Always visible under Month/Week grid)   */}
        {/* ------------------------------------------------------------------ */}
        {calendarView !== 'day' && (
          <div style={styles.agendaStrip} className="digital-card" id="calendar-selected-agenda">
            <div style={styles.agendaHeader}>
              <div>
                <span style={styles.agendaBadge}>SELECTED DATE AGENDA</span>
                <h3 style={styles.agendaTitle}>{formatFullDateHeading(selectedDate)}</h3>
              </div>
              <div style={styles.agendaHeaderActions}>
                <button
                  type="button"
                  onClick={() => handleOpenQuickAdd(selectedDate)}
                  style={styles.primaryAddBtn}
                  id="calendar-agenda-add-btn"
                >
                  + Add Task for {selectedDate}
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView('day')}
                  style={styles.viewDayFocusBtn}
                >
                  <span>Focus Day View</span>
                  <MotifIcon name="arrow-right" size={12} style={{ marginLeft: '4px' }} />
                </button>
              </div>
            </div>

            {selectedDateTasks.length === 0 ? (
              <p style={styles.agendaEmptyNotice}>
                No tasks due on this date. Click <strong>"+ Add Task"</strong> to schedule one.
              </p>
            ) : (
              <div style={styles.agendaCardsList}>
                {selectedDateTasks.map((task) => {
                  const palette = getPriorityPalette(task.priority, task.completed);
                  return (
                    <div
                      key={task.id}
                      style={{
                        ...styles.agendaTaskItem,
                        borderLeft: `4px solid ${palette.border}`,
                      }}
                      onClick={() => handleOpenTaskDetail(task)}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onToggleComplete) onToggleComplete(task.id);
                        }}
                        style={{
                          ...styles.miniCheckbox,
                          backgroundColor: task.completed ? '#2D6A4F' : '#FFF',
                          borderColor: task.completed ? '#2D6A4F' : 'rgba(61, 38, 69, 0.3)',
                        }}
                        aria-label={`Toggle completion for "${task.title}"`}
                      >
                        {task.completed && <MotifIcon name="check" size={10} color="#FFF" strokeWidth={3} />}
                      </button>
                      <div style={styles.agendaTaskText}>
                        <span
                          style={{
                            ...styles.agendaTaskTitle,
                            textDecoration: task.completed ? 'line-through' : 'none',
                          }}
                        >
                          {task.title}
                        </span>
                        <div style={styles.agendaTaskMetaRow}>
                          <span style={{ ...styles.priorityMiniBadge, color: palette.text, backgroundColor: palette.bg }}>
                            <MotifIcon name={palette.motifName || 'circle'} size={11} style={{ marginRight: '4px' }} />
                            <span>{task.priority.toUpperCase()}</span>
                          </span>
                          {task.estimatedEffort && (
                            <span style={styles.agendaEffortBadge}>
                              <MotifIcon name="clock" size={11} style={{ marginRight: '3px' }} />
                              <span>{task.estimatedEffort}h</span>
                            </span>
                          )}
                          {stickyNotesMap[task.id]?.length > 0 && (
                            <TaskStickyTab
                              notes={stickyNotesMap[task.id]}
                              taskTitle={task.title}
                              onOpen={() => onOpenStickyNotes && onOpenStickyNotes(task)}
                              compact={true}
                              showAddPrompt={false}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* QUICK ADD MODAL FOR SPECIFIC CALENDAR DATE                         */}
        {/* ------------------------------------------------------------------ */}
        {quickAddModalDate && (
          <div style={styles.modalOverlay} onClick={handleCloseQuickAdd} role="dialog" aria-modal="true" aria-labelledby="quick-add-modal-title">
            <div style={styles.modalCard} onClick={(e) => e.stopPropagation()} className="digital-card">
              <div style={styles.modalHeader}>
                <h3 id="quick-add-modal-title" style={styles.modalTitle}>
                  Add Task for {quickAddModalDate}
                </h3>
                <button type="button" onClick={handleCloseQuickAdd} style={styles.modalCloseBtn} aria-label="Close dialog">
                  <MotifIcon name="close" size={13} />
                </button>
              </div>

              <form onSubmit={handleSubmitQuickAdd} style={styles.modalForm}>
                <label style={styles.formLabel}>
                  Task Title:
                  <input
                    type="text"
                    id="calendar-quick-add-title-input"
                    value={quickAddTitle}
                    onChange={(e) => setQuickAddTitle(e.target.value)}
                    placeholder="e.g. Audit infrastructure reliability..."
                    style={styles.formInput}
                    autoFocus
                    required
                  />
                </label>

                <div style={styles.formRow}>
                  <label style={styles.formLabelHalf}>
                    Priority:
                    <select
                      id="calendar-quick-add-priority-select"
                      value={quickAddPriority}
                      onChange={(e) => setQuickAddPriority(e.target.value)}
                      style={styles.formSelect}
                    >
                      <option value="critical">Critical / Urgent</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </label>

                  <label style={styles.formLabelHalf}>
                    Estimated Effort (hrs):
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="100"
                      value={quickAddEffort}
                      onChange={(e) => setQuickAddEffort(e.target.value)}
                      placeholder="e.g. 2.0"
                      style={styles.formInput}
                    />
                  </label>
                </div>

                <div style={styles.modalActions}>
                  <button type="button" onClick={handleCloseQuickAdd} style={styles.cancelModalBtn}>
                    Cancel
                  </button>
                  <button type="submit" style={styles.submitModalBtn} id="calendar-quick-add-submit-btn">
                    Create Task
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TASK DETAIL / EDIT MODAL                                           */}
        {/* ------------------------------------------------------------------ */}
        {selectedTask && (
          <div style={styles.modalOverlay} onClick={() => setSelectedTask(null)} role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
            <div style={styles.detailModalCard} onClick={(e) => e.stopPropagation()} className="digital-card">
              <div style={styles.modalHeader}>
                <div style={styles.detailHeaderMeta}>
                  <span style={styles.badge}>{selectedTask.category ? selectedTask.category.toUpperCase() : 'GENERAL'}</span>
                  <span
                    style={{
                      ...styles.priorityMiniBadge,
                      color: getPriorityPalette(selectedTask.priority).text,
                      backgroundColor: getPriorityPalette(selectedTask.priority).bg,
                    }}
                  >
                    <MotifIcon name={getPriorityPalette(selectedTask.priority).motifName || 'circle'} size={12} style={{ marginRight: '4px' }} />
                    <span>{selectedTask.priority.toUpperCase()} PRIORITY</span>
                  </span>
                  <TaskStickyTab
                    notes={stickyNotesMap[selectedTask.id] || []}
                    taskTitle={selectedTask.title}
                    onOpen={() => {
                      const t = selectedTask;
                      setSelectedTask(null);
                      if (onOpenStickyNotes) onOpenStickyNotes(t);
                    }}
                  />
                </div>
                <button type="button" onClick={() => setSelectedTask(null)} style={styles.modalCloseBtn} aria-label="Close details">
                  <MotifIcon name="close" size={13} />
                </button>
              </div>

              {/* Title Editor */}
              {isEditingTitle ? (
                <div style={styles.titleEditRow}>
                  <input
                    type="text"
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    style={styles.titleInput}
                    autoFocus
                  />
                  <button type="button" onClick={handleSaveTitleEdit} style={styles.saveTitleBtn}>
                    Save
                  </button>
                  <button type="button" onClick={() => setIsEditingTitle(false)} style={styles.cancelTitleBtn}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={styles.titleViewRow}>
                  <h3 id="task-detail-title" style={styles.detailTitle}>{selectedTask.title}</h3>
                  <button type="button" onClick={() => setIsEditingTitle(true)} style={styles.editTitleTrigger} title="Edit title">
                    <MotifIcon name="pencil" size={12} />
                  </button>
                </div>
              )}

              {/* Reschedule Date Control */}
              <div style={styles.detailFieldGroup}>
                <label style={styles.detailFieldLabel}>Deadline Date:</label>
                <div style={styles.rescheduleRow}>
                  <input
                    type="date"
                    value={rescheduleInput}
                    onChange={(e) => setRescheduleInput(e.target.value)}
                    style={styles.datePickerInput}
                  />
                  <button type="button" onClick={handleSaveReschedule} style={styles.rescheduleSaveBtn}>
                    Update Deadline
                  </button>
                </div>
              </div>

              {/* Action Buttons: Priority Cycle, Toggle Complete, Delete */}
              <div style={styles.detailActionButtons}>
                {onCyclePriority && (
                  <button
                    type="button"
                    onClick={() => {
                      onCyclePriority(selectedTask.id);
                      const nextMap = { high: 'medium', medium: 'low', low: 'high' };
                      setSelectedTask((prev) => (prev ? { ...prev, priority: nextMap[prev.priority] || 'medium' } : null));
                    }}
                    style={styles.cyclePrioBtn}
                  >
                    Cycle Priority
                  </button>
                )}

                {onToggleComplete && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleComplete(selectedTask.id);
                      setSelectedTask((prev) => (prev ? { ...prev, completed: !prev.completed } : null));
                    }}
                    style={{
                      ...styles.completeBtn,
                      backgroundColor: selectedTask.completed ? 'rgba(45, 106, 79, 0.15)' : '#2D6A4F',
                      color: selectedTask.completed ? '#2D6A4F' : '#FFFFFF',
                    }}
                  >
                    {selectedTask.completed ? (
                      <>
                        <span>Mark as Incomplete</span>
                        <MotifIcon name="history" size={13} style={{ marginLeft: '6px' }} />
                      </>
                    ) : (
                      <>
                        <span>Mark Complete</span>
                        <MotifIcon name="check" size={13} style={{ marginLeft: '6px' }} />
                      </>
                    )}
                  </button>
                )}

                {onDeleteTask && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTask(selectedTask.id);
                      setSelectedTask(null);
                    }}
                    style={styles.detailDeleteBtn}
                  >
                    Delete Task
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const styles = {
  section: {
    width: '100%',
    padding: '12px 0 32px 0',
  },
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  controlHub: {
    padding: '20px 24px',
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(61, 38, 69, 0.09)',
    boxShadow: '0 4px 18px rgba(61, 38, 69, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
  },
  hubDivider: {
    height: '1px',
    backgroundColor: 'rgba(61, 38, 69, 0.08)',
    margin: '2px 0',
  },
  filterAndLegendRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
  },
  filterPillsArea: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px',
  },
  headingGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  badge: {
    fontSize: '11px',
    fontWeight: '800',
    color: '#C85A32',
    letterSpacing: '0.08em',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  mainHeading: {
    fontFamily: "var(--font-display, 'Eagle Lake', cursive, Georgia, serif)",
    fontSize: 'clamp(22px, 2.8vw, 32px)',
    fontWeight: '400',
    color: '#201E23',
    margin: 0,
    letterSpacing: '0.01em',
  },
  todayPill: {
    fontSize: '10px',
    fontWeight: '800',
    backgroundColor: '#FFF8E7',
    color: '#B45309',
    border: '1px solid #E5A83B',
    padding: '3px 8px',
    borderRadius: '12px',
    letterSpacing: '0.05em',
  },
  subHeading: {
    fontSize: '13px',
    color: '#706D73',
    margin: 0,
    lineHeight: '1.4',
  },
  overdueNotice: {
    color: '#D9383A',
    fontWeight: '700',
  },
  toolbarControls: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
  },
  navButtonGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '12px',
    backgroundColor: 'rgba(61, 38, 69, 0.04)',
    padding: '3px',
    border: '1px solid rgba(61, 38, 69, 0.08)',
  },
  todayBtn: {
    background: '#FFFFFF',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#201E23',
    cursor: 'pointer',
    boxShadow: '0 2px 6px rgba(61, 38, 69, 0.06)',
  },
  navArrowBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '16px',
    fontWeight: '800',
    padding: '4px 10px',
    color: '#3D2645',
    cursor: 'pointer',
  },
  viewSwitcherGroup: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '12px',
    backgroundColor: 'rgba(61, 38, 69, 0.04)',
    padding: '3px',
    border: '1px solid rgba(61, 38, 69, 0.08)',
  },
  viewBtn: {
    background: 'transparent',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#706D73',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  activeViewBtn: {
    background: '#3D2645',
    color: '#FFFFFF',
    boxShadow: '0 2px 8px rgba(61, 38, 69, 0.18)',
  },
  backTasksBtn: {
    background: 'rgba(200, 90, 50, 0.08)',
    border: '1px solid rgba(200, 90, 50, 0.25)',
    borderRadius: '10px',
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#C85A32',
    cursor: 'pointer',
  },
  exportBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: '#FFFFFF',
    border: '1px solid rgba(61, 38, 69, 0.2)',
    borderRadius: '10px',
    padding: '7px 12px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#3D2645',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
    padding: '12px 18px',
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    border: '1px solid rgba(61, 38, 69, 0.08)',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  filterLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#706D73',
    marginRight: '2px',
  },
  filterPill: {
    background: 'rgba(61, 38, 69, 0.04)',
    border: '1px solid rgba(61, 38, 69, 0.08)',
    borderRadius: '8px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#706D73',
    cursor: 'pointer',
  },
  activeFilterPill: {
    background: '#FFF8E7',
    color: '#B45309',
    borderColor: '#E5A83B',
    fontWeight: '700',
  },
  unscheduledBtn: {
    background: 'rgba(61, 38, 69, 0.05)',
    border: '1px solid rgba(61, 38, 69, 0.12)',
    borderRadius: '8px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#3D2645',
    cursor: 'pointer',
  },
  activeUnscheduledBtn: {
    background: '#F5EEF8',
    borderColor: '#8E5FA8',
    color: '#3D2645',
  },
  legendBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    flexWrap: 'wrap',
    fontSize: '12px',
    color: '#706D73',
    padding: '0 4px',
  },
  legendLabel: {
    fontWeight: '700',
    color: '#201E23',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontWeight: '600',
  },
  legendDot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  unscheduledDrawer: {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    padding: '20px',
    border: '1px solid rgba(61, 38, 69, 0.10)',
    boxShadow: '0 6px 20px rgba(61, 38, 69, 0.05)',
  },
  unscheduledHeader: {
    marginBottom: '12px',
  },
  unscheduledTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, Georgia, serif)",
    fontSize: '16px',
    fontWeight: '400',
    color: '#201E23',
    margin: 0,
  },
  unscheduledSub: {
    fontSize: '13px',
    color: '#706D73',
    margin: '4px 0 0 0',
  },
  noUnscheduledText: {
    fontSize: '13px',
    color: '#2D6A4F',
    fontWeight: '600',
  },
  unscheduledGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '10px',
  },
  unscheduledCard: {
    backgroundColor: 'rgba(61, 38, 69, 0.03)',
    borderRadius: '10px',
    padding: '10px 14px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    border: '1px solid rgba(61, 38, 69, 0.06)',
  },
  unscheduledCardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  unscheduledCardTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#201E23',
  },
  assignDateBtn: {
    background: '#FFF8E7',
    border: '1px solid #E5A83B',
    borderRadius: '6px',
    padding: '2px 6px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#B45309',
    cursor: 'pointer',
  },
  priorityMiniBadge: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.04em',
  },
  monthViewWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(61, 38, 69, 0.09)',
    boxShadow: '0 4px 20px rgba(61, 38, 69, 0.04)',
    overflow: 'hidden',
  },
  gridHeaderRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    backgroundColor: 'rgba(61, 38, 69, 0.03)',
    borderBottom: '1px solid rgba(61, 38, 69, 0.08)',
  },
  gridHeaderCell: {
    padding: '12px 6px',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '800',
    color: '#706D73',
    letterSpacing: '0.04em',
  },
  gridBody: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    backgroundColor: 'rgba(61, 38, 69, 0.06)',
    gap: '1px',
  },
  gridCell: {
    backgroundColor: '#FFFFFF',
    minHeight: '122px',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  gridCellOutside: {
    backgroundColor: '#FCFAF7',
  },
  gridCellSelected: {
    outline: '2px solid #C85A32',
    outlineOffset: '-2px',
    backgroundColor: '#FFFDF9',
  },
  gridCellToday: {
    backgroundColor: '#FFFDF6',
  },
  cellHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cellDayNumber: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#201E23',
    width: '26px',
    height: '26px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  },
  cellDayTodayBadge: {
    backgroundColor: '#E5A83B',
    color: '#FFFFFF',
    fontWeight: '800',
    boxShadow: '0 2px 6px rgba(229, 168, 59, 0.35)',
  },
  cellDaySelectedBadge: {
    backgroundColor: '#C85A32',
    color: '#FFFFFF',
    fontWeight: '800',
    boxShadow: '0 2px 6px rgba(200, 90, 50, 0.35)',
  },
  cellDayTodaySelectedBadge: {
    backgroundColor: '#C85A32',
    color: '#FFFFFF',
    fontWeight: '800',
    boxShadow: '0 0 0 2px #E5A83B, 0 2px 8px rgba(200, 90, 50, 0.4)',
  },
  cellDayMuted: {
    color: '#A09D98',
  },
  cellAddBtn: {
    background: 'transparent',
    border: 'none',
    color: '#A09D98',
    fontSize: '14px',
    fontWeight: '800',
    cursor: 'pointer',
    padding: '0 4px',
    borderRadius: '4px',
  },
  cellTaskContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flexGrow: 1,
  },
  taskChip: {
    borderRadius: '5px',
    padding: '3px 6px',
    fontSize: '11px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(61, 38, 69, 0.04)',
  },
  taskChipIcon: {
    fontSize: '10px',
    flexShrink: 0,
  },
  taskChipTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  overflowBtn: {
    background: 'rgba(61, 38, 69, 0.06)',
    border: 'none',
    borderRadius: '4px',
    padding: '2px 5px',
    fontSize: '10px',
    fontWeight: '700',
    color: '#706D73',
    cursor: 'pointer',
    textAlign: 'left',
  },
  weekViewWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    border: '1px solid rgba(61, 38, 69, 0.09)',
    boxShadow: '0 4px 20px rgba(61, 38, 69, 0.04)',
    overflow: 'hidden',
  },
  weekGridHeader: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    backgroundColor: 'rgba(61, 38, 69, 0.03)',
    borderBottom: '1px solid rgba(61, 38, 69, 0.08)',
  },
  weekDayHeaderCell: {
    padding: '12px 6px',
    textAlign: 'center',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  weekDayHeaderToday: {
    backgroundColor: 'rgba(229, 168, 59, 0.12)',
  },
  weekDayHeaderSelected: {
    backgroundColor: 'rgba(200, 90, 50, 0.08)',
  },
  weekDayName: {
    fontSize: '12px',
    fontWeight: '800',
    color: '#706D73',
  },
  weekDayNumber: {
    fontSize: '16px',
    fontWeight: '800',
    color: '#201E23',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
  },
  weekDayNumberToday: {
    backgroundColor: '#E5A83B',
    color: '#FFFFFF',
  },
  weekColumnsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '1px',
    backgroundColor: 'rgba(61, 38, 69, 0.06)',
    minHeight: '260px',
  },
  weekColumnCell: {
    backgroundColor: '#FFFFFF',
    padding: '10px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    cursor: 'pointer',
  },
  weekColumnCellSelected: {
    backgroundColor: '#FFFDF9',
    outline: '2px solid #C85A32',
    outlineOffset: '-2px',
  },
  weekColumnTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekTaskCountBadge: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#706D73',
  },
  weekTaskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  weekTaskCard: {
    borderRadius: '8px',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(61, 38, 69, 0.04)',
  },
  weekTaskCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  weekTaskPriorityLabel: {
    fontSize: '9px',
    fontWeight: '800',
  },
  weekTaskTitle: {
    fontSize: '12px',
    fontWeight: '700',
    lineHeight: '1.3',
  },
  weekTaskEffort: {
    fontSize: '10px',
    color: '#706D73',
  },
  emptyDayPlaceholder: {
    fontSize: '11px',
    color: '#A09D98',
    textAlign: 'center',
    padding: '16px 0',
  },
  dayViewWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    padding: '24px',
    border: '1px solid rgba(61, 38, 69, 0.09)',
    boxShadow: '0 4px 20px rgba(61, 38, 69, 0.04)',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  dayViewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    borderBottom: '1px solid rgba(61, 38, 69, 0.08)',
    paddingBottom: '16px',
  },
  dayViewDateTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, Georgia, serif)",
    fontSize: '22px',
    fontWeight: '400',
    color: '#201E23',
    margin: 0,
  },
  dayViewMeta: {
    fontSize: '13px',
    color: '#706D73',
    fontWeight: '600',
  },
  dayEmptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 16px',
    textAlign: 'center',
    gap: '10px',
  },
  dayEmptyIcon: {
    fontSize: '36px',
  },
  dayEmptyTitle: {
    fontSize: '18px',
    fontWeight: '800',
    color: '#201E23',
    margin: 0,
  },
  dayEmptySub: {
    fontSize: '14px',
    color: '#706D73',
    maxWidth: '440px',
    margin: 0,
  },
  dayTaskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  dayTaskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    padding: '16px 18px',
    border: '1px solid rgba(61, 38, 69, 0.09)',
    boxShadow: '0 2px 10px rgba(61, 38, 69, 0.03)',
    cursor: 'pointer',
  },
  dayTaskMainRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '14px',
  },
  dayTaskCheckbox: {
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    border: '1.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    marginTop: '2px',
    flexShrink: 0,
  },
  dayTaskContent: {
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  dayTaskTopMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  dayTaskPriorityBadge: {
    fontSize: '10px',
    fontWeight: '800',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  dayTaskCategory: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#706D73',
  },
  dayTaskEffort: {
    fontSize: '11px',
    color: '#706D73',
  },
  dayTaskTitle: {
    fontSize: '15px',
    fontWeight: '700',
    margin: 0,
  },
  dayTaskDescription: {
    fontSize: '13px',
    color: '#706D73',
    margin: 0,
  },
  dayTaskActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  smallActionBtn: {
    background: 'rgba(61, 38, 69, 0.04)',
    border: '1px solid rgba(61, 38, 69, 0.09)',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: '700',
    color: '#3D2645',
    cursor: 'pointer',
  },
  deleteActionBtn: {
    background: 'transparent',
    border: 'none',
    color: '#A09D98',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '4px',
  },
  primaryAddBtn: {
    backgroundColor: '#C85A32',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '10px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(200, 90, 50, 0.25)',
  },
  agendaStrip: {
    backgroundColor: '#FFFFFF',
    borderRadius: '18px',
    padding: '20px 24px',
    border: '1px solid rgba(61, 38, 69, 0.09)',
    boxShadow: '0 4px 16px rgba(61, 38, 69, 0.03)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  agendaHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
  },
  agendaBadge: {
    fontFamily: "var(--font-subheading, 'Unica One', cursive, sans-serif)",
    fontSize: '11px',
    fontWeight: '700',
    color: '#C85A32',
    letterSpacing: '0.08em',
  },
  agendaTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, Georgia, serif)",
    fontSize: '18px',
    fontWeight: '400',
    color: '#201E23',
    margin: '2px 0 0 0',
  },
  agendaHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  viewDayFocusBtn: {
    background: 'rgba(61, 38, 69, 0.05)',
    border: '1px solid rgba(61, 38, 69, 0.12)',
    borderRadius: '10px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#3D2645',
    cursor: 'pointer',
  },
  agendaEmptyNotice: {
    fontSize: '13px',
    color: '#706D73',
    margin: 0,
  },
  agendaCardsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '10px',
  },
  agendaTaskItem: {
    backgroundColor: '#FAF8F5',
    borderRadius: '10px',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    border: '1px solid rgba(61, 38, 69, 0.06)',
  },
  miniCheckbox: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    border: '1.5px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  },
  agendaTaskText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflow: 'hidden',
  },
  agendaTaskTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#201E23',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  agendaTaskMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  agendaEffortBadge: {
    fontSize: '10px',
    color: '#706D73',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(32, 30, 35, 0.45)',
    backdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: '16px',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    padding: '28px',
    maxWidth: '480px',
    width: '100%',
    boxShadow: '0 12px 40px rgba(61, 38, 69, 0.16)',
    border: '1px solid rgba(61, 38, 69, 0.12)',
  },
  detailModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: '20px',
    padding: '28px',
    maxWidth: '520px',
    width: '100%',
    boxShadow: '0 12px 40px rgba(61, 38, 69, 0.16)',
    border: '1px solid rgba(61, 38, 69, 0.12)',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  modalTitle: {
    fontFamily: "var(--font-heading, 'Eagle Lake', cursive, Georgia, serif)",
    fontSize: '18px',
    fontWeight: '400',
    color: '#201E23',
    margin: 0,
  },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    fontSize: '18px',
    color: '#706D73',
    cursor: 'pointer',
    padding: '4px',
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#201E23',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formRow: {
    display: 'flex',
    gap: '12px',
  },
  formLabelHalf: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#201E23',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
  },
  formInput: {
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid rgba(61, 38, 69, 0.16)',
    fontSize: '14px',
    fontFamily: 'inherit',
    backgroundColor: '#FCFAF7',
    color: '#201E23',
    outline: 'none',
  },
  formSelect: {
    padding: '10px 12px',
    borderRadius: '10px',
    border: '1px solid rgba(61, 38, 69, 0.16)',
    fontSize: '14px',
    fontFamily: 'inherit',
    backgroundColor: '#FCFAF7',
    color: '#201E23',
    outline: 'none',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '10px',
  },
  cancelModalBtn: {
    background: 'transparent',
    border: '1px solid rgba(61, 38, 69, 0.14)',
    borderRadius: '10px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#706D73',
    cursor: 'pointer',
  },
  submitModalBtn: {
    backgroundColor: '#C85A32',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '10px',
    padding: '8px 20px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(200, 90, 50, 0.25)',
  },
  detailHeaderMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  titleViewRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  detailTitle: {
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    fontSize: '19px',
    fontWeight: '700',
    color: '#201E23',
    margin: 0,
    lineHeight: '1.3',
  },
  editTitleTrigger: {
    background: 'transparent',
    border: 'none',
    color: '#C85A32',
    fontSize: '16px',
    cursor: 'pointer',
  },
  titleEditRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  titleInput: {
    flexGrow: 1,
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1.5px solid #C85A32',
    fontSize: '16px',
    fontFamily: 'inherit',
  },
  saveTitleBtn: {
    backgroundColor: '#2D6A4F',
    color: '#FFF',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  cancelTitleBtn: {
    background: 'transparent',
    border: '1px solid rgba(61, 38, 69, 0.15)',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '12px',
    color: '#706D73',
    cursor: 'pointer',
  },
  detailFieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  detailFieldLabel: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#706D73',
  },
  rescheduleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  datePickerInput: {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(61, 38, 69, 0.16)',
    fontSize: '13px',
    fontFamily: 'inherit',
  },
  rescheduleSaveBtn: {
    backgroundColor: '#3D2645',
    color: '#FFF',
    border: 'none',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  detailActionButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
    borderTop: '1px solid rgba(61, 38, 69, 0.08)',
    paddingTop: '14px',
  },
  cyclePrioBtn: {
    background: '#FFF8E7',
    border: '1px solid #E5A83B',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#B45309',
    cursor: 'pointer',
  },
  completeBtn: {
    border: 'none',
    borderRadius: '8px',
    padding: '8px 16px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  detailDeleteBtn: {
    background: 'rgba(217, 56, 58, 0.08)',
    border: '1px solid rgba(217, 56, 58, 0.25)',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#D9383A',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
};
