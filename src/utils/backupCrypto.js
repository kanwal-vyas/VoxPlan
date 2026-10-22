/**
 * VoxPlan Encrypted Backup Cryptography Layer (Phase 8, Stage 8.2).
 *
 * Implements authenticated client-side encryption and key derivation using standard Web Crypto API:
 * - Cipher: AES-GCM (256-bit key) with 128-bit authentication tag.
 * - Key Derivation: PBKDF2 with SHA-256 (PBKDF2-HMAC-SHA256).
 * - Salt: 16 bytes (128 bits) cryptographically random per backup.
 * - IV / Nonce: 12 bytes (96 bits) cryptographically random per backup, never reused.
 * - Iterations: 600,000 default (OWASP recommendation), bounded between 100,000 and 1,000,000.
 * - Authenticated Additional Data (AAD): Cryptographic envelope metadata is bound to ciphertext.
 * - Bounds & Limits: Strict payload size cap (10 MB) to prevent resource exhaustion attacks.
 *
 * Zero cloud dependency: 100% in-browser Web Crypto API. Passwords and keys are NEVER persisted.
 */

export const BACKUP_FORMAT_IDENTIFIER = 'voxplan_encrypted_backup';
export const CURRENT_ENVELOPE_VERSION = 1;
export const CURRENT_APP_VERSION = '1.0.0';

export const MAX_BACKUP_FILE_SIZE = 10 * 1024 * 1024; // 10 Megabytes
export const MIN_KDF_ITERATIONS = 100000;
export const MAX_KDF_ITERATIONS = 1000000;
export const DEFAULT_KDF_ITERATIONS = 600000;
export const SALT_BYTE_LENGTH = 16;
export const IV_BYTE_LENGTH = 12;
export const TAG_LENGTH_BITS = 128;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Returns the native Web Crypto API instance available in the current environment.
 * @returns {SubtleCrypto}
 */
export function getSubtleCrypto() {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto.subtle;
  }
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto.subtle;
  }
  throw new Error('Web Crypto API (crypto.subtle) is not available in the current runtime environment.');
}

/**
 * Converts a Uint8Array into a standard Base64 string safely across Node and Browser environments.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function uint8ArrayToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a Base64 string into a Uint8Array safely across Node and Browser environments.
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToUint8Array(base64) {
  if (typeof base64 !== 'string' || base64.trim() === '') {
    throw new Error('Cannot convert empty or non-string base64 input.');
  }
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from a user password using PBKDF2-HMAC-SHA256.
 *
 * @param {string} password User-provided password string
 * @param {Uint8Array} salt Cryptographically random 16-byte salt
 * @param {number} iterations Iteration count (bounded [100000, 1000000])
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKeyFromPassword(password, salt, iterations = DEFAULT_KDF_ITERATIONS) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  }
  if (!(salt instanceof Uint8Array) || salt.byteLength !== SALT_BYTE_LENGTH) {
    throw new Error(`Cryptographic salt must be exactly ${SALT_BYTE_LENGTH} bytes.`);
  }
  if (
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < MIN_KDF_ITERATIONS ||
    iterations > MAX_KDF_ITERATIONS
  ) {
    throw new Error(
      `PBKDF2 iteration count must be an integer between ${MIN_KDF_ITERATIONS} and ${MAX_KDF_ITERATIONS}. Received: ${iterations}`
    );
  }

  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Creates canonical Authenticated Additional Data (AAD) bytes to bind envelope metadata to ciphertext.
 * If any of these fields are tampered with in the unencrypted envelope, AES-GCM authentication fails.
 *
 * @param {object} metadata
 * @returns {Uint8Array}
 */
export function createAadBytes(metadata) {
  const canonicalAad = JSON.stringify({
    format: metadata.format || BACKUP_FORMAT_IDENTIFIER,
    version: metadata.version || CURRENT_ENVELOPE_VERSION,
    app_version: metadata.app_version || CURRENT_APP_VERSION,
    kdf_algorithm: metadata.kdf?.algorithm || 'PBKDF2',
    kdf_hash: metadata.kdf?.hash || 'SHA-256',
    kdf_iterations: metadata.kdf?.iterations || DEFAULT_KDF_ITERATIONS,
    created_at: metadata.created_at || '',
  });
  return new TextEncoder().encode(canonicalAad);
}

/**
 * Encrypts a plaintext payload string into a versioned, authenticated backup envelope.
 *
 * @param {string} payloadJsonString Serialized JSON plaintext payload
 * @param {string} password User-provided encryption password
 * @param {object} [options]
 * @param {number} [options.iterations] Optional custom iterations count
 * @returns {Promise<object>} Versioned encrypted backup envelope
 */
export async function encryptBackupPayload(payloadJsonString, password, options = {}) {
  if (typeof payloadJsonString !== 'string' || payloadJsonString.trim() === '') {
    throw new Error('Payload must be a non-empty string.');
  }

  const payloadBytes = new TextEncoder().encode(payloadJsonString);
  if (payloadBytes.byteLength > MAX_BACKUP_FILE_SIZE) {
    throw new Error(`Payload size exceeds maximum allowed backup size of ${MAX_BACKUP_FILE_SIZE} bytes.`);
  }

  const iterations = options.iterations || DEFAULT_KDF_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
  const createdAt = new Date().toISOString();

  const envelopeMetadata = {
    format: BACKUP_FORMAT_IDENTIFIER,
    version: CURRENT_ENVELOPE_VERSION,
    app_version: CURRENT_APP_VERSION,
    created_at: createdAt,
    kdf: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
    },
  };

  const aad = createAadBytes(envelopeMetadata);
  const subtle = getSubtleCrypto();
  const key = await deriveKeyFromPassword(password, salt, iterations);

  const ciphertextBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
      tagLength: TAG_LENGTH_BITS,
    },
    key,
    payloadBytes
  );

  return {
    format: BACKUP_FORMAT_IDENTIFIER,
    version: CURRENT_ENVELOPE_VERSION,
    app_version: CURRENT_APP_VERSION,
    created_at: createdAt,
    kdf: {
      algorithm: 'PBKDF2',
      hash: 'SHA-256',
      iterations,
      salt: uint8ArrayToBase64(salt),
    },
    encryption: {
      cipher: 'AES-GCM',
      key_length: 256,
      iv: uint8ArrayToBase64(iv),
      tag_length: TAG_LENGTH_BITS,
    },
    ciphertext: uint8ArrayToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

/**
 * Decrypts a versioned backup envelope and returns the verified plaintext payload string.
 *
 * @param {object} envelope Versioned encrypted backup envelope
 * @param {string} password User-provided password
 * @returns {Promise<string>} Plaintext JSON string
 */
export async function decryptBackupPayload(envelope, password) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('Invalid backup envelope: expected an object.');
  }

  if (envelope.format !== BACKUP_FORMAT_IDENTIFIER) {
    throw new Error(`Unsupported backup format: expected "${BACKUP_FORMAT_IDENTIFIER}", got "${envelope.format}".`);
  }

  if (envelope.version !== CURRENT_ENVELOPE_VERSION) {
    throw new Error(
      `Unsupported envelope version: expected ${CURRENT_ENVELOPE_VERSION}, got ${envelope.version}.`
    );
  }

  if (!envelope.kdf || envelope.kdf.algorithm !== 'PBKDF2' || envelope.kdf.hash !== 'SHA-256') {
    throw new Error('Unsupported KDF configuration: expected PBKDF2 with SHA-256.');
  }

  const iterations = envelope.kdf.iterations;
  if (
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < MIN_KDF_ITERATIONS ||
    iterations > MAX_KDF_ITERATIONS
  ) {
    throw new Error(
      `KDF iterations out of bounds (${iterations}). Must be between ${MIN_KDF_ITERATIONS} and ${MAX_KDF_ITERATIONS}.`
    );
  }

  if (!envelope.encryption || envelope.encryption.cipher !== 'AES-GCM' || envelope.encryption.tag_length !== TAG_LENGTH_BITS) {
    throw new Error('Unsupported encryption cipher: expected AES-GCM with 128-bit authentication tag.');
  }

  const salt = base64ToUint8Array(envelope.kdf.salt);
  if (salt.byteLength !== SALT_BYTE_LENGTH) {
    throw new Error(`Invalid salt length: expected ${SALT_BYTE_LENGTH} bytes, got ${salt.byteLength}.`);
  }

  const iv = base64ToUint8Array(envelope.encryption.iv);
  if (iv.byteLength !== IV_BYTE_LENGTH) {
    throw new Error(`Invalid IV length: expected ${IV_BYTE_LENGTH} bytes, got ${iv.byteLength}.`);
  }

  const ciphertextBytes = base64ToUint8Array(envelope.ciphertext);
  if (ciphertextBytes.byteLength < 16) {
    throw new Error('Ciphertext is too short to contain a valid authentication tag.');
  }
  if (ciphertextBytes.byteLength > MAX_BACKUP_FILE_SIZE) {
    throw new Error(`Ciphertext size exceeds maximum allowed limit of ${MAX_BACKUP_FILE_SIZE} bytes.`);
  }

  const aad = createAadBytes(envelope);
  const subtle = getSubtleCrypto();
  const key = await deriveKeyFromPassword(password, salt, iterations);

  try {
    const decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: aad,
        tagLength: TAG_LENGTH_BITS,
      },
      key,
      ciphertextBytes
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    // Intentionally do not leak internal crypto stack trace
    throw new Error('Decryption failed: Incorrect password or corrupted/tampered backup file.');
  }
}
