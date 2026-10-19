/**
 * VoxPlan Versioned Configuration Snapshots & Rollback Safety Foundation (Phase 7, Stage 3).
 *
 * Implements a small, deterministic, local-first module for safely creating, validating,
 * persisting, and rolling back adaptive scheduler configuration snapshots.
 *
 * Strict Production Safety & Invariants (Scope C):
 * 1. Non-Activation Boundary: Saving, validating, rolling back, or restoring configuration records
 *    NEVER enables learned weights in the production scheduler.
 * 2. Immutable Factory Defaults: Production scheduling continues using FACTORY_SCHEDULER_WEIGHTS.
 * 3. Invariants Preserved: isAdaptationUnlocked === false, productionApplied === false.
 * 4. Isolation: Storing or restoring a configuration record is an administrative snapshot mechanism;
 *    it does not unlock the Phase 7.1 readiness gate or bypass explicit preference evidence.
 * 5. Safe Failure: Failed validations, missing records, or storage exceptions never leave the active
 *    record in a corrupted, partial, or modified state.
 *
 * Integrity Check Specification & Guarantees:
 * - Integrity checksums are deterministic 32-bit FNV-1a hex digests computed over canonical
 *   alphabetically-sorted JSON representations of content fields.
 * - Guarantees: Detects accidental corruption, serialization truncation, partial writes, and manual
 *   field edits where the checksum was not recomputed.
 * - Threat Model Limitation: The checksum is an integrity check, NOT a cryptographic signature.
 *   It does NOT provide authentication or protection against an attacker who can rewrite both
 *   the snapshot payload and its checksum in browser storage.
 */

import { FACTORY_SCHEDULER_WEIGHTS } from './adaptiveScheduler.js';
import { SIMULATION_WEIGHT_BOUNDS } from './scheduleSimulator.js';
import { generateUUID } from '../telemetry/eventSchema.js';

export const SNAPSHOT_SCHEMA_VERSION = '1.0.0';
export const SNAPSHOT_STORAGE_KEY = 'voxplan_adaptive_config_snapshots_v1';
export const ACTIVE_CONFIG_RECORD_KEY = 'voxplan_adaptive_active_config_v1';

export const VALID_WEIGHT_KEYS = Object.freeze([
  'urgencyWeight',
  'priorityWeight',
  'unblockWeight',
  'riskWeight',
]);

export const PROVENANCE_TYPES = Object.freeze([
  'factory_baseline',
  'manual_simulation',
  'candidate_tuning',
  'rollback_restoration',
]);

// In-memory fallback store for Node.js test environments or when localStorage is unavailable
const memoryFallbackStore = new Map();

/**
 * Resolves the active storage provider.
 * Uses injected storage if provided, window.localStorage if available, else memory fallback.
 *
 * @param {Object} [storage]
 * @returns {Object}
 */
export function resolveStorage(storage = null) {
  if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
    return storage;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key) => (memoryFallbackStore.has(key) ? memoryFallbackStore.get(key) : null),
    setItem: (key, val) => memoryFallbackStore.set(key, String(val)),
    removeItem: (key) => memoryFallbackStore.delete(key),
    clear: () => memoryFallbackStore.clear(),
  };
}

/**
 * Resets the in-memory fallback store (for unit tests).
 */
export function clearConfigurationMemoryFallback() {
  memoryFallbackStore.clear();
}

/**
 * Computes deterministic 32-bit FNV-1a hash formatted as an 8-character lowercase hex string.
 *
 * @param {string} str
 * @returns {string}
 */
export function computeFnv1a32(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return ('0000000' + (hash >>> 0).toString(16)).slice(-8);
}

/**
 * Deterministically serializes an arbitrary object by recursively sorting its keys alphabetically.
 * Ensures consistent serialization regardless of key insertion order.
 *
 * @param {*} val
 * @returns {string}
 */
export function canonicalJsonStringify(val) {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(val[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes the deterministic integrity checksum for a snapshot content payload.
 *
 * @param {Object} snapshot
 * @returns {string} 8-character hex digest
 */
export function computeSnapshotChecksum(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const contentToHash = {
    schemaVersion: snapshot.schemaVersion,
    snapshotId: snapshot.snapshotId,
    createdAt: snapshot.createdAt,
    revision: snapshot.revision,
    provenance: snapshot.provenance,
    weights: snapshot.weights,
    factoryBaseline: snapshot.factoryBaseline,
  };
  return computeFnv1a32(canonicalJsonStringify(contentToHash));
}

/**
 * Validates a weight configuration against factory baselines and permitted ±20% bounds.
 *
 * @param {Object} rawWeights
 * @returns {{ isValid: boolean, errors: string[], validatedWeights: Object|null }}
 */
export function validateWeightsPayload(rawWeights) {
  if (!rawWeights || typeof rawWeights !== 'object' || Array.isArray(rawWeights)) {
    return {
      isValid: false,
      errors: ['Weights payload must be a non-null object.'],
      validatedWeights: null,
    };
  }

  const errors = [];
  const inputKeys = Object.keys(rawWeights);

  // Check for unexpected extra keys
  for (const k of inputKeys) {
    if (!VALID_WEIGHT_KEYS.includes(k)) {
      errors.push(`Unexpected configuration parameter: "${k}". Only [${VALID_WEIGHT_KEYS.join(', ')}] are permitted.`);
    }
  }

  // Check for missing keys
  for (const k of VALID_WEIGHT_KEYS) {
    if (!(k in rawWeights)) {
      errors.push(`Missing mandatory configuration parameter: "${k}".`);
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors, validatedWeights: null };
  }

  const validatedWeights = {};

  for (const key of VALID_WEIGHT_KEYS) {
    const val = rawWeights[key];
    const spec = SIMULATION_WEIGHT_BOUNDS[key];

    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      errors.push(`Parameter "${key}" must be a finite number. Received: ${String(val)}.`);
      continue;
    }

    if (val < spec.min || val > spec.max) {
      errors.push(
        `Parameter "${key}" (${val}) is outside permitted bounds [${spec.min.toFixed(1)}, ${spec.max.toFixed(1)}] (±20% of factory default ${spec.factory.toFixed(1)}).`
      );
      continue;
    }

    validatedWeights[key] = Math.round(val * 10) / 10;
  }

  return {
    isValid: errors.length === 0,
    errors,
    validatedWeights: errors.length === 0 ? validatedWeights : null,
  };
}

/**
 * Validates a configuration snapshot against schema, integrity, and bound invariants.
 *
 * @param {Object} snapshot
 * @returns {{ isValid: boolean, errors: string[] }}
 */
export function validateConfigurationSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return {
      isValid: false,
      errors: ['Snapshot must be a non-null object.'],
    };
  }

  const errors = [];

  // Schema version validation
  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    errors.push(
      `Unsupported snapshot schema version: "${snapshot.schemaVersion}". Supported: "${SNAPSHOT_SCHEMA_VERSION}".`
    );
  }

  // Snapshot ID validation
  if (typeof snapshot.snapshotId !== 'string' || snapshot.snapshotId.trim().length < 3) {
    errors.push('Snapshot must have a valid non-empty snapshotId string.');
  }

  // Timestamp validation
  if (typeof snapshot.createdAt !== 'string' || isNaN(Date.parse(snapshot.createdAt))) {
    errors.push('Snapshot must have a valid ISO-8601 createdAt timestamp.');
  }

  // Revision validation
  if (typeof snapshot.revision !== 'number' || !Number.isInteger(snapshot.revision) || snapshot.revision < 1) {
    errors.push(`Snapshot revision must be a positive integer >= 1. Received: ${snapshot.revision}.`);
  }

  // Provenance validation
  if (typeof snapshot.provenance !== 'string' || snapshot.provenance.trim().length === 0) {
    errors.push('Snapshot must have a valid non-empty provenance string.');
  }

  // Factory baseline identity validation
  if (!snapshot.factoryBaseline || typeof snapshot.factoryBaseline !== 'object') {
    errors.push('Snapshot must include a factoryBaseline object reference.');
  } else {
    for (const key of VALID_WEIGHT_KEYS) {
      if (snapshot.factoryBaseline[key] !== FACTORY_SCHEDULER_WEIGHTS[key]) {
        errors.push(
          `Factory baseline identity mismatch for "${key}": expected ${FACTORY_SCHEDULER_WEIGHTS[key]}, received ${snapshot.factoryBaseline[key]}.`
        );
      }
    }
  }

  // Weight payload bounds and structure validation
  const weightVal = validateWeightsPayload(snapshot.weights);
  if (!weightVal.isValid) {
    errors.push(...weightVal.errors);
  }

  // Integrity checksum validation
  if (typeof snapshot.integrityChecksum !== 'string' || snapshot.integrityChecksum.trim().length === 0) {
    errors.push('Snapshot must include an integrityChecksum string.');
  } else if (weightVal.isValid && snapshot.schemaVersion === SNAPSHOT_SCHEMA_VERSION) {
    const expectedChecksum = computeSnapshotChecksum(snapshot);
    if (snapshot.integrityChecksum !== expectedChecksum) {
      errors.push(
        `Integrity checksum mismatch: expected "${expectedChecksum}", found "${snapshot.integrityChecksum}". Snapshot data may be corrupted or modified.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a versioned, validated, frozen configuration snapshot object.
 *
 * @param {Object} params
 * @param {Object} params.weights - Validated weight configuration.
 * @param {string} [params.provenance='candidate_tuning'] - Source / provenance.
 * @param {string} [params.snapshotId] - Stable identifier (auto-generated if omitted).
 * @param {string} [params.createdAt] - Creation timestamp (defaults to now).
 * @param {number} [params.revision=1] - Revision number.
 * @returns {Object} Frozen validated snapshot object.
 * @throws {Error} If weights or metadata fail validation.
 */
export function createConfigurationSnapshot({
  weights,
  provenance = 'candidate_tuning',
  snapshotId,
  createdAt,
  revision = 1,
}) {
  const weightVal = validateWeightsPayload(weights);
  if (!weightVal.isValid) {
    throw new Error(`Cannot create configuration snapshot: ${weightVal.errors.join(' ')}`);
  }

  const id = typeof snapshotId === 'string' && snapshotId.trim().length >= 3
    ? snapshotId.trim()
    : `snap_${Date.now()}_${generateUUID().slice(0, 8)}`;

  const created = typeof createdAt === 'string' && !isNaN(Date.parse(createdAt))
    ? createdAt
    : new Date().toISOString();

  const rev = typeof revision === 'number' && Number.isInteger(revision) && revision >= 1
    ? revision
    : 1;

  const rawSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId: id,
    createdAt: created,
    revision: rev,
    provenance: String(provenance).trim() || 'candidate_tuning',
    weights: Object.freeze({ ...weightVal.validatedWeights }),
    factoryBaseline: Object.freeze({ ...FACTORY_SCHEDULER_WEIGHTS }),
  };

  const integrityChecksum = computeSnapshotChecksum(rawSnapshot);

  const snapshot = Object.freeze({
    ...rawSnapshot,
    integrityChecksum,
  });

  const fullVal = validateConfigurationSnapshot(snapshot);
  if (!fullVal.isValid) {
    throw new Error(`Internal snapshot construction error: ${fullVal.errors.join(' ')}`);
  }

  return snapshot;
}

/**
 * Creates a canonical factory baseline configuration snapshot.
 *
 * @param {Object} [params]
 * @param {number} [params.revision=1]
 * @param {string} [params.createdAt]
 * @returns {Object} Canonical factory baseline snapshot.
 */
export function createFactorySnapshot({ revision = 1, createdAt } = {}) {
  return createConfigurationSnapshot({
    weights: FACTORY_SCHEDULER_WEIGHTS,
    provenance: 'factory_baseline',
    snapshotId: 'snap_factory_baseline',
    createdAt,
    revision,
  });
}

/**
 * Saves a validated configuration snapshot into persistent storage.
 * Does NOT alter the active configuration record.
 *
 * @param {Object} snapshot - Valid configuration snapshot.
 * @param {Object} [options]
 * @param {Object} [options.storage] - Storage provider.
 * @returns {{ success: boolean, status: string, snapshot?: Object, errors?: string[], error?: string }}
 */
export function saveSnapshot(snapshot, { storage = null } = {}) {
  const val = validateConfigurationSnapshot(snapshot);
  if (!val.isValid) {
    return {
      success: false,
      status: 'validation_failure',
      errors: val.errors,
      error: `Validation failed: ${val.errors[0]}`,
    };
  }

  const store = resolveStorage(storage);

  try {
    const raw = store.getItem(SNAPSHOT_STORAGE_KEY);
    let dict = {};
    if (raw) {
      try {
        dict = JSON.parse(raw);
        if (!dict || typeof dict !== 'object' || Array.isArray(dict)) {
          dict = {};
        }
      } catch {
        dict = {};
      }
    }

    dict[snapshot.snapshotId] = snapshot;
    store.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(dict));

    return {
      success: true,
      status: 'saved',
      snapshot,
    };
  } catch (err) {
    return {
      success: false,
      status: 'storage_failure',
      error: `Storage failure while saving snapshot: ${err.message || String(err)}`,
    };
  }
}

/**
 * Reads and strictly validates a configuration snapshot from storage by snapshotId.
 *
 * @param {string} snapshotId - Snapshot identifier.
 * @param {Object} [options]
 * @param {Object} [options.storage] - Storage provider.
 * @returns {{ success: boolean, status: string, snapshot?: Object, errors?: string[], error?: string }}
 */
export function getSnapshot(snapshotId, { storage = null } = {}) {
  if (!snapshotId || typeof snapshotId !== 'string') {
    return {
      success: false,
      status: 'invalid_id',
      error: 'snapshotId must be a valid non-empty string.',
    };
  }

  const store = resolveStorage(storage);
  let raw = null;

  try {
    raw = store.getItem(SNAPSHOT_STORAGE_KEY);
  } catch (err) {
    return {
      success: false,
      status: 'storage_failure',
      error: `Storage failure while reading snapshots: ${err.message || String(err)}`,
    };
  }

  if (!raw) {
    return {
      success: false,
      status: 'not_found',
      error: `Snapshot "${snapshotId}" not found in storage.`,
    };
  }

  let dict = null;
  try {
    dict = JSON.parse(raw);
  } catch {
    return {
      success: false,
      status: 'corrupted_storage',
      error: 'Snapshot storage record is malformed JSON.',
    };
  }

  if (!dict || typeof dict !== 'object' || !dict[snapshotId]) {
    return {
      success: false,
      status: 'not_found',
      error: `Snapshot "${snapshotId}" not found in storage.`,
    };
  }

  const candidate = dict[snapshotId];
  const val = validateConfigurationSnapshot(candidate);
  if (!val.isValid) {
    return {
      success: false,
      status: 'validation_failure',
      errors: val.errors,
      error: `Persisted snapshot "${snapshotId}" is invalid: ${val.errors[0]}`,
    };
  }

  return {
    success: true,
    status: 'valid',
    snapshot: candidate,
  };
}

/**
 * Lists all stored configuration snapshots, validating each record.
 *
 * @param {Object} [options]
 * @param {Object} [options.storage] - Storage provider.
 * @returns {Array<{ snapshot: Object, isValid: boolean, errors?: string[] }>}
 */
export function listSnapshots({ storage = null } = {}) {
  const store = resolveStorage(storage);
  let raw = null;
  try {
    raw = store.getItem(SNAPSHOT_STORAGE_KEY);
  } catch {
    return [];
  }

  if (!raw) return [];

  let dict = {};
  try {
    dict = JSON.parse(raw);
    if (!dict || typeof dict !== 'object' || Array.isArray(dict)) {
      return [];
    }
  } catch {
    return [];
  }

  return Object.values(dict).map((snap) => {
    const val = validateConfigurationSnapshot(snap);
    return {
      snapshot: snap,
      isValid: val.isValid,
      errors: val.isValid ? [] : val.errors,
    };
  });
}

/**
 * Retrieves the currently active configuration record from storage.
 * If none exists or if the stored record is invalid, initializes and returns
 * the canonical factory baseline active record at revision 1.
 *
 * @param {Object} [options]
 * @param {Object} [options.storage] - Storage provider.
 * @returns {Object} Active configuration record.
 */
export function getActiveConfigRecord({ storage = null } = {}) {
  const store = resolveStorage(storage);
  let raw = null;

  try {
    raw = store.getItem(ACTIVE_CONFIG_RECORD_KEY);
  } catch {
    raw = null;
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.schemaVersion === SNAPSHOT_SCHEMA_VERSION &&
        typeof parsed.revision === 'number' &&
        parsed.revision >= 1 &&
        parsed.activeWeights
      ) {
        const weightVal = validateWeightsPayload(parsed.activeWeights);
        if (weightVal.isValid) {
          return {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            revision: parsed.revision,
            activeWeights: Object.freeze({ ...weightVal.validatedWeights }),
            sourceSnapshotId: String(parsed.sourceSnapshotId || 'snap_factory_baseline'),
            provenance: String(parsed.provenance || 'factory_baseline'),
            updatedAt: parsed.updatedAt || new Date().toISOString(),
            isFactoryBaseline: Boolean(parsed.isFactoryBaseline),
            productionApplied: false, // Invariant: production adaptation remains hard-disabled
          };
        }
      }
    } catch {
      // Fall through to factory baseline record
    }
  }

  // Canonical factory baseline record fallback
  const defaultRecord = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    revision: 1,
    activeWeights: Object.freeze({ ...FACTORY_SCHEDULER_WEIGHTS }),
    sourceSnapshotId: 'snap_factory_baseline',
    provenance: 'factory_baseline',
    updatedAt: new Date().toISOString(),
    isFactoryBaseline: true,
    productionApplied: false,
  };

  try {
    store.setItem(ACTIVE_CONFIG_RECORD_KEY, JSON.stringify(defaultRecord));
  } catch {
    // Ignore storage errors on read-path fallback
  }

  return defaultRecord;
}

/**
 * Persists an active configuration record.
 * Internal helper: validates record structure before saving.
 *
 * @param {Object} record
 * @param {Object} [options]
 * @param {Object} [options.storage]
 * @returns {{ success: boolean, error?: string }}
 */
function saveActiveConfigRecord(record, { storage = null } = {}) {
  const store = resolveStorage(storage);
  try {
    const payload = JSON.stringify(record);
    store.setItem(ACTIVE_CONFIG_RECORD_KEY, payload);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Storage failure while writing active config: ${err.message || String(err)}`,
    };
  }
}

/**
 * Rolls back the active configuration record to a target validated snapshot.
 *
 * Requirements:
 * - Validates the target snapshot before touching the active configuration record.
 * - Prevents stale rollback overwrites via expectedRevision checks.
 * - If target validation or persistence fails, active configuration remains 100% untouched.
 * - Invariant: Does NOT activate production adaptation (isAdaptationUnlocked remains false).
 *
 * @param {string} targetSnapshotId - ID of target snapshot to restore.
 * @param {Object} [options]
 * @param {number} [options.expectedRevision] - Optimistic concurrency revision check.
 * @param {Object} [options.storage] - Storage provider.
 * @returns {{
 *   success: boolean,
 *   status: string,
 *   activeConfig: Object,
 *   restoredWeights?: Object,
 *   error?: string,
 *   errors?: string[],
 *   currentRevision?: number
 * }}
 */
export function rollbackToSnapshot(targetSnapshotId, { expectedRevision, storage = null } = {}) {
  const currentActive = getActiveConfigRecord({ storage });

  // 1. Revision conflict check
  if (expectedRevision !== undefined && currentActive.revision !== expectedRevision) {
    return {
      success: false,
      status: 'revision_conflict',
      error: `Revision conflict: expected revision ${expectedRevision}, but current active revision is ${currentActive.revision}.`,
      currentRevision: currentActive.revision,
      activeConfig: currentActive,
    };
  }

  // 2. Target snapshot lookup & validation
  const targetResult = getSnapshot(targetSnapshotId, { storage });
  if (!targetResult.success) {
    return {
      success: false,
      status: targetResult.status,
      errors: targetResult.errors || [targetResult.error],
      error: targetResult.error || 'Target snapshot validation failed.',
      activeConfig: currentActive, // Preserved untouched
    };
  }

  const targetSnapshot = targetResult.snapshot;

  // 3. Check if target weights match factory defaults
  let isFactory = true;
  for (const k of VALID_WEIGHT_KEYS) {
    if (Math.abs(targetSnapshot.weights[k] - FACTORY_SCHEDULER_WEIGHTS[k]) > 0.001) {
      isFactory = false;
      break;
    }
  }

  // 4. Construct next active configuration record with incremented revision
  const newActiveRecord = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    revision: currentActive.revision + 1,
    activeWeights: Object.freeze({ ...targetSnapshot.weights }),
    sourceSnapshotId: targetSnapshot.snapshotId,
    provenance: targetSnapshot.provenance || 'rollback_restoration',
    updatedAt: new Date().toISOString(),
    isFactoryBaseline: isFactory,
    productionApplied: false, // Invariant: Production adaptation remains hard-disabled
  };

  // 5. Atomic write attempt
  const writeResult = saveActiveConfigRecord(newActiveRecord, { storage });
  if (!writeResult.success) {
    return {
      success: false,
      status: 'storage_failure',
      error: writeResult.error,
      activeConfig: currentActive, // Preserved untouched
    };
  }

  return {
    success: true,
    status: 'success',
    activeConfig: newActiveRecord,
    restoredWeights: newActiveRecord.activeWeights,
  };
}

/**
 * Restores the active configuration record to canonical factory baseline defaults.
 *
 * Requirements:
 * - Always uses FACTORY_SCHEDULER_WEIGHTS from the authoritative source of truth.
 * - Does NOT require a candidate snapshot to be trusted first.
 * - Respects expectedRevision if provided.
 * - Invariant: Does NOT activate production adaptation (isAdaptationUnlocked remains false).
 *
 * @param {Object} [options]
 * @param {number} [options.expectedRevision] - Optimistic concurrency revision check.
 * @param {Object} [options.storage] - Storage provider.
 * @returns {{
 *   success: boolean,
 *   status: string,
 *   activeConfig: Object,
 *   restoredWeights: Object,
 *   error?: string,
 *   currentRevision?: number
 * }}
 */
export function restoreFactoryConfiguration({ expectedRevision, storage = null } = {}) {
  const currentActive = getActiveConfigRecord({ storage });

  if (expectedRevision !== undefined && currentActive.revision !== expectedRevision) {
    return {
      success: false,
      status: 'revision_conflict',
      error: `Revision conflict: expected revision ${expectedRevision}, but current active revision is ${currentActive.revision}.`,
      currentRevision: currentActive.revision,
      activeConfig: currentActive,
    };
  }

  // Ensure canonical factory snapshot exists in storage for provenance
  const factorySnapshot = createFactorySnapshot({ revision: 1 });
  saveSnapshot(factorySnapshot, { storage });

  const newActiveRecord = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    revision: currentActive.revision + 1,
    activeWeights: Object.freeze({ ...FACTORY_SCHEDULER_WEIGHTS }),
    sourceSnapshotId: factorySnapshot.snapshotId,
    provenance: 'factory_baseline',
    updatedAt: new Date().toISOString(),
    isFactoryBaseline: true,
    productionApplied: false, // Invariant: Production adaptation remains hard-disabled
  };

  const writeResult = saveActiveConfigRecord(newActiveRecord, { storage });
  if (!writeResult.success) {
    return {
      success: false,
      status: 'storage_failure',
      error: writeResult.error,
      activeConfig: currentActive,
    };
  }

  return {
    success: true,
    status: 'success',
    activeConfig: newActiveRecord,
    restoredWeights: Object.freeze({ ...FACTORY_SCHEDULER_WEIGHTS }),
  };
}
