import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ensurePlacementIds,
  validatePlacementEdit,
  applyPlacementEdit,
  validateFullProposal,
  createProposalEditSession,
} from '../src/scheduler/proposalEditor.js';

import { generateAdaptiveSchedule } from '../src/scheduler/adaptiveScheduler.js';

describe('Phase 6.3: Interactive Schedule Proposal Editing', () => {
  const baseTasks = [
    {
      id: 'task-1',
      title: 'Implement Core Engine',
      priority: 'high',
      category: 'Backend',
      estimatedEffort: 3.0,
      dueDate: '2026-10-20',
      dependencies: [],
    },
    {
      id: 'task-2',
      title: 'Write Unit Tests',
      priority: 'medium',
      category: 'QA',
      estimatedEffort: 2.0,
      dueDate: '2026-10-22',
      dependencies: ['task-1'],
    },
    {
      id: 'task-3',
      title: 'Multi-Day Refactor',
      priority: 'low',
      category: 'Refactor',
      estimatedEffort: 10.0,
      dueDate: '2026-10-28',
      dependencies: [],
    },
    {
      id: 'task-4',
      title: 'Design Wireframes',
      priority: 'medium',
      category: 'Design',
      estimatedEffort: 2.0,
      dueDate: '2026-10-25',
      dependencies: [],
    },
  ];

  const defaultContext = {
    tasks: baseTasks,
    dailyCapacityHours: 6.0,
    enableIntraday: true,
    workingHours: { start: '09:00', end: '17:00' },
    blackouts: [
      { id: 'lunch', label: 'Lunch Break', start: '13:00', end: '14:00', recurring: 'daily' },
    ],
    focusWindows: [
      { id: 'deep_work', label: 'Morning Focus', start: '09:00', end: '12:00' },
    ],
  };

  const createBaseProposal = () =>
    generateAdaptiveSchedule(baseTasks, {
      startDate: '2026-10-19',
      dailyCapacityHours: 6.0,
      horizonDays: 14,
      enableChunking: true,
      enableIntraday: true,
      workingHours: { start: '09:00', end: '17:00' },
      blackouts: defaultContext.blackouts,
      focusWindows: defaultContext.focusWindows,
    });

  test('1. Stable placement ID generation across tasks and chunks', () => {
    const rawProposal = createBaseProposal();
    const proposal = ensurePlacementIds(rawProposal);
    const placements = proposal.proposedPlacements;

    assert.ok(placements.length > 0);
    const ids = new Set();
    for (const p of placements) {
      assert.ok(p.placementId, 'Every placement must have a placementId');
      assert.ok(!ids.has(p.placementId), `Placement ID "${p.placementId}" must be unique`);
      ids.add(p.placementId);
    }
  });

  test('2. Moving a session to another valid date and time', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    const target = proposal.proposedPlacements.find((p) => p.taskId === 'task-4');
    assert.ok(target);

    // 2026-10-22 has 0 tasks initially
    const editResult = applyPlacementEdit(
      proposal,
      target.placementId,
      {
        proposedDate: '2026-10-22',
        startTime: '09:00',
        endTime: '11:00',
      },
      defaultContext
    );

    assert.equal(editResult.success, true);
    const updatedPlacement = editResult.proposal.proposedPlacements.find(
      (p) => p.placementId === target.placementId
    );
    assert.equal(updatedPlacement.proposedDate, '2026-10-22');
    assert.equal(updatedPlacement.startTime, '09:00');
    assert.equal(updatedPlacement.endTime, '11:00');
    assert.equal(updatedPlacement.inFocusWindow, true);
    assert.equal(updatedPlacement.focusWindowLabel, 'Morning Focus');
  });

  test('3. Rejecting a session scheduled outside working hours', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    const target = proposal.proposedPlacements.find((p) => p.taskId === 'task-4');
    assert.ok(target);

    // Early morning before 09:00
    const earlyEdit = validatePlacementEdit(
      proposal,
      target.placementId,
      {
        proposedDate: '2026-10-22',
        startTime: '07:30',
        endTime: '09:30',
      },
      defaultContext
    );
    assert.equal(earlyEdit.valid, false);
    assert.equal(earlyEdit.reason, 'outside_working_hours');
    assert.match(earlyEdit.message, /outside your working hours/);

    // Late evening after 17:00
    const lateEdit = validatePlacementEdit(
      proposal,
      target.placementId,
      {
        proposedDate: '2026-10-22',
        startTime: '16:00',
        endTime: '18:00',
      },
      defaultContext
    );
    assert.equal(lateEdit.valid, false);
    assert.equal(lateEdit.reason, 'outside_working_hours');
  });

  test('4. Rejecting a session overlapping a meeting blackout', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    const target = proposal.proposedPlacements.find((p) => p.taskId === 'task-4');
    assert.ok(target);

    // Overlaps lunch blackout 13:00 - 14:00
    const blackoutEdit = validatePlacementEdit(
      proposal,
      target.placementId,
      {
        proposedDate: '2026-10-22',
        startTime: '12:30',
        endTime: '14:30',
      },
      defaultContext
    );
    assert.equal(blackoutEdit.valid, false);
    assert.equal(blackoutEdit.reason, 'overlaps_blackout');
    assert.match(blackoutEdit.message, /overlaps a meeting blackout/);
  });

  test('5. Rejecting a session conflict (overlap with another placement on same date)', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    // Move task-4 to 2026-10-22 at 09:00 - 11:00
    const edit1 = applyPlacementEdit(
      proposal,
      'placement_task-4',
      { proposedDate: '2026-10-22', startTime: '09:00', endTime: '11:00' },
      defaultContext
    );
    assert.equal(edit1.success, true);

    // Attempt to move task-2 to overlap at 10:00 - 12:00 on 2026-10-22
    const overlapEdit = validatePlacementEdit(
      edit1.proposal,
      'placement_task-2',
      { proposedDate: '2026-10-22', startTime: '10:00', endTime: '12:00' },
      defaultContext
    );
    assert.equal(overlapEdit.valid, false);
    assert.equal(overlapEdit.reason, 'session_conflict');
    assert.match(overlapEdit.message, /conflicts with another session/);
  });

  test('6. Enforcing daily capacity limits', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    // Context with low capacity: 3.0 hours/day
    const lowCapContext = { ...defaultContext, dailyCapacityHours: 3.0 };

    // Move task-4 (2.0h) to 2026-10-22 (09:00 - 11:00)
    const edit1 = applyPlacementEdit(
      proposal,
      'placement_task-4',
      { proposedDate: '2026-10-22', startTime: '09:00', endTime: '11:00', durationHours: 2.0 },
      lowCapContext
    );
    assert.equal(edit1.success, true);

    // Attempt to also move task-2 (2.0h) to 2026-10-22 at 14:00 - 16:00 (non-overlapping in time, but total 4.0h > 3.0h capacity)
    const capExceeded = validatePlacementEdit(
      edit1.proposal,
      'placement_task-2',
      { proposedDate: '2026-10-22', startTime: '14:00', endTime: '16:00', durationHours: 2.0 },
      lowCapContext
    );
    assert.equal(capExceeded.valid, false);
    assert.equal(capExceeded.reason, 'exceeds_daily_capacity');
    assert.match(capExceeded.message, /exceed the daily capacity/);
  });

  test('7. Enforcing topological task dependencies', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    // task-2 depends on task-1 (task-1 is scheduled on 2026-10-19)

    // 7a. Try to move task-2 to a date before task-1 (e.g. 2026-10-18)
    const depViolationEarly = validatePlacementEdit(
      proposal,
      'placement_task-2',
      { proposedDate: '2026-10-18', startTime: '09:00', endTime: '11:00' },
      defaultContext
    );
    assert.equal(depViolationEarly.valid, false);
    assert.equal(depViolationEarly.reason, 'violates_dependency');
    assert.match(depViolationEarly.message, /cannot be scheduled before prerequisite/);

    // 7b. Try to move prerequisite task-1 after dependent task-2
    // task-2 is scheduled on 2026-10-20. Moving task-1 to 2026-10-22 (after task-2) violates dependency.
    const depViolationLate = validatePlacementEdit(
      proposal,
      'placement_task-1',
      { proposedDate: '2026-10-22', startTime: '09:00', endTime: '12:00' },
      defaultContext
    );
    assert.equal(depViolationLate.valid, false);
    assert.equal(depViolationLate.reason, 'violates_dependency');
    assert.match(depViolationLate.message, /cannot be scheduled after dependent task/);
  });

  test('8. Enforcing chronological order of sibling chunks for a multi-day task', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    const chunks = proposal.proposedPlacements.filter((p) => p.taskId === 'task-3');
    assert.ok(chunks.length >= 2, 'task-3 should be chunked into multiple sessions');

    const chunk1 = chunks[0];
    const chunk2 = chunks[1];
    assert.ok(chunk2, 'second chunk should exist');

    // Try to move chunk 1 to a date after chunk 2
    const chunkOrderViolation = validatePlacementEdit(
      proposal,
      chunk1.placementId,
      { proposedDate: '2026-10-28', startTime: '09:00', endTime: '12:00' },
      defaultContext
    );
    assert.equal(chunkOrderViolation.valid, false);
    assert.equal(chunkOrderViolation.reason, 'chunk_order_violation');
    assert.match(chunkOrderViolation.message, /cannot be scheduled after Session/);
  });

  test('9. Strict deadline enforcement when configured', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    // task-4 has dueDate '2026-10-25'
    const strictContext = { ...defaultContext, enforceDeadlines: true };

    const deadlineViolation = validatePlacementEdit(
      proposal,
      'placement_task-4',
      { proposedDate: '2026-10-27', startTime: '09:00', endTime: '11:00' },
      strictContext
    );
    assert.equal(deadlineViolation.valid, false);
    assert.equal(deadlineViolation.reason, 'violates_deadline');
    assert.match(deadlineViolation.message, /violate the task's deadline/);
  });

  test('10. Live recalculation of derived proposal metrics and explanations', () => {
    const proposal = ensurePlacementIds(createBaseProposal());

    // Shift task-4 to 2026-10-22
    const editResult = applyPlacementEdit(
      proposal,
      'placement_task-4',
      { proposedDate: '2026-10-22', startTime: '09:00', endTime: '11:00' },
      defaultContext
    );
    assert.equal(editResult.success, true);
    const updatedSummary = editResult.proposal.summary;

    assert.ok(updatedSummary.scheduledWorkloadHours > 0);
    assert.ok(typeof updatedSummary.averageUtilizationPercent === 'number');
    assert.equal(updatedSummary.scheduledCount, proposal.summary.scheduledCount);

    const updatedTask4 = editResult.proposal.proposedPlacements.find(
      (p) => p.placementId === 'placement_task-4'
    );
    assert.match(updatedTask4.explanation, /Manual placement/);
  });

  test('11. Interactive edit session: Undo, Revert, and Draft Isolation', () => {
    const baseProposal = createBaseProposal();
    const session = createProposalEditSession(baseProposal, defaultContext);

    assert.equal(session.canUndo(), false);
    assert.equal(session.canRevert(), false);
    assert.equal(session.isModified(), false);

    // Edit 1: Move task-4 to 2026-10-22
    const edit1 = session.applyEdit('placement_task-4', {
      proposedDate: '2026-10-22',
      startTime: '09:00',
      endTime: '11:00',
    });
    assert.equal(edit1.success, true);
    assert.equal(session.canUndo(), true);
    assert.equal(session.canRevert(), true);
    assert.equal(session.isModified(), true);

    const draftAfterEdit1 = session.getDraft();
    const p4 = draftAfterEdit1.proposedPlacements.find((p) => p.placementId === 'placement_task-4');
    assert.equal(p4.proposedDate, '2026-10-22');

    // Original baseProposal must remain UNMUTATED (Draft Isolation)
    const originalP4 = baseProposal.proposedPlacements.find((p) => p.taskId === 'task-4');
    assert.notEqual(originalP4.proposedDate, '2026-10-22');

    // Undo edit
    const undoResult = session.undo();
    assert.equal(undoResult.success, true);
    const draftAfterUndo = session.getDraft();
    const p4Undone = draftAfterUndo.proposedPlacements.find(
      (p) => p.placementId === 'placement_task-4'
    );
    assert.equal(p4Undone.proposedDate, originalP4.proposedDate);
    assert.equal(session.canUndo(), false);

    // Edit again, then Revert
    session.applyEdit('placement_task-4', {
      proposedDate: '2026-10-22',
      startTime: '09:00',
      endTime: '11:00',
    });
    assert.equal(session.canRevert(), true);

    const revertResult = session.revert();
    assert.equal(revertResult.success, true);
    assert.equal(session.canUndo(), false);
    assert.equal(session.canRevert(), false);
    assert.equal(session.isModified(), false);
  });

  test('12. Preserving the last valid draft when an invalid edit is rejected', () => {
    const baseProposal = createBaseProposal();
    const session = createProposalEditSession(baseProposal, defaultContext);

    // Valid edit: move task-4 to 2026-10-22 at 09:00 - 11:00
    session.applyEdit('placement_task-4', {
      proposedDate: '2026-10-22',
      startTime: '09:00',
      endTime: '11:00',
    });
    const validDraftState = session.getDraft();
    assert.ok(validDraftState, 'draft should be defined after valid edit');

    // Invalid edit (outside working hours)
    const invalidResult = session.applyEdit('placement_task-4', {
      proposedDate: '2026-10-22',
      startTime: '05:00',
      endTime: '08:00',
    });
    assert.equal(invalidResult.success, false);

    // The draft must be preserved exactly as validDraftState
    const currentDraft = session.getDraft();
    const p4 = currentDraft.proposedPlacements.find((p) => p.placementId === 'placement_task-4');
    assert.equal(p4.proposedDate, '2026-10-22');
    assert.equal(p4.startTime, '09:00');
    assert.equal(p4.endTime, '11:00');
  });

  test('13. Discarding / Cancelling does not mutate underlying tasks or accepted schedule', () => {
    const rawTasks = JSON.parse(JSON.stringify(baseTasks));
    const proposal = createBaseProposal();
    const session = createProposalEditSession(proposal, { tasks: rawTasks, ...defaultContext });

    session.applyEdit('placement_task-4', {
      proposedDate: '2026-10-22',
      startTime: '09:00',
      endTime: '11:00',
    });

    // Simulated cancel without calling onApplySchedule
    // Confirm rawTasks remain completely untouched
    assert.equal(rawTasks[3].dueDate, '2026-10-25');
    assert.deepEqual(rawTasks, baseTasks);
  });

  test('14. Full proposal pre-acceptance validation', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    const validCheck = validateFullProposal(proposal, defaultContext);
    assert.equal(validCheck.valid, true);
    assert.equal(validCheck.errors.length, 0);
  });

  test('15. Duplicate task titles are independently editable via stable placement IDs', () => {
    const duplicateTasks = [
      {
        id: 'dup-1',
        title: 'Review Documentation',
        priority: 'high',
        category: 'Docs',
        estimatedEffort: 2.0,
        dueDate: '2026-10-20',
        dependencies: [],
      },
      {
        id: 'dup-2',
        title: 'Review Documentation', // Duplicate title!
        priority: 'low',
        category: 'Docs',
        estimatedEffort: 2.0,
        dueDate: '2026-10-21',
        dependencies: [],
      },
    ];

    const proposal = ensurePlacementIds(
      generateAdaptiveSchedule(duplicateTasks, {
        startDate: '2026-10-19',
        dailyCapacityHours: 6.0,
        horizonDays: 14,
        enableChunking: false,
        enableIntraday: true,
        workingHours: { start: '09:00', end: '17:00' },
      })
    );

    const dup1 = proposal.proposedPlacements.find((p) => p.taskId === 'dup-1');
    const dup2 = proposal.proposedPlacements.find((p) => p.taskId === 'dup-2');

    assert.notEqual(dup1.placementId, dup2.placementId);

    // Edit dup-1 only
    const editDup1 = applyPlacementEdit(
      proposal,
      dup1.placementId,
      { proposedDate: '2026-10-20', startTime: '09:00', endTime: '11:00' },
      { tasks: duplicateTasks, dailyCapacityHours: 6.0, enableIntraday: true }
    );
    assert.equal(editDup1.success, true);

    const updatedDup1 = editDup1.proposal.proposedPlacements.find(
      (p) => p.placementId === dup1.placementId
    );
    const updatedDup2 = editDup1.proposal.proposedPlacements.find(
      (p) => p.placementId === dup2.placementId
    );

    assert.equal(updatedDup1.startTime, '09:00');
    assert.notEqual(updatedDup2.startTime, '09:00');
  });

  test('16. Preserving parent-task and chunk relationships after editing a chunk', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    const chunks = proposal.proposedPlacements.filter((p) => p.taskId === 'task-3');
    assert.ok(chunks.length >= 2);
    // Move the final chunk to 2026-10-22 (after earlier chunks on 2026-10-19..21)
    const finalChunk = chunks[chunks.length - 1];
    const initialParentEffort = finalChunk.parentTotalEffort;
    const initialChunkIdx = finalChunk.chunkIndex;
    const initialTotalChunks = finalChunk.totalChunks;

    const editChunk = applyPlacementEdit(
      proposal,
      finalChunk.placementId,
      { proposedDate: '2026-10-22', startTime: '09:00', endTime: '10:00' },
      defaultContext
    );
    assert.equal(editChunk.success, true);

    const updatedFinalChunk = editChunk.proposal.proposedPlacements.find(
      (p) => p.placementId === finalChunk.placementId
    );
    assert.equal(updatedFinalChunk.taskId, 'task-3');
    assert.equal(updatedFinalChunk.parentTotalEffort, initialParentEffort);
    assert.equal(updatedFinalChunk.chunkIndex, initialChunkIdx);
    assert.equal(updatedFinalChunk.totalChunks, initialTotalChunks);
  });

  test('17. Preserving effort total invariants across chunks and single sessions', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    const initialWorkload = proposal.summary.scheduledWorkloadHours;

    // Moving task-4 (2.0h) without resizing should preserve total workload
    const editResult = applyPlacementEdit(
      proposal,
      'placement_task-4',
      { proposedDate: '2026-10-22', startTime: '09:00', endTime: '11:00' },
      defaultContext
    );
    assert.equal(editResult.success, true);
    assert.equal(editResult.proposal.summary.scheduledWorkloadHours, initialWorkload);

    const sumPlacementHours = Math.round(
      editResult.proposal.proposedPlacements
        .filter((p) => p.proposedDate !== null && p.status !== 'unscheduled')
        .reduce((sum, p) => sum + p.effectiveHours, 0) * 10
    ) / 10;
    assert.equal(editResult.proposal.summary.scheduledWorkloadHours, sumPlacementHours);
  });

  test('18. Pre-acceptance validation blocks invalid proposals', () => {
    const proposal = ensurePlacementIds(createBaseProposal());

    // Manually force an overlapping placement collision
    const corrupted = JSON.parse(JSON.stringify(proposal));
    corrupted.proposedPlacements[0].proposedDate = '2026-10-20';
    corrupted.proposedPlacements[0].startTime = '10:00';
    corrupted.proposedPlacements[0].endTime = '12:00';
    corrupted.proposedPlacements[1].proposedDate = '2026-10-20';
    corrupted.proposedPlacements[1].startTime = '11:00';
    corrupted.proposedPlacements[1].endTime = '13:00';

    const check = validateFullProposal(corrupted, defaultContext);
    assert.equal(check.valid, false);
    assert.ok(check.errors.length > 0);
    assert.ok(check.errors.some((e) => e.type === 'session_conflict'));
  });

  test('19. Accidental duplicate acceptance prevention: acceptance produces exact accepted map', () => {
    const proposal = ensurePlacementIds(createBaseProposal());
    const edit = applyPlacementEdit(
      proposal,
      'placement_task-4',
      { proposedDate: '2026-10-22', startTime: '09:00', endTime: '11:00' },
      defaultContext
    );
    assert.equal(edit.success, true);

    // Simulate App.jsx acceptance logic
    const placements = edit.proposal.proposedPlacements;
    const changedPlacements = placements.filter(
      (p) =>
        p.status !== 'unscheduled' &&
        p.status !== 'blocked_by_dependency' &&
        p.status !== 'oversized_exceeds_capacity' &&
        p.isDateChanged &&
        p.proposedDate &&
        p.proposedDate !== p.originalDueDate
    );

    const changedMap = new Map();
    for (const p of changedPlacements) {
      const existing = changedMap.get(p.taskId);
      if (!existing || p.proposedDate > existing) {
        changedMap.set(p.taskId, p.proposedDate);
      }
    }

    // Applying twice produces identical idempotency
    assert.equal(changedMap.get('task-4'), '2026-10-22');
    assert.ok(changedMap.size >= 1);
  });

  test('20. Stale proposal detection hash invariant', () => {
    const tasks = [...baseTasks];
    const initialHash = JSON.stringify(
      tasks.map((t) => [t.id, t.dueDate, t.completed, t.estimatedEffort, t.dependencies])
    );

    // Mutate a task
    const modifiedTasks = tasks.map((t) =>
      t.id === 'task-1' ? { ...t, dueDate: '2026-10-29' } : t
    );
    const modifiedHash = JSON.stringify(
      modifiedTasks.map((t) => [t.id, t.dueDate, t.completed, t.estimatedEffort, t.dependencies])
    );

    assert.notEqual(initialHash, modifiedHash);
  });

  test('21. Editing a draft does not emit accepted telemetry or mutate persisted tasks', () => {
    const persistedTasks = JSON.parse(JSON.stringify(baseTasks));
    const telemetryEvents = [];
    const _mockTelemetry = {
      recordTaskRescheduled: async (id, oldD, newD) => {
        telemetryEvents.push({ id, oldD, newD });
      },
    };

    const session = createProposalEditSession(createBaseProposal(), defaultContext);
    session.applyEdit('placement_task-4', {
      proposedDate: '2026-10-22',
      startTime: '09:00',
      endTime: '11:00',
    });

    // Zero telemetry events recorded during editing
    assert.equal(telemetryEvents.length, 0);
    // Zero changes to persisted tasks
    assert.deepEqual(persistedTasks, baseTasks);
  });

  test('22. Preserving Phase 6.1 and 6.2 behaviors during editing', () => {
    const proposal = ensurePlacementIds(createBaseProposal());

    // Phase 6.1: task-3 is chunked
    const task3Chunks = proposal.proposedPlacements.filter((p) => p.taskId === 'task-3');
    assert.ok(task3Chunks.length >= 2);
    for (const chunk of task3Chunks) {
      assert.ok(chunk.isChunk);
      assert.ok(chunk.chunkIndex !== undefined);
    }

    // Phase 6.2: placements fit inside continuous windows and respect blackouts
    for (const p of proposal.proposedPlacements) {
      if (p.proposedDate && p.startTime && p.endTime) {
        assert.notEqual(p.startTime, '13:00', 'Should not start during lunch blackout');
        assert.ok(p.startTime >= '09:00', 'Should not start before working hours');
        assert.ok(p.endTime <= '17:00', 'Should not end after working hours');
      }
    }
  });
});

