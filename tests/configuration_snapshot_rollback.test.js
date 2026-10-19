import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  SNAPSHOT_SCHEMA_VERSION,
  SNAPSHOT_STORAGE_KEY,
  ACTIVE_CONFIG_RECORD_KEY,
  createConfigurationSnapshot,
  createFactorySnapshot,
  validateWeightsPayload,
  validateConfigurationSnapshot,
  computeFnv1a32,
  canonicalJsonStringify,
  computeSnapshotChecksum,
  saveSnapshot,
  getSnapshot,
  listSnapshots,
  getActiveConfigRecord,
  rollbackToSnapshot,
  restoreFactoryConfiguration,
  clearConfigurationMemoryFallback,
} from '../src/scheduler/configurationSnapshot.js';

import {
  FACTORY_SCHEDULER_WEIGHTS,
  generateAdaptiveSchedule,
} from '../src/scheduler/adaptiveScheduler.js';

import {
  evaluateLearningReadiness,
} from '../src/scheduler/learningReadinessGate.js';

import {
  runScheduleSimulation,
} from '../src/scheduler/scheduleSimulator.js';

describe('Phase 7.4 Stage 3: Versioned Configuration Snapshots & Rollback Safety Foundation', () => {
  let mockStorage;
  let storageBacking;

  beforeEach(() => {
    storageBacking = new Map();
    mockStorage = {
      getItem: (k) => (storageBacking.has(k) ? storageBacking.get(k) : null),
      setItem: (k, v) => storageBacking.set(k, String(v)),
      removeItem: (k) => storageBacking.delete(k),
      clear: () => storageBacking.clear(),
    };
    clearConfigurationMemoryFallback();
  });

  describe('1. Canonical Serialization & Checksum Integrity', () => {
    it('canonicalJsonStringify sorts keys alphabetically at all nesting levels', () => {
      const objA = { z: 1, a: { b: 2, a: 3 }, m: [3, 2, 1] };
      const objB = { m: [3, 2, 1], a: { a: 3, b: 2 }, z: 1 };
      assert.equal(canonicalJsonStringify(objA), canonicalJsonStringify(objB));
    });

    it('computeFnv1a32 produces deterministic 8-character hex strings', () => {
      const hash1 = computeFnv1a32('voxplan_test_payload');
      const hash2 = computeFnv1a32('voxplan_test_payload');
      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 8);
      assert.match(hash1, /^[0-9a-f]{8}$/);
    });

    it('computeSnapshotChecksum changes when any content property changes', () => {
      const snap = createFactorySnapshot();
      const initialChecksum = snap.integrityChecksum;

      const modifiedSnap = {
        ...snap,
        weights: { ...snap.weights, urgencyWeight: 52.0 },
      };
      const modifiedChecksum = computeSnapshotChecksum(modifiedSnap);
      assert.notEqual(initialChecksum, modifiedChecksum);
    });
  });

  describe('2. Snapshot Validation & Boundary Defense (Scope A)', () => {
    it('validates a valid factory snapshot', () => {
      const snap = createFactorySnapshot();
      const val = validateConfigurationSnapshot(snap);
      assert.equal(val.isValid, true);
      assert.equal(val.errors.length, 0);
      assert.equal(snap.schemaVersion, SNAPSHOT_SCHEMA_VERSION);
      assert.deepEqual(snap.weights, FACTORY_SCHEDULER_WEIGHTS);
    });

    it('validates a valid bounded candidate snapshot', () => {
      const candidateWeights = {
        urgencyWeight: 45.0, // bounds [40, 60]
        priorityWeight: 110.0, // bounds [80, 120]
        unblockWeight: 16.0, // bounds [12, 18]
        riskWeight: 22.0, // bounds [20, 30]
      };
      const snap = createConfigurationSnapshot({
        weights: candidateWeights,
        provenance: 'candidate_tuning',
      });
      const val = validateConfigurationSnapshot(snap);
      assert.equal(val.isValid, true);
      assert.equal(val.errors.length, 0);
      assert.equal(snap.weights.priorityWeight, 110.0);
    });

    it('rejects snapshots missing mandatory weight parameters', () => {
      const partial = { urgencyWeight: 50.0, priorityWeight: 100.0 };
      const val = validateWeightsPayload(partial);
      assert.equal(val.isValid, false);
      assert.ok(val.errors.some((e) => e.includes('Missing mandatory configuration parameter: "unblockWeight"')));
      assert.ok(val.errors.some((e) => e.includes('Missing mandatory configuration parameter: "riskWeight"')));
    });

    it('rejects snapshots with unexpected extra weight parameters', () => {
      const extra = {
        ...FACTORY_SCHEDULER_WEIGHTS,
        unsupportedLearningRate: 0.05,
      };
      const val = validateWeightsPayload(extra);
      assert.equal(val.isValid, false);
      assert.ok(val.errors.some((e) => e.includes('Unexpected configuration parameter: "unsupportedLearningRate"')));
    });

    it('rejects NaN, +Infinity, -Infinity, and non-numeric weights', () => {
      const testCases = [
        { ...FACTORY_SCHEDULER_WEIGHTS, urgencyWeight: NaN },
        { ...FACTORY_SCHEDULER_WEIGHTS, priorityWeight: Infinity },
        { ...FACTORY_SCHEDULER_WEIGHTS, unblockWeight: -Infinity },
        { ...FACTORY_SCHEDULER_WEIGHTS, riskWeight: 'twenty_five' },
      ];

      for (const tc of testCases) {
        const val = validateWeightsPayload(tc);
        assert.equal(val.isValid, false);
        assert.ok(val.errors.some((e) => e.includes('must be a finite number')));
      }
    });

    it('rejects weights outside permitted ±20% bounds', () => {
      const outOfBounds = [
        { weights: { ...FACTORY_SCHEDULER_WEIGHTS, urgencyWeight: 39.0 }, key: 'urgencyWeight' },
        { weights: { ...FACTORY_SCHEDULER_WEIGHTS, urgencyWeight: 61.0 }, key: 'urgencyWeight' },
        { weights: { ...FACTORY_SCHEDULER_WEIGHTS, priorityWeight: 75.0 }, key: 'priorityWeight' },
        { weights: { ...FACTORY_SCHEDULER_WEIGHTS, priorityWeight: 125.0 }, key: 'priorityWeight' },
        { weights: { ...FACTORY_SCHEDULER_WEIGHTS, unblockWeight: 10.0 }, key: 'unblockWeight' },
        { weights: { ...FACTORY_SCHEDULER_WEIGHTS, unblockWeight: 20.0 }, key: 'unblockWeight' },
        { weights: { ...FACTORY_SCHEDULER_WEIGHTS, riskWeight: 18.0 }, key: 'riskWeight' },
        { weights: { ...FACTORY_SCHEDULER_WEIGHTS, riskWeight: 32.0 }, key: 'riskWeight' },
      ];

      for (const { weights, key } of outOfBounds) {
        const val = validateWeightsPayload(weights);
        assert.equal(val.isValid, false);
        assert.ok(val.errors.some((e) => e.includes(key) && e.includes('outside permitted bounds')));
      }
    });

    it('rejects unsupported schema versions', () => {
      const snap = {
        ...createFactorySnapshot(),
        schemaVersion: '2.0.0',
      };
      const val = validateConfigurationSnapshot(snap);
      assert.equal(val.isValid, false);
      assert.ok(val.errors.some((e) => e.includes('Unsupported snapshot schema version: "2.0.0"')));
    });

    it('rejects invalid timestamps or snapshot identifiers', () => {
      const snapBadTime = {
        ...createFactorySnapshot(),
        createdAt: 'invalid-iso-date',
      };
      assert.equal(validateConfigurationSnapshot(snapBadTime).isValid, false);

      const snapBadId = {
        ...createFactorySnapshot(),
        snapshotId: '  ',
      };
      assert.equal(validateConfigurationSnapshot(snapBadId).isValid, false);
    });

    it('rejects corrupted snapshots with checksum mismatches', () => {
      const snap = createFactorySnapshot();
      // Silently mutate a weight without recomputing checksum
      const tampered = {
        ...snap,
        weights: { ...snap.weights, urgencyWeight: 48.0 },
      };
      const val = validateConfigurationSnapshot(tampered);
      assert.equal(val.isValid, false);
      assert.ok(val.errors.some((e) => e.includes('Integrity checksum mismatch')));
    });

    it('rejects snapshots with factory baseline identity mismatches', () => {
      const snap = createFactorySnapshot();
      const corruptedBaseline = {
        ...snap,
        factoryBaseline: { ...snap.factoryBaseline, urgencyWeight: 99.0 },
        integrityChecksum: '', // will trigger checksum or baseline mismatch
      };
      const val = validateConfigurationSnapshot(corruptedBaseline);
      assert.equal(val.isValid, false);
      assert.ok(val.errors.some((e) => e.includes('Factory baseline identity mismatch')));
    });
  });

  describe('3. Persistence, Rollback & Factory Restoration (Scope B)', () => {
    it('saves and retrieves a valid configuration snapshot', () => {
      const candidateWeights = {
        urgencyWeight: 48.0,
        priorityWeight: 105.0,
        unblockWeight: 14.0,
        riskWeight: 24.0,
      };
      const snap = createConfigurationSnapshot({
        weights: candidateWeights,
        provenance: 'candidate_tuning',
      });

      const saveRes = saveSnapshot(snap, { storage: mockStorage });
      assert.equal(saveRes.success, true);
      assert.equal(saveRes.status, 'saved');

      const getRes = getSnapshot(snap.snapshotId, { storage: mockStorage });
      assert.equal(getRes.success, true);
      assert.equal(getRes.status, 'valid');
      assert.deepEqual(getRes.snapshot.weights, candidateWeights);
    });

    it('returns not_found when reading a non-existent snapshot ID', () => {
      const res = getSnapshot('snap_does_not_exist', { storage: mockStorage });
      assert.equal(res.success, false);
      assert.equal(res.status, 'not_found');
    });

    it('rejects saving an invalid snapshot and does not corrupt storage', () => {
      const badSnap = {
        schemaVersion: '1.0.0',
        snapshotId: 'bad_snap',
        createdAt: new Date().toISOString(),
        revision: 1,
        provenance: 'candidate_tuning',
        weights: { urgencyWeight: 999.0 }, // Invalid
        factoryBaseline: FACTORY_SCHEDULER_WEIGHTS,
        integrityChecksum: '12345678',
      };

      const res = saveSnapshot(badSnap, { storage: mockStorage });
      assert.equal(res.success, false);
      assert.equal(res.status, 'validation_failure');
      assert.equal(mockStorage.getItem(SNAPSHOT_STORAGE_KEY), null);
    });

    it('detects corrupted storage records gracefully', () => {
      mockStorage.setItem(SNAPSHOT_STORAGE_KEY, '{ invalid_json ');
      const res = getSnapshot('some_id', { storage: mockStorage });
      assert.equal(res.success, false);
      assert.equal(res.status, 'corrupted_storage');
    });

    it('lists all stored snapshots and validates each record', () => {
      const snap1 = createFactorySnapshot({ revision: 1 });
      const snap2 = createConfigurationSnapshot({
        weights: { urgencyWeight: 44.0, priorityWeight: 95.0, unblockWeight: 13.0, riskWeight: 26.0 },
        snapshotId: 'snap_candidate_two',
        revision: 2,
      });

      saveSnapshot(snap1, { storage: mockStorage });
      saveSnapshot(snap2, { storage: mockStorage });

      const list = listSnapshots({ storage: mockStorage });
      assert.equal(list.length, 2);
      assert.ok(list.every((item) => item.isValid));
    });

    it('getActiveConfigRecord returns canonical factory baseline defaults initially', () => {
      const active = getActiveConfigRecord({ storage: mockStorage });
      assert.equal(active.revision, 1);
      assert.equal(active.isFactoryBaseline, true);
      assert.equal(active.provenance, 'factory_baseline');
      assert.deepEqual(active.activeWeights, FACTORY_SCHEDULER_WEIGHTS);
      assert.equal(active.productionApplied, false);
    });

    it('successfully rolls back to a validated candidate snapshot with revision increment', () => {
      const initialActive = getActiveConfigRecord({ storage: mockStorage });
      assert.equal(initialActive.revision, 1);

      const candidateWeights = {
        urgencyWeight: 46.0,
        priorityWeight: 112.0,
        unblockWeight: 15.0,
        riskWeight: 23.0,
      };
      const candidateSnap = createConfigurationSnapshot({
        weights: candidateWeights,
        provenance: 'candidate_tuning',
      });
      saveSnapshot(candidateSnap, { storage: mockStorage });

      const rollbackRes = rollbackToSnapshot(candidateSnap.snapshotId, {
        expectedRevision: 1,
        storage: mockStorage,
      });

      assert.equal(rollbackRes.success, true);
      assert.equal(rollbackRes.status, 'success');
      assert.equal(rollbackRes.activeConfig.revision, 2);
      assert.deepEqual(rollbackRes.activeConfig.activeWeights, candidateWeights);
      assert.equal(rollbackRes.activeConfig.sourceSnapshotId, candidateSnap.snapshotId);
      assert.equal(rollbackRes.activeConfig.isFactoryBaseline, false);
      assert.equal(rollbackRes.activeConfig.productionApplied, false);

      // Verify persisted active record
      const refreshedActive = getActiveConfigRecord({ storage: mockStorage });
      assert.equal(refreshedActive.revision, 2);
      assert.deepEqual(refreshedActive.activeWeights, candidateWeights);
    });

    it('aborts rollback and leaves current configuration untouched when target snapshot is invalid or missing', () => {
      const initialActive = getActiveConfigRecord({ storage: mockStorage });

      const missingRes = rollbackToSnapshot('non_existent_snapshot_id', { storage: mockStorage });
      assert.equal(missingRes.success, false);
      assert.equal(missingRes.status, 'not_found');

      const afterMissing = getActiveConfigRecord({ storage: mockStorage });
      assert.deepEqual(afterMissing, initialActive);

      // Persist a tampered snapshot directly into storage dictionary
      const tamperedSnap = {
        ...createFactorySnapshot(),
        snapshotId: 'snap_tampered',
        weights: { ...FACTORY_SCHEDULER_WEIGHTS, urgencyWeight: 59.0 },
        // mismatched checksum
      };
      const dict = { snap_tampered: tamperedSnap };
      mockStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(dict));

      const tamperedRes = rollbackToSnapshot('snap_tampered', { storage: mockStorage });
      assert.equal(tamperedRes.success, false);
      assert.equal(tamperedRes.status, 'validation_failure');

      const afterTampered = getActiveConfigRecord({ storage: mockStorage });
      assert.deepEqual(afterTampered, initialActive);
    });

    it('aborts rollback on revision conflict (optimistic concurrency guard)', () => {
      const candidateSnap = createConfigurationSnapshot({
        weights: { urgencyWeight: 45.0, priorityWeight: 100.0, unblockWeight: 15.0, riskWeight: 25.0 },
      });
      saveSnapshot(candidateSnap, { storage: mockStorage });

      // Stale expectedRevision: expects revision 99 while active is 1
      const conflictRes = rollbackToSnapshot(candidateSnap.snapshotId, {
        expectedRevision: 99,
        storage: mockStorage,
      });

      assert.equal(conflictRes.success, false);
      assert.equal(conflictRes.status, 'revision_conflict');
      assert.equal(conflictRes.currentRevision, 1);
      assert.ok(conflictRes.error.includes('Revision conflict'));

      // Active config unchanged
      const currentActive = getActiveConfigRecord({ storage: mockStorage });
      assert.equal(currentActive.revision, 1);
    });

    it('safely handles storage write failure during rollback without mutating current record', () => {
      const candidateSnap = createConfigurationSnapshot({
        weights: { urgencyWeight: 45.0, priorityWeight: 100.0, unblockWeight: 15.0, riskWeight: 25.0 },
      });
      saveSnapshot(candidateSnap, { storage: mockStorage });

      const throwingStorage = {
        getItem: (k) => mockStorage.getItem(k),
        setItem: (k, v) => {
          if (k === ACTIVE_CONFIG_RECORD_KEY) {
            throw new Error('Disk quota exceeded (simulated)');
          }
          mockStorage.setItem(k, v);
        },
      };

      const failRes = rollbackToSnapshot(candidateSnap.snapshotId, { storage: throwingStorage });
      assert.equal(failRes.success, false);
      assert.equal(failRes.status, 'storage_failure');
      assert.ok(failRes.error.includes('Disk quota exceeded'));

      // Active config remains factory baseline
      const active = getActiveConfigRecord({ storage: mockStorage });
      assert.equal(active.revision, 1);
      assert.deepEqual(active.activeWeights, FACTORY_SCHEDULER_WEIGHTS);
    });

    it('restores canonical factory defaults from any state (Scope B Factory Restoration)', () => {
      // 1. Rollback to a candidate configuration first
      const candidateSnap = createConfigurationSnapshot({
        weights: { urgencyWeight: 42.0, priorityWeight: 88.0, unblockWeight: 13.0, riskWeight: 28.0 },
      });
      saveSnapshot(candidateSnap, { storage: mockStorage });
      rollbackToSnapshot(candidateSnap.snapshotId, { storage: mockStorage });

      const candidateActive = getActiveConfigRecord({ storage: mockStorage });
      assert.equal(candidateActive.isFactoryBaseline, false);
      assert.equal(candidateActive.revision, 2);

      // 2. Restore factory defaults
      const restoreRes = restoreFactoryConfiguration({ storage: mockStorage });
      assert.equal(restoreRes.success, true);
      assert.equal(restoreRes.status, 'success');
      assert.equal(restoreRes.activeConfig.revision, 3);
      assert.equal(restoreRes.activeConfig.isFactoryBaseline, true);
      assert.deepEqual(restoreRes.activeConfig.activeWeights, FACTORY_SCHEDULER_WEIGHTS);
      assert.deepEqual(restoreRes.restoredWeights, FACTORY_SCHEDULER_WEIGHTS);
      assert.equal(restoreRes.activeConfig.productionApplied, false);

      // 3. Verify refreshed active record
      const refreshed = getActiveConfigRecord({ storage: mockStorage });
      assert.equal(refreshed.revision, 3);
      assert.deepEqual(refreshed.activeWeights, FACTORY_SCHEDULER_WEIGHTS);
    });

    it('restoreFactoryConfiguration works safely when no candidate snapshots exist', () => {
      mockStorage.clear();
      const restoreRes = restoreFactoryConfiguration({ storage: mockStorage });
      assert.equal(restoreRes.success, true);
      assert.equal(restoreRes.activeConfig.revision, 2);
      assert.equal(restoreRes.activeConfig.isFactoryBaseline, true);
      assert.deepEqual(restoreRes.activeConfig.activeWeights, FACTORY_SCHEDULER_WEIGHTS);
    });
  });

  describe('4. Hard Production Safety Invariants (Scope C)', () => {
    it('FACTORY_SCHEDULER_WEIGHTS is immutable and unchanged', () => {
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.equal(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
      assert.throws(() => {
        FACTORY_SCHEDULER_WEIGHTS.urgencyWeight = 99.0;
      });
    });

    it('snapshot creation and persistence do NOT unlock adaptation or modify production scheduler', () => {
      const snap = createConfigurationSnapshot({
        weights: { urgencyWeight: 45.0, priorityWeight: 110.0, unblockWeight: 15.0, riskWeight: 25.0 },
      });
      saveSnapshot(snap, { storage: mockStorage });

      // Live scheduler proposal generation strictly defaults to factory weights
      const sampleTasks = [
        { id: 't1', title: 'Task 1', estimatedEffort: 2.0, dueDate: '2026-10-20', priority: 'high', completed: false },
        { id: 't2', title: 'Task 2', estimatedEffort: 2.0, dueDate: '2026-10-21', priority: 'low', completed: false },
      ];

      const prodSchedule = generateAdaptiveSchedule(sampleTasks, { startDate: '2026-10-19' });
      assert.ok(prodSchedule.placements.length > 0);
      // Production schedule generation does not read or apply candidate weights
      assert.equal(prodSchedule.cycleDetected, false);
      assert.equal(prodSchedule.summary.feasibilityStatus, 'feasible');
    });

    it('rollback and factory restoration leave productionApplied === false and adaptation locked', () => {
      const snap = createConfigurationSnapshot({
        weights: { urgencyWeight: 44.0, priorityWeight: 90.0, unblockWeight: 14.0, riskWeight: 22.0 },
      });
      saveSnapshot(snap, { storage: mockStorage });

      const rollbackRes = rollbackToSnapshot(snap.snapshotId, { storage: mockStorage });
      assert.equal(rollbackRes.activeConfig.productionApplied, false);

      const restoreRes = restoreFactoryConfiguration({ storage: mockStorage });
      assert.equal(restoreRes.activeConfig.productionApplied, false);

      // Verify readiness gate remains independent and unchanged
      const readiness = evaluateLearningReadiness({ events: [] });
      assert.equal(readiness.status, 'insufficient_evidence');
    });

    it('shadow schedule simulation does not mutate configuration storage records', () => {
      const initialActive = getActiveConfigRecord({ storage: mockStorage });

      runScheduleSimulation({
        scenarioKey: 'deadline_vs_priority',
        candidateWeights: { urgencyWeight: 45.0, priorityWeight: 110.0, unblockWeight: 15.0, riskWeight: 25.0 },
        options: { startDate: '2026-10-19' },
      });

      const afterSimulation = getActiveConfigRecord({ storage: mockStorage });
      assert.deepEqual(afterSimulation, initialActive);
    });
  });
});
