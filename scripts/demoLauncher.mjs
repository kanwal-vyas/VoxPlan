#!/usr/bin/env node
/**
 * VoxPlan 72-Hour Demonstration Launcher & Orchestrator.
 *
 * Checks prerequisites, detects running services, launches FastAPI backend and
 * Vite frontend with active readiness health-checks, and opens the demo interface.
 *
 * Usage:
 *   npm run demo
 *   node scripts/demoLauncher.mjs [--no-open]
 */

import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = process.cwd();

const FRONTEND_PORT = 5173;
const BACKEND_PORT = 8000;
const openDirectApp = process.argv.includes('--app');
const targetPath = openDirectApp ? 'app' : '';
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}/${targetPath}`;
const BACKEND_HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/health`;
const BACKEND_STATUS_URL = `http://127.0.0.1:${BACKEND_PORT}/api/model/status`;

const noOpen = process.argv.includes('--no-open');
const isDryRun = process.argv.includes('--dry-run');
const isWindows = process.platform === 'win32';

let backendProcess = null;
let frontendProcess = null;

function logBanner() {
  console.log('\n============================================================');
  console.log('       ✦ VoxPlan 72-Hour Live Demo Launcher ✦');
  console.log('============================================================');
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  logBanner();
  console.log(`Usage:
  npm run demo [-- [options]]
  node scripts/demoLauncher.mjs [options]
  .\\run-demo.bat [options]

Options:
  --app       Open directly to Productivity Application (/app) instead of Landing Page (/)
  --no-open   Start services without automatically opening the browser
  --dry-run   Perform runtime checks and port inspection without launching background processes
  --help, -h  Display this help message
`);
  process.exit(0);
}

/**
 * Checks HTTP endpoint and returns body as JSON/text, or null if unreachable.
 * Uses IPv4 loopback (127.0.0.1) when probing localhost to prevent 20s OS IPv6 fallback delays on Windows.
 */
function probeHttp(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname === 'localhost' ? '127.0.0.1' : parsed.hostname;
      const req = http.request(
        {
          hostname,
          port: parsed.port,
          path: parsed.pathname + parsed.search,
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, statusCode: res.statusCode, body: data });
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => {
        resolve(null);
      });
      req.end();
    } catch {
      resolve(null);
    }
  });
}

/**
 * Actively polls an endpoint until it returns ok or times out.
 */
async function waitForReadiness(name, url, maxWaitMs = 15000, intervalMs = 400) {
  const start = Date.now();
  process.stdout.write(`  ⏳ Waiting for ${name} readiness at ${url}... `);
  while (Date.now() - start < maxWaitMs) {
    const res = await probeHttp(url);
    if (res && res.ok) {
      process.stdout.write('READY\n');
      return res;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  process.stdout.write('TIMEOUT\n');
  return null;
}

/**
 * Locates the appropriate Python executable (venv or system).
 */
function findPythonExecutable() {
  // Check local .venv first
  const venvPythonWin = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
  const venvPythonUnix = path.join(rootDir, '.venv', 'bin', 'python');

  if (isWindows && fs.existsSync(venvPythonWin)) {
    return venvPythonWin;
  }
  if (!isWindows && fs.existsSync(venvPythonUnix)) {
    return venvPythonUnix;
  }

  // Fallback to system python
  for (const cmd of ['python', 'python3']) {
    try {
      const ver = execSync(`${cmd} --version`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8' });
      if (ver && ver.toLowerCase().includes('python')) {
        return cmd;
      }
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * Verifies environment and dependencies.
 */
function checkEnvironment() {
  console.log('\n[1/5] Checking environment & runtime prerequisites...');

  // Check Node.js
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 18) {
    console.error(`  ❌ Error: Node.js version 18+ required. Current: ${process.version}`);
    process.exit(1);
  }
  console.log(`  ✓ Node.js runtime: ${process.version}`);

  // Check Python
  const pyExe = findPythonExecutable();
  if (!pyExe) {
    console.warn('  ⚠️ Warning: Python executable not found. ML backend features may be offline.');
  } else {
    try {
      const ver = execSync(`"${pyExe}" --version`, { encoding: 'utf-8' }).trim();
      console.log(`  ✓ Python runtime: ${ver} (${pyExe})`);
    } catch (err) {
      console.warn(`  ⚠️ Warning: Could not verify Python version: ${err.message}`);
    }
  }

  // Check node_modules
  if (!fs.existsSync(path.join(rootDir, 'node_modules'))) {
    console.error('  ❌ Error: node_modules missing. Please run "npm install" first.');
    process.exit(1);
  }
  console.log('  ✓ Frontend dependencies: present');

  return { pyExe };
}

/**
 * Checks whether ports are already running VoxPlan or conflicting.
 */
async function checkPorts() {
  console.log('\n[2/5] Checking service port status...');
  const portConflicts = { backend: false, frontend: false };

  // Check backend port 8000
  const backendProbe = await probeHttp(BACKEND_HEALTH_URL);
  let backendAlreadyRunning = false;
  if (backendProbe) {
    if (backendProbe.ok) {
      try {
        const json = JSON.parse(backendProbe.body);
        if (json.service === 'voxplan-ml') {
          backendAlreadyRunning = true;
          console.log(`  ✓ Backend is already running on port ${BACKEND_PORT} (VoxPlan service identified).`);
        } else {
          portConflicts.backend = true;
          console.warn(`  ⚠️ Port ${BACKEND_PORT} is in use by an unrecognized service (not VoxPlan).`);
        }
      } catch {
        portConflicts.backend = true;
        console.warn(`  ⚠️ Port ${BACKEND_PORT} responded with non-JSON content; occupied by an unrelated service.`);
      }
    } else {
      portConflicts.backend = true;
      console.warn(`  ⚠️ Port ${BACKEND_PORT} is in use (HTTP ${backendProbe.statusCode}).`);
    }
  }

  // Check frontend port 5173
  const frontendProbe = await probeHttp(FRONTEND_URL);
  let frontendAlreadyRunning = false;
  if (frontendProbe) {
    if (frontendProbe.ok) {
      if (frontendProbe.body && (frontendProbe.body.includes('VoxPlan') || frontendProbe.body.includes('voxplan'))) {
        frontendAlreadyRunning = true;
        console.log(`  ✓ Frontend is already running on port ${FRONTEND_PORT} (VoxPlan dev server identified).`);
      } else {
        portConflicts.frontend = true;
        console.warn(`  ⚠️ Port ${FRONTEND_PORT} is in use by an unrelated web service.`);
      }
    } else {
      portConflicts.frontend = true;
      console.warn(`  ⚠️ Port ${FRONTEND_PORT} is in use (HTTP ${frontendProbe.statusCode}).`);
    }
  }

  return { backendAlreadyRunning, frontendAlreadyRunning, portConflicts };
}

/**
 * Launches the backend process if not already running.
 */
async function startBackend(pyExe, alreadyRunning, hasConflict = false) {
  if (alreadyRunning) {
    return true;
  }
  if (hasConflict) {
    console.warn(`  ⚠️ Skipping backend launch: port ${BACKEND_PORT} is in use by another process. Please close it if you wish to run FastAPI ML.`);
    return false;
  }
  if (!pyExe) {
    console.log('  ⚠️ Skipping backend launch: Python executable not found. ML backend features will operate in client offline mode.');
    return false;
  }

  console.log('\n[3/5] Starting FastAPI ML backend service on port 8000...');
  const args = ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)];

  try {
    backendProcess = spawn(pyExe, args, {
      cwd: rootDir,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    backendProcess.stderr.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('ERROR') || msg.includes('Traceback')) {
        console.error(`  [Backend Error]: ${msg.trim()}`);
      }
    });

    backendProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`  [Backend]: process exited with code ${code}`);
      }
    });

    const ready = await waitForReadiness('FastAPI backend', BACKEND_HEALTH_URL, 15000);
    if (!ready) {
      console.warn('  ⚠️ FastAPI backend startup timed out. VoxPlan frontend will operate in offline resilience mode.');
    }
    return Boolean(ready);
  } catch (err) {
    console.error(`  ❌ Failed to start backend: ${err.message}`);
    return false;
  }
}

/**
 * Launches the frontend Vite server if not already running.
 */
async function startFrontend(alreadyRunning, hasConflict = false) {
  if (alreadyRunning) {
    return true;
  }
  if (hasConflict) {
    console.error(`  ❌ Port ${FRONTEND_PORT} is in use by an unrelated service. Cannot start Vite without conflicting. Please free port ${FRONTEND_PORT}.`);
    return false;
  }

  console.log('\n[4/5] Starting Vite frontend server on port 5173...');
  const npmCmd = isWindows ? 'npx.cmd' : 'npx';
  const args = ['vite', '--port', String(FRONTEND_PORT)];

  try {
    frontendProcess = spawn(npmCmd, args, {
      cwd: rootDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    frontendProcess.stderr.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('Error:')) {
        console.error(`  [Frontend Error]: ${msg.trim()}`);
      }
    });

    const ready = await waitForReadiness('Vite dev server', FRONTEND_URL, 15000);
    if (!ready) {
      console.error('  ❌ Vite frontend server timed out after 15s. Check that Node dependencies are installed.');
    }
    return Boolean(ready);
  } catch (err) {
    console.error(`  ❌ Failed to start frontend: ${err.message}`);
    return false;
  }
}

/**
 * Displays status dashboard and launches browser.
 */
async function reportAndLaunch() {
  console.log('\n[5/5] Inspecting live system capabilities & holdout metrics...');

  const modelProbe = await probeHttp(BACKEND_STATUS_URL);
  let modelInfo = 'Backend Offline (Client-side offline mode active)';
  if (modelProbe && modelProbe.ok) {
    try {
      const json = JSON.parse(modelProbe.body);
      if (json.is_trained) {
        modelInfo = `${json.model_type || 'RandomForest'} [TRAINED] | Acc: ${(json.accuracy * 100).toFixed(1)}% | F1: ${(json.f1_score * 100).toFixed(1)}%`;
      } else {
        modelInfo = 'Model Online but Untrained (Ready for /api/train)';
      }
    } catch {
      modelInfo = 'Online';
    }
  }

  const backendProbe = await probeHttp(BACKEND_HEALTH_URL, 800);
  const isBackendLive = Boolean(backendProbe && backendProbe.ok);
  const frontendProbe = await probeHttp(FRONTEND_URL, 800);
  const isFrontendLive = Boolean(frontendProbe && frontendProbe.ok);

  logBanner();
  console.log(`  Frontend Server:     ${FRONTEND_URL}  [${isFrontendLive ? 'ONLINE' : 'OFFLINE'}]`);
  console.log(`  Backend ML API:      http://127.0.0.1:${BACKEND_PORT}/   [${isBackendLive ? 'ONLINE' : 'OFFLINE (Client-side offline mode active)'}]`);
  console.log(`  Model Intelligence:  ${modelInfo}`);
  console.log('------------------------------------------------------------');
  console.log('  Live Demo Entry:     ' + FRONTEND_URL);
  console.log('  Voice Dictation:     Supported in Google Chrome & Microsoft Edge');
  console.log('  Demo Data Seeder:    Available via UI Header button & window.voxplanDemo');
  console.log('  Offline Resilience:  Full task management & adaptive scheduling work offline');
  console.log('------------------------------------------------------------');
  console.log('  Press Ctrl+C to cleanly stop all background processes.');
  console.log('============================================================\n');

  if (!noOpen) {
    try {
      console.log('  🌐 Opening demonstration in your default browser...');
      if (isWindows) {
        spawn('cmd.exe', ['/c', 'start', '', FRONTEND_URL], { detached: true, stdio: 'ignore' });
      } else if (process.platform === 'darwin') {
        spawn('open', [FRONTEND_URL], { detached: true, stdio: 'ignore' });
      } else {
        spawn('xdg-open', [FRONTEND_URL], { detached: true, stdio: 'ignore' });
      }
    } catch (err) {
      console.warn(`  ⚠️ Could not open browser automatically: ${err.message}. Please navigate to ${FRONTEND_URL}`);
    }
  }
}

/**
 * Graceful cleanup of child processes on exit.
 * Terminates ONLY processes spawned by this specific launcher invocation.
 */
function cleanup() {
  console.log('\n[Shutdown] Stopping launched background services...');
  if (backendProcess && !backendProcess.killed) {
    try {
      if (isWindows && backendProcess.pid) {
        try {
          execSync(`taskkill /pid ${backendProcess.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          backendProcess.kill('SIGTERM');
        }
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
  }
  if (frontendProcess && !frontendProcess.killed) {
    try {
      if (isWindows && frontendProcess.pid) {
        try {
          execSync(`taskkill /pid ${frontendProcess.pid} /T /F`, { stdio: 'ignore' });
        } catch {
          frontendProcess.kill('SIGTERM');
        }
      } else {
        frontendProcess.kill('SIGTERM');
      }
    } catch {
      // ignore
    }
  }
  console.log('  ✓ Services stopped. Goodbye!\n');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Main orchestrator flow
async function main() {
  logBanner();
  const { pyExe } = checkEnvironment();
  const { backendAlreadyRunning, frontendAlreadyRunning, portConflicts } = await checkPorts();

  if (isDryRun) {
    console.log('\n[Dry Run] Preflight and port inspection completed.');
    console.log(`  Backend Service (port ${BACKEND_PORT}):  ${backendAlreadyRunning ? 'Running (VoxPlan verified)' : portConflicts.backend ? 'Port occupied by another process' : 'Available for launch'}`);
    console.log(`  Frontend Service (port ${FRONTEND_PORT}): ${frontendAlreadyRunning ? 'Running (VoxPlan verified)' : portConflicts.frontend ? 'Port occupied by another process' : 'Available for launch'}`);
    console.log(`  Target Launch URL:       ${FRONTEND_URL}`);
    console.log(`  Browser Auto-Open:       ${noOpen ? 'Disabled (--no-open)' : 'Enabled'}`);
    console.log('\n✓ Dry run preflight successful.\n');
    process.exit(0);
  }

  await startBackend(pyExe, backendAlreadyRunning, portConflicts.backend);
  const frontendOk = await startFrontend(frontendAlreadyRunning, portConflicts.frontend);

  if (!frontendOk && !frontendAlreadyRunning) {
    console.error('\n❌ Frontend is not running or failed readiness checks. Demo cannot launch.\n');
    cleanup();
    return;
  }

  await reportAndLaunch();

  // Keep process alive if any child was spawned
  if (backendProcess || frontendProcess) {
    // wait for interrupt
  } else {
    // Both were already running
    console.log('  All services were already running. You may close this window at any time.');
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal demo launcher error:', err);
  cleanup();
});
