# VoxPlan Transformation: Living Project Plan

This document tracks the phased evolution of VoxPlan from a static task tracker with a cold-start supervised model into an independent, AI-powered personal planning system that learns from actual user task-completion patterns.

---

## Phase Overview

| Phase | Title | Status | Scope |
|---|---|---|---|
| **Phase 1** | Foundation, Date Unification & De-mocking | **COMPLETED** | Consistent task schema, arbitrary calendar date handling, removal of demo metric fallbacks, dynamic task-risk visualizations, honest browser Web Speech API, backwards-compatible localStorage migration. |
| **Phase 2** | Local Persistence & Behavioral Telemetry | Next Up | SQLite storage, telemetry event schema, task lifecycle events (create, start, edit, complete, reschedule), user velocity and estimation accuracy metrics. |
| **Phase 3** | Personalization Engine & Hybrid ML Pipeline | Planned | Per-user feature engineering, incremental learning / Bayesian blending of synthetic baseline with real user completion history, feature attribution. |
| **Phase 4** | Adaptive Scheduling & Workload Optimization | Planned | Workload density balancing, time-of-day affinity scheduling, dependency graph resolution, proactive bottleneck notifications. |
| **Phase 5** | Voice & Conversational Planning Experience | Planned | Rich multi-turn planning dialog, schedule rescheduling commands, review debriefing via natural language. |

---

## Phase 1 Execution Record

### Objective
Establish trustworthy task data, remove misleading demo behavior, eliminate hardcoded date hacks, and ground all frontend visualizations in actual task state.

### Completed Work by Component

#### 1. Backend Date & Feature Engineering
- **File**: `backend/ml/features.py`
  - Replaced hardcoded October 5, 6, 7 date logic with `parse_calendar_date` and `calculate_days_remaining`.
  - Added robust ISO date (`YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:SS`) and natural date parsing with explicit timezone handling.
  - Dynamically computed `task_age` from `createdAt` or creation timestamp instead of fixed static numbers.
  - Handled overdue tasks with progressive deadline pressure, tasks due today, and tasks with no set deadline.
  - Removed silent fallback substitution of arbitrary fixed days.
- **File**: `backend/ml/model.py`
  - Removed hardcoded default `"October 7"` from Pydantic `TaskInput` schema.
  - Added support for `description`, `createdAt`, `created_at`, `due_date`, and `estimated_effort`.
- **File**: `backend/ml/predict.py`
  - Updated `generate_task_explanation` to handle overdue tasks, tasks due today, and flexible timelines without deadlines.
  - Grounded factor explanations in actual task feature thresholds rather than hardcoded sprint assumptions.

#### 2. Backend Automated Test Suite
- **File**: `backend/tests/test_date_handling.py` (New)
  - 18 comprehensive tests covering:
    - ISO format (`YYYY-MM-DD`, datetime with timezone).
    - Month name formats (`Oct 24`, `October 24 2026`).
    - Leap years (`2028-02-29`).
    - Past dates / overdue detection.
    - Today's date (`0` days remaining).
    - Future dates (boundary checks).
    - Missing or `None` date handling.
    - Invalid date string handling (returns `None` without crashing).
    - Timezone safety across UTC and local dates.
    - Feature transformation pipeline across varied dates.
- **File**: `backend/tests/test_ml_backend.py`
  - Updated test payload from `"October 7"` to dynamic ISO dates (`YYYY-MM-DD`).
  - Total test suite: **26 tests passing**.

#### 3. Frontend Core & Task Persistence
- **File**: `src/App.jsx`
  - Implemented `normalizeTask()` ensuring every task has `id`, `title`, `description`, `dueDate` (ISO), `priority`, `estimatedEffort`, `completed`, `dependencies`, and `createdAt`.
  - Replaced hardcoded initial tasks with `getDefaultTasks()` generating valid dynamic ISO dates.
  - Ensured safe migration path for existing `localStorage` data without losing user tasks.
  - Completely removed `INITIAL_PREDICTIONS`, `INITIAL_MODEL_STATUS`, and `INITIAL_FEATURE_IMPORTANCES` fabricated fallbacks.
  - Enhanced deterministic command parser (`executeCommand`) to parse due dates, effort hours, and priority from natural language input.
  - Integrated genuine browser Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) with graceful text-input fallback.
  - Passed dynamic user tasks and prediction mapping to `ProjectOverview`.

#### 4. UI De-mocking & Honest State Presentation
- **File**: `src/components/ProjectOverview.jsx`
  - Replaced hardcoded student task cards with live user tasks from state.
  - Replaced fabricated summary stats (`56% Average Risk`, `1 Critical Delay Risk`) with dynamic sprint health calculations derived from current tasks.
  - Gracefully handled empty task lists and unpredicted task states.
- **File**: `src/components/MLModelPanel.jsx`
  - Removed hardcoded fallback metrics (`87.7% Accuracy`, `93.7% Precision`, `91.2% Recall`, `92.4% F1`) and fake confusion matrix `[[112, 8], [11, 109]]`.
  - Displayed honest un-trained / offline states (`—`) when backend is not connected or model has not been trained.
  - Clarified that evaluation metrics and confusion matrix are measured directly on the test split when `/api/train` runs.
- **File**: `src/components/TaskCard.jsx`
  - Removed fallback 50% medium risk for unpredicted tasks; added explicit "Awaiting analysis" badge.
  - Formatted due dates dynamically relative to current calendar date ("Due today", "Due tomorrow", "Overdue by X days", "Due MMM DD", or "No deadline set").
  - Displayed user-specified effort hours (`⏱️ Xh`) dynamically when set.
- **File**: `src/components/Hero.jsx`
  - Added explicit `✦ ILLUSTRATIVE PREVIEW` badge to hero preview cards to prevent user confusion.
- **File**: `src/components/CommandBar.jsx`
  - Removed misleading claims of external Wispr Flow integration; accurately documented browser Web Speech API.
- **File**: `src/components/TaskExplanationModal.jsx`
  - Clarified attribution to feature values and rule-based risk factors.

---

## Verification & Test Results

### 1. Backend Pytest
- **Command**: `python -m pytest backend/tests/ -v`
- **Result**: `26 passed in 1.48s` (18 date tests + 8 API/model tests).

### 2. Frontend Build
- **Command**: `npm run build`
- **Result**: Built successfully (`dist/` generated with zero errors).

### 3. Frontend Linter
- **Command**: `npm run lint`
- **Result**: Clean pass (`oxlint` passed with 0 errors).

---

## Known Limitations & Remaining Synthetic Components

1. **Synthetic Training Baseline**: The cold-start Random Forest model is still trained on the synthetic historical sprint dataset (`backend/ml/data_generator.py`) until Phase 2 & 3 implement real behavioral telemetry and local user history collection.
2. **Explainability Attribution**: Individual task risk explanations are rule-based heuristic factors evaluating deadline proximity and effort density, while global feature importances are Gini importances from the fitted trees.
3. **Browser Storage**: Tasks currently persist in browser `localStorage`. Multi-device sync and relational telemetry storage will be addressed in Phase 2 with SQLite.

---

## Next Implementation Stage: Phase 2

**Phase 2: Local Persistence & Behavioral Telemetry Engine**
1. Introduce local SQLite database schema for persistent task storage and behavioral event telemetry.
2. Define event logging pipeline (`TaskCreated`, `TaskStarted`, `TaskCompleted`, `TaskRescheduled`, `TaskPriorityChanged`).
3. Compute actual completion velocity, overdue rate, and user effort estimation accuracy.
4. Establish user telemetry feed for downstream model adaptation.
