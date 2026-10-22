import React, { useState, useEffect, useCallback } from 'react';
import LandingPage from './pages/LandingPage';
import ProductivityApp from './pages/ProductivityApp';

/**
 * VoxPlan Top-Level Router & Experience Orchestrator
 *
 * Routes:
 * - /      : Polished product landing page with features, preview, and how-it-works
 * - /app   : Existing functional VoxPlan productivity intelligence application
 */
export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
    }
    return '/';
  });

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
      {isApp ? (
        <ProductivityApp onNavigate={navigate} />
      ) : (
        <LandingPage onNavigate={navigate} />
      )}
    </>
  );
}
