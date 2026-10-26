import { useState, useEffect, useCallback, useRef } from 'react';
import { TOUR_STEPS } from './tourSteps';
import {
  TOUR_MODES,
  loadTourState,
  saveTourState,
  markTourCompleted,
} from './tourStorage';
import {
  getInitialDemoTasks,
  getInitialDemoStickyNotes,
} from './demoState';

/**
 * Custom Hook for managing the VoxPlan Interactive Product Tour
 *
 * Provides isolated state, spotlight position calculation, keyboard handling,
 * and view coordination.
 *
 * @param {object} options
 * @param {string} options.currentView Current active view tab ('today' | 'tasks' | 'calendar' | 'insights')
 * @param {function} options.onSelectView Callback to change view tab
 * @param {boolean} options.autoStartFromUrl Whether to start tour automatically from URL query param (?tour=1 or ?tour=demo)
 */
export function useProductTour({
  currentView,
  onSelectView,
  autoStartFromUrl = true,
}) {
  const [isActive, setIsActive] = useState(() => {
    if (!autoStartFromUrl || typeof window === 'undefined') return false;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tourParam = urlParams.get('tour');
      return Boolean(tourParam);
    } catch {
      return false;
    }
  });

  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    if (!autoStartFromUrl || typeof window === 'undefined') return 0;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const stepParam = parseInt(urlParams.get('step'), 10);
      if (!isNaN(stepParam) && stepParam >= 1 && stepParam <= TOUR_STEPS.length) {
        return stepParam - 1;
      }
    } catch {
      // Safe fallback
    }
    return 0;
  });

  const [mode, setMode] = useState(() => {
    if (!autoStartFromUrl || typeof window === 'undefined') return TOUR_MODES.OBSERVE;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tourParam = urlParams.get('tour');
      return tourParam === 'demo' ? TOUR_MODES.DEMO : TOUR_MODES.OBSERVE;
    } catch {
      return TOUR_MODES.OBSERVE;
    }
  });

  const [targetRect, setTargetRect] = useState(null);
  const [isTargetFound, setIsTargetFound] = useState(false);

  // Disposable in-memory demo data (Mode B)
  const [demoTasks, setDemoTasks] = useState(getInitialDemoTasks);
  const [demoNotes, setDemoNotes] = useState(getInitialDemoStickyNotes);

  const activeStep = TOUR_STEPS[currentStepIndex] || TOUR_STEPS[0];
  const totalSteps = TOUR_STEPS.length;

  const targetElementRef = useRef(null);
  const mutationObserverRef = useRef(null);
  const animationFrameRef = useRef(null);

  // 1. Listen for browser back/forward URL query changes (?tour=1 or ?tour=demo)
  useEffect(() => {
    if (!autoStartFromUrl || typeof window === 'undefined') return;

    const handlePopState = () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const tourParam = urlParams.get('tour');
        const stepParam = parseInt(urlParams.get('step'), 10);
        if (tourParam) {
          setIsActive(true);
          setMode(tourParam === 'demo' ? TOUR_MODES.DEMO : TOUR_MODES.OBSERVE);
          if (!isNaN(stepParam) && stepParam >= 1 && stepParam <= TOUR_STEPS.length) {
            setCurrentStepIndex(stepParam - 1);
          }
        } else {
          setIsActive(false);
        }
      } catch {
        // Safe fallback
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [autoStartFromUrl]);

/**
 * Safely finds the first visible DOM element matching the selector string.
 * Supports comma-separated selector lists, evaluating selectors in sequence,
 * and filtering out elements with zero dimensions (e.g. elements inside inactive tabs).
 */
function findVisibleElement(selector) {
  if (!selector || typeof document === 'undefined') return null;
  const subSelectors = selector.split(',').map((s) => s.trim()).filter(Boolean);

  for (const sub of subSelectors) {
    try {
      const candidates = document.querySelectorAll(sub);
      for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return { el, rect };
        }
      }
    } catch {
      // Ignore invalid sub-selector
    }
  }
  return null;
}

  // 2. Measure & update spotlight bounding rectangle
  const updateTargetRect = useCallback(() => {
    if (!isActive || !activeStep) {
      setTargetRect(null);
      setIsTargetFound(false);
      return;
    }

    // Try primary selector, then fallback selector
    const match =
      findVisibleElement(activeStep.targetSelector) ||
      findVisibleElement(activeStep.fallbackTargetSelector);

    if (match) {
      targetElementRef.current = match.el;
      setTargetRect({
        top: Math.round(match.rect.top),
        left: Math.round(match.rect.left),
        width: Math.round(match.rect.width),
        height: Math.round(match.rect.height),
        right: Math.round(match.rect.right),
        bottom: Math.round(match.rect.bottom),
      });
      setIsTargetFound(true);
      return;
    }

    // If target element is not in DOM or has zero size, provide graceful fallback
    targetElementRef.current = null;
    setTargetRect(null);
    setIsTargetFound(false);
  }, [isActive, activeStep]);

  // 3. Coordinate view switching when step requires a different tab
  useEffect(() => {
    if (!isActive || !activeStep) return;

    if (activeStep.view && activeStep.view !== 'any' && activeStep.view !== currentView) {
      if (typeof onSelectView === 'function') {
        onSelectView(activeStep.view);
      }
    }
  }, [isActive, activeStep, currentView, onSelectView]);

  // 4. Update rect on step change, view change, scroll, resize, or DOM mutations
  useEffect(() => {
    if (!isActive) return;

    // Initial update and scroll after short delay for DOM mount
    const timer = setTimeout(() => {
      updateTargetRect();

      // Scroll target into view gently if found
      if (targetElementRef.current) {
        targetElementRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
      }
    }, 80);

    // Follow-up check after view transition animation (180ms) and smooth scroll settle
    const settleTimer = setTimeout(() => {
      updateTargetRect();
    }, 240);

    const handleWindowChange = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        updateTargetRect();
      });
    };

    window.addEventListener('resize', handleWindowChange, { passive: true });
    window.addEventListener('scroll', handleWindowChange, { passive: true });

    // Observe DOM mutations to adjust if elements appear or layout shifts
    if (typeof MutationObserver !== 'undefined') {
      mutationObserverRef.current = new MutationObserver(() => {
        handleWindowChange();
      });
      mutationObserverRef.current.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }

    return () => {
      clearTimeout(timer);
      clearTimeout(settleTimer);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange);
      if (mutationObserverRef.current) {
        mutationObserverRef.current.disconnect();
        mutationObserverRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isActive, currentStepIndex, currentView, updateTargetRect]);

  // 5. Tour Navigation Handlers
  const startTour = useCallback((chosenMode = TOUR_MODES.OBSERVE) => {
    const saved = loadTourState();
    setIsActive(true);
    setMode(chosenMode);
    setCurrentStepIndex(saved.lastStepIndex || 0);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((prevIndex) => {
      if (prevIndex < totalSteps - 1) {
        const nextIndex = prevIndex + 1;
        saveTourState({ lastStepIndex: nextIndex });
        return nextIndex;
      }
      markTourCompleted();
      setIsActive(false);
      return prevIndex;
    });
  }, [totalSteps]);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((prevIndex) => {
      if (prevIndex > 0) {
        const nextIndex = prevIndex - 1;
        saveTourState({ lastStepIndex: nextIndex });
        return nextIndex;
      }
      return 0;
    });
  }, []);

  const goToStep = useCallback((index) => {
    if (index >= 0 && index < totalSteps) {
      setCurrentStepIndex(index);
      saveTourState({ lastStepIndex: index });
    }
  }, [totalSteps]);

  const skipTour = useCallback(() => {
    markTourCompleted();
    setIsActive(false);
  }, []);

  const exitTour = useCallback(() => {
    setCurrentStepIndex((curr) => {
      saveTourState({ lastStepIndex: curr });
      return curr;
    });
    setIsActive(false);
  }, []);

  const restartTour = useCallback(() => {
    setCurrentStepIndex(0);
    saveTourState({ lastStepIndex: 0 });
    setIsActive(true);
  }, []);

  const switchMode = useCallback((newMode) => {
    setMode(newMode);
    saveTourState({ mode: newMode });
  }, []);

  // 6. Disposable Demo Mode Handlers (Never touch real user tasks)
  const addDemoTask = useCallback((task) => {
    setDemoTasks((prev) => [
      {
        ...task,
        id: `demo-task-${Date.now()}`,
        createdAt: new Date().toISOString(),
        isDemoTourItem: true,
      },
      ...prev,
    ]);
  }, []);

  const toggleDemoTask = useCallback((taskId) => {
    setDemoTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  const deleteDemoTask = useCallback((taskId) => {
    setDemoTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const resetDemoData = useCallback(() => {
    setDemoTasks(getInitialDemoTasks());
    setDemoNotes(getInitialDemoStickyNotes());
  }, []);

  // 7. Keyboard Navigation (Escape to exit, Arrow keys for navigation)
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        exitTour();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, exitTour, nextStep, prevStep]);

  return {
    isActive,
    currentStepIndex,
    activeStep,
    totalSteps,
    mode,
    targetRect,
    isTargetFound,
    startTour,
    nextStep,
    prevStep,
    goToStep,
    skipTour,
    exitTour,
    restartTour,
    switchMode,
    demoTasks,
    demoNotes,
    addDemoTask,
    toggleDemoTask,
    deleteDemoTask,
    resetDemoData,
  };
}
