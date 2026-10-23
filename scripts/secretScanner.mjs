#!/usr/bin/env node
/**
 * VoxPlan Dedicated Secret & Credential Scanner.
 *
 * Scans repository files and working tree for exposed credentials and active .env files.
 * Designed to provide reproducible, path-aware secret detection with zero credential leakage in logs.
 *
 * Usage:
 *   node scripts/secretScanner.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// High-confidence, bounded credential patterns (ReDoS safe)
export const SECRET_PATTERNS = [
  {
    name: 'Private Key Header',
    regex: /-----BEGIN\s+(?:[A-Z0-9_-]+\s+)?PRIVATE KEY(?: BLOCK)?-----/,
  },
  {
    name: 'AWS Access Key ID',
    regex: /\b(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    name: 'GitHub Personal Access / OAuth / App Token',
    regex: /\b(?:ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}|gho_[a-zA-Z0-9]{36}|ghs_[a-zA-Z0-9]{36}|ghr_[a-zA-Z0-9]{36})\b/,
  },
  {
    name: 'Slack Token',
    regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/,
  },
  {
    name: 'Stripe Secret Key',
    regex: /\b[sr]k_(?:live|test)_[0-9a-zA-Z]{24,}\b/,
  },
  {
    name: 'OpenAI API Key',
    regex: /\bsk-(?:proj-)?[a-zA-Z0-9_-]{20,}\b/,
  },
  {
    name: 'Hardcoded Password / Key Assignment',
    regex: /(?:password|secret_key|api_key|access_token|private_token)\s*[:=]\s*['"][a-zA-Z0-9!@#$%^&*()_+=\-`~[\]{}|;:,.<>?]{16,}['"]/i,
  },
];

// File extensions treated as binary and skipped from line-by-line text regex scans
export const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.joblib', '.pyc', '.wasm', '.woff', '.woff2', '.ttf', '.eot',
  '.pdf', '.zip', '.tar', '.gz', '.db', '.sqlite',
]);

// Maximum file size in bytes to scan (files > 2 MB skipped from regex scanning with warning)
export const MAX_SCAN_FILE_SIZE = 2 * 1024 * 1024;

/**
 * Checks if a relative path is exempt from secret scanning.
 * Uses strict path-boundary matching rather than broad substring search.
 *
 * @param {string} relPath - Relative file path to repository root.
 * @returns {boolean}
 */
export function isExempt(relPath) {
  if (!relPath) return true;
  const norm = relPath.replace(/\\/g, '/').replace(/^\.\//, '');

  // Exact file exemptions
  if (norm === '.env.example' || norm.endsWith('/.env.example')) return true;
  if (norm === 'package-lock.json') return true;

  // Scanner's own file definition contains pattern regexes
  if (norm === 'scripts/secretScanner.mjs') return true;

  // Dedicated test files that explicitly test the secret scanner itself
  if (norm === 'tests/secret_scanner.test.js') return true;

  // Strict directory boundary checks (only exempt if at root or as directory component)
  const exemptPrefixes = [
    'node_modules/',
    'dist/',
    '.git/',
    '.venv/',
    'venv/',
    '__pycache__/',
    '.pytest_cache/',
  ];

  for (const prefix of exemptPrefixes) {
    if (norm === prefix.slice(0, -1) || norm.startsWith(prefix) || norm.includes('/' + prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively scans directory for active environment files at any depth.
 * Allows .env.example templates; flags real .env, .env.local, .env.production, etc.
 *
 * @param {string} dir - Directory to inspect.
 * @param {string} root - Repository root for calculating relative paths.
 * @param {string[]} found - Accumulator for found forbidden env files.
 * @returns {string[]}
 */
export function findEnvironmentFiles(dir, root = dir, found = []) {
  if (!fs.existsSync(dir)) return found;

  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (isExempt(relPath + '/')) continue;
      findEnvironmentFiles(fullPath, root, found);
    } else if (entry.isFile()) {
      const name = entry.name;
      // Check for .env or .env.* or *.env
      if (name === '.env' || name.startsWith('.env.') || name.endsWith('.env')) {
        // Documented template exemption
        if (name === '.env.example') continue;
        found.push(relPath);
      }
    }
  }

  return found;
}

/**
 * Checks if a buffer appears to be binary by checking for null bytes.
 *
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function isBinaryContent(buffer) {
  const checkLen = Math.min(buffer.length, 8000);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

/**
 * Fast string inclusion pre-check before evaluating full regular expressions.
 * Prevents pathological linear runtime on large files with benign text.
 */
export function lineMightContainSecret(line) {
  if (line.includes('-----BEGIN')) return true;
  if (
    line.includes('AKIA') ||
    line.includes('ASIA') ||
    line.includes('AROA') ||
    line.includes('A3T') ||
    line.includes('AGPA') ||
    line.includes('AIDA') ||
    line.includes('AIPA') ||
    line.includes('ANPA') ||
    line.includes('ANVA')
  ) {
    return true;
  }
  if (
    line.includes('ghp_') ||
    line.includes('github_pat_') ||
    line.includes('gho_') ||
    line.includes('ghs_') ||
    line.includes('ghr_')
  ) {
    return true;
  }
  if (line.includes('xox')) return true;
  if (line.includes('sk_') || line.includes('rk_') || line.includes('sk-')) return true;

  const lower = line.toLowerCase();
  if (
    lower.includes('password') ||
    lower.includes('secret') ||
    lower.includes('api_key') ||
    lower.includes('access_token') ||
    lower.includes('private_token')
  ) {
    return true;
  }

  return false;
}

/**
 * Main scanner function.
 *
 * @param {Object} options
 * @param {string} [options.rootDir] - Root directory to scan (defaults to process.cwd()).
 * @param {boolean} [options.silent=false] - Suppress console output.
 * @param {boolean} [options.includeUntracked=true] - Include untracked working tree files.
 * @returns {{
 *   success: boolean,
 *   scannedCount: number,
 *   exemptCount: number,
 *   binaryCount: number,
 *   oversizedCount: number,
 *   violations: Array<{ pattern: string, file: string, line: number }>,
 *   envViolations: string[],
 *   operationalErrors: string[]
 * }}
 */
export function scanSecrets(options = {}) {
  const root = path.resolve(options.rootDir || process.cwd());
  const silent = Boolean(options.silent);
  const includeUntracked = options.includeUntracked !== false;

  const log = (...args) => { if (!silent) console.log(...args); };
  const logWarn = (...args) => { if (!silent) console.warn(...args); };
  const logError = (...args) => { if (!silent) console.error(...args); };

  log('🔍 Running VoxPlan Dedicated Secret & Credential Scanner...');

  const violations = [];
  const operationalErrors = [];
  let scannedCount = 0;
  let exemptCount = 0;
  let binaryCount = 0;
  let oversizedCount = 0;

  // 1. Recursive check for forbidden .env files at any repository depth
  const envViolations = findEnvironmentFiles(root, root);
  if (envViolations.length > 0) {
    for (const f of envViolations) {
      logError(`❌ Security Violation: Active environment file present in workspace: ${f}`);
      logError('   Real .env files must never be present in the repository or committed.');
    }
  }

  // 2. Discover files to scan (Git tracked + untracked working-tree files, with directory walk fallback)
  let filesToScan = [];
  let gitAvailable = false;

  try {
    const gitTracked = execSync('git ls-files', { encoding: 'utf-8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    const trackedList = gitTracked.split('\n').map((s) => s.trim()).filter(Boolean);

    let untrackedList = [];
    if (includeUntracked) {
      try {
        const gitUntracked = execSync('git ls-files --others --exclude-standard', { encoding: 'utf-8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
        untrackedList = gitUntracked.split('\n').map((s) => s.trim()).filter(Boolean);
      } catch {
        // Fallback gracefully without untracked list if git command fails
      }
    }

    const fileSet = new Set([...trackedList, ...untrackedList]);
    filesToScan = Array.from(fileSet);
    gitAvailable = true;
  } catch (err) {
    logWarn(`⚠️ Warning: Git repository inspection failed (${err.message}).`);
    logWarn('   Performing comprehensive directory walk fallback of the workspace.');

    // Comprehensive fallback directory walk
    function walkDir(dir) {
      let results = [];
      let list = [];
      try {
        list = fs.readdirSync(dir, { withFileTypes: true });
      } catch (readErr) {
        operationalErrors.push(`Failed to read directory: ${path.relative(root, dir)} (${readErr.message})`);
        return results;
      }

      for (const entry of list) {
        const full = path.join(dir, entry.name);
        const rel = path.relative(root, full).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          if (!isExempt(rel + '/')) {
            results = results.concat(walkDir(full));
          }
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          if (!isExempt(rel)) {
            results.push(rel);
          }
        }
      }
      return results;
    }

    filesToScan = walkDir(root);
  }

  // 3. Scan each file from working tree
  for (const relPath of filesToScan) {
    if (isExempt(relPath)) {
      exemptCount++;
      continue;
    }

    const fullPath = path.join(root, relPath);

    // Verify file presence in working tree
    let stats;
    try {
      stats = fs.lstatSync(fullPath);
    } catch {
      // File listed by git but deleted from working tree: safe to skip
      continue;
    }

    if (stats.isSymbolicLink()) {
      try {
        const real = fs.realpathSync(fullPath);
        if (!real.startsWith(root)) {
          logWarn(`⚠️ Skipping symlink pointing outside repository root: ${relPath}`);
          continue;
        }
      } catch {
        continue;
      }
    }

    if (!stats.isFile() && !stats.isSymbolicLink()) {
      continue;
    }

    // Skip known binary extensions
    const ext = path.extname(relPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      binaryCount++;
      continue;
    }

    // Check file size
    if (stats.size > MAX_SCAN_FILE_SIZE) {
      oversizedCount++;
      logWarn(`⚠️ Skipping oversized file (> ${MAX_SCAN_FILE_SIZE} bytes): ${relPath}`);
      continue;
    }

    // Read file buffer to detect binary content
    let rawBuffer;
    try {
      rawBuffer = fs.readFileSync(fullPath);
    } catch (readErr) {
      operationalErrors.push(`Failed to read tracked file: ${relPath} (${readErr.message})`);
      logError(`❌ Operational Error: Unable to read file for scanning: ${relPath}`);
      continue;
    }

    if (isBinaryContent(rawBuffer)) {
      binaryCount++;
      continue;
    }

    const content = rawBuffer.toString('utf-8');
    const lines = content.split(/\r?\n/);
    scannedCount++;

    lines.forEach((line, idx) => {
      if (!lineMightContainSecret(line)) return;

      // For each pattern, test line
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.regex.test(line)) {
          // Narrow test fixture exception for dummy passwords in unit test files
          if (
            pattern.name === 'Hardcoded Password / Key Assignment' &&
            (relPath.startsWith('tests/') || relPath.includes('test')) &&
            (line.toLowerCase().includes('testpassword') ||
             line.toLowerCase().includes('dummy') ||
             line.toLowerCase().includes('fixture') ||
             line.toLowerCase().includes('mock') ||
             line.includes('placeholder-token'))
          ) {
            continue;
          }

          // Important: Never print the secret snippet or line content to console/logs
          logError(`❌ Suspicious Credential Match: [${pattern.name}] in ${relPath}:${idx + 1}`);
          violations.push({
            pattern: pattern.name,
            file: relPath,
            line: idx + 1,
          });
        }
      }
    });
  }

  const hasFailures = violations.length > 0 || envViolations.length > 0 || operationalErrors.length > 0;

  if (hasFailures) {
    if (violations.length > 0) {
      logError(`\n❌ Secret scan failed with ${violations.length} suspicious pattern match(es).`);
    }
    if (envViolations.length > 0) {
      logError(`❌ Found ${envViolations.length} active environment file(s) in workspace.`);
    }
    if (operationalErrors.length > 0) {
      logError(`❌ Encountered ${operationalErrors.length} operational scanning error(s).`);
    }
    logError('   Please review and remove sensitive materials before staging or pushing.\n');
  } else {
    log(`✓ No configured secret patterns matched in the scanned files (${scannedCount} files scanned, ${exemptCount} exempt, ${binaryCount} binary, ${oversizedCount} oversized).\n`);
  }

  return {
    success: !hasFailures,
    gitAvailable,
    scannedCount,
    exemptCount,
    binaryCount,
    oversizedCount,
    violations,
    envViolations,
    operationalErrors,
  };
}

// If executed directly from command line, run scan and set exit code
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) {
  const result = scanSecrets();
  process.exit(result.success ? 0 : 1);
}
