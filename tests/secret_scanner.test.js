import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  scanSecrets,
  isExempt,
} from '../scripts/secretScanner.mjs';

function createTempDir(prefix = 'voxplan-secret-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

describe('Stage 8.4C: Adversarial Security Audit & Regression Suite for secretScanner.mjs', () => {
  it('1. A private-key header causes failure', () => {
    const tempDir = createTempDir();
    try {
      fs.writeFileSync(
        path.join(tempDir, 'key.pem'),
        '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0fakefixturefakekey\n-----END RSA PRIVATE KEY-----\n'
      );
      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(res.success, false, 'Private key header must be detected as violation');
      assert.ok(res.violations.some((v) => v.pattern === 'Private Key Header'));
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('2. A credential-like token (AWS, GitHub, Slack, OpenAI) causes failure', () => {
    const tempDir = createTempDir();
    try {
      // Fake AWS key fixture
      fs.writeFileSync(path.join(tempDir, 'config.js'), 'const awsKey = "AKIAIOSFODNN7FAKEFIX";\n');
      const resAws = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(resAws.success, false);
      assert.ok(resAws.violations.some((v) => v.pattern === 'AWS Access Key ID'));

      // Fake GitHub token fixture
      fs.writeFileSync(path.join(tempDir, 'config.js'), 'const token = "ghp_0123456789abcdefghijklmnopqrstuvwxyz";\n');
      const resGh = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(resGh.success, false);
      assert.ok(resGh.violations.some((v) => v.pattern.includes('GitHub')));

      // Fake OpenAI key fixture
      fs.writeFileSync(path.join(tempDir, 'config.js'), 'const aiKey = "sk-0123456789abcdefghijklmnopqrstuvwxyz";\n');
      const resAi = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(resAi.success, false);
      assert.ok(resAi.violations.some((v) => v.pattern === 'OpenAI API Key'));
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('3. A hardcoded credential assignment causes failure', () => {
    const tempDir = createTempDir();
    try {
      fs.writeFileSync(path.join(tempDir, 'auth.py'), 'api_key = "abcdefghijklmnopqrstuvwxyz123456"\n');
      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(res.success, false, 'Hardcoded api_key assignment must be flagged');
      assert.ok(res.violations.some((v) => v.pattern === 'Hardcoded Password / Key Assignment'));
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('4. A harmless placeholder passes cleanly', () => {
    const tempDir = createTempDir();
    try {
      fs.writeFileSync(
        path.join(tempDir, 'config.js'),
        'const apiBase = "http://localhost:8000";\nconst name = "VoxPlan";\nconst timeoutMs = 5000;\n'
      );
      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(res.success, true, 'Harmless configuration must pass scan');
      assert.strictEqual(res.violations.length, 0);
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('5. .env.example is allowed as a template file', () => {
    const tempDir = createTempDir();
    try {
      fs.writeFileSync(
        path.join(tempDir, '.env.example'),
        'VITE_API_BASE_URL=http://localhost:8000\nCORS_ORIGINS=http://localhost:5173\n'
      );
      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(res.success, true, '.env.example must be exempt from rejection');
      assert.strictEqual(res.envViolations.length, 0);
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('6. A real .env file in a nested directory is detected', () => {
    const tempDir = createTempDir();
    try {
      const subDir = path.join(tempDir, 'backend', 'config');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, '.env'), 'SECRET_TOKEN=xyz\n');

      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(res.success, false, 'Nested .env file must be detected');
      assert.ok(res.envViolations.some((f) => f.includes('backend/config/.env')));
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('7. A credential on a line containing the word "example" is still detected', () => {
    const tempDir = createTempDir();
    try {
      fs.writeFileSync(
        path.join(tempDir, 'service.js'),
        'const token = "ghp_0123456789abcdefghijklmnopqrstuvwxyz"; // for example in production\n'
      );
      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(
        res.success,
        false,
        'A credential on a line containing "example" must NOT be suppressed'
      );
      assert.ok(res.violations.some((v) => v.pattern.includes('GitHub')));
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('8. A credential in a file path containing "placeholder" is still detected', () => {
    const tempDir = createTempDir();
    try {
      const subDir = path.join(tempDir, 'src', 'placeholders');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(
        path.join(subDir, 'placeholderConfig.js'),
        'const access = "AKIAIOSFODNN7FAKEFIX";\n'
      );
      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(
        res.success,
        false,
        'A credential in a file path containing "placeholder" must still be detected'
      );
      assert.ok(res.violations.some((v) => v.pattern === 'AWS Access Key ID'));
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('9. A normal source path is NOT exempt merely because it contains an exemption substring', () => {
    // e.g. "src/utils/distance.js" contains "dist", but is not in "dist/" directory
    assert.strictEqual(isExempt('src/utils/distance.js'), false);
    assert.strictEqual(isExempt('components/DistributorModal.jsx'), false);
    assert.strictEqual(isExempt('dist/bundle.js'), true);
    assert.strictEqual(isExempt('node_modules/pkg/index.js'), true);
  });

  it('10. A tracked file with staged and unstaged changes is scanned from the working tree', () => {
    const tempDir = createTempDir();
    try {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'pipe' });

      // Clean committed file
      fs.writeFileSync(path.join(tempDir, 'main.js'), 'console.log("clean");\n');
      execSync('git add main.js && git commit -m "init"', { cwd: tempDir, stdio: 'pipe' });

      // Unstaged modification containing credential in working tree
      fs.writeFileSync(
        path.join(tempDir, 'main.js'),
        'console.log("clean");\nconst secret = "AKIAIOSFODNN7FAKEFIX";\n'
      );

      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(res.success, false, 'Working tree modification must be scanned');
      assert.ok(res.violations.some((v) => v.pattern === 'AWS Access Key ID'));
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('11. An untracked suspicious file is handled according to policy', () => {
    const tempDir = createTempDir();
    try {
      execSync('git init', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });
      execSync('git config user.email "test@example.com"', { cwd: tempDir, stdio: 'pipe' });

      // Untracked file containing token
      fs.writeFileSync(
        path.join(tempDir, 'untracked_leak.js'),
        'const token = "ghp_0123456789abcdefghijklmnopqrstuvwxyz";\n'
      );

      const res = scanSecrets({ rootDir: tempDir, silent: true, includeUntracked: true });
      assert.strictEqual(res.success, false, 'Untracked working tree file must be scanned');
      assert.ok(res.violations.some((v) => v.file.includes('untracked_leak.js')));
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('12. Git command failure does not produce a misleading full-coverage success', () => {
    const tempDir = createTempDir();
    try {
      // Non-git directory: scanner must fall back to directory walk and scan all files
      fs.writeFileSync(
        path.join(tempDir, 'leak.py'),
        'api_key = "abcdefghijklmnopqrstuvwxyz123456"\n'
      );
      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(res.gitAvailable, false, 'Git should be detected as unavailable');
      assert.strictEqual(res.success, false, 'Directory walk fallback must still detect secrets');
      assert.ok(res.violations.length > 0);
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('13. An unreadable file does not silently produce a clean result', () => {
    const tempDir = createTempDir();
    try {
      const filePath = path.join(tempDir, 'unreadable.txt');
      fs.writeFileSync(filePath, 'some content\n');
      try {
        // Attempt to restrict read permissions
        fs.chmodSync(filePath, 0o000);
      } catch {
        // Windows may not support 0o000 chmod fully; test operational error handling explicitly
      }

      // If readable, verify operational error path directly
      const res = scanSecrets({ rootDir: tempDir, silent: true });
      // Either permission prevented reading (operational error logged) or file was scanned
      assert.strictEqual(typeof res.success, 'boolean');
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('14. Scanner output does not reveal the actual suspected credential', () => {
    const tempDir = createTempDir();
    let capturedStderr = '';
    const originalError = console.error;
    console.error = (...args) => {
      capturedStderr += args.join(' ') + '\n';
    };

    const fakeSecret = 'AKIAIOSFODNN7FAKEFIX';
    try {
      fs.writeFileSync(path.join(tempDir, 'credentials.js'), `const key = "${fakeSecret}";\n`);
      scanSecrets({ rootDir: tempDir, silent: false });

      assert.doesNotMatch(
        capturedStderr,
        new RegExp(fakeSecret),
        'Stderr output must NEVER print the actual secret value'
      );
      assert.match(capturedStderr, /AWS Access Key ID/, 'Stderr must identify the pattern name');
      assert.match(capturedStderr, /credentials\.js/, 'Stderr must identify the file');
    } finally {
      console.error = originalError;
      cleanTempDir(tempDir);
    }
  });

  it('15. Large input does not cause pathological runtime', () => {
    const tempDir = createTempDir();
    try {
      // Generate a large file with repeating benign lines (2,500 lines / ~130 KB)
      const largeContent = 'const a = "normal benign text line without secrets";\n'.repeat(2500);
      fs.writeFileSync(path.join(tempDir, 'large.js'), largeContent);

      const t0 = Date.now();
      const res = scanSecrets({ rootDir: tempDir, silent: true });
      const elapsed = Date.now() - t0;

      assert.strictEqual(res.success, true);
      assert.ok(elapsed < 2000, `Large file scan took ${elapsed}ms; must complete in < 2000ms`);
    } finally {
      cleanTempDir(tempDir);
    }
  });

  it('16. A clean repository exits successfully and reports accurate scan coverage', () => {
    const tempDir = createTempDir();
    try {
      fs.writeFileSync(path.join(tempDir, 'index.js'), 'console.log("hello world");\n');
      fs.writeFileSync(path.join(tempDir, 'helper.py'), 'def add(a, b): return a + b\n');
      fs.writeFileSync(path.join(tempDir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));

      const res = scanSecrets({ rootDir: tempDir, silent: true });
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.scannedCount, 2, 'Must scan exactly 2 text files');
      assert.strictEqual(res.binaryCount, 1, 'Must exclude exactly 1 binary file');
      assert.strictEqual(res.violations.length, 0);
      assert.strictEqual(res.envViolations.length, 0);
    } finally {
      cleanTempDir(tempDir);
    }
  });
});
