import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import RouteLoadingFallback from './components/RouteLoadingFallback';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import OfflineBanner from './components/OfflineBanner';
import UpdateNotification from './components/UpdateNotification';
import { registerServiceWorker, initInstallPromptListener } from './utils/pwaManager';

// Dynamic route-level code splitting (Phase 8, Stage 8.3)
const LandingPage = lazy(() => import('./pages/LandingPage'));
const ProductivityApp = lazy(() => import('./pages/ProductivityApp'));

/**
 * VoxPlan Top-Level Router & Experience Orchestrator
 *
 * Routes:
 * - /    : Polished product landing & overview page with features, preview, and how-it-works (lazy loaded)
 * - /app : Existing functional VoxPlan productivity intelligence application (lazy loaded)
 */
export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
    }
    return '/';
  });

  // Initialize PWA service worker and install prompt listener on mount
  useEffect(() => {
    registerServiceWorker();
    initInstallPromptListener();
  }, []);

  // Listen for browser forward/back buttons
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== 'undefined') {
        const p = window.location.pathname;
        const normalized = p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
        setCurrentPath(normalized);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Programmatic client-side navigation
  const navigate = useCallback((to) => {
    if (typeof window === 'undefined') return;

    // Handle hash anchors on the same page
    if (to.startsWith('#')) {
      const elem = document.querySelector(to);
      if (elem) {
        elem.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    const targetUrl = new URL(to, window.location.origin);
    const targetPath = targetUrl.pathname.length > 1 && targetUrl.pathname.endsWith('/')
      ? targetUrl.pathname.slice(0, -1)
      : targetUrl.pathname;

    window.history.pushState({}, '', to);
    setCurrentPath(targetPath);

    // If there is a hash in the target, scroll to it after rendering
    if (targetUrl.hash) {
      setTimeout(() => {
        const elem = document.querySelector(targetUrl.hash);
        if (elem) elem.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const isApp = currentPath === '/app' || currentPath.startsWith('/app/');
  const [dismissedRoutePath, setDismissedRoutePath] = useState(null);
  const isUnknownRoute = !isApp && currentPath !== '/' && currentPath !== '' && dismissedRoutePath !== currentPath;

  // Dynamic route document titles and focus restoration (WCAG 2.2 2.4.2 Page Titled & 2.4.3 Focus Order)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isApp) {
      document.title = 'VoxPlan App — Tasks & Adaptive Scheduling';
    } else {
      document.title = 'VoxPlan — Playful Project Intelligence';
    }
  }, [isApp]);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <OfflineBanner />
      {isUnknownRoute && (
        <aside
          role="status"
          aria-label="Route notice"
          style={styles.unknownRouteBanner}
          id="unknown-route-banner"
        >
          <div style={styles.unknownRouteInner}>
            <span style={styles.unknownRouteText}>
              ℹ️ Route <code>{currentPath}</code> was not recognized. Showing VoxPlan home.
            </span>
            <div style={styles.unknownRouteActions}>
              <button
                type="button"
                onClick={() => navigate('/app')}
                style={styles.unknownRouteActionBtn}
                id="unknown-route-to-app-btn"
              >
                Go to Workspace (/app) →
              </button>
              <button
                type="button"
                onClick={() => setDismissedRoutePath(currentPath)}
                style={styles.unknownRouteDismissBtn}
                aria-label="Dismiss route notice"
              >
                ✕
              </button>
            </div>
          </div>
        </aside>
      )}
      <RouteErrorBoundary>
        <Suspense fallback={<RouteLoadingFallback message={isApp ? 'Loading productivity workspace...' : 'Loading VoxPlan...'} />}>
          {isApp ? (
            <ProductivityApp onNavigate={navigate} />
          ) : (
            <LandingPage onNavigate={navigate} />
          )}
        </Suspense>
      </RouteErrorBoundary>
      <UpdateNotification />
    </>
  );
}

const styles = {
  unknownRouteBanner: {
    backgroundColor: '#FFF4E5',
    borderBottom: '1px solid #FFE0B2',
    color: '#B45309',
    padding: '10px 16px',
    fontSize: '13px',
    fontFamily: "var(--font-sans, 'Lato', sans-serif)",
    position: 'sticky',
    top: 0,
    zIndex: 1000,
  },
  unknownRouteInner: {
    maxWidth: '1120px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  unknownRouteText: {
    fontWeight: '600',
  },
  unknownRouteActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  unknownRouteActionBtn: {
    background: '#B45309',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '9999px',
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  unknownRouteDismissBtn: {
    background: 'transparent',
    border: 'none',
    color: '#B45309',
    cursor: 'pointer',
    padding: '4px 8px',
    fontSize: '13px',
    fontWeight: '700',
  },
};
