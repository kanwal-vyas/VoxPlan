import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './App.css';

import Header from './components/Header';
import Hero from './components/Hero';
import CommandBar from './components/CommandBar';
import ProjectOverview from './components/ProjectOverview';
import MLModelPanel from './components/MLModelPanel';
import BehavioralHistoryPanel from './components/BehavioralHistoryPanel';
import PersonalModelDashboard from './components/PersonalModelDashboard';
import TaskList from './components/TaskList';
import TaskExplanationModal from './components/TaskExplanationModal';
import AdaptiveScheduleModal from './components/AdaptiveScheduleModal';
import LoadingScreen from './components/LoadingScreen';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initCinematicScrollStory } from './animations/scrollStory';
import { telemetry } from './telemetry/telemetryManager';
import { completeTaskLifecycle, reopenTaskLifecycle } from './telemetry/taskLifecycle';
import { buildPersonalDurationModel, computeBatchGuardedRisk } from './telemetry/personalModel';
import {
  checkBackendHealth,
  getModelStatus,
  trainModel as apiTrainModel,
  getFeatureImportance,
  predictBatchTasks,
} from './api/mlApi';
import {
  dialogueManager,
  CONVERSATION_INTENTS,
  CONVERSATION_STATES,
} from './conversation/dialogueManager';

const STORAGE_KEY = 'voxplan_tasks';

/**
 * Returns clean, un-fabricated default tasks with real calendar dates for new users.
 */
const getDefaultTasks = () => {
  const now = new Date();
  const formatISO = (d) => d.toISOString().split('T')[0];

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
    if (/^\d{4}-\d{2}-\d{2}/.test(rawStr)) {
      dueDate = rawStr.slice(0, 10);
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
          dueDate = parsed.toISOString().split('T')[0];
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

  return {
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

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [tasks, setTasks] = useState(loadSavedTasks);
  const [activeFilter, setActiveFilter] = useState('all');
  const [feedback, setFeedback] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [activeTimerState, setActiveTimerState] = useState(() => telemetry.getActiveTimer());
  const [conversationState, setConversationState] = useState(CONVERSATION_STATES.IDLE);
  const [activeSubjectTaskId, setActiveSubjectTaskId] = useState(null);

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
  const speechRecognitionRef = useRef(null);

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

  // Persist tasks to localStorage whenever tasks change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (err) {
      console.error('Failed to persist tasks to localStorage:', err);
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

    const changedMap = new Map(changedPlacements.map((p) => [p.taskId, p.proposedDate]));
    setTasks((prev) =>
      prev.map((t) => {
        if (changedMap.has(t.id)) {
          return { ...t, dueDate: changedMap.get(t.id) };
        }
        return t;
      })
    );

    for (const p of changedPlacements) {
      await telemetry.recordTaskRescheduled(p.taskId, p.originalDueDate, p.proposedDate, 'adaptive_scheduler');
    }

    await telemetry.recordRecommendationAction('adaptive_schedule', proposal.summary?.scheduleId || 'proposal', true, {
      changesCount: changedPlacements.length,
      feasibility: proposal.summary?.feasibilityStatus || proposal.summary?.feasibility,
    });

    await telemetry.recordScheduleProposalAccepted(proposal, changedPlacements);

    setFeedback({
      type: 'success',
      message: `Applied adaptive schedule: ${changedPlacements.length} task deadline${changedPlacements.length === 1 ? '' : 's'} updated.`,
    });
  };

  const handleProposalGenerated = useCallback(async (proposal) => {
    await telemetry.recordScheduleProposalGenerated(proposal);
  }, []);

  const handleDiscardSchedule = useCallback(async (proposal, reason) => {
    await telemetry.recordScheduleProposalDiscarded(proposal, reason);
  }, []);

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
    const result = dialogueManager.processInput(rawText, {
      tasks,
      riskStats,
      modelStatus,
    });

    setConversationState(result.state);
    setActiveSubjectTaskId(dialogueManager.activeSubjectTaskId);

    if (result.responseText) {
      setFeedback({
        type: result.feedbackType || 'info',
        message: result.responseText,
      });
    }

    if (!result.isAuthorized || !result.action) {
      return;
    }

    const { action } = result;

    switch (action.type) {
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
        break;
      }

      case CONVERSATION_INTENTS.COMPLETE_TASK:
        await completeTask(action.taskId);
        dialogueManager.setActiveSubject(action.taskId);
        setActiveSubjectTaskId(action.taskId);
        break;

      case CONVERSATION_INTENTS.REOPEN_TASK:
        await reopenTask(action.taskId);
        dialogueManager.setActiveSubject(action.taskId);
        setActiveSubjectTaskId(action.taskId);
        break;

      case CONVERSATION_INTENTS.DELETE_TASK:
        deleteTask(action.taskId);
        break;

      case CONVERSATION_INTENTS.RESCHEDULE_TASK:
        await handleReschedule(action.taskId, action.newDueDate);
        dialogueManager.setActiveSubject(action.taskId);
        setActiveSubjectTaskId(action.taskId);
        break;

      case CONVERSATION_INTENTS.CREATE_TASK: {
        const newTask = {
          id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title: action.title,
          description: '',
          priority: action.priority || 'medium',
          dueDate: action.dueDate || null,
          completed: false,
          category: 'General',
          estimatedEffort: action.estimatedEffort || null,
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
        if (action.targetTask) {
          dialogueManager.setActiveSubject(action.targetTask.id);
          setActiveSubjectTaskId(action.targetTask.id);
        }
        break;

      default:
        break;
    }
  };

  // Real Web Speech API browser voice dictation
  const toggleListening = () => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setFeedback({
        type: 'info',
        message: 'Speech recognition is not supported in this browser. Please type your command into the command bar.',
      });
      return;
    }

    if (isListening) {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        setIsListening(false);
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript && transcript.trim()) {
          setFeedback({
            type: 'info',
            message: `Heard: "${transcript}"`,
          });
          executeCommand(transcript);
        }
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setFeedback({
            type: 'error',
            message: 'Microphone permission was denied. Please allow mic access or type your command.',
          });
        } else if (event.error !== 'no-speech') {
          setFeedback({
            type: 'error',
            message: `Voice recognition error: ${event.error}`,
          });
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsListening(false);
      setFeedback({
        type: 'error',
        message: `Could not start voice recognition: ${err.message}`,
      });
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
        />

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
          isListening={isListening}
          onToggleListening={toggleListening}
          conversationState={conversationState}
          onConfirm={() => executeCommand('yes')}
          onCancel={() => executeCommand('cancel')}
          activeSubjectTask={activeSubjectTask}
        />
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

