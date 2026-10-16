# VoxPlan Transformation: Living Project Plan

This document tracks the phased evolution of VoxPlan from a static task tracker with a cold-start supervised model into an independent, AI-powered personal planning system that learns from actual user task-completion patterns.

---

## Phase Overview

| Phase | Title | Status | Scope |
|---|---|---|---|
| **Phase 1** | Foundation, Date Unification & De-mocking | **COMPLETED** | Consistent task schema, arbitrary calendar date handling, removal of demo metric fallbacks, dynamic task-risk visualizations, honest browser Web Speech API, backwards-compatible localStorage migration. |
| **Phase 2** | Local Persistence & Behavioral Telemetry | **COMPLETED** | Local-first IndexedDB event store, versioned behavioral schema (11 event types), explicit stopwatch working duration vs self-reported vs unknown duration, inline reschedule/effort/reorder instrumentation, sparse-data honest behavioral statistics (< 3 completions), Behavioral History & Habit Insights UI panel with JSON export and history deletion, backend batch endpoints, and automated test suite. |
| **Phase 3, Stage 1** | Telemetry Repair & Personal Duration Estimation | **COMPLETED** | Shared task lifecycle engine (`taskLifecycle.js`), active stopwatch finalization, command-bar completion/reopening convergence, idempotent telemetry, local-first Personal Duration Estimator (`personalModel.js`) with weighted median and empirical Bayesian shrinkage ($K = 3.0$), dual duration badges on task cards, cold-start and uncertainty tiers. |
| **Phase 3, Stage 2** | Personal Model Dashboard & Evaluation | **COMPLETED** | Personal Model Dashboard (`PersonalModelDashboard.jsx`), sample weight transparency, Bayesian shrinkage formula explainer, leak-free chronological walk-forward holdout evaluation (`evaluatePersonalDurationModel`), MAE/MdAPE baseline comparison, and honest cold-start states. |
| **Phase 3, Stage 3** | Hybrid Completion-Risk Personalization | Next Up | Transparent hybrid model blending synthetic baseline risk with observed personal estimation bias and velocity variance without overfitting small samples. |
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
- **File**: `backend/tests/test_date_handling.py`
  - 18 comprehensive tests covering ISO format, month names, leap years, overdue detection, boundary checks, and timezone safety.
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
  - Dynamic user tasks from state, live sprint health calculations.
- **File**: `src/components/MLModelPanel.jsx`
  - Removed hardcoded fallback metrics; displayed honest un-trained / offline states (`—`) when backend is not connected.
- **File**: `src/components/TaskCard.jsx`
  - Removed fallback 50% medium risk for unpredicted tasks; added explicit "Awaiting analysis" badge.
  - Formatted due dates dynamically relative to current calendar date.
- **File**: `src/components/Hero.jsx`
  - Added explicit `✦ ILLUSTRATIVE PREVIEW` badge to hero preview cards.
- **File**: `src/components/CommandBar.jsx`
  - Documented browser Web Speech API honestly.

---

## Phase 2: Personal Behavioural Telemetry & Durable Persistence

### 1. Persistence Architecture Evaluation & Decision

Before writing the database layer, the deployment and persistence constraints were rigorously evaluated:

1. **Hosted Deployment Reality (Render Web Services)**:
   - VoxPlan is deployed on Render (`https://voxplan-u31l.onrender.com/`). Render free-tier instances have an **ephemeral disk**.
   - Ephemeral disks are reset on every instance spin-down (after 15 minutes of inactivity) and during every redeployment. A backend-only SQLite database stored on the hosted filesystem would silently lose user telemetry and task history.
   - Multiple public visitors accessing the same Render backend would collide on a shared SQLite file unless multi-tenant authentication and tenancy isolation were introduced.

2. **Single-User Personal Planning & Privacy Constraint**:
   - VoxPlan is an intimate personal productivity tool. Telemetry captures granular working habits, active hours, pause patterns, and estimation biases.
   - Forcing telemetry into a remote server without explicit authentication introduces privacy leaks and breaks the core offline-first requirement established in Phase 1.
   - Adding cloud-hosted databases (e.g. Supabase, AWS RDS, Neon) or third-party auth (Firebase, Clerk) violates the project constraints (no external paid databases, no unnecessary cloud auth).

3. **Chosen Architecture: Local-First IndexedDB as Source of Truth + Stable Anonymous Profile ID**:
   - **Engine**: Browser **IndexedDB** (`voxplan_db`, version 1) with object stores:
     - `telemetry_events`: Versioned, immutable event records indexed by `event_id`, `task_id`, `event_type`, and `timestamp`.
     - `tasks`: Durable task records and state.
     - `timer_sessions`: Active and completed working session intervals with start/pause/resume timestamps.
   - **Profile Isolation**: A stable anonymous local profile ID (`voxplan_profile_id`, format: `prof_<uuid>`) is generated on the client and stored in `localStorage` and IndexedDB. Every telemetry event is strictly stamped with this `profile_id`.
   - **Durability**: IndexedDB data survives browser tab closes, full application reloads, offline periods, and machine restarts.
   - **Offline Resilience**: The app can create tasks, track timers, log behavioral telemetry, and compute behavioral statistics completely offline without a running backend.
   - **Optional Backend Batch Ingestion**: FastAPI exposes `/api/telemetry/events` for local testing and batch ingestion, validating profile ownership and deduplicating by `event_id`.
   - **User Agency**: Users can inspect all recorded events in full transparency, export their history as JSON, or permanently wipe their behavioral history with a single click without deleting active tasks.

---

### 2. Completed Implementation by Component

#### A. Versioned Behavioral Event Schema & Validation
- **File**: `src/telemetry/eventSchema.js`
  - Defines `SCHEMA_VERSION = 1` and all 11 event types:
    - `task_created`: `{ title, category, priority, due_date, estimated_effort, dependencies }`
    - `task_started`: `{ session_id, started_at }`
    - `task_paused`: `{ session_id, paused_at, elapsed_seconds }`
    - `task_completed`: `{ completed_at, tracked_duration_seconds, self_reported_duration_seconds, duration_source }`
    - `task_reopened`: `{ reopened_at }`
    - `task_rescheduled`: `{ previous_due_date, new_due_date, reason }`
    - `task_priority_changed`: `{ previous_priority, new_priority }`
    - `task_effort_revised`: `{ previous_effort, new_effort }`
    - `task_reordered`: `{ previous_index, new_index, task_ids_order }`
    - `recommendation_accepted`: `{ recommendation_type, recommendation_id, details }`
    - `recommendation_rejected`: `{ recommendation_type, recommendation_id, details }`
  - Robust `validateEvent()` asserting UUID format, ISO-8601 timestamps, schema version match, and payload structure.
  - Frozen `createEvent()` factory ensuring payload immutability.

#### B. Storage Layer & Telemetry Manager
- **File**: `src/telemetry/indexedDbStore.js`
  - Transactional wrapper around `indexedDB` with object stores: `telemetry_events`, `tasks`, `timer_sessions`.
  - In-memory / localStorage fallback for Node.js test runners and non-browser environments.
- **File**: `src/telemetry/telemetryManager.js`
  - Orchestrates profile initialization (`getOrCreateProfileId()`), event creation, and deduplicated storage.
  - Persists active stopwatch timer state in `localStorage` and IndexedDB, ensuring running timers continue tracking accurately across browser reloads.
  - Provides methods for exporting complete telemetry as JSON (`exportTelemetryJson()`) and wiping history (`clearProfileTelemetry()`) safely.

#### C. Behavioral Statistics Layer
- **File**: `src/telemetry/behavioralStats.js`
  - Reconstructs active task state and computes genuine metrics:
    - `completed_count`: Number of completed tasks.
    - `duration_measured_count`: Tasks with stopwatch-measured duration (`tracked`).
    - `self_reported_count`: Tasks with approximate completion time (`self_reported`).
    - `unknown_duration_count`: Tasks completed without duration.
    - `total_tracked_seconds` & `formatted_tracked_time`.
    - `median_observed_duration_hours`: Median duration computed over measured tasks.
    - `median_by_category`: Categorical breakdown of observed duration.
    - `estimation_accuracy_ratio`: Ratio of median observed duration to median estimated effort.
    - `weekday_distribution`: Completion distribution across Monday through Sunday.
    - `postponements_count`: Total deadline changes and postponements.
  - **Sparse-Data Guard**: Enforces `insufficient_data: true` when completed tasks < 3. Never hallucinates productivity trends from 1 or 2 tasks.

#### D. UI Task Instrumentation & Stopwatch Timer
- **File**: `src/components/TaskCard.jsx`
  - Added dedicated stopwatch control: **Start / Pause / Resume** with live seconds ticker (`⏱️ 00:00`).
  - Added inline due-date rescheduling popup and inline effort revision input, firing `task_rescheduled` and `task_effort_revised` events with previous and new values.
  - Added manual reordering triggers (▲ / ▼), firing `task_reordered`.
  - On task completion without an active timer, opens an optional quick self-reported duration prompt (`"Log time: 15m / 30m / 1h / Skip"`), recording duration honestly as `duration_source: 'self_reported'`.
  - On unmeasured completion, records `duration_source: 'unknown'` without fabricating zero minutes.
- **File**: `src/components/TaskList.jsx`
  - Wired reorder, reschedule, effort revision, and timer handler props to each `TaskCard`.

#### E. Behavioral History & Habit Insights UI
- **File**: `src/components/BehavioralHistoryPanel.jsx`
  - Added Section 04: **Behavioral History & Habit Insights**.
  - Features 4 pastel metric cards:
    - **Completed Tasks**: Total completed vs. timer-tracked vs. self-reported counts.
    - **Focused Time**: Accumulated stopwatch duration with median duration per task.
    - **Estimation Accuracy**: Real ratio of actual duration vs. user's estimated effort with honest bias assessment.
    - **Schedule Adjustments**: Count of deadline changes and postponements.
  - Features **Weekday Rhythm** visual bar distribution showing which days the user actually completes work.
  - Features **Local Privacy Promise**: Explicit documentation that data stays 100% in the browser's IndexedDB, never uploaded or sent to third-party AI models.
  - Includes **Export History (JSON)** and **Clear History** with double-confirmation modal that clears telemetry while preserving active tasks.
- **File**: `src/components/CommandBar.jsx`
  - Updated section numbering to Section 05.
- **File**: `src/App.jsx`
  - Initialized telemetry manager on mount.
  - Connected `toggleTaskCompletion`, `cyclePriority`, `handleReschedule`, `handleReviseEffort`, `handleMoveTask`, `handleStartTimer`, and `handlePauseTimer` to telemetry logger.
  - Recorded `recommendation_accepted` when clicking high-risk filter from command bar.
  - Embedded `<BehavioralHistoryPanel />` with live stats subscription.

#### F. Backend Batch Telemetry Endpoints
- **File**: `backend/ml/model.py`
  - Added `TelemetryEventInput`, `TelemetryBatchRequest`, `TelemetryBatchResponse`.
- **File**: `backend/main.py`
  - `POST /api/telemetry/events`: Batch ingestion of validated telemetry events with deduplication.
  - `GET /api/telemetry/events`: Profile-scoped event retrieval.
  - `DELETE /api/telemetry/events`: Profile-scoped history deletion.
- **File**: `backend/tests/test_ml_backend.py`
  - Added test `test_api_telemetry_batch_ingest_and_retrieval` verifying batch storage, deduplication, and profile isolation.

---

### 3. Automated Test Verification & Results

#### A. Node.js Telemetry Test Suite
- **Command**: `npm test` (`node --test tests/**/*.test.js`)
- **Result**: `14 passed, 0 failed, duration: 128ms`.
  - Event schema validation: UUID format, ISO-8601 dates, schema version, required payload fields.
  - Profile isolation: Separate storage and deletion across different profile IDs.
  - Deduplication: Idempotent event writes with duplicate event IDs.
  - Duration distinctions: `tracked` vs. `self_reported` vs. `unknown`.
  - Rescheduling & priority change tracking: Previous and new value preservation.
  - Sparse data handling: `insufficient_data: true` when completed tasks < 3; genuine median and weekday calculations when tasks >= 3.
  - Task reopening: Accurately adjusts completed task statistics.

#### B. Backend Pytest Suite
- **Command**: `python -m pytest backend/tests/ -v`
- **Result**: `27 passed in 5.15s` (18 date handling tests + 9 API & ML tests including telemetry batch ingestion).

#### C. Frontend Code Quality & Bundle Verification
- **Linter**: `npm run lint` (`oxlint`) -> **0 warnings, 0 errors** across 20 files.
- **Build**: `npm run build` (`vite build`) -> **Successfully generated production bundle** (`dist/assets/index-DAlGQmgN.js`, 455 kB gzip: 143 kB).

---

### 4. Known Limitations & Transition to Phase 3

1. **Cold-Start Random Forest Model**: The Random Forest classifier remains trained on the synthetic baseline dataset. Phase 2 collected trustworthy behavioral telemetry; Phase 3 will consume this telemetry to adapt model predictions to the user's actual velocity and estimation bias.
2. **Local-First Single Device**: Telemetry is durably persisted in the client's IndexedDB. Cross-device synchronization is not claimed or implemented. Users can export their telemetry as JSON to migrate data if needed.
3. **Statistical Sample Size**: Behavioral metrics require a minimum of 3 completed tasks to display meaningful patterns. The UI explicitly discloses this requirement to prevent misleading premature conclusions.

---

## Phase 3, Stage 1 Execution Record: Telemetry Repair & Local Personal Duration Estimation

### Objective
Fix command-bar completion and reopening telemetry, ensure active stopwatch timers finalize reliably without duplicate events, and implement a transparent, local-first personal duration estimator that learns user effort estimation bias using genuine historical observations from IndexedDB.

### Completed Work by Component

#### 1. Shared Task Lifecycle & Command-Bar Convergence
- **File**: `src/telemetry/taskLifecycle.js` (NEW)
  - Extracted pure lifecycle state transition logic: `completeTaskLifecycle` and `reopenTaskLifecycle`.
  - **Convergence**: Both TaskCard clicks and CommandBar voice/text actions (`"Complete Prepare Report"`, `"Uncomplete Prepare Report"`) route through identical lifecycle functions.
  - **Timer Finalization**: Automatically finalizes active stopwatch sessions on task completion, calculating non-paused working seconds and recording `duration_source: 'tracked'`.
  - **Idempotency**: Protects against duplicate completion or reopening events on repeated natural language commands by returning `{ success: false, reason: 'already_completed' }` or `{ success: false, reason: 'already_open' }`.
  - **Duration Truth**: Distinguishes `tracked`, `self_reported`, and `unknown` durations. Missing duration is recorded as `null` rather than zero.
- **File**: `src/App.jsx`
  - Integrated `completeTaskLifecycle` and `reopenTaskLifecycle` into `completeTask`, `reopenTask`, and `toggleTaskCompletion`.
  - Rewired natural language commands 8 (uncomplete), 9 (complete), and 10 (delete) to call unified handlers.
  - Memoized `personalDurationModel` from telemetry events and tasks, passing to `<TaskList />`.

#### 2. Local-First Personal Duration Estimator
- **File**: `src/telemetry/personalModel.js` (NEW)
  - Client-side duration estimator extracting genuine observations from IndexedDB telemetry events.
  - **Observation Eligibility**:
    - Groups events by stable `task_id`.
    - Handles reopening: ignores intermediate completion states of reopened tasks, evaluating only final completions.
    - Plausibility boundaries: excludes durations $< 0.01\text{h}$ (36s) or $> 200\text{h}$.
    - Positive initial effort requirement: requires `original_estimated_effort > 0` for ratio calculation.
    - Target leakage safeguard: excludes all post-completion attributes (`completed_at`, `duration_source`, `tracked_duration_seconds`) from prediction inputs. Only pre-completion planning fields are used.
  - **Weighting**: Tracked stopwatch duration $w = 1.0$; self-reported duration $w = 0.5$; unknown duration $w = 0.0$.
  - **Mathematical Formula**:
    $$r_i = \frac{\text{observed\_duration\_hours}_i}{\text{original\_estimated\_effort\_hours}_i}$$
    $$r_{med} = \text{WeightedMedian}\left(\left\{(r_i, w_i)\right\}\right)$$
    $$r_{adjusted} = \frac{W \cdot r_{med} + K \cdot 1.0}{W + K} \quad (K = 3.0)$$
    $$\hat{D} = \text{user\_estimate\_hours} \times r_{adjusted}$$
  - **Uncertainty & Sample Maturity**:
    - `cold_start` ($W = 0$): returns unmodified estimate, explaining no completed tasks exist yet.
    - `sparse` ($0 < W < 3$): returns unmodified estimate, reporting $X$ observations recorded and 3 needed.
    - `developing` ($3 \le W < 8$): applies shrinkage toward 1.0, reporting emerging pattern.
    - `supported` ($W \ge 8$): applies full personal adjustment with empirical spread $[r_{p25} \dots r_{p75}]$.
    - `unavailable`: clearly indicated if user has not provided an effort estimate.
  - **Privacy & History Deletion**: Computed purely on the client. Resetting telemetry via `clearProfileTelemetry()` immediately returns the estimator to cold-start without touching active tasks.

#### 3. Task Card UI Integration
- **File**: `src/components/TaskCard.jsx`
  - Integrated dual duration indicator: when personal observations exist, shows `⏱️ 2h → ~2.6h (4)` with observation count badge.
  - Rich explanatory tooltip disclosing user estimate, adjusted prediction, sample count, effective weight, bias ratio, empirical spread, and plain-language explanation.
  - Distinguishes missing effort estimates with an honest "Duration estimation unavailable (no effort estimate)" message.
  - Preserved pastel aesthetic and layout responsiveness.
- **File**: `src/components/TaskList.jsx`
  - Evaluates `estimateTaskDuration(personalDurationModel, task)` per task and supplies to `TaskCard`.

#### 4. Automated Testing
- **File**: `tests/personal_model.test.js` (NEW)
  - 21 comprehensive unit tests covering:
    - Weighted median calculation with odd/even weights and identical values.
    - Cold-start with no observations.
    - Unavailable state for missing user estimates.
    - 1 tracked observation with shrinkage ($1.0 \times 1.4 \to 1.1$).
    - Multiple consistent observations ($1.5 \to 1.34$).
    - Self-reported lower weighting ($0.5$).
    - Exclusion of unknown durations, negative durations, and implausible values ($> 200$h).
    - Resistance to extreme outliers (100h bug).
    - Shrinkage prevention of overcorrection on sparse data.
    - Deduplication of duplicate completion events.
    - Intermediate completion handling for reopened tasks (no double counting).
    - Absence of fabricated category personalization.
    - History deletion restoring cold-start state.
    - Target leakage verification (post-completion fields do not alter prediction).
    - Lifecycle completion, active timer finalization, idempotency duplicate rejection, and reopen transitions.

---

### Verification Results

1. **Frontend Test Suite**: `npm test`
   - **35 tests passing across 6 suites** (14 duration tests, 5 lifecycle tests, 16 Phase 2 telemetry tests).
2. **Backend Pytest Suite**: `python -m pytest backend/tests/ -v`
   - **27 tests passing** (18 date handling tests, 9 ML & API tests).
3. **Frontend Linter**: `npm run lint` (`oxlint`)
   - **0 errors, 0 warnings** across 23 files.
4. **Production Build**: `npm run build` (`vite build`)
   - Successfully built production bundle in 1.21s.

---

---

## Phase 3, Stage 2 Execution Record: Personal Model Dashboard & Evaluation

### Objective
Build a transparent dashboard for VoxPlan's local personal duration estimator and establish a defensible, leak-free holdout evaluation methodology that honestly measures whether personalized duration predictions improve on the user's original effort estimates.

### Completed Work by Component

#### 1. Chronological Walk-Forward Holdout Evaluation Engine
- **File**: `src/telemetry/personalModel.js`
  - Enhanced `extractEligibleObservations` to track `completedAt` timestamps and sort eligible observations chronologically.
  - Implemented `evaluatePersonalDurationModel(events, currentTasks, options)`:
    - **Walk-Forward Rolling-Origin Design**: Evaluates tasks in strict chronological completion order. For each test step $k \ge 3$, the model is fitted strictly on tasks completed prior to task $k$.
    - **Zero Target Leakage**: The test task's observed duration, completion time, and post-completion metadata are never in the training set.
    - **Observation Isolation**: Groups all events per task; duplicate events or multiple completion cycles for a single task do not inflate evaluation splits.
    - **Minimum Sample Guard**: Requires at least 5 completed tasks with effort estimates and durations (`MIN_EVALUATION_TASKS = 5`). When $< 5$ tasks exist, returns an explicit `insufficient_data` state with progress tracking and an explanation of the walk-forward methodology.
    - **Evaluation Metrics**:
      - Model MAE vs. User Original Effort Baseline MAE: Mean Absolute Error in hours.
      - Error Reduction: Absolute delta in hours and percentage improvement.
      - Model MdAPE vs. Baseline MdAPE: Median Absolute Percentage Error ($\text{Median}(|\hat{D}_i - D_i| / D_i) \times 100\%$).
      - Win / Loss / Tie Counts: Number of test tasks predicted closer to actual duration than the original estimate.
      - Test Details: Audit log of each walk-forward test prediction with training set size, effective weight, applied ratio, and error metrics.

#### 2. Personal Model Dashboard Component
- **File**: `src/components/PersonalModelDashboard.jsx` (NEW)
  - Created Section 05: **PERSONAL ESTIMATION MODEL & EVALUATION** ("HOW VOXPLAN LEARNS YOUR PACE") with editorial typography ribbon `CALIBRATE`.
  - **Core Pastel Metric Cards**:
    - **Maturity Status**: Displays tier (`cold_start`, `sparse`, `developing`, `supported`) with explanatory captions and color-coded status pills.
    - **Effective Sample Weight**: Discloses $W = 1.0 \times N_{tracked} + 0.5 \times N_{reported}$, explicitly distinguishing raw observation counts from effective weighted sample size.
    - **Personal Bias Ratio**: Discloses adjusted multiplier $r_{adjusted}$ alongside raw weighted median $r_{med}$ and shrinkage prior weight ($K=3.0$).
    - **Interactive Simulation**: Live slider/input showing how a user estimate (e.g. 2.0h) transforms into an adjusted duration estimate with empirical spread.
  - **Bayesian Shrinkage Architecture**: Visual equation box explaining the shrinkage math:
    $$\text{Adjusted Ratio} = \frac{W \cdot r_{med} + 3.0 \cdot 1.0}{W + 3.0}$$
    and why neutral prior anchoring protects against wild swings from noisy early tasks.
  - **Walk-Forward Holdout Evaluation Panel**:
    - **Awaiting Data State (< 5 tasks)**: Shows animated progress bar ($X / 5$ tasks), clear explanation of out-of-sample holdout validation, and methodological honesty callout explaining why training-set accuracy is rejected.
    - **Evaluated State ($\ge 5$ tasks)**: Displays Model MAE, Baseline MAE, Error Reduction hours and %, MdAPE comparison, win rate badge, and audit table of test tasks.
  - **Methodological Honesty Disclosures**:
    - Interpretable Bias Correction vs. Black-Box Regressor.
    - Baseline Delay-Risk Distinction (Random Forest in Section 03 remains an empirical synthetic baseline).
    - Durable Local Privacy (100% in-browser IndexedDB, instant reset on history clear).

#### 3. Navigation & App Integration
- **File**: `src/components/Header.jsx`: Added Habits (`behavior`) and Personal Model (`personal-model`) nav links.
- **File**: `src/components/CommandBar.jsx`: Re-indexed section number to 06.
- **File**: `src/App.jsx`: Embedded `<PersonalModelDashboard events={telemetryEvents} tasks={tasks} />` with ribbon `CALIBRATE`.

#### 4. Automated Testing
- **File**: `tests/personal_model.test.js`
  - Added Suite 3: **Personal Model Evaluation & Dashboard Derivations** with 8 tests:
    - Cold-start evaluation returns `insufficient_data` ($N=0$).
    - Sparse data evaluation returns `insufficient_data` with progress count ($N < 5$).
    - Effective weight calculation separates measured ($1.0$) vs. reported ($0.5$) vs. unmeasured ($0.0$).
    - Walk-forward chronological holdout evaluation with 5+ tasks verifies training set sizes ($3 \to 4 \to 5$) and leak-free predictions.
    - Prevention of task-level overlap: duplicate completion events do not inflate evaluation splits.
    - Safe handling of missing or zero estimates during evaluation.
    - History deletion immediately resets model to cold-start and evaluation to `insufficient_data`.
    - Status tier progression (`cold_start` $\to$ `sparse` $\to$ `developing` $\to$ `supported`).

---

### Verification Results

1. **Frontend Test Suite**: `npm test`
   - **43 tests passing across 7 suites** (0 failures, 124ms duration).
2. **Backend Pytest Suite**: `python -m pytest backend/tests/ -v`
   - **27 tests passing** (18 date handling tests, 9 ML & API tests).
3. **Frontend Linter**: `npm run lint` (`oxlint`)
   - **0 errors, 0 warnings** across 24 files.
4. **Production Build**: `npm run build` (`vite build`)
   - Successfully generated production bundle in 266ms (`dist/assets/index-Cjky9M-L.js`, 488 kB / 151 kB gzip).

---

### Known Limitations & Phase 3, Stage 3 Plan

1. **Scope Boundary**: Task duration estimation is now fully personal, Bayesian-shrunk, transparently displayed, and chronologically evaluated on held-out tasks. The delay-risk classification model in Section 03 remains an empirical Random Forest baseline trained on synthetic data.
2. **Holdout Sample Requirement**: Generalization evaluation requires $\ge 5$ completed tasks with estimates and durations. The UI explicitly presents this threshold rather than fabricating synthetic evaluation metrics on small samples.
3. **Phase 3, Stage 3 Deliverable**:
   - Design a hybrid completion-risk architecture that blends baseline risk probabilities with personal velocity variance, estimation bias, and postponement history without overfitting small samples.


