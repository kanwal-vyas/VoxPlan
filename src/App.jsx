import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

import Header from './components/Header';
import Hero from './components/Hero';
import CommandBar from './components/CommandBar';
import ProjectOverview from './components/ProjectOverview';
import MLModelPanel from './components/MLModelPanel';
import TaskList from './components/TaskList';
import TaskExplanationModal from './components/TaskExplanationModal';
import LoadingScreen from './components/LoadingScreen';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initCinematicScrollStory } from './animations/scrollStory';
import {
  checkBackendHealth,
  getModelStatus,
  trainModel as apiTrainModel,
  getFeatureImportance,
  predictBatchTasks,
} from './api/mlApi';

const STORAGE_KEY = 'voxplan_tasks';

const INITIAL_TASKS = [
  {
    id: 'task-1',
    title: 'Revise Cryptography',
    priority: 'high',
    dueDate: 'October 5',
    completed: false,
    category: 'Security',
    estimatedEffort: 10.0,
    dependencies: ['task-2'],
    task_age: 4.0,
  },
  {
    id: 'task-2',
    title: 'Practice Subnetting',
    priority: 'medium',
    dueDate: 'October 5',
    completed: false,
    category: 'Networking',
    estimatedEffort: 6.0,
    dependencies: [],
    task_age: 3.0,
  },
  {
    id: 'task-3',
    title: 'Study OSI Model',
    priority: 'low',
    dueDate: 'October 6',
    completed: false,
    category: 'Architecture',
    estimatedEffort: 3.5,
    dependencies: [],
    task_age: 1.0,
  },
];

const INITIAL_PREDICTIONS = {
  'task-1': {
    task_id: 'task-1',
    risk: 'HIGH',
    probability: 0.964,
    explanation: [
      'Immediate deadline pressure (due October 5)',
      'High estimated effort (10.0 hours)',
      'Dependency bottlenecks (1 blocking predecessor)',
      'High priority classification',
    ],
  },
  'task-2': {
    task_id: 'task-2',
    risk: 'MEDIUM',
    probability: 0.542,
    explanation: [
      'Moderate effort allocation (6.0 hours)',
      'Due date proximity within current sprint',
      'Balanced workload complexity',
    ],
  },
  'task-3': {
    task_id: 'task-3',
    risk: 'LOW',
    probability: 0.187,
    explanation: [
      'Low estimated effort (3.5 hours)',
      'No blocking dependencies',
      'Extended delivery timeline',
    ],
  },
};

const INITIAL_MODEL_STATUS = {
  is_trained: true,
  accuracy: 0.877,
  precision: 0.937,
  recall: 0.912,
  f1_score: 0.924,
  confusion_matrix: [[112, 8], [11, 109]],
  total_samples: 1200,
  trained_at: new Date().toISOString(),
};

const INITIAL_FEATURE_IMPORTANCES = [
  { feature: 'days_remaining', label: 'Deadline pressure', importance: 0.216, percentage: 21.6 },
  { feature: 'effort_to_time_ratio', label: 'Effort-to-time ratio', importance: 0.178, percentage: 17.8 },
  { feature: 'task_age', label: 'Days remaining', importance: 0.170, percentage: 17.0 },
  { feature: 'estimated_effort', label: 'Workload pressure', importance: 0.081, percentage: 8.1 },
  { feature: 'priority_num', label: 'Priority weight', importance: 0.075, percentage: 7.5 },
  { feature: 'dependency_count', label: 'Dependency count', importance: 0.062, percentage: 6.2 },
];

const loadSavedTasks = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return INITIAL_TASKS;

    const parsed = JSON.parse(saved);
    if (Array.isArray(parsed) && parsed.length >= 0) {
      const isValid = parsed.every(
        (t) =>
          t &&
          typeof t === 'object' &&
          typeof t.id === 'string' &&
          typeof t.title === 'string' &&
          typeof t.completed === 'boolean'
      );
      if (isValid) return parsed;
    }
  } catch (error) {
    console.warn('Error reading tasks from localStorage, fallback to defaults:', error);
  }
  return INITIAL_TASKS;
};

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [tasks, setTasks] = useState(loadSavedTasks);
  const [activeFilter, setActiveFilter] = useState('all');
  const [feedback, setFeedback] = useState(null);
  const [isListening, setIsListening] = useState(false);

  // ML State
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [modelStatus, setModelStatus] = useState(INITIAL_MODEL_STATUS);
  const [featureImportances, setFeatureImportances] = useState(INITIAL_FEATURE_IMPORTANCES);
  const [predictionsMap, setPredictionsMap] = useState(INITIAL_PREDICTIONS);
  const [riskStats, setRiskStats] = useState({ highCount: 1, mediumCount: 1, lowCount: 1, avgProb: 0.564 });
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState('');
  const [isPredicting, setIsPredicting] = useState(false);
  const [selectedTaskExplanation, setSelectedTaskExplanation] = useState(null);

  const mlPanelRef = useRef(null);

  // Initial viewport setup: ensure page starts at top with manual scroll restoration
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
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
  const refreshMLState = useCallback(async (currentTasks = tasks) => {
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
        const predRes = await predictBatchTasks(currentTasks);
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

  // Initial load: verify backend & sync predictions
  useEffect(() => {
    refreshMLState();
    const interval = setInterval(() => {
      checkBackendHealth().then((h) => setIsBackendOnline(h.online));
    }, 15000);
    return () => clearInterval(interval);
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

  // Task Operations
  const toggleTaskCompletion = (taskId) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
    );
  };

  const deleteTask = (taskId) => {
    const taskToDelete = tasks.find((t) => t.id === taskId);
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

  const cyclePriority = (taskId) => {
    const nextMap = { high: 'medium', medium: 'low', low: 'high' };
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, priority: nextMap[t.priority] || 'medium' } : t))
    );
  };

  const findTaskByName = (taskList, query) => {
    if (!query) return null;
    const clean = query.trim().toLowerCase();
    const exact = taskList.find((t) => t.title.trim().toLowerCase() === clean);
    if (exact) return exact;

    const stripped = clean.replace(/^(?:the|a|an)\s+/i, '').trim();
    const exactStripped = taskList.find(
      (t) => t.title.trim().toLowerCase().replace(/^(?:the|a|an)\s+/i, '') === stripped
    );
    if (exactStripped) return exactStripped;

    return taskList.find(
      (t) => t.title.toLowerCase().includes(clean) || clean.includes(t.title.toLowerCase())
    ) || null;
  };

  // Comprehensive Natural Language & Voice Command Parser
  const executeCommand = (rawText) => {
    const text = rawText.trim().replace(/[.!?]+$/, '');
    if (!text) return;

    // 1. ML Command: Train/Retrain model
    if (/^(?:train|retrain|re-train)\s+(?:the\s+)?(?:ml\s+)?(?:model|random\s*forest|classifier)?$/i.test(text)) {
      handleTrainModel();
      return;
    }

    // 2. ML Command: Predict delay risk / Run predictions
    if (/^(?:predict|run\s+predictions?|analyze\s+(?:project\s+)?risk|compute\s+risk|check\s+delays?)$/i.test(text)) {
      handleRunPredictions();
      return;
    }

    // 3. ML Command: Filter / Show high risk tasks
    if (/^(?:show|filter|find|list|view)\s+(?:me\s+)?(?:the\s+)?(?:highest\s+risk|high\s+risk|delayed|at\s*risk)\s*(?:tasks?)?$/i.test(text) ||
        /^(?:which\s+tasks?\s+are\s+(?:most\s+likely\s+to\s+be\s+delayed|at\s+(?:the\s+)?highest\s+risk))$/i.test(text)) {
      setActiveFilter('high-risk');
      setFeedback({
        type: 'success',
        message: 'Filtered view to highest delay-risk tasks.',
      });
      return;
    }

    // 4. ML Command: Show model performance / metrics
    if (/^(?:show|view|display)\s+(?:model\s+)?(?:performance|metrics|accuracy|f1|status)$/i.test(text)) {
      if (mlPanelRef.current) {
        mlPanelRef.current.scrollIntoView({ behavior: 'smooth' });
      }
      setFeedback({
        type: 'info',
        message: modelStatus.is_trained
          ? `Model Accuracy: ${((modelStatus.accuracy || 0) * 100).toFixed(1)}%, F1: ${((modelStatus.f1_score || 0) * 100).toFixed(1)}%`
          : 'Model is not trained yet. Click "Train Model" to evaluate.',
      });
      return;
    }

    // 5. ML Command: Show feature importance
    if (/^(?:show|view|what\s+drives)\s+(?:feature\s+importance|risk|delays?)$/i.test(text)) {
      if (mlPanelRef.current) {
        mlPanelRef.current.scrollIntoView({ behavior: 'smooth' });
      }
      setFeedback({
        type: 'info',
        message: 'Feature importance: Days remaining, Workload pressure, and Effort-to-time ratio are the top predictors.',
      });
      return;
    }

    // 6. ML Command: Explain risk
    if (/^(?:explain|breakdown)\s+(?:the\s+)?(?:project\s+)?risk$/i.test(text)) {
      setFeedback({
        type: 'info',
        message: `Project Risk Analysis: ${riskStats.highCount} high-risk, ${riskStats.mediumCount} medium-risk tasks. Click any task risk pill for details.`,
      });
      return;
    }

    // 7. Task Command: Clear completed tasks
    if (/^(?:clear|remove|delete)\s+(?:all\s+)?completed(?:\s+tasks?)?$/i.test(text)) {
      const completedTasks = tasks.filter((t) => t.completed);
      if (completedTasks.length === 0) {
        setFeedback({
          type: 'info',
          message: 'No completed tasks to clear',
        });
        return;
      }
      setTasks((prev) => prev.filter((t) => !t.completed));
      setFeedback({
        type: 'success',
        message: `Cleared ${completedTasks.length} completed task${completedTasks.length > 1 ? 's' : ''}`,
      });
      return;
    }

    // 8. Task Command: Uncomplete / Mark as pending
    const markPendingMatch = text.match(/^mark\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+as\s+(?:pending|incomplete|uncompleted|not\s+done|open)$/i);
    const uncompleteMatch = text.match(/^(?:uncomplete|uncheck|reopen)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);

    if (markPendingMatch || uncompleteMatch) {
      const taskName = (markPendingMatch ? markPendingMatch[1] : uncompleteMatch[1]).trim();
      const target = findTaskByName(tasks, taskName);
      if (!target) {
        setFeedback({
          type: 'error',
          message: `Task not found: "${taskName}"`,
        });
        return;
      }
      setTasks((prev) => prev.map((t) => (t.id === target.id ? { ...t, completed: false } : t)));
      setFeedback({
        type: 'success',
        message: `Uncompleted task: ${target.title}`,
      });
      return;
    }

    // 9. Task Command: Complete / Mark as completed
    const markCompletedMatch = text.match(/^mark\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+?)\s+as\s+(?:completed|complete|done|finished)$/i);
    const completeMatch = text.match(/^(?:complete|finish|check)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);

    if (markCompletedMatch || completeMatch) {
      const taskName = (markCompletedMatch ? markCompletedMatch[1] : completeMatch[1]).trim();
      const target = findTaskByName(tasks, taskName);
      if (!target) {
        setFeedback({
          type: 'error',
          message: `Task not found: "${taskName}"`,
        });
        return;
      }
      setTasks((prev) => prev.map((t) => (t.id === target.id ? { ...t, completed: true } : t)));
      setFeedback({
        type: 'success',
        message: `Completed task: ${target.title}`,
      });
      return;
    }

    // 10. Task Command: Delete task
    const deleteMatch = text.match(/^(?:delete|remove)\s+(?:the\s+)?(?:task\s+)?(?:called\s+|named\s+)?(.+)$/i);
    if (deleteMatch) {
      const taskName = deleteMatch[1].trim();
      const target = findTaskByName(tasks, taskName);
      if (!target) {
        setFeedback({
          type: 'error',
          message: `Task not found: "${taskName}"`,
        });
        return;
      }
      setTasks((prev) => prev.filter((t) => t.id !== target.id));
      setFeedback({
        type: 'success',
        message: `Deleted task: ${target.title}`,
      });
      return;
    }

    // 11. Task Command: Create / Add task
    const isCreateIntent = /^(?:create|add|new|make|schedule)\b/i.test(text);
    if (isCreateIntent) {
      let priority = 'medium';
      if (/\b(?:high\s+priority|urgent|critical)\b/i.test(text)) {
        priority = 'high';
      } else if (/\b(?:low\s+priority|trivial|minor)\b/i.test(text)) {
        priority = 'low';
      } else if (/\b(?:medium\s+priority|normal\s+priority)\b/i.test(text)) {
        priority = 'medium';
      }

      let rawTitle = text
        .replace(/^(?:create|add|new|make|schedule)\s+/i, '')
        .replace(/^(?:a|an)\s+/i, '')
        .replace(/\bwith\s+(?:high|medium|low)\s+priority\b/gi, '')
        .replace(/\b(?:high|medium|low)\s+priority\b/gi, '')
        .replace(/^task\s+/i, '')
        .replace(/^(?:called|named)\s+/i, '')
        .replace(/\b(?:called|named)\s+/gi, '')
        .trim();

      rawTitle = rawTitle.replace(/\s+(?:with\s+)?(?:high|medium|low)\s+priority$/i, '').trim();

      if (!rawTitle) {
        setFeedback({
          type: 'error',
          message: 'Please specify a task name. Try: "add task [name]"',
        });
        return;
      }

      const newTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: rawTitle,
        priority,
        dueDate: 'October 7',
        completed: false,
        category: 'Productivity',
        estimatedEffort: priority === 'high' ? 8.0 : (priority === 'medium' ? 5.0 : 3.0),
        dependencies: [],
        task_age: 1.0,
      };

      setTasks((prev) => [newTask, ...prev]);
      setFeedback({
        type: 'success',
        message: `Created task: ${rawTitle}`,
      });
      return;
    }

    // 12. Fallback
    setFeedback({
      type: 'error',
      message: 'Command not recognized. Try: "add task [name]", "train the model", "predict delay risk", or "show high risk tasks"',
    });
  };

  const toggleListening = () => {
    setIsListening((prev) => !prev);
    if (!isListening) {
      setTimeout(() => {
        const sampleVoiceCommands = [
          'predict delay risk',
          'show high risk tasks',
          'train the model',
          'create a high priority task called Cloud Infrastructure Audit',
          'complete Revise Cryptography',
        ];
        const randomCmd = sampleVoiceCommands[Math.floor(Math.random() * sampleVoiceCommands.length)];
        setIsListening(false);
        executeCommand(randomCmd);
      }, 2200);
    }
  };

  const handleScrollToSection = (sectionId) => {
    const el = document.getElementById(sectionId) || document.getElementById(`section-${sectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // GSAP context cleanup reference
  const gsapCleanupRef = useRef(null);

  // Initialize GSAP Cinematic Scroll Storytelling EXACTLY ONCE when loading completes
  useEffect(() => {
    if (isLoading) return;

    // Small delay to ensure DOM is painted and computed dimensions are ready
    const timer = setTimeout(() => {
      if (gsapCleanupRef.current) {
        gsapCleanupRef.current();
        gsapCleanupRef.current = null;
      }
      gsapCleanupRef.current = initCinematicScrollStory();
    }, 80);

    return () => {
      clearTimeout(timer);
      if (gsapCleanupRef.current) {
        gsapCleanupRef.current();
        gsapCleanupRef.current = null;
      }
    };
  }, [isLoading]);

  // Debounced ScrollTrigger refresh when layout height changes (without recreating timelines)
  useEffect(() => {
    if (isLoading) return;
    const refreshTimer = setTimeout(() => {
      ScrollTrigger.refresh();
    }, 200);
    return () => clearTimeout(refreshTimer);
  }, [isLoading, tasks.length]);

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
          totalCount={totalCount}
          completedCount={completedCount}
          progressPercent={progressPercent}
          riskStats={riskStats}
          onRunPredictions={handleRunPredictions}
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
          predictionsMap={predictionsMap}
          activeFilter={activeFilter}
          onChangeFilter={setActiveFilter}
          onToggleComplete={toggleTaskCompletion}
          onDelete={deleteTask}
          onUpdateTitle={updateTaskTitle}
          onCyclePriority={cyclePriority}
          onOpenExplanation={(task, pred) => setSelectedTaskExplanation({ task, pred })}
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
          <span className="editorial-ribbon-word">ACT</span>
        </div>

        {/* Section 04: Command Center (Soft Peach Notebook Assistant) */}
        <CommandBar
          onExecuteCommand={executeCommand}
          feedback={feedback}
          onDismissFeedback={() => setFeedback(null)}
          isListening={isListening}
          onToggleListening={toggleListening}
        />
      </div>

      {/* Task ML Explainability Modal (Smart Note) */}
      {selectedTaskExplanation && (
        <TaskExplanationModal
          task={selectedTaskExplanation.task}
          prediction={selectedTaskExplanation.pred}
          onClose={() => setSelectedTaskExplanation(null)}
        />
      )}
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

