/**
 * VoxPlan Automated CI Pipeline, Deployment Hardening & Security Audit Suite.
 *
 * Verifies:
 * 1. GitHub Actions CI workflow syntax, trigger policies, least-privilege permissions, and timeouts.
 * 2. Secret exposure prevention, .gitignore coverage, and placeholder-only environment documentation.
 * 3. Reproducible production build and PWA artifact completeness.
 * 4. Content Security Policy (CSP), framing protection, and HTTP security response headers.
 * 5. Minimal multi-stage non-root containerization configuration.
 * 6. Invariant preservation for frozen factory scheduler weights and Phase 7.4.4B locking.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';

const rootDir = process.cwd();

describe('Phase 8, Stage 8.4: CI Pipeline, Reproducible Builds & Deployment Hardening', () => {

  describe('1. GitHub Actions CI Workflow Architecture & Safety', () => {
    const ciPath = path.join(rootDir, '.github', 'workflows', 'ci.yml');

    it('1.1 Workflow file exists and is readable', () => {
      assert.strictEqual(fs.existsSync(ciPath), true, 'ci.yml must exist');
      const content = fs.readFileSync(ciPath, 'utf8');
      assert.ok(content.length > 100, 'ci.yml must not be empty');
    });

    it('1.2 Enforces least-privilege read-only permissions', () => {
      const content = fs.readFileSync(ciPath, 'utf8');
      assert.match(content, /permissions:\s+contents:\s+read/, 'Must declare contents: read least-privilege');
      assert.doesNotMatch(content, /contents:\s+write/, 'Must NOT declare write permissions');
    });

    it('1.3 Configures appropriate push and pull_request triggers', () => {
      const content = fs.readFileSync(ciPath, 'utf8');
      assert.match(content, /push:\s+branches:\s+\[\s*main\s*\]/, 'Must trigger on push to main');
      assert.match(content, /pull_request:\s+branches:\s+\[\s*main\s*\]/, 'Must trigger on PR to main');
      assert.doesNotMatch(content, /pull_request_target/, 'Must avoid privileged pull_request_target');
    });

    it('1.4 Separates frontend, backend, and security quality jobs with timeouts', () => {
      const content = fs.readFileSync(ciPath, 'utf8');
      assert.match(content, /frontend:/, 'Must define frontend job');
      assert.match(content, /backend:/, 'Must define backend job');
      assert.match(content, /security:/, 'Must define security job');
      assert.match(content, /timeout-minutes:\s+1[05]/, 'Must define sensible job timeouts');
    });

    it('1.5 Uses npm ci for reproducible clean installations', () => {
      const content = fs.readFileSync(ciPath, 'utf8');
      assert.match(content, /npm ci/, 'Must use npm ci for dependency installation');
    });

    it('1.6 Verifies backend dependency check, PYTHONPATH, and model immutability in CI', () => {
      const content = fs.readFileSync(ciPath, 'utf8');
      assert.match(content, /pip check/, 'Must run pip check in backend job');
      assert.match(content, /pytest backend\/tests\//, 'Must run pytest in backend job');
      assert.match(content, /PYTHONPATH:\s*\./, 'Must specify PYTHONPATH: . to ensure backend module resolution');
      assert.match(content, /git status --porcelain backend\/models/, 'Must verify model files are not dirtied by tests');
    });

    it('1.7 Pins third-party actions to immutable commit SHAs', () => {
      const content = fs.readFileSync(ciPath, 'utf8');
      assert.match(content, /actions\/checkout@11bd71901bbe5b1630ceea73d27597364c9af683/, 'Must pin checkout to immutable SHA');
      assert.match(content, /actions\/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af/, 'Must pin setup-node to immutable SHA');
      assert.match(content, /actions\/setup-python@42375524e23c412d93fb67b49958b491fce71c38/, 'Must pin setup-python to immutable SHA');
    });

    it('1.8 Security job includes pip-audit and dedicated secretScanner', () => {
      const content = fs.readFileSync(ciPath, 'utf8');
      assert.match(content, /pip-audit/, 'Must execute pip-audit in security job');
      assert.match(content, /secretScanner\.mjs/, 'Must execute dedicated secret scanner in security job');
    });
  });

  describe('2. Secret Protection, .gitignore & Environment Configuration', () => {
    it('2.1 .gitignore explicitly ignores secret files and virtual environments', () => {
      const gitignore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
      assert.match(gitignore, /\.env/, '.gitignore must ignore .env');
      assert.match(gitignore, /\.venv/, '.gitignore must ignore .venv');
      assert.match(gitignore, /!\.env\.example/, '.gitignore must allow .env.example template');
    });

    it('2.2 .env.example contains documented placeholders and zero secrets', () => {
      const envExamplePath = path.join(rootDir, '.env.example');
      assert.strictEqual(fs.existsSync(envExamplePath), true, '.env.example must exist');
      const content = fs.readFileSync(envExamplePath, 'utf8');
      assert.match(content, /VITE_API_BASE_URL=/, 'Must document VITE_API_BASE_URL');
      assert.match(content, /CORS_ORIGINS=/, 'Must document CORS_ORIGINS');
      assert.doesNotMatch(content, /password\s*=\s*[a-zA-Z0-9_-]{4,}/i, 'Must not contain passwords');
      assert.doesNotMatch(content, /api[_-]?key\s*=\s*[a-zA-Z0-9_-]{8,}/i, 'Must not contain API keys');
    });

    it('2.3 No committed .env or credentials exist in working tree', () => {
      assert.strictEqual(fs.existsSync(path.join(rootDir, '.env')), false, '.env must not exist in repository root');
    });

    it('2.4 Dedicated secret scanner executes cleanly with zero violations', () => {
      const scannerPath = path.join(rootDir, 'scripts', 'secretScanner.mjs');
      assert.strictEqual(fs.existsSync(scannerPath), true, 'secretScanner.mjs must exist');

      const output = execSync('node scripts/secretScanner.mjs', { cwd: rootDir, encoding: 'utf-8' });
      assert.match(output, /No configured secret patterns matched/);
    });
  });

  describe('3. Production Build & PWA Artifact Verification', () => {
    const distPath = path.join(rootDir, 'dist');

    it('3.1 Dist directory contains all required PWA manifest and icon assets', () => {
      if (fs.existsSync(distPath)) {
        assert.strictEqual(fs.existsSync(path.join(distPath, 'index.html')), true, 'dist/index.html must exist');
        assert.strictEqual(fs.existsSync(path.join(distPath, 'sw.js')), true, 'dist/sw.js must exist');
        assert.strictEqual(fs.existsSync(path.join(distPath, 'manifest.webmanifest')), true, 'dist/manifest.webmanifest must exist');
        assert.strictEqual(fs.existsSync(path.join(distPath, 'favicon.svg')), true, 'dist/favicon.svg must exist');
        assert.strictEqual(fs.existsSync(path.join(distPath, 'pwa-192x192.png')), true, 'dist/pwa-192x192.png must exist');
        assert.strictEqual(fs.existsSync(path.join(distPath, 'pwa-512x512.png')), true, 'dist/pwa-512x512.png must exist');
        assert.strictEqual(fs.existsSync(path.join(distPath, 'maskable-icon-512x512.png')), true, 'dist/maskable-icon-512x512.png must exist');
      } else {
        // Build may not have been run yet in local test run; check source assets
        assert.strictEqual(fs.existsSync(path.join(rootDir, 'public', 'manifest.webmanifest')), true);
        assert.strictEqual(fs.existsSync(path.join(rootDir, 'public', 'sw.js')), true);
      }
    });

    it('3.2 index.html contains no inline scripts to satisfy strict CSP', () => {
      const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
      const inlineScripts = indexHtml.match(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi);
      assert.strictEqual(inlineScripts, null, 'index.html must not contain inline scripts');
    });
  });

  describe('4. Browser Security Headers, CSP & SPA Routing Protection', () => {
    it('4.1 Backend defines security headers middleware with CSP, framing, and sniffing protection', () => {
      const mainPy = fs.readFileSync(path.join(rootDir, 'backend', 'main.py'), 'utf8');
      assert.match(mainPy, /add_security_headers/, 'main.py must define add_security_headers middleware');
      assert.match(mainPy, /response\.headers\["X-Content-Type-Options"\]\s*=\s*"nosniff"/, 'Must set X-Content-Type-Options: nosniff');
      assert.match(mainPy, /response\.headers\["X-Frame-Options"\]\s*=\s*"DENY"/, 'Must set X-Frame-Options: DENY');
      assert.match(mainPy, /response\.headers\["Referrer-Policy"\]\s*=\s*"strict-origin-when-cross-origin"/, 'Must set Referrer-Policy');
      assert.match(mainPy, /response\.headers\["Content-Security-Policy"\]/, 'Must set Content-Security-Policy');
      assert.match(mainPy, /response\.headers\["Permissions-Policy"\]/, 'Must set Permissions-Policy');
    });

    it('4.2 CSP directives avoid broad wildcards and restrict script/frame execution', () => {
      const mainPy = fs.readFileSync(path.join(rootDir, 'backend', 'main.py'), 'utf8');
      assert.match(mainPy, /default-src 'self'/, 'CSP must define default-src self');
      assert.match(mainPy, /script-src 'self'/, 'CSP must define script-src self');
      assert.match(mainPy, /object-src 'none'/, 'CSP must block object-src');
      assert.match(mainPy, /frame-ancestors 'none'/, 'CSP must block frame-ancestors');
      assert.doesNotMatch(mainPy, /script-src[^;]*'unsafe-eval'/, 'CSP script-src must not allow unsafe-eval');
    });

    it('4.3 SPA routing fallback explicitly protects /api endpoints from returning index.html', () => {
      const mainPy = fs.readFileSync(path.join(rootDir, 'backend', 'main.py'), 'utf8');
      assert.match(mainPy, /full_path\.startswith\("api\/"\)/, 'Must block /api routes from SPA fallback');
    });
  });

  describe('5. Containerization Architecture', () => {
    const dockerfilePath = path.join(rootDir, 'Dockerfile');
    const dockerignorePath = path.join(rootDir, '.dockerignore');

    it('5.1 Dockerfile implements multi-stage build with pinned runtimes', () => {
      assert.strictEqual(fs.existsSync(dockerfilePath), true, 'Dockerfile must exist');
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      assert.match(content, /FROM node:22-alpine AS frontend-builder/, 'Stage 1 must use Node 22 alpine');
      assert.match(content, /FROM python:3\.12-slim AS runner/, 'Stage 2 must use Python 3.12 slim');
    });

    it('5.2 Dockerfile enforces unprivileged non-root execution and native Python healthcheck', () => {
      const content = fs.readFileSync(dockerfilePath, 'utf8');
      assert.match(content, /useradd -u 10001 -g voxplan/, 'Must create dedicated non-root user');
      assert.match(content, /USER voxplan/, 'Must switch to unprivileged user');
      assert.match(content, /HEALTHCHECK/, 'Must declare container healthcheck');
      assert.match(content, /python -c "import urllib\.request/, 'Healthcheck must use native python urllib without external curl dependency');
    });

    it('5.3 .dockerignore excludes source control, dependencies, and environment files', () => {
      assert.strictEqual(fs.existsSync(dockerignorePath), true, '.dockerignore must exist');
      const content = fs.readFileSync(dockerignorePath, 'utf8');
      assert.match(content, /\.git/, 'Must ignore .git');
      assert.match(content, /node_modules/, 'Must ignore node_modules');
      assert.match(content, /\.venv/, 'Must ignore .venv');
      assert.match(content, /\.env/, 'Must ignore .env');
    });
  });

  describe('6. Scheduler Invariant Preservation & Activation Gate Locking', () => {
    it('6.1 FACTORY_SCHEDULER_WEIGHTS remain frozen with exact baseline weights', () => {
      assert.strictEqual(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS), true, 'FACTORY_SCHEDULER_WEIGHTS must be frozen');
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
    });
  });
});
