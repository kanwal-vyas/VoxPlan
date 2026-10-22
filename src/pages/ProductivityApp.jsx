import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import '../App.css';

import Header from '../components/Header';
import Hero from '../components/Hero';
import CommandBar from '../components/CommandBar';
import ProjectOverview from '../components/ProjectOverview';
import MLModelPanel from '../components/MLModelPanel';
import BehavioralHistoryPanel from '../components/BehavioralHistoryPanel';
import PersonalModelDashboard from '../components/PersonalModelDashboard';
import TaskList from '../components/TaskList';
import TaskExplanationModal from '../components/TaskExplanationModal';
import AdaptiveScheduleModal from '../components/AdaptiveScheduleModal';
import LoadingScreen from '../components/LoadingScreen';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initCinematicScrollStory } from '../animations/scrollStory';
import { telemetry } from '../telemetry/telemetryManager';
import { completeTaskLifecycle, reopenTaskLifecycle } from '../telemetry/taskLifecycle';
import { buildPersonalDurationModel, computeBatchGuardedRisk } from '../telemetry/personalModel';
import {
  checkBackendHealth,
  getModelStatus,
  trainModel as apiTrainModel,
  getFeatureImportance,
  predictBatchTasks,
} from '../api/mlApi';
import {
  dialogueManager,
  CONVERSATION_INTENTS,
  CONVERSATION_STATES,
} from '../conversation/dialogueManager';
import {
  VoiceRecognitionController,
  SpeechSynthesisController,
  generateSpokenSummary,
  RECOGNITION_STATES,
} from '../conversation/speechEngine';
import { formatISODate } from '../conversation/compoundCommandParser';
import {
  saveAcceptedSchedule,
  loadAcceptedSchedule,
  generateIcsCalendar,
  downloadIcsFile,
} from '../scheduler/icalExporter';
import { saveEvent, clearDemoEventsByProfile } from '../telemetry/indexedDbStore';
import {
  applyDemoSeed,
  clearDemoSeed,
  hasExistingUserData,
  safePersistTasks,
  resumePendingDemoCleanup,
  DEMO_SEED_KEY,
  DEMO_STORAGE_REVISION_KEY,
} from '../utils/demoDataSeeder';

const STORAGE_KEY = 'voxplan_tasks';

/**
 * Returns clean, un-fabricated default tasks with real calendar dates for new users.
 */
const getDefaultTasks = () => {
  const now = new Date();
  const formatISO = (d) => formatISODate(d);

  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const nextWeek = new Date(now);
  nextWeek.setDate(now.getDate() + 5);

  return [
    {
      id: 'task-welcome-1',
      title: 'Review weekly project plan & deliverables',
      description: 'Audit active milestones and ensure dependencies are identified.',
      priority: 'high',
      dueDate: formatISO(today),
      completed: false,
      category: 'Planning',
      estimatedEffort: 2.0,
      dependencies: [],
      createdAt: new Date(now.getTime() - 86400000 * 2).toISOString(),
    },
    {
      id: 'task-welcome-2',
      title: 'Draft architecture audit documentation',
      description: 'Document current data flows, pipeline constraints, and integration boundaries.',
      priority: 'medium',
      dueDate: formatISO(tomorrow),
      completed: false,
      category: 'Engineering',
      estimatedEffort: 4.0,
      dependencies: ['task-welcome-1'],
      createdAt: new Date(now.getTime() - 86400000).toISOString(),
    },
    {
      id: 'task-welcome-3',
      title: 'Refactor client date formatting utilities',
      description: 'Unify ISO-8601 calendar date parsing across interface cards.',
      priority: 'low',
      dueDate: formatISO(nextWeek),
      completed: false,
      category: 'Maintenance',
      estimatedEffort: 1.5,
      dependencies: [],
      createdAt: now.toISOString(),
    },
  ];
};

/**
 * Normalizes any task object, migrating legacy localStorage formats safely without losing data.
 */
const normalizeTask = (t) => {
  if (!t || typeof t !== 'object') return null;
  const id = typeof t.id === 'string' && t.id.trim() ? t.id : `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = typeof t.title === 'string' && t.title.trim() ? t.title.trim() : 'Untitled Task';
  const description = typeof t.description === 'string' ? t.description : '';
  const priority = ['high', 'medium', 'low'].includes(String(t.priority).toLowerCase())
    ? String(t.priority).toLowerCase()
    : 'medium';
  const completed = Boolean(t.completed);
  const category = typeof t.category === 'string' && t.category.trim() ? t.category.trim() : 'General';
  const rawEffort = t.estimatedEffort ?? t.estimated_effort;
  const estimatedEffort = typeof rawEffort === 'number' && !isNaN(rawEffort) ? rawEffort : null;
  const dependencies = Array.isArray(t.dependencies) ? t.dependencies.filter((d) => typeof d === 'string') : [];

  // Migrate due date cleanly to YYYY-MM-DD
  let dueDate = null;
  const rawDue = t.dueDate || t.due_date;
  if (rawDue) {
    const rawStr = String(rawDue).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawStr)) {
      dueDate = rawStr;
    } else {
      // Legacy "October 5" format migration
      const legacyMatch = rawStr.match(/oct(?:ober)?\s*(\d{1,2})/i);
      if (legacyMatch) {
        const day = legacyMatch[1].padStart(2, '0');
        const year = new Date().getFullYear();
        dueDate = `${year}-10-${day}`;
      } else {
        const parsed = new Date(rawStr);
        if (!isNaN(parsed.getTime())) {
          dueDate = formatISODate(parsed);
        } else {
          dueDate = rawStr;
        }
      }
    }
  }

  // Preserve or initialize creation timestamp
  let createdAt = t.createdAt || t.created_at;
  if (!createdAt || isNaN(new Date(createdAt).getTime())) {
    createdAt = new Date().toISOString();
  }

  const normalized = {
    id,
    title,
    description,
    priority,
    dueDate,
    completed,
    category,
    estimatedEffort,
    dependencies,
    createdAt,
  };

  if (t.isDemoSeed) normalized.isDemoSeed = true;
  if (t.isSyntheticData) normalized.isSyntheticData = true;
  if (t.provenanceSource) normalized.provenanceSource = t.provenanceSource;
  if (t.chunkable !== undefined) normalized.chunkable = Boolean(t.chunkable);

  return normalized;
};

const loadSavedTasks = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return getDefaultTasks();

    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const normalized = parsed.map(normalizeTask).filter(Boolean);
      if (normalized.length > 0) return normalized;
    }
  } catch (error) {
    console.warn('Error reading tasks from localStorage, fallback to defaults:', error);
  }
  return getDefaultTasks();
};

const UNTRAINED_MODEL_STATUS = {
  is_trained: false,
  message: 'Model is not trained yet. Connect the backend and click "Train Model" to fit on historical baseline data.',
};

export default function ProductivityApp({ onNavigate }) {
  const [isLoading, setIsLoading] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [tasks, setTasks] = useState(loadSavedTasks);
  const [activeFilter, setActiveFilter] = useState('all');
  const [feedback, setFeedback] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [recognitionState, setRecognitionState] = useState(RECOGNITION_STATES.IDLE);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [speechOutputEnabled, setSpeechOutputEnabled] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('voxplan_speech_output_enabled') === 'true';
    } catch {
      return false;
    }
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeTimerState, setActiveTimerState] = useState(() => telemetry.getActiveTimer());
  const [conversationState, setConversationState] = useState(CONVERSATION_STATES.IDLE);
  const [activeSubjectTaskId, setActiveSubjectTaskId] = useState(null);
  const [activeProposal, setActiveProposal] = useState(null);
  const [acceptedSchedule, setAcceptedSchedule] = useState(() => loadAcceptedSchedule());
  const [pendingClarification, setPendingClarification] = useState(null);

  const voiceRecognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const lastKnownRevisionRef = useRef(
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage.getItem(DEMO_STORAGE_REVISION_KEY) || ''
      : ''
  );

  // Resume any pending demo telemetry cleanup from interrupted resets on mount
  useEffect(() => {
    resumePendingDemoCleanup((profileId) => clearDemoEventsByProfile(profileId)).then((res) => {
      if (res && res.cleaned) {
        telemetry.init();
      }
    }).catch((err) => {
      console.warn('Pending cleanup resume error:', err);
    });
  }, []);

  // Cross-tab synchronization via standard storage event
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (!e) return;
      if (e.key === STORAGE_KEY || e.key === DEMO_SEED_KEY || e.key === DEMO_STORAGE_REVISION_KEY) {
        if (typeof window !== 'undefined' && window.localStorage) {
          lastKnownRevisionRef.current = window.localStorage.getItem(DEMO_STORAGE_REVISION_KEY) || '';
        }
        setTasks(loadSavedTasks());
        setAcceptedSchedule(loadAcceptedSchedule());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Initialize persistent telemetry storage on mount
  useEffect(() => {
    telemetry.init();
  }, []);

  // Synchronize tasks with DialogueManager to prevent stale context
  useEffect(() => {
    dialogueManager.syncTasks(tasks);
  }, [tasks]);

  const activeSubjectTask = useMemo(() => {
    if (!activeSubjectTaskId) return null;
    return tasks.find((t) => t.id === activeSubjectTaskId) || null;
  }, [tasks, activeSubjectTaskId]);

  // Personal Duration Model state derived from local IndexedDB telemetry
  const [telemetryEvents, setTelemetryEvents] = useState(() => telemetry.eventsCache);

  useEffect(() => {
    const unsub = telemetry.subscribe((events) => {
      setTelemetryEvents([...events]);
    });
    return unsub;
  }, []);

  const personalDurationModel = useMemo(() => {
    return buildPersonalDurationModel(telemetryEvents, tasks);
  }, [telemetryEvents, tasks]);

  // Live Demonstration Seeding & Teardown Handlers with concurrent operation guard
  const isDemoActionBusyRef = useRef(false);

  const handleSeedDemo = useCallback(async () => {
    if (isDemoActionBusyRef.current) return;
    isDemoActionBusyRef.current = true;
    try {
      if (hasExistingUserData()) {
        const ok = typeof window !== 'undefined' && window.confirm
          ? window.confirm(
              'Load Showcase Demo Profile?\n\nThis will replace active tasks with a calibrated demonstration dataset (8 completed tasks + 4 active tasks) for presenting behavioral habit insights and duration estimation.\n\nYour existing user tasks will be backed up and restored on Reset.\n\nClick OK to confirm.'
            )
          : true;
        if (!ok) return;
      }
      const res = await applyDemoSeed({
        confirmOverwrite: true,
        saveEventFn: (ev) => saveEvent(ev),
      });
      if (res.success) {
        setTasks(loadSavedTasks());
        setAcceptedSchedule(null);
        await telemetry.init();
        setFeedback({ type: 'success', message: res.message });
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } finally {
      isDemoActionBusyRef.current = false;
    }
  }, []);

  const handleClearDemo = useCallback(async () => {
    if (isDemoActionBusyRef.current) return;
    isDemoActionBusyRef.current = true;
    try {
      const ok = typeof window !== 'undefined' && window.confirm
        ? window.confirm(
            'Reset to Clean Default State?\n\nThis will clear demonstration tasks, restore any backed-up user tasks (or clean welcome tasks), and remove synthetic demo telemetry while preserving genuine user data.\n\nClick OK to confirm.'
          )
        : true;
      if (!ok) return;
      const res = await clearDemoSeed({
        clearEventsFn: (pId) => clearDemoEventsByProfile(pId),
      });
      if (res.tasksRestored || res.success) {
        setTasks(loadSavedTasks());
        setAcceptedSchedule(null);
        await telemetry.init();
        if (res.telemetryCleaned === false || res.partialSuccess) {
          setFeedback({ type: 'warning', message: res.message });
        } else {
          setFeedback({ type: 'info', message: res.message });
        }
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } finally {
      isDemoActionBusyRef.current = false;
    }
  }, []);

  // Developer Convenience Interface:
  // Exposes helper functions on window for live presenter walk-throughs and automated test runners.
  // Note: This is an internal developer convenience, not an external API or security boundary.
  // In accordance with VoxPlan's local-first architecture, all operations remain entirely within the client.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.voxplanDemo = {
        seed: handleSeedDemo,
        clear: handleClearDemo,
        hasExistingUserData,
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.voxplanDemo;
      }
    };
  }, [handleSeedDemo, handleClearDemo]);

  // ML State (truthfully initialized to empty/untrained state, without fabricated metrics)
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [modelStatus, setModelStatus] = useState(UNTRAINED_MODEL_STATUS);
  const [featureImportances, setFeatureImportances] = useState([]);
  const [predictionsMap, setPredictionsMap] = useState({});
  const [riskStats, setRiskStats] = useState({ highCount: 0, mediumCount: 0, lowCount: 0, avgProb: 0 });

  // Guarded Hybrid Completion-Risk Estimates (Personal Telemetry + ML Baseline)
  const guardedPredictionsMap = useMemo(() => {
    return computeBatchGuardedRisk(predictionsMap, tasks, telemetryEvents, personalDurationModel);
  }, [predictionsMap, tasks, telemetryEvents, personalDurationModel]);

  const effectiveRiskStats = useMemo(() => {
    const values = Object.values(guardedPredictionsMap);
    if (!values.length) return riskStats;
    let high = 0;
    let med = 0;
    let low = 0;
    let sumProb = 0;
    values.forEach((p) => {
      if (!p) return;
      if (p.risk === 'HIGH') high++;
      else if (p.risk === 'MEDIUM') med++;
      else low++;
      sumProb += (p.delay_probability ?? p.probability ?? 0);
    });
    return {
      highCount: high,
      mediumCount: med,
      lowCount: low,
      avgProb: values.length > 0 ? sumProb / values.length : 0,
    };
  }, [guardedPredictionsMap, riskStats]);

  const [isTraining, setIsTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState('');
  const [isPredicting, setIsPredicting] = useState(false);
  const [selectedTaskExplanation, setSelectedTaskExplanation] = useState(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  const mlPanelRef = useRef(null);
  const gsapCleanupRef = useRef(null);

  // Initial viewport setup: ensure page ALWAYS starts at top on every reload/refresh
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
      window.scrollTo(0, 0);

      const handleBeforeUnload = () => {
        window.scrollTo(0, 0);
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }
  }, []);

  // Track scroll progress
  useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        setScrollProgress((window.scrollY / totalScroll) * 100);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Persist tasks to localStorage whenever tasks change with cross-tab conflict detection
  useEffect(() => {
    try {
      const res = safePersistTasks(tasks, {
        expectedRevision: lastKnownRevisionRef.current,
      });
      if (res.success) {
        lastKnownRevisionRef.current = res.revision;
        if (res.conflict && Array.isArray(res.tasks) && res.tasks.length !== tasks.length) {
          setTasks(res.tasks);
        }
      } else if (res.conflict && res.reason === 'demo_action_in_progress') {
        console.warn('Task save deferred: demo action in progress in another tab.');
      }
    } catch (err) {
      console.error('Failed to persist tasks to storage:', err);
    }
  }, [tasks]);

  // Auto-dismiss feedback messages
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => {
      setFeedback(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Fetch ML status and predictions from backend
  const refreshMLState = useCallback(async (customTasks) => {
    const activeTasks = customTasks || tasks;
    const health = await checkBackendHealth();
    setIsBackendOnline(health.online);

    if (!health.online) return;

    try {
      const status = await getModelStatus();
      setModelStatus(status);

      if (status.is_trained) {
        const featRes = await getFeatureImportance();
        if (featRes.feature_importances) {
          setFeatureImportances(featRes.feature_importances);
        }

        // Run batch prediction
        const predRes = await predictBatchTasks(activeTasks);
        if (predRes && predRes.predictions) {
          const map = {};
          predRes.predictions.forEach((p) => {
            map[p.task_id] = p;
          });
          setPredictionsMap(map);
          setRiskStats({
            highCount: predRes.high_risk_count || 0,
            mediumCount: predRes.medium_risk_count || 0,
            lowCount: predRes.low_risk_count || 0,
            avgProb: predRes.average_delay_probability || 0,
          });
        }
      }
    } catch (err) {
      console.warn('Error refreshing ML state:', err);
    }
  }, [tasks]);

  // Initial load: verify backend once on mount and gentle polling every 30s
  useEffect(() => {
    let active = true;
    const init = async () => {
      if (active) await refreshMLState();
    };
    init();
    const interval = setInterval(() => {
      checkBackendHealth().then((h) => {
        if (active) setIsBackendOnline(h.online);
      });
    }, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [refreshMLState]);

  // Whenever task list changes, refresh predictions automatically if model is trained
  useEffect(() => {
    if (modelStatus.is_trained && isBackendOnline) {
      predictBatchTasks(tasks)
        .then((predRes) => {
          if (predRes && predRes.predictions) {
            const map = {};
            predRes.predictions.forEach((p) => {
              map[p.task_id] = p;
            });
            setPredictionsMap(map);
            setRiskStats({
              highCount: predRes.high_risk_count || 0,
              mediumCount: predRes.medium_risk_count || 0,
              lowCount: predRes.low_risk_count || 0,
              avgProb: predRes.average_delay_probability || 0,
            });
          }
        })
        .catch((err) => console.warn('Prediction sync failed:', err));
    }
  }, [tasks, modelStatus.is_trained, isBackendOnline]);

  // Train Model Handler
  const handleTrainModel = async () => {
    if (!isBackendOnline) {
      setFeedback({
        type: 'error',
        message: 'ML Backend is offline. Please start FastAPI (port 8000) to train the model.',
      });
      return;
    }

    setIsTraining(true);
    setTrainingStep('Generating synthetic historical dataset (1,200 records)...');

    try {
      setTimeout(() => {
        setTrainingStep('Engineering features & training RandomForestClassifier...');
      }, 400);

      const metrics = await apiTrainModel(1200, 42);
      setModelStatus(metrics);
      if (metrics.feature_importances) {
        setFeatureImportances(metrics.feature_importances);
      }

      setTrainingStep('Evaluating model validation metrics & computing confusion matrix...');

      // Immediately run predictions on existing tasks
      const predRes = await predictBatchTasks(tasks);
      if (predRes && predRes.predictions) {
        const map = {};
        predRes.predictions.forEach((p) => {
          map[p.task_id] = p;
        });
        setPredictionsMap(map);
        setRiskStats({
          highCount: predRes.high_risk_count || 0,
          mediumCount: predRes.medium_risk_count || 0,
          lowCount: predRes.low_risk_count || 0,
          avgProb: predRes.average_delay_probability || 0,
        });
      }

      setFeedback({
        type: 'success',
        message: `RandomForest trained successfully! (Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%, F1: ${(metrics.f1_score * 100).toFixed(1)}%)`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Model training failed: ${err.message}`,
      });
    } finally {
      setIsTraining(false);
      setTrainingStep('');
    }
  };

  // Run Predictions Handler
  const handleRunPredictions = async () => {
    if (!isBackendOnline) {
      setFeedback({
        type: 'error',
        message: 'ML Backend is offline. Start FastAPI backend on port 8000.',
      });
      return;
    }
    if (!modelStatus.is_trained) {
      setFeedback({
        type: 'info',
        message: 'Please train the model first before generating predictions.',
      });
      return;
    }

    setIsPredicting(true);
    try {
      const predRes = await predictBatchTasks(tasks);
      if (predRes && predRes.predictions) {
        const map = {};
        predRes.predictions.forEach((p) => {
          map[p.task_id] = p;
        });
        setPredictionsMap(map);
        setRiskStats({
          highCount: predRes.high_risk_count || 0,
          mediumCount: predRes.medium_risk_count || 0,
          lowCount: predRes.low_risk_count || 0,
          avgProb: predRes.average_delay_probability || 0,
        });
      }
      setFeedback({
        type: 'success',
        message: `Generated delay risk predictions for ${tasks.length} tasks.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Prediction failed: ${err.message}`,
      });
    } finally {
      setIsPredicting(false);
    }
  };

  // Timer Controls
  const handleStartTimer = async (taskId) => {
    const newState = await telemetry.startTimer(taskId);
    setActiveTimerState(newState);
  };

  const handlePauseTimer = async (taskId) => {
    const updatedState = await telemetry.pauseTimer(taskId);
    setActiveTimerState(updatedState);
  };

  // Task Operations with Telemetry Logging & Shared Lifecycle Transitions
  const completeTask = async (taskId, durationInfo = {}) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;

    const result = await completeTaskLifecycle({
      task: target,
      activeTimerState,
      durationInfo,
      stopTimerFn: (tid) => telemetry.stopTimer(tid),
    });

    if (!result.success) {
      if (result.reason === 'already_completed') {
        setFeedback({
          type: 'info',
          message: `Task is already completed: "${target.title}"`,
        });
      }
      return;
    }

    if (result.timerStopped) {
      setActiveTimerState(null);
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? result.updatedTask : t))
    );

    await telemetry.recordTaskCompleted(taskId, result.telemetryPayload);

    setFeedback({
      type: 'success',
      message: `Completed task: "${target.title}"${
        result.telemetryPayload.durationSource === 'tracked'
          ? ` (${Math.round((result.telemetryPayload.trackedDurationSeconds || 0) / 60)}m timed)`
          : result.telemetryPayload.durationSource === 'self_reported'
          ? ` (${Math.round((result.telemetryPayload.selfReportedDurationSeconds || 0) / 60)}m reported)`
          : ''
      }`,
    });
  };

  const reopenTask = async (taskId) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;

    const result = reopenTaskLifecycle({ task: target });
    if (!result.success) {
      if (result.reason === 'already_open') {
        setFeedback({
          type: 'info',
          message: `Task is already pending: "${target.title}"`,
        });
      }
      return;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? result.updatedTask : t))
    );

    await telemetry.recordTaskReopened(taskId);

    setFeedback({
      type: 'info',
      message: `Reopened task: "${target.title}"`,
    });
  };

  const toggleTaskCompletion = async (taskId, durationInfo = {}) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    if (target.completed) {
      return reopenTask(taskId);
    }
    return completeTask(taskId, durationInfo);
  };

  const deleteTask = (taskId) => {
    dialogueManager.invalidateTask(taskId);
    if (activeSubjectTaskId === taskId) {
      setActiveSubjectTaskId(null);
    }
    const taskToDelete = tasks.find((t) => t.id === taskId);
    if (activeTimerState && activeTimerState.taskId === taskId) {
      telemetry.stopTimer(taskId);
      setActiveTimerState(null);
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    if (taskToDelete) {
      setFeedback({
        type: 'success',
        message: `Deleted task: ${taskToDelete.title}`,
      });
    }
  };

  const updateTaskTitle = (taskId, newTitle) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title: newTitle } : t))
    );
  };

  const cyclePriority = async (taskId) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const nextMap = { high: 'medium', medium: 'low', low: 'high' };
    const nextPriority = nextMap[target.priority] || 'medium';
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, priority: nextPriority } : t))
    );
    await telemetry.recordTaskPriorityChanged(taskId, target.priority, nextPriority);
  };

  const handleReschedule = async (taskId, newDueDate) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const prevDue = target.dueDate;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, dueDate: newDueDate } : t))
    );
    await telemetry.recordTaskRescheduled(taskId, prevDue, newDueDate, 'user_update');
    setFeedback({
      type: 'info',
      message: `Rescheduled "${target.title}" to ${newDueDate || 'no deadline'}`,
    });
  };

  const handleApplySchedule = async (proposal) => {
    const placements = proposal?.proposedPlacements || proposal?.placements || [];
    const changedPlacements = placements.filter(
      (p) =>
        p.status !== 'unscheduled' &&
        p.status !== 'blocked_by_dependency' &&
        p.status !== 'oversized_exceeds_capacity' &&
        p.isDateChanged &&
        p.proposedDate &&
        p.proposedDate !== p.originalDueDate
    );

    if (changedPlacements.length === 0) {
      setFeedback({
        type: 'info',
        message: 'No date changes to apply from proposal.',
      });
      return;
    }

    // Group by distinct parent task ID, setting parent dueDate to latest scheduled chunk date
    const changedMap = new Map();
    for (const p of changedPlacements) {
      const existing = changedMap.get(p.taskId);
      if (!existing || p.proposedDate > existing) {
        changedMap.set(p.taskId, p.proposedDate);
      }
    }

    setTasks((prev) =>
      prev.map((t) => {
        if (changedMap.has(t.id)) {
          return { ...t, dueDate: changedMap.get(t.id) };
        }
        return t;
      })
    );

    for (const [taskId, newDueDate] of changedMap.entries()) {
      const originalPlacement = placements.find((p) => p.taskId === taskId);
      await telemetry.recordTaskRescheduled(taskId, originalPlacement?.originalDueDate || null, newDueDate, 'adaptive_scheduler');
    }

    await telemetry.recordRecommendationAction('adaptive_schedule', proposal.summary?.scheduleId || 'proposal', true, {
      changesCount: changedMap.size,
      totalChunksApplied: changedPlacements.length,
      feasibility: proposal.summary?.feasibilityStatus || proposal.summary?.feasibility,
    });

    await telemetry.recordScheduleProposalAccepted(proposal, changedPlacements);

    const acceptedWithMetadata = {
      ...proposal,
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
    };
    setAcceptedSchedule(acceptedWithMetadata);
    saveAcceptedSchedule(acceptedWithMetadata);

    setFeedback({
      type: 'success',
      message: `Applied adaptive schedule: ${changedMap.size} task deadline${changedMap.size === 1 ? '' : 's'} updated (${changedPlacements.length} session${changedPlacements.length === 1 ? '' : 's'} scheduled).`,
    });
  };

  const handleExportCalendar = (scheduleToExport, options = {}) => {
    const target = scheduleToExport || acceptedSchedule;
    if (!target) {
      setFeedback({
        type: 'warning',
        message: 'No accepted schedule to export. Please review and apply an adaptive schedule first.',
      });
      return { success: false, reason: 'no_accepted_schedule' };
    }
    try {
      const result = generateIcsCalendar(target, { tasks, ...options });
      if (result.sessionCount === 0) {
        setFeedback({
          type: 'warning',
          message: 'The accepted schedule contains 0 timed sessions to export.',
        });
        return { success: false, reason: 'zero_sessions', details: result };
      }
      const downloadResult = downloadIcsFile(result.ics);
      setFeedback({
        type: 'success',
        message: `Exported ${result.sessionCount} session(s) to ${downloadResult.filename} (calendar snapshot).${result.omittedCount > 0 ? ` (${result.omittedCount} unscheduled/blocked items omitted)` : ''}`,
      });
      return { success: true, ...result, ...downloadResult };
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Calendar export failed: ${err.message}`,
      });
      return { success: false, error: err.message };
    }
  };

  const handleProposalGenerated = useCallback(async (proposal) => {
    await telemetry.recordScheduleProposalGenerated(proposal);
  }, []);

  const handleDiscardSchedule = useCallback(async (proposal, reason) => {
    await telemetry.recordScheduleProposalDiscarded(proposal, reason);
  }, []);

  const handleAcceptProposal = async (proposalToAccept) => {
    const prop = proposalToAccept || activeProposal;
    if (!prop) return;
    if (prop.status === 'superseded') {
      setFeedback({
        type: 'warning',
        message: 'This proposal was superseded by a newer proposal. Please review and apply the latest proposal.',
      });
      return;
    }
    await handleApplySchedule(prop);
    dialogueManager.activeProposal = null;
    dialogueManager.state = CONVERSATION_STATES.IDLE;
    setActiveProposal(null);
    setConversationState(CONVERSATION_STATES.IDLE);

    if (speechOutputEnabled && speechSynthesisRef.current) {
      const summary = generateSpokenSummary(null, { event: 'PROPOSAL_ACCEPTED', proposal: prop });
      speechSynthesisRef.current.speak(summary);
    }
  };

  const handleDiscardProposal = async (proposalToDiscard, reason = 'user_discard') => {
    const prop = proposalToDiscard || activeProposal;
    if (!prop) return;
    await handleDiscardSchedule(prop, reason);
    dialogueManager.activeProposal = null;
    dialogueManager.state = CONVERSATION_STATES.IDLE;
    setActiveProposal(null);
    setConversationState(CONVERSATION_STATES.IDLE);
    setFeedback({
      type: 'info',
      message: 'Schedule proposal discarded. Your current schedule remains unchanged.',
    });

    if (speechOutputEnabled && speechSynthesisRef.current) {
      const summary = generateSpokenSummary(null, { event: 'PROPOSAL_DISCARDED' });
      speechSynthesisRef.current.speak(summary);
    }
  };

  const handleReviseEffort = async (taskId, newEffort) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const prevEffort = target.estimatedEffort;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, estimatedEffort: newEffort } : t))
    );
    await telemetry.recordTaskEffortRevised(taskId, prevEffort, newEffort);
    setFeedback({
      type: 'info',
      message: `Updated effort estimate for "${target.title}" to ${newEffort}h`,
    });
  };

  const handleMoveTask = async (fromIndex, toIndex) => {
    if (fromIndex < 0 || fromIndex >= tasks.length || toIndex < 0 || toIndex >= tasks.length) return;
    const copy = [...tasks];
    const [moved] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, moved);
    setTasks(copy);
    await telemetry.recordTaskReordered(moved.id, fromIndex, toIndex, copy.map((t) => t.id));
  };

  // Comprehensive Natural Language & Voice Command Parser powered by DialogueManager
  const executeCommand = async (rawText) => {
    const cleanCmd = String(rawText || '').trim().toLowerCase();
    if (/^(?:export|download)\s+(?:the\s+)?(?:calendar|schedule)(?:\s+file|\s+\.ics)?$/i.test(cleanCmd)) {
      handleExportCalendar();
      return;
    }

    const result = dialogueManager.processInput(rawText, {
      tasks,
      riskStats,
      modelStatus,
      telemetryEvents,
      activeProposal,
    });

    setConversationState(result.state);
    setActiveSubjectTaskId(dialogueManager.activeSubjectTaskId);

    if (result.state === CONVERSATION_STATES.AWAITING_CLARIFICATION) {
      const candidates = result.candidateTasks ||
        dialogueManager.pendingClarification?.matches ||
        dialogueManager.pendingClarification?.candidateTasks ||
        [];
      setPendingClarification({
        prompt: result.responseText,
        candidates,
        intent: result.intent || dialogueManager.pendingIntent?.intent,
        query: result.clarificationQuery || dialogueManager.pendingClarification?.query || '',
      });
    } else {
      setPendingClarification(null);
    }

    if (result.proposal) {
      setActiveProposal(result.proposal);
      await handleProposalGenerated(result.proposal);
    }
    if (result.supersededProposal) {
      await handleDiscardSchedule(result.supersededProposal, 'superseded_by_revision');
    }

    if (result.responseText) {
      setFeedback({
        type: result.feedbackType || 'info',
        message: result.responseText,
      });
    }

    // Accessible speech synthesis feedback
    if (speechOutputEnabled && speechSynthesisRef.current) {
      const spokenSummary = generateSpokenSummary(result);
      if (spokenSummary) {
        speechSynthesisRef.current.speak(spokenSummary);
      }
    }

    if (!result.isAuthorized || !result.action) {
      return;
    }

    const { action } = result;

    const dispatchAction = async (act) => {
      if (!act) return;

      // Hard Mutation Safety Invariant:
      // Any operation that modifies, completes, reschedules, or deletes an existing task
      // MUST have a validated, unique task ID present in the active task store.
      const MUTATING_INTENTS = new Set([
        CONVERSATION_INTENTS.COMPLETE_TASK,
        CONVERSATION_INTENTS.REOPEN_TASK,
        CONVERSATION_INTENTS.DELETE_TASK,
        CONVERSATION_INTENTS.RESCHEDULE_TASK,
        CONVERSATION_INTENTS.CHANGE_PRIORITY,
      ]);

      if (MUTATING_INTENTS.has(act.type)) {
        const targetId = act.taskId || act.targetTaskId;
        if (!targetId || typeof targetId !== 'string') {
          setFeedback({
            type: 'error',
            message: 'Mutation blocked: A validated, unique task ID is required.',
          });
          return;
        }
        const exists = tasks.some((t) => t.id === targetId);
        if (!exists) {
          setFeedback({
            type: 'error',
            message: 'Mutation aborted: Target task ID no longer exists in task store.',
          });
          return;
        }
      }

      switch (act.type) {
        case 'COMPOUND_ACTIONS':
          if (Array.isArray(act.actions)) {
            for (const subAct of act.actions) {
              await dispatchAction(subAct);
            }
          }
          break;

        case 'ACCEPT_SCHEDULE_PROPOSAL':
          if (act.proposal) {
            await handleApplySchedule(act.proposal);
            setActiveProposal(null);
            setConversationState(CONVERSATION_STATES.IDLE);
          }
          break;

        case 'DISCARD_SCHEDULE_PROPOSAL':
          if (act.proposal) {
            await handleDiscardSchedule(act.proposal, act.reason || 'user_discard');
            setActiveProposal(null);
            setConversationState(CONVERSATION_STATES.IDLE);
          }
          break;

        case CONVERSATION_INTENTS.TRAIN_MODEL:
          handleTrainModel();
          break;

        case CONVERSATION_INTENTS.PREDICT_RISK:
          handleRunPredictions();
          break;

        case CONVERSATION_INTENTS.OPEN_SCHEDULER:
          setIsScheduleModalOpen(true);
          break;

        case CONVERSATION_INTENTS.FILTER_HIGH_RISK:
          setActiveFilter('high-risk');
          telemetry.recordRecommendationAction('high_risk_filter', 'filter_cmd', true);
          break;

        case CONVERSATION_INTENTS.SHOW_METRICS:
        case CONVERSATION_INTENTS.SHOW_IMPORTANCE:
          if (mlPanelRef.current) {
            mlPanelRef.current.scrollIntoView({ behavior: 'smooth' });
          }
          break;

        case CONVERSATION_INTENTS.CLEAR_COMPLETED: {
          const completedTasks = tasks.filter((t) => t.completed);
          for (const t of completedTasks) {
            dialogueManager.invalidateTask(t.id);
          }
          setTasks((prev) => prev.filter((t) => !t.completed));
          break;
        }

        case CONVERSATION_INTENTS.CLEAR_HISTORY: {
          await telemetry.clearHistory();
          dialogueManager.reset();
          setConversationState(CONVERSATION_STATES.IDLE);
          setActiveSubjectTaskId(null);
          setPendingClarification(null);
          break;
        }

        case CONVERSATION_INTENTS.COMPLETE_TASK:
          await completeTask(act.taskId);
          dialogueManager.setActiveSubject(act.taskId);
          setActiveSubjectTaskId(act.taskId);
          break;

        case CONVERSATION_INTENTS.REOPEN_TASK:
          await reopenTask(act.taskId);
          dialogueManager.setActiveSubject(act.taskId);
          setActiveSubjectTaskId(act.taskId);
          break;

        case CONVERSATION_INTENTS.DELETE_TASK:
          deleteTask(act.taskId);
          break;

        case CONVERSATION_INTENTS.RESCHEDULE_TASK:
          await handleReschedule(act.taskId, act.newDueDate);
          dialogueManager.setActiveSubject(act.taskId);
          setActiveSubjectTaskId(act.taskId);
          break;

        case CONVERSATION_INTENTS.CHANGE_PRIORITY: {
          const target = tasks.find((t) => t.id === act.taskId);
          const prevPriority = target ? target.priority : 'medium';
          setTasks((prev) =>
            prev.map((t) => (t.id === act.taskId ? { ...t, priority: act.priority } : t))
          );
          await telemetry.recordTaskPriorityChanged(act.taskId, prevPriority, act.priority);
          dialogueManager.setActiveSubject(act.taskId);
          setActiveSubjectTaskId(act.taskId);
          break;
        }

        case CONVERSATION_INTENTS.CREATE_TASK: {
          const newTask = {
            id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            title: act.title,
            description: '',
            priority: act.priority || 'medium',
            dueDate: act.dueDate || null,
            completed: false,
            category: 'General',
            estimatedEffort: act.estimatedEffort || null,
            dependencies: [],
            createdAt: new Date().toISOString(),
          };
          setTasks((prev) => [newTask, ...prev]);
          await telemetry.recordTaskCreated(newTask);
          dialogueManager.setActiveSubject(newTask.id);
          setActiveSubjectTaskId(newTask.id);
          break;
        }

        case CONVERSATION_INTENTS.DESCRIBE_TASK:
          if (act.targetTask) {
            dialogueManager.setActiveSubject(act.targetTask.id);
            setActiveSubjectTaskId(act.targetTask.id);
          }
          break;

        default:
          break;
      }
    };

    await dispatchAction(action);
  };

  const executeCommandRef = useRef(executeCommand);
  useEffect(() => {
    executeCommandRef.current = executeCommand;
  });

  // Initialize browser speech recognition and synthesis controllers with keyboard shortcuts
  useEffect(() => {
    const synth = new SpeechSynthesisController({
      onSpeakingChange: (speaking) => setIsSpeaking(speaking),
    });
    speechSynthesisRef.current = synth;

    const recog = new VoiceRecognitionController({
      onStateChange: (state) => {
        setRecognitionState(state);
        setIsListening(state === RECOGNITION_STATES.LISTENING);
        if (state !== RECOGNITION_STATES.LISTENING && state !== RECOGNITION_STATES.PROCESSING) {
          setInterimTranscript('');
        }
      },
      onInterimResult: (draft) => {
        setInterimTranscript(draft);
      },
      onResult: (transcript) => {
        setInterimTranscript('');
        if (executeCommandRef.current) {
          executeCommandRef.current(transcript);
        }
      },
      onError: (err) => {
        setInterimTranscript('');
        setFeedback({
          type: 'error',
          message: err.message,
        });
      },
    });

    if (!recog.isSupported()) {
      setRecognitionState(RECOGNITION_STATES.UNSUPPORTED);
    }
    voiceRecognitionRef.current = recog;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        synth.stop();
        recog.stop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      synth.destroy();
      recog.destroy();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Real Web Speech API browser voice dictation controller toggle
  const toggleListening = () => {
    if (!voiceRecognitionRef.current) return;
    if (recognitionState === RECOGNITION_STATES.LISTENING) {
      voiceRecognitionRef.current.stop();
    } else {
      // Cancel speech before listening so microphone does not pick up assistant's voice
      if (speechSynthesisRef.current) {
        speechSynthesisRef.current.stop();
      }
      voiceRecognitionRef.current.start();
    }
  };

  const toggleSpeechOutput = () => {
    if (!speechSynthesisRef.current) return;
    const next = !speechOutputEnabled;
    speechSynthesisRef.current.setEnabled(next);
    setSpeechOutputEnabled(next);
    if (next) {
      speechSynthesisRef.current.speak('Spoken responses enabled.', { force: true });
    }
  };

  const handleStopSpeech = () => {
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.stop();
    }
  };

  const handleScrollToSection = (sectionId) => {
    const el = document.getElementById(sectionId) || document.getElementById(`section-${sectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Initialize GSAP Cinematic Scroll Storytelling on mount so all pin spacers and layouts are ready
  useEffect(() => {
    // Immediate initialization so DOM pin-spacers are in place before loader lifts
    const cleanup = initCinematicScrollStory();
    gsapCleanupRef.current = cleanup;

    return () => {
      if (gsapCleanupRef.current) {
        gsapCleanupRef.current();
        gsapCleanupRef.current = null;
      }
    };
  }, []);

  // Debounced ScrollTrigger refresh when layout height changes (without recreating timelines)
  useEffect(() => {
    const refreshTimer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 150);
    return () => clearTimeout(refreshTimer);
  }, [tasks.length]);

  const handleLoadingComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <div className="voxplan-app" style={styles.app}>
      {/* Initial Branded Loading Sequence */}
      {isLoading && <LoadingScreen onComplete={handleLoadingComplete} />}

      {/* Subtle Scroll Progress Indicator */}
      <div style={styles.progressBarWrapper}>
        <div style={{ ...styles.progressBarTrack, width: `${scrollProgress}%` }} />
      </div>

      <div style={styles.content}>
        {/* Floating Pastel Header */}
        <Header
          isBackendOnline={isBackendOnline}
          modelMetadata={modelStatus}
          onScrollToSection={handleScrollToSection}
          onSeedDemo={handleSeedDemo}
          onClearDemo={handleClearDemo}
          onNavigate={onNavigate}
        />

        {/* Main Landmark for Accessibility (WCAG 2.2 1.3.1 Info and Relationships & 2.4.1 Bypass Blocks) */}
        <main id="main-content" tabIndex={-1} style={{ outline: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Playful Hero */}
          <Hero
            modelMetadata={modelStatus}
            onScrollToSection={handleScrollToSection}
          />

        {/* Giant Editorial Typography Ribbon 1 */}
        <div className="editorial-ribbon-wrap" aria-hidden="true">
          <span className="editorial-ribbon-word">PLAN</span>
        </div>

        {/* Section 01: Sprint Pulse (Butter Yellow Panel) */}
        <ProjectOverview
          tasks={tasks}
          predictionsMap={guardedPredictionsMap}
          totalCount={totalCount}
          completedCount={completedCount}
          progressPercent={progressPercent}
          riskStats={effectiveRiskStats}
          onRunPredictions={handleRunPredictions}
          onOpenScheduleModal={() => setIsScheduleModalOpen(true)}
          isPredicting={isPredicting}
          modelStatus={modelStatus}
        />

        {/* Giant Editorial Typography Ribbon 2 */}
        <div className="editorial-ribbon-wrap" aria-hidden="true">
          <span className="editorial-ribbon-word">PREDICT</span>
        </div>

        {/* Section 02: Risk Landscape (Lavender Sticky Notes Wall) */}
        <TaskList
          tasks={tasks}
          predictionsMap={guardedPredictionsMap}
          personalDurationModel={personalDurationModel}
          activeFilter={activeFilter}
          onChangeFilter={setActiveFilter}
          onToggleComplete={toggleTaskCompletion}
          onDelete={deleteTask}
          onUpdateTitle={updateTaskTitle}
          onCyclePriority={cyclePriority}
          onReschedule={handleReschedule}
          onReviseEffort={handleReviseEffort}
          onMoveUp={(index) => handleMoveTask(index, index - 1)}
          onMoveDown={(index) => handleMoveTask(index, index + 1)}
          activeTimerState={activeTimerState}
          onStartTimer={handleStartTimer}
          onPauseTimer={handlePauseTimer}
          onOpenExplanation={(task, pred) =>
            setSelectedTaskExplanation({
              task,
              pred: guardedPredictionsMap[task.id] || pred,
            })
          }
        />

        {/* Giant Editorial Typography Ribbon 3 */}
        <div className="editorial-ribbon-wrap" aria-hidden="true">
          <span className="editorial-ribbon-word">UNDERSTAND</span>
        </div>

        {/* Section 03: Model Intelligence (Soft Mint Brain Panel) */}
        <div ref={mlPanelRef}>
          <MLModelPanel
            modelStatus={modelStatus}
            featureImportances={featureImportances}
            onTrainModel={handleTrainModel}
            isTraining={isTraining}
            trainingStep={trainingStep}
          />
        </div>

        {/* Giant Editorial Typography Ribbon 4 */}
        <div className="editorial-ribbon-wrap" aria-hidden="true">
          <span className="editorial-ribbon-word">REFLECT</span>
        </div>

        {/* Section 04: Behavioral Telemetry & Habit Insights */}
        <BehavioralHistoryPanel tasks={tasks} />

        {/* Giant Editorial Typography Ribbon 5 */}
        <div className="editorial-ribbon-wrap" aria-hidden="true">
          <span className="editorial-ribbon-word">CALIBRATE</span>
        </div>

        {/* Section 05: Personal Duration Model & Evaluation */}
        <PersonalModelDashboard
          events={telemetryEvents}
          tasks={tasks}
        />

        {/* Giant Editorial Typography Ribbon 6 */}
        <div className="editorial-ribbon-wrap" aria-hidden="true">
          <span className="editorial-ribbon-word">ACT</span>
        </div>

        {/* Section 06: Command Center (Soft Peach Notebook Assistant) */}
        <CommandBar
          onExecuteCommand={executeCommand}
          feedback={feedback}
          onDismissFeedback={() => setFeedback(null)}
          isListening={recognitionState === RECOGNITION_STATES.LISTENING || isListening}
          recognitionState={recognitionState}
          interimTranscript={interimTranscript}
          onToggleListening={toggleListening}
          speechOutputEnabled={speechOutputEnabled}
          isSpeaking={isSpeaking}
          onToggleSpeechOutput={toggleSpeechOutput}
          onStopSpeech={handleStopSpeech}
          conversationState={conversationState}
          onConfirm={() => executeCommand('yes')}
          onCancel={() => executeCommand('cancel')}
          activeSubjectTask={activeSubjectTask}
          activeProposal={activeProposal}
          onAcceptProposal={handleAcceptProposal}
          onDiscardProposal={handleDiscardProposal}
          pendingClarification={pendingClarification}
          dialogueClock={dialogueManager.clock}
          onSelectClarificationCandidate={(candidate) => {
            if (!candidate) return;
            const targetId = candidate.id || candidate.title;
            executeCommand(targetId);
          }}
          onCancelClarification={() => executeCommand('cancel')}
        />
        </main>
      </div>

      {/* Task ML Explainability Modal (Smart Note) */}
      {selectedTaskExplanation && (
        <TaskExplanationModal
          task={selectedTaskExplanation.task}
          prediction={guardedPredictionsMap[selectedTaskExplanation.task.id] || selectedTaskExplanation.pred}
          onClose={() => setSelectedTaskExplanation(null)}
        />
      )}

      {/* Adaptive Sprint Proposal Modal */}
      <AdaptiveScheduleModal
        isOpen={isScheduleModalOpen}
        tasks={tasks}
        events={telemetryEvents}
        personalDurationModel={personalDurationModel}
        guardedPredictionsMap={guardedPredictionsMap}
        acceptedSchedule={acceptedSchedule}
        onExportSchedule={handleExportCalendar}
        onClose={() => setIsScheduleModalOpen(false)}
        onApplySchedule={handleApplySchedule}
        onProposalGenerated={handleProposalGenerated}
        onDiscardSchedule={handleDiscardSchedule}
      />
    </div>
  );
}

const styles = {
  app: {
    minHeight: '100vh',
    backgroundColor: '#FFF8EF',
    color: '#25242A',
    fontFamily: "'Plus Jakarta Sans', 'Instrument Sans', sans-serif",
    position: 'relative',
    overflowX: 'hidden',
    padding: '0 20px 80px 20px',
  },
  progressBarWrapper: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '3px',
    zIndex: 999,
    backgroundColor: 'rgba(37, 36, 42, 0.04)',
  },
  progressBarTrack: {
    height: '100%',
    backgroundColor: '#FF8F82',
    backgroundImage: 'linear-gradient(90deg, #FF8F82 0%, #FFE58A 50%, #C9B6FF 100%)',
    transition: 'width 0.1s ease',
  },
  content: {
    maxWidth: '1120px',
    margin: '0 auto',
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
};

