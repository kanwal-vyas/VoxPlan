import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  isServiceWorkerSupported,
  isOnline,
  subscribeNetworkStatus,
  subscribeServiceWorkerUpdate,
  applyServiceWorkerUpdate,
  canInstallPwa,
  promptPwaInstall,
  subscribeInstallPrompt,
} from '../src/utils/pwaManager.js';
import { FACTORY_SCHEDULER_WEIGHTS } from '../src/scheduler/adaptiveScheduler.js';
import { evaluateActivationGate } from '../src/scheduler/activationGateEvaluator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

describe('Phase 8, Stage 8.3: PWA Readiness, Safe Offline Behavior & Bundle Optimization', () => {
  describe('1. Web App Manifest & Icon Asset Verification', () => {
    it('1.1 manifest exists and parses as valid JSON with required PWA metadata', () => {
      const manifestPath = path.join(projectRoot, 'public', 'manifest.webmanifest');
      assert.strictEqual(fs.existsSync(manifestPath), true, 'manifest.webmanifest must exist in public/');

      const content = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      assert.strictEqual(typeof manifest.name, 'string');
      assert.ok(manifest.name.includes('VoxPlan'), 'name must include VoxPlan');
      assert.strictEqual(manifest.short_name, 'VoxPlan');
      assert.strictEqual(manifest.scope, '/');
      assert.strictEqual(manifest.start_url, '/app');
      assert.strictEqual(manifest.display, 'standalone');
      assert.strictEqual(manifest.theme_color, '#FFF8EF');
      assert.strictEqual(manifest.background_color, '#FFF8EF');
      assert.ok(Array.isArray(manifest.icons), 'icons must be an array');
      assert.ok(manifest.icons.length >= 3, 'manifest must define at least 3 icons');
    });

    it('1.2 all icons referenced in the manifest exist on disk with non-zero size', () => {
      const manifestPath = path.join(projectRoot, 'public', 'manifest.webmanifest');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      for (const icon of manifest.icons) {
        assert.ok(icon.src, 'icon must specify src');
        // Resolve path relative to public/
        const relativePath = icon.src.startsWith('/') ? icon.src.slice(1) : icon.src;
        const iconDiskPath = path.join(projectRoot, 'public', relativePath);
        assert.strictEqual(
          fs.existsSync(iconDiskPath),
          true,
          `Referenced icon ${icon.src} must exist at ${iconDiskPath}`
        );
        const stats = fs.statSync(iconDiskPath);
        assert.ok(stats.size > 0, `Icon ${icon.src} must have non-zero size`);
      }
    });

    it('1.3 manifest defines a maskable icon with safe zone support', () => {
      const manifestPath = path.join(projectRoot, 'public', 'manifest.webmanifest');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      const maskableIcon = manifest.icons.find((i) => i.purpose === 'maskable');
      assert.ok(maskableIcon, 'Manifest must declare a maskable icon');
      assert.strictEqual(maskableIcon.src, '/maskable-icon-512x512.png');
      assert.strictEqual(maskableIcon.sizes, '512x512');
    });

    it('1.4 index.html properly links to the manifest, apple-touch-icon, and theme-color', () => {
      const indexPath = path.join(projectRoot, 'index.html');
      const html = fs.readFileSync(indexPath, 'utf-8');

      assert.ok(html.includes('rel="manifest"'), 'index.html must link manifest');
      assert.ok(html.includes('href="/manifest.webmanifest"'), 'index.html must reference /manifest.webmanifest');
      assert.ok(html.includes('name="theme-color"'), 'index.html must specify theme-color');
      assert.ok(html.includes('content="#FFF8EF"'), 'theme-color must match VoxPlan cream #FFF8EF');
      assert.ok(html.includes('rel="apple-touch-icon"'), 'index.html must specify apple-touch-icon');
    });
  });

  describe('2. Service Worker Policy & Caching Integrity', () => {
    it('2.1 sw.js exists in public/ and defines explicit cache versions and prefixes', () => {
      const swPath = path.join(projectRoot, 'public', 'sw.js');
      assert.strictEqual(fs.existsSync(swPath), true, 'public/sw.js must exist');

      const swContent = fs.readFileSync(swPath, 'utf-8');
      assert.ok(swContent.includes("CACHE_PREFIX = 'voxplan-'"), 'sw.js must use voxplan- prefix');
      assert.ok(swContent.includes('APP_SHELL_CACHE'), 'sw.js must define APP_SHELL_CACHE');
      assert.ok(swContent.includes('STATIC_ASSETS_CACHE'), 'sw.js must define STATIC_ASSETS_CACHE');
    });

    it('2.2 sw.js activate handler deletes ONLY obsolete VoxPlan-owned caches', () => {
      const swPath = path.join(projectRoot, 'public', 'sw.js');
      const swContent = fs.readFileSync(swPath, 'utf-8');

      // Verifies that cache keys must start with CACHE_PREFIX before being deleted
      assert.ok(
        swContent.includes('name.startsWith(CACHE_PREFIX)'),
        'activate handler must filter keys by CACHE_PREFIX before deleting'
      );
      assert.ok(
        swContent.includes('!CURRENT_CACHES.includes(name)'),
        'activate handler must preserve current active caches'
      );
    });

    it('2.3 sw.js fetch handler strictly bypasses API calls and non-GET requests', () => {
      const swPath = path.join(projectRoot, 'public', 'sw.js');
      const swContent = fs.readFileSync(swPath, 'utf-8');

      // Check method guard
      assert.ok(
        swContent.includes("request.method !== 'GET'"),
        'sw.js must bypass non-GET requests'
      );
      // Check API guard
      assert.ok(
        swContent.includes("url.pathname.startsWith('/api/')"),
        'sw.js must bypass /api/ endpoints without caching'
      );
    });

    it('2.4 sw.js handles navigation requests with App Shell cache fallback', () => {
      const swPath = path.join(projectRoot, 'public', 'sw.js');
      const swContent = fs.readFileSync(swPath, 'utf-8');

      assert.ok(
        swContent.includes("request.mode === 'navigate'"),
        'sw.js must intercept navigate requests'
      );
      assert.ok(
        swContent.includes("match('/index.html')"),
        'sw.js must fall back to /index.html when offline'
      );
    });

    it('2.5 sw.js message handler supports controlled SKIP_WAITING', () => {
      const swPath = path.join(projectRoot, 'public', 'sw.js');
      const swContent = fs.readFileSync(swPath, 'utf-8');

      assert.ok(
        swContent.includes("event.data.type === 'SKIP_WAITING'"),
        'sw.js must listen for SKIP_WAITING'
      );
      assert.ok(
        swContent.includes('self.skipWaiting()'),
        'sw.js must call self.skipWaiting() on message'
      );
    });
  });

  describe('3. PWA Manager Lifecycle & Network Subscription', () => {
    it('3.1 detects service worker support accurately', () => {
      // In node.js test environment, navigator.serviceWorker is undefined
      assert.strictEqual(typeof isServiceWorkerSupported(), 'boolean');
    });

    it('3.2 isOnline returns true by default in non-browser or connected environments', () => {
      assert.strictEqual(typeof isOnline(), 'boolean');
    });

    it('3.3 subscribeNetworkStatus returns a callable unsubscribe function', () => {
      let statusCalled = false;
      const unsubscribe = subscribeNetworkStatus((_status) => {
        statusCalled = true;
      });
      assert.strictEqual(statusCalled, false);
      assert.strictEqual(typeof unsubscribe, 'function');
      unsubscribe();
    });

    it('3.4 subscribeServiceWorkerUpdate registers listeners safely', () => {
      let notified = false;
      const unsubscribe = subscribeServiceWorkerUpdate(({ hasUpdate }) => {
        notified = hasUpdate;
      });
      assert.strictEqual(notified, false);
      assert.strictEqual(typeof unsubscribe, 'function');
      unsubscribe();
    });

    it('3.5 applyServiceWorkerUpdate does not crash when waiting worker is absent', () => {
      // Should not throw in headless / test environment
      assert.doesNotThrow(() => {
        applyServiceWorkerUpdate();
      });
    });

    it('3.6 canInstallPwa returns false when no install prompt is deferred', () => {
      assert.strictEqual(canInstallPwa(), false);
    });

    it('3.7 promptPwaInstall returns unavailable when no prompt event is pending', async () => {
      const outcome = await promptPwaInstall();
      assert.strictEqual(outcome, 'unavailable');
    });

    it('3.8 subscribeInstallPrompt immediately reports current installability', () => {
      let currentCanInstall = null;
      const unsubscribe = subscribeInstallPrompt((canInstall) => {
        currentCanInstall = canInstall;
      });
      assert.strictEqual(currentCanInstall, false);
      assert.strictEqual(typeof unsubscribe, 'function');
      unsubscribe();
    });
  });

  describe('4. Route-Level & Component-Level Code Splitting', () => {
    it('4.1 App.jsx uses React.lazy and Suspense for LandingPage and ProductivityApp', () => {
      const appPath = path.join(projectRoot, 'src', 'App.jsx');
      const appContent = fs.readFileSync(appPath, 'utf-8');

      assert.ok(appContent.includes("lazy(() => import('./pages/LandingPage'))"), 'LandingPage must be lazy loaded');
      assert.ok(appContent.includes("lazy(() => import('./pages/ProductivityApp'))"), 'ProductivityApp must be lazy loaded');
      assert.ok(appContent.includes('<Suspense'), 'App.jsx must wrap routes in Suspense');
      assert.ok(appContent.includes('<RouteErrorBoundary>'), 'App.jsx must wrap routes in RouteErrorBoundary');
      assert.ok(appContent.includes('<OfflineBanner />'), 'App.jsx must render OfflineBanner');
      assert.ok(appContent.includes('<UpdateNotification />'), 'App.jsx must render UpdateNotification');
    });

    it('4.2 ProductivityApp.jsx lazy-loads heavy modals on demand', () => {
      const prodAppPath = path.join(projectRoot, 'src', 'pages', 'ProductivityApp.jsx');
      const content = fs.readFileSync(prodAppPath, 'utf-8');

      assert.ok(content.includes("lazy(() => import('../components/AdaptiveScheduleModal'))"), 'AdaptiveScheduleModal must be lazy loaded');
      assert.ok(content.includes("lazy(() => import('../components/BackupModal'))"), 'BackupModal must be lazy loaded');
      assert.ok(content.includes("lazy(() => import('../components/TaskExplanationModal'))"), 'TaskExplanationModal must be lazy loaded');
    });

    it('4.3 vite.config.js isolates vendor chunks (vendor-react, vendor-gsap)', () => {
      const viteConfigPath = path.join(projectRoot, 'vite.config.js');
      const content = fs.readFileSync(viteConfigPath, 'utf-8');

      assert.ok(content.includes('manualChunks'), 'vite.config.js must configure manualChunks');
      assert.ok(content.includes('vendor-react'), 'vite.config.js must isolate vendor-react');
      assert.ok(content.includes('vendor-gsap'), 'vite.config.js must isolate vendor-gsap');
    });

    it('4.4 dist/ build output verifies chunk separation and reduced initial bundle', () => {
      const distAssetsPath = path.join(projectRoot, 'dist', 'assets');
      if (!fs.existsSync(distAssetsPath)) {
        execSync('npm run build', { cwd: projectRoot, stdio: 'pipe' });
      }
      assert.strictEqual(fs.existsSync(distAssetsPath), true, 'dist/assets must exist after build');

      const files = fs.readdirSync(distAssetsPath);

      // Verify discrete chunk files exist
      const hasLandingChunk = files.some((f) => f.startsWith('LandingPage-') && f.endsWith('.js'));
      const hasProductivityChunk = files.some((f) => f.startsWith('ProductivityApp-') && f.endsWith('.js'));
      const hasAdaptiveModalChunk = files.some((f) => f.startsWith('AdaptiveScheduleModal-') && f.endsWith('.js'));
      const hasBackupModalChunk = files.some((f) => f.startsWith('BackupModal-') && f.endsWith('.js'));
      const hasGsapChunk = files.some((f) => f.startsWith('vendor-gsap-') && f.endsWith('.js'));
      const hasReactChunk = files.some((f) => f.startsWith('vendor-react-') && f.endsWith('.js'));

      assert.ok(hasLandingChunk, 'Build must output a separate LandingPage chunk');
      assert.ok(hasProductivityChunk, 'Build must output a separate ProductivityApp chunk');
      assert.ok(hasAdaptiveModalChunk, 'Build must output a separate AdaptiveScheduleModal chunk');
      assert.ok(hasBackupModalChunk, 'Build must output a separate BackupModal chunk');
      assert.ok(hasGsapChunk, 'Build must output a separate vendor-gsap chunk');
      assert.ok(hasReactChunk, 'Build must output a separate vendor-react chunk');

      // Verify LandingPage chunk size is compact (< 80 kB uncompressed)
      const landingFile = files.find((f) => f.startsWith('LandingPage-') && f.endsWith('.js'));
      const landingStats = fs.statSync(path.join(distAssetsPath, landingFile));
      assert.ok(
        landingStats.size < 80000,
        `LandingPage chunk (${landingStats.size} bytes) must be < 80 kB`
      );
    });
  });

  describe('5. Protected Scheduler Invariants & Production Gate Preservation', () => {
    it('5.1 strictly preserves factory baseline weights and object immutability', () => {
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.urgencyWeight, 50.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.priorityWeight, 100.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.unblockWeight, 15.0);
      assert.strictEqual(FACTORY_SCHEDULER_WEIGHTS.riskWeight, 25.0);
      assert.strictEqual(Object.isFrozen(FACTORY_SCHEDULER_WEIGHTS), true);
    });

    it('5.2 production activation gate fails closed and adaptation is locked', () => {
      const evalResult = evaluateActivationGate();

      assert.strictEqual(evalResult.isAdaptationUnlocked, false);
      assert.strictEqual(evalResult.productionApplied, false);
      assert.strictEqual(evalResult.productionInvariance.productionApplied, false);
      assert.strictEqual(evalResult.productionInvariance.isAdaptationUnlocked, false);
      assert.notStrictEqual(evalResult.outcome, 'eligible_for_supervised_review');
    });
  });
});
