/**
 * VoxPlan PWA & Service Worker Lifecycle Manager (Phase 8, Stage 8.3).
 *
 * Manages:
 * - Safe service worker registration and update notification
 * - Controlled user-initiated update application (no aggressive unprompted reloads)
 * - Online / offline network status subscription
 * - Install prompt capture and trigger
 */

let swRegistration = null;
let deferredInstallPrompt = null;
const updateListeners = new Set();
const installListeners = new Set();
const networkListeners = new Set();

/**
 * Checks whether service workers are supported in the current environment.
 * @returns {boolean}
 */
export function isServiceWorkerSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Checks whether the browser is currently online.
 * @returns {boolean}
 */
export function isOnline() {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

/**
 * Subscribes to online/offline connectivity changes.
 * @param {(online: boolean) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeNetworkStatus(callback) {
  if (typeof window === 'undefined') return () => {};

  networkListeners.add(callback);

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    networkListeners.delete(callback);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Subscribes to service worker update availability.
 * @param {(info: { hasUpdate: boolean }) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function subscribeServiceWorkerUpdate(callback) {
  updateListeners.add(callback);
  return () => {
    updateListeners.delete(callback);
  };
}

function notifyUpdateListeners() {
  for (const listener of updateListeners) {
    try {
      listener({ hasUpdate: true });
    } catch (err) {
      console.warn('[PWA] Error in update listener:', err);
    }
  }
}

/**
 * Registers the VoxPlan service worker.
 * @param {object} [options]
 * @param {string} [options.swUrl='/sw.js']
 * @param {string} [options.scope='/']
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function registerServiceWorker(options = {}) {
  if (!isServiceWorkerSupported()) {
    return null;
  }

  const swUrl = options.swUrl || '/sw.js';
  const scope = options.scope || '/';

  try {
    const registration = await navigator.serviceWorker.register(swUrl, { scope });
    swRegistration = registration;

    // Check if an update is already waiting
    if (registration.waiting) {
      notifyUpdateListeners();
    }

    // Listen for new service worker installing
    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing;
      if (!installingWorker) return;

      installingWorker.addEventListener('statechange', () => {
        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // A new version has been installed and is waiting
          notifyUpdateListeners();
        }
      });
    });

    return registration;
  } catch (error) {
    console.warn('[PWA] Service worker registration failed:', error);
    return null;
  }
}

/**
 * Instructs a waiting service worker to skipWaiting and reloads the application.
 * Called only upon explicit user confirmation.
 */
export function applyServiceWorkerUpdate() {
  if (!swRegistration || !swRegistration.waiting) {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
    return;
  }

  // Once the new worker activates, reload the window
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, { once: true });

  swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
}

/**
 * Captures the beforeinstallprompt event for installable PWA readiness.
 */
export function initInstallPromptListener() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    for (const listener of installListeners) {
      try {
        listener(true);
      } catch (err) {
        console.warn('[PWA] Error in install prompt listener:', err);
      }
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    for (const listener of installListeners) {
      try {
        listener(false);
      } catch (err) {
        console.warn('[PWA] Error in appinstalled listener:', err);
      }
    }
  });
}

/**
 * Checks whether an install prompt is available.
 * @returns {boolean}
 */
export function canInstallPwa() {
  return Boolean(deferredInstallPrompt);
}

/**
 * Triggers the browser's PWA install prompt.
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
 */
export async function promptPwaInstall() {
  if (!deferredInstallPrompt) {
    return 'unavailable';
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

/**
 * Subscribes to changes in installability.
 * @param {(canInstall: boolean) => void} callback
 * @returns {() => void}
 */
export function subscribeInstallPrompt(callback) {
  installListeners.add(callback);
  callback(Boolean(deferredInstallPrompt));
  return () => {
    installListeners.delete(callback);
  };
}
