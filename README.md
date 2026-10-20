# VoxPlan: Predictive Task & Schedule Intelligence
[Live Demo](https://voxplan-u31l.onrender.com/)

> **"VoxPlan transforms task lists into structured execution plans, evaluating delivery risk with supervised machine learning and an accessible natural language interface."**

VoxPlan is being evolved from a student/sprint task tracker into an independent, AI-powered personal planning system that learns from actual user task-completion patterns and adapts scheduling to individual working styles.

---

## Application Structure & Routing

VoxPlan is organized into two distinct experiences with seamless client-side routing:
- **`/` — Product Landing Page**: Product introduction, interactive feature previews (Adaptive Schedule, ML Risk, Voice Commands), architecture comparison, and direct calls to action.
- **`/app` — Functional Productivity Application**: The full operational intelligence workspace featuring task management, live stopwatch timers, ML delay-risk prediction, Kahn DAG dependency scheduling, visual proposal editing, behavioral habit insights, and RFC 5545 `.ics` calendar export.

```bash
# Automated Launch (Node.js script or Windows batch wrapper)
npm run demo                 # Starts services and opens Product Landing Page (/)
npm run demo -- --app        # Starts services and opens directly to Productivity App (/app)
# or on Windows:
.\run-demo.bat
.\run-demo.bat --app

# Launch flags:
npm run demo -- --no-open    # Start services without automatically opening browser
npm run demo -- --help       # Show all orchestration options
```

### Manual Individual Commands (Traditional Development)
```bash
# 1. FastAPI Machine Learning Backend (Terminal 1)
.venv\Scripts\activate
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

# 2. Vite React Frontend (Terminal 2)
npm run dev
# Browser opens at: http://localhost:5173
```

### Verified Test Suites & Quality Metrics
- **Frontend Test Suite**: **832 / 832 passing** across 166 test suites (`npm test`).
- **Backend Test Suite**: **27 / 27 passing** across REST and ML endpoints (`python -m pytest backend/tests/`).
- **Linter**: Zero errors (`npm run lint`).
- **Production Build**: Clean compilation in ~270ms (`npm run build`).
- **Authoritative Scope Document**: See [PROJECT_SCOPE.md](file:///c:/Users/kaval%20vyas/OneDrive/Desktop/Projects/VoxPlan/PROJECT_SCOPE.md) for full classification (Categories A through F).

---

## Current Architecture & System State (Phase 7 Stage 4A Verified, Demo Ready)

```
BROWSER WEB SPEECH API / TEXT INPUT
                 ↓
      [ Speech-to-Text Dictation ]
                 ↓
VOXPLAN COMMAND ENGINE (Deterministic NL Parser)
                 ↓
SHARED TASK LIFECYCLE ENGINE (taskLifecycle.js)
     │
     ├─ Idempotent State Transitions (complete / reopen / delete)
     ├─ Active Stopwatch Session Finalization & Duration Classification
     └─ Reliable Behavioral Telemetry Event Generation
                 ↓
REACT / VITE DASHBOARD (Client State & Local-First Architecture)
     │
     ├─ Dynamic Task Roadmap (Real User Tasks & Dates)
     ├─ Guarded Hybrid Risk Visualizations (Baseline RF + Personal Shrinkage)
     ├─ Interactive Stopwatch Timers (Start / Pause / Resume)
     ├─ Behavioral History & Habit Insights (Section 04)
     ├─ Personal Estimation Model & Evaluation Dashboard (Section 05)
     ├─ Adaptive Sprint Proposal Modal (AdaptiveScheduleModal.jsx)
     ├─ Task Explanation Modal with Personalization Transparency Card
     ├─ Offline-Resilient Local State (Tasks & Active Timers)
     │
     ↕ (IndexedDB: voxplan_db)
LOCAL EVENT STORE & PERSONAL AI ENGINES
     ├─ Stable Profile Isolation (prof_<uuid>)
     ├─ 11 Versioned Event Types (Schema v1)
     ├─ Honest Duration Accounting (Tracked vs Self-Reported vs Unknown)
     ├─ Personal Duration Estimator (Weighted Median + Empirical Bayesian Shrinkage, K=3.0)
     ├─ Chronological Walk-Forward Holdout Evaluation (min 3 train, min 5 held-out, N>=8)
     ├─ Guarded Personal Completion-Risk Estimator (personalRiskModel.js)
     │   ├─ Cold-start guard (W < 3.0 -> pure baseline)
     │   ├─ Audited signals: Postponements (+5%/+10%), Bias Stress (+6%/-4%), Reopening (+5%)
     │   ├─ Strict bounds: clamped to ±15% with Bayesian shrinkage W / (W + 5.0)
     │   └─ Leakage protection: zero target leakage, strict timestamp <= asOfTime
     ├─ Hardened Adaptive Scheduler (src/scheduler/adaptiveScheduler.js)
     │   ├─ Kahn's topological ready-queue (strict DAG precedence over priority scores)
     │   ├─ Downstream unblocking bonus (+15 pts/dep, max +45 pts) replacing depth penalties
     │   ├─ Multi-tier deterministic tie-breaking (score -> dueDate -> Shortest Processing Time -> taskId)
     │   ├─ 3-color DFS cycle isolation, self-dependency, and downstream blocked propagation
     │   ├─ Oversized task manual resolution (status: oversized_exceeds_capacity)
     │   ├─ Cumulative daily capacity enforcement & accurate capacity utilization metric
     │   ├─ Timezone-safe inclusive calendar deadlines & weekend rollover
     │   ├─ Rich placement explainability (prerequisite constraints, unblocking, overdue recovery)
     │   └─ Safe proposal flow: stale-proposal guard, non-destructive filtering, deduplicated telemetry
     └─ Evidence-Based Behavioral Stats (Sparse-Data Guard < 3 tasks)
     │
     ↕ (HTTP REST, Optional Backend)
FASTAPI ML BACKEND (scikit-learn Pipeline & Batch Endpoints)
     ├─ /api/model/status (Baseline Training State & Holdout Metrics)
     ├─ /api/train (Fits RandomForest on Baseline Dataset)
     ├─ /api/predict/all (Batch Delay-Risk Probabilities)
     ├─ /api/feature-importance (Gini Feature Importances)
     └─ /api/telemetry/events (Validated Batch Ingestion & History Query)
```

---

## Machine Learning Pipeline & Data Truth

### 1. Synthetic vs. User-Provided Data
- **Synthetic Historical Dataset (`backend/ml/data_generator.py`)**: Used solely as a cold-start baseline to fit the initial Random Forest classifier (`backend/ml/train.py`). It models correlations between task effort, remaining calendar days, workload pressure, priority, and completion delays.
- **User-Provided Tasks**: All tasks displayed in the task manager, the roadmap, and the sprint health overview are genuine user tasks entered manually or via voice commands, persisted in browser `localStorage` and `IndexedDB`.
- **Illustrative UI Previews**: The Hero section contains explicitly labeled design previews for illustration.

### 2. Genuinely Measured Metrics vs. Unavailable States
- **Model Evaluation Metrics**: Accuracy, Precision, Recall, F1 score, and the 2x2 Confusion Matrix are **genuinely computed** by scikit-learn on a 20% stratified test holdout split during `/api/train`.
- **Personal Duration Evaluation**: Genuinely evaluated via strict chronological walk-forward holdout validation (`evaluatePersonalDurationModel`). Requires at least 3 train tasks per step and 5 held-out predictions ($N \ge 8$); otherwise renders explicit `insufficient_evaluation_data` state without fabricating metrics.
- **Honest Offline States**: If the backend is not running or the model is not yet trained, the dashboard displays an honest "awaiting analysis" / "model not trained" state (`—`). No fallback accuracy or confusion matrix numbers are fabricated.
- **Individual Task Explanations**: Contributing risk factors in the Task Explanation Modal disclose synthetic baseline probability vs. personal adjustments, applied signals, and fallback reasons.

### 3. Backend Dependency & Offline Resilience
- **Without Backend**: Full task management (creation, editing, completion, priority cycling, arbitrary calendar dates, deletion, filtering, local persistence, stopwatch duration tracking, behavioral habit analytics, and deterministic adaptive scheduling) works entirely offline in the browser. Task risk cards display an honest "Awaiting analysis" indicator.
- **With Backend**: Connecting the FastAPI backend enables live delay-risk inference via `predict_proba()`, real-time sprint risk aggregation, model training, and optional backend telemetry ingestion.

### 4. Personalization Roadmap
- **Phase 1 (Completed)**: Unified arbitrary date parsing, task schema normalization, complete de-mocking of metrics and demo fallbacks, dynamic task-risk visualizations, and browser Web Speech integration.
- **Phase 2 (Completed)**: Local-first IndexedDB persistence, behavioral telemetry event schema (11 event types), stopwatch working duration vs. self-reported vs. unknown duration, inline reschedule/effort/reorder instrumentation, sparse-data honest behavioral statistics (< 3 completions), Behavioral History & Habit Insights UI panel with JSON export and history deletion, and automated test suite.
- **Phase 3, Stage 1 (Completed)**: Telemetry repair (command-bar lifecycle convergence, active timer finalization, idempotency) & transparent, local-first Personal Duration Estimator (`personalModel.js`) using weighted median and empirical Bayesian shrinkage toward 1.0. Dual duration badges on task cards.
- **Phase 3, Stage 2 (Completed)**: Personal Model Dashboard (`PersonalModelDashboard.jsx`), sample weight transparency, Bayesian shrinkage formula explainer, leak-free chronological walk-forward holdout evaluation (`evaluatePersonalDurationModel`), MAE/MdAPE baseline comparison, and honest cold-start states.
- **Phase 3, Stage 3 (Completed)**: Guarded personal completion-risk estimation (`personalRiskModel.js`), hardened evaluation guard ($N \ge 8$), bounded personal probability shifts ($\pm 15\%$), Bayesian confidence shrinkage, and explainability modal transparency card.
- **Phase 4, Stage 1 (Completed)**: Deterministic Adaptive Scheduling Engine (`src/scheduler/adaptiveScheduler.js`), topological DAG analysis with cycle detection, personalized duration model integration with cold-start fallbacks, daily working-hour capacity bin-packing, weekend rollover, proposal review modal (`AdaptiveScheduleModal.jsx`), safe approval flow, non-destructive diffs, and 19 unit tests (72 tests total).
- **Phase 4, Stage 2 (Completed)**: Scheduling correctness & reliability audit: Kahn's topological ready-queue (guaranteed DAG order over priority scores), explicit 3-color DFS cycle isolation, blocked dependent propagation, oversized task manual resolution (`status: 'oversized_exceeds_capacity'`), cumulative daily capacity constraint enforcement, accurate capacity utilization denominator, timezone-safe deadline policies, stale-proposal detection with one-click regeneration, non-destructive diff filtering, deduplicated telemetry, and 81 automated tests across 16 suites.
- **Phase 4, Stage 3 (Completed)**: Schedule quality evaluation & benchmarking: independent 7-dimension evaluation metrics (coverage, deadline feasibility, dependency correctness, capacity compliance, workload balance CV, horizon coverage, perturbation churn), multi-strategy benchmarking comparing Adaptive against Earliest Deadline First (EDF) and Priority-First under identical hard constraints, 12 reproducible scenario fixtures (`scheduleBenchmarks.js`), stability churn analysis, interactive modal benchmark tab, and 93 automated tests across 19 suites.
- **Phase 4, Stage 4 (Completed)**: Evidence-driven scheduler optimization: replaced topological depth penalty with bounded downstream unblocking bonus (`+ min(45, unblockCount * 15)`), eliminating critical-path bottlenecks without penalizing ready dependents (reduced churn on satisfied dependencies from 40% to 0%, overall average churn from 24% to 16%); multi-tier deterministic tie-breaking (score $\to$ due date $\to$ Shortest Processing Time $\to$ task ID); evaluator metric honesty reporting `schedulableOnTimeRate` and `schedulerDaysDelayed` to separate impossible deadlines and pre-existing delays; enriched placement explainability; 99 automated tests passing across 20 suites.
- **Phase 4, Stage 5 (Completed)**: Local Schedule Feedback & Outcome Tracking: versioned privacy-preserving telemetry schema (`SCHEMA_VERSION = 2`) recording proposal generation, acceptance, and discard actions; single-action deduplication in `telemetryManager`; subsequent manual date override detection (postponed vs advanced shift tracking); unaltered completion outcome matching (excluding tasks manually moved prior to finish); pure local feedback module (`src/scheduler/scheduleFeedback.js`); focused modal feedback tab with explicit denominators and insufficient-data guards (< 3 observations); strict cautious learning boundary (no automatic weight retuning); and 110 automated tests passing across 27 suites.
- **Phase 4, Stage 6 (Completed)**: Schedule Feedback Integrity & Attribution Audit: stable session-scoped proposal identities; durable deduplication surviving page reloads without backend dependency (hydrating index from cached IndexedDB events on `telemetry.init()`); multi-proposal interval-based outcome attribution (`[acceptedAt, supersededAt)`); task lifecycle hardening (excluding reopened incomplete tasks and active backlog tasks from completion outcomes); isolation of conflicting proposal decisions; standardized unique task denominators; real-time attribution diagnostics in feedback UI; and 115 automated tests passing across 30 suites.
- **Phase 5 (Completed & Verified)**: Conversational Planning, Multi-Turn Dialog & Voice Experience: 4 stages delivering contextual dialog state machine, safety confirmations for destructive actions, natural language rescheduling engine, Web Speech voice synthesis with typed fallback symmetry, and constraint debriefing.
- **Phase 6 (Completed & Verified)**: Calendar-Aware Time-Blocking & Multi-Day Workload Modeling: 4 stages delivering multi-day task chunking for oversized work, intra-day focus blocks and meeting buffer constraints, interactive visual proposal editing canvas with drag/override support, and RFC 5545 iCalendar (`.ics`) standard export.
- **Phase 7 (Completed & Verified - Stage 4B Locked)**: Evidence-Gated Schedule Adaptation & Preference Learning: 4 stages delivering Bayesian weight shrinkage, shadow evaluation sandbox, explicit synthetic evidence rejection, and fail-closed production activation gates (`isAdaptationUnlocked: false`, `productionApplied: false`). Supervised live deployment (Stage 7.4.4B) is intentionally unstarted and locked until genuine longitudinal evidence anchors are established.
- **Phase 8 (Deferred Post-Demo)**: Production Hardening, Accessibility, Security & Release Readiness: PWA offline service worker, full automated WCAG 2.1 AA audit, client-side encrypted backup, and CI release pipeline are scheduled for post-demo execution.

*(For the complete, authoritative deliverable breakdown across Categories A through F, consult [PROJECT_SCOPE.md](file:///c:/Users/kaval%20vyas/OneDrive/Desktop/Projects/VoxPlan/PROJECT_SCOPE.md). For detailed historical engineering stage logs, refer to [PROJECT_PLAN.md](file:///c:/Users/kaval%20vyas/OneDrive/Desktop/Projects/VoxPlan/PROJECT_PLAN.md).)*

---

## Personal Behavioral Telemetry & Durable Persistence (Phase 2)

VoxPlan records how the user actually works to form the empirical foundation for Phase 3's personalized ML models.

### 1. Persistence Architecture: Local-First IndexedDB
- **Constraint**: VoxPlan's hosted backend runs on Render free-tier with ephemeral disks that reset every 15 minutes of inactivity. Storing user telemetry exclusively in a remote SQLite file would result in silent data loss and potential cross-user collision.
- **Solution**: The primary source of truth for behavioral history is the browser's **IndexedDB** (`voxplan_db`), keyed by an anonymous client profile identifier (`prof_<uuid>`).
- **Durability**: Telemetry survives browser refreshes, tab closures, offline sessions, and application restarts.
- **Zero Lock-in & No Cloud Auth**: Operates with complete privacy without requiring account registration, cloud auth, or external paid databases.

### 2. Versioned Behavioral Event Schema (`schema_version: 1`)
Every user action is recorded as an immutable, validated event with UUID v4 identifier, stable profile ID, stable task ID, and ISO-8601 timestamp:
- `task_created`: Initial task definition, priority, deadline, estimated effort.
- `task_started`: Explicit stopwatch timer start timestamp and session ID.
- `task_paused`: Stopwatch timer pause timestamp and elapsed session seconds.
- `task_completed`: Task completion with explicit duration source (`tracked`, `self_reported`, or `unknown`).
- `task_reopened`: Reopening of a completed task, safely updating completion metrics.
- `task_rescheduled`: Due date change capturing previous and new deadlines.
- `task_priority_changed`: Priority elevation or reduction with previous and new levels.
- `task_effort_revised`: Effort adjustment with previous and new hours.
- `task_reordered`: Manual drag or up/down task reordering capturing full order sequence.
- `recommendation_accepted` / `recommendation_rejected`: User response to algorithmic suggestions.

### 3. Honest Working Duration Accounting
- **Tracked Stopwatch Duration**: Live stopwatch on task cards accumulates active focused working seconds across multiple sessions and persists across page reloads. Paused time is strictly excluded.
- **Self-Reported Duration**: When completing a task without having run the stopwatch, users can optionally enter an approximate duration. This is explicitly labeled as `self_reported`.
- **Unknown Duration**: Tasks completed without tracked or reported duration store `duration_source: 'unknown'` rather than fabricating 0 minutes.
- **Wall-Clock Separation**: Elapsed calendar time is never conflated with active working duration.

### 4. Transparent Behavioral Statistics & Sparse-Data Honesty
- Computes completed task count, duration-measured count, median observed duration per task, categorical duration breakdowns, estimation accuracy ratios, and weekday velocity distributions.
- **Sparse-Data Rule**: Requires at least **3 completed task observations** before presenting behavioral trends. When observations are fewer than 3, the UI returns an honest "insufficient data" state rather than premature conclusions.

### 5. User Agency & Data Control
- Users can inspect their complete behavioral profile in Section 04 of the dashboard.
- **Export**: One-click download of all telemetry events as standard JSON.
- **Clear History**: Double-confirmed permanent deletion of profile telemetry from IndexedDB without affecting active tasks.

---

## Personal Duration Estimator & Telemetry Repair (Phase 3, Stage 1)

Phase 3, Stage 1 repairs task completion telemetry across all natural language and UI input paths and introduces a local-first, evidence-based Personal Duration Estimator that learns personal effort-bias without backend dependencies or cloud services.

### 1. Telemetry Convergence & Lifecycle Engine (`src/telemetry/taskLifecycle.js`)
Previously, natural language voice and text commands mutated task status directly without executing stopwatch timer finalization or recording validated telemetry events.
- **Unified Lifecycle**: Command-bar actions now route directly through `completeTaskLifecycle()` and `reopenTaskLifecycle()`, sharing identical logic with the interactive task card buttons.
- **Active Timer Finalization**: Completing a task with a running stopwatch timer automatically finalizes the active session, calculates accurate elapsed working seconds excluding pauses, and attributes the duration as `duration_source: 'tracked'`.
- **Idempotency & Duplicate Protection**: Executing repeated completion or reopening commands checks current state and returns `already_completed` or `already_open`. No duplicate telemetry events are generated.
- **Duration Source Truth**: Duration is classified strictly as `tracked` (measured via stopwatch), `self_reported` (user prompt), or `unknown` (unmeasured). Unmeasured tasks store `null` elapsed duration rather than fabricating zero.

### 2. Observation Eligibility & Privacy Safeguards (`src/telemetry/personalModel.js`)
The estimator reconstructs personal work patterns exclusively from the local browser IndexedDB store:
- **Observation Units**: Historical tasks joined by stable `task_id`.
- **Reopening Policy**: Intermediate completions of reopened tasks are ignored; only the final completion state of a completed task is evaluated to prevent double-counting.
- **Plausibility Filters**: Durations outside the range $[0.01\text{ hours}, 200.0\text{ hours}]$ ($36\text{ seconds}$ to $200\text{ hours}$) are excluded as non-finite or implausible artifacts.
- **Ratio Requirements**: Tasks lacking a valid positive estimated effort ($> 0$) are excluded from effort-ratio calculations.
- **Target Leakage Safeguard**: Post-completion attributes (actual completion time, tracked duration, duration source) are **never** used as prediction inputs. Prediction utilizes strictly pre-completion planning inputs (`estimatedEffort`, `category`).
- **Zero Backend Exposure**: Personal telemetry remains 100% within the browser. Clearing history via the UI permanently wipes all observations and immediately restores the model to cold-start.

### 3. Personal Effort-Bias Correction Formula
For each eligible completed task $i$, the effort ratio is:
$$r_i = \frac{\text{observed\_duration\_hours}_i}{\text{original\_estimated\_effort\_hours}_i}$$

Each observation is weighted by evidence reliability:
- **Tracked Stopwatch Sessions**: $w_i = 1.0$ (highest fidelity).
- **Self-Reported Sessions**: $w_i = 0.5$ (lower weight to account for recall bias).
- **Unknown Duration**: $w_i = 0.0$ (excluded from ratio).

The central bias ratio is computed using a **Weighted Median**:
$$r_{med} = \text{WeightedMedian}\left(\left\{(r_i, w_i)\right\}\right)$$

To protect against extreme ratios from sparse observations, an **Empirical Bayesian Shrinkage** is applied toward a neutral ratio of $1.0$:
$$r_{adjusted} = \frac{W \cdot r_{med} + K \cdot 1.0}{W + K}$$
where $W = \sum w_i$ is the total effective observation weight and $K = 3.0$ is the shrinkage strength constant.

The predicted duration is then:
$$\hat{D} = \text{user\_estimate\_hours} \times r_{adjusted}$$

### 4. Sample Size Tiers & Honest Uncertainty
The estimator transparently signals sample maturity and avoids presenting heuristic intervals as calibrated statistical confidence intervals:
- **`cold_start`** ($W = 0$): Returns original estimate unmodified. "Using your original estimate (no completed task history yet)".
- **`sparse`** ($0 < W < 3$): Returns original estimate unmodified. "Collecting observations ($X$ recorded, 3 needed to adjust)".
- **`developing`** ($3 \le W < 8$): Applies conservative shrinkage adjustment. "Adjusted using your observed task durations ($X$ observations)".
- **`supported`** ($W \ge 8$): Applies full personal adjustment with empirical heuristic spread $[r_{p25} \dots r_{p75}]$.
- **`unavailable`**: If the task lacks an initial effort estimate, personal duration prediction is explicitly marked unavailable.

### 5. UI Integration & Task Cards
- **Dual Duration Pill**: Task cards display the original estimate alongside the adjusted prediction when supported by genuine data (e.g., `⏱️ 2h → ~2.6h (4)`).
- **Explanatory Tooltip**: Hovering discloses the exact sample count, effective weight, bias ratio, empirical range, and plain-English explanation.
- **Baseline Distinction**: The completion-risk classifier remains a synthetic Random Forest baseline; duration estimation is explicitly labeled as the sole personalized component.

### 6. Personal Model Dashboard & Walk-Forward Holdout Evaluation (Phase 3, Stage 2)
Section 05 of the dashboard (**HOW VOXPLAN LEARNS YOUR PACE**) provides full transparency into the personal estimator and its held-out generalization performance:
- **Sample Weight Transparency**: Displays effective sample weight $W = 1.0 \times N_{tracked} + 0.5 \times N_{reported}$, clearly distinguishing raw observation counts from effective weighted sample size.
- **Maturity Status Tiers**: Color-coded badges indicating current model phase (`cold_start`, `sparse`, `developing`, `supported`).
- **Personal Bias Ratio & Live Simulator**: Shows current $r_{adjusted}$ multiplier alongside raw median $r_{med}$ and an interactive tool demonstrating how arbitrary estimates (e.g. 2.0h) are adjusted.
- **Bayesian Shrinkage Architecture**: Formula display detailing how neutral prior weight $K = 3.0$ anchors early estimates and smoothly yields to empirical observations.
- **Leak-Free Walk-Forward Evaluation (`evaluatePersonalDurationModel`)**:
  - Evaluates tasks in strict chronological completion order with zero lookahead bias.
  - Each prediction fits model parameters strictly on prior completed tasks ($k \ge 3$).
  - Never evaluates on training observations.
  - Requires at least 5 completed tasks (`MIN_EVALUATION_TASKS = 5`) to report generalization metrics.
  - When $\ge 5$ tasks exist, reports Model MAE, Baseline MAE, Error Reduction hours and %, Model MdAPE vs. Baseline MdAPE, and a complete audit table of test predictions.
  - When $< 5$ tasks exist, displays an honest progress indicator and methodology disclosure.
- **Methodological Honesty Disclosures**: Explicitly explains that the model is an interpretable bias-correction method (not deep learning), separates duration bias from generic delay risk, and assures 100% on-device privacy.

---

## Voice & Natural Language Workflow

VoxPlan provides browser-native voice dictation using the **Web Speech API** (`webkitSpeechRecognition` / `SpeechRecognition`) with an immediate text fallback. No external paid voice APIs are required.

### Supported Commands:
- **Task Management**:
  - `"Add task Prepare Client Presentation due Friday 3h"`
  - `"Create a high priority task called Infrastructure Audit due 2026-11-15"`
  - `"Complete Prepare Client Presentation"`
  - `"Uncomplete Prepare Client Presentation"`
  - `"Delete Prepare Client Presentation"`
  - `"Clear completed tasks"`
- **Predictive ML Intelligence**:
  - `"Train the model"` / `"Retrain baseline"`
  - `"Show high risk tasks"`
  - `"Show model performance"`
  - `"Explain project risk"`

---

## API Endpoints Reference

FastAPI exposes interactive OpenAPI documentation at **`http://127.0.0.1:8000/docs`**.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Backend status check (`status: ok`) |
| `GET` | `/api/model/status` | Current training state, timestamp & holdout metrics |
| `POST` | `/api/train` | Trains RandomForest on baseline dataset; returns measured test-split metrics |
| `GET` | `/api/metrics` | Measured evaluation metrics & 2x2 confusion matrix |
| `GET` | `/api/feature-importance` | Gini feature importances calculated from fitted trees |
| `POST` | `/api/predict` | Single-task delay risk probability and contributing factors |
| `POST` | `/api/predict/all` | Batch delay-risk predictions & sprint aggregate statistics |
| `POST` | `/api/telemetry/events` | Ingests batch of behavioral telemetry events with deduplication |
| `GET` | `/api/telemetry/events` | Retrieves stored telemetry events scoped by profile ID |
| `DELETE` | `/api/telemetry/events` | Deletes stored telemetry events scoped by profile ID |

---

## Local Development & Setup

### Prerequisites
- Node.js (v18+)
- Python 3.10+

### 1. Start the FastAPI ML Backend
```bash
# Install Python dependencies
pip install -r backend/requirements.txt

# Start FastAPI server on port 8000
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Start the React/Vite Frontend
```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

### 3. Run Automated Tests
```bash
# Run Node.js telemetry test suite (14 unit tests)
npm test

# Run Python ML backend & date test suite (27 pytest tests)
python -m pytest backend/tests/ -v
```

### 4. Build Frontend for Production & Lint
```bash
# Fast linter check
npm run lint

# Compile production bundle
npm run build
```

---

## Repository Structure

```
VoxPlan/
├── backend/
│   ├── main.py                  # FastAPI application, REST endpoints & telemetry routes
│   ├── requirements.txt         # Python dependencies
│   ├── ml/
│   │   ├── data_generator.py    # Synthetic historical dataset generator (baseline)
│   │   ├── features.py          # Unified calendar date parsing & feature pipeline
│   │   ├── train.py             # RandomForest training & test-split evaluation
│   │   ├── predict.py           # Delay risk inference & rule-based factor signals
│   │   └── model.py             # Pydantic schemas (TaskInput, TelemetryEventInput, etc.)
│   ├── models/                  # Saved model artifacts (.joblib, metadata.json)
│   └── tests/
│       ├── test_date_handling.py # 18 tests for calendar date & timezone logic
│       └── test_ml_backend.py   # 9 tests for FastAPI routes & telemetry ingestion
│
├── src/
│   ├── api/
│   │   └── mlApi.js             # HTTP client for FastAPI backend
│   ├── components/
│   │   ├── Header.jsx           # Top bar & live backend connectivity status
│   │   ├── Hero.jsx             # Editorial typography & illustrative preview cards
│   │   ├── CommandBar.jsx       # Browser Web Speech API & NL command parser (Section 06)
│   │   ├── ProjectOverview.jsx  # Dynamic task risk pathway, live sprint health & scheduler trigger
│   │   ├── MLModelPanel.jsx     # Honest metrics, holdout confusion matrix, Gini bars
│   │   ├── TaskList.jsx         # Task management controls & filterable list
│   │   ├── TaskCard.jsx         # Stopwatch timer, inline reschedule/effort/reorder, ML pill
│   │   ├── TaskExplanationModal.jsx # Risk factor & personalization transparency modal
│   │   ├── AdaptiveScheduleModal.jsx # Adaptive sprint schedule proposal review & configuration
│   │   ├── BehavioralHistoryPanel.jsx # Behavioral habits, focus metrics & privacy (Section 04)
│   │   └── PersonalModelDashboard.jsx # Personal duration & risk model dashboard (Section 05)
│   ├── scheduler/
│   │   └── adaptiveScheduler.js # Deterministic local-first scheduling engine & DAG resolver
│   ├── telemetry/
│   │   ├── eventSchema.js       # Typed event schemas, UUID generator & validation
│   │   ├── indexedDbStore.js    # Local-first IndexedDB store (voxplan_db) & fallback
│   │   ├── behavioralStats.js   # Evidence-based stats calculation & sparse-data guard
│   │   ├── taskLifecycle.js     # Shared task lifecycle engine & timer finalization
│   │   ├── personalModel.js     # Duration model (weighted median + shrinkage) & walk-forward eval
│   │   ├── personalRiskModel.js # Guarded hybrid completion-risk personalization
│   │   └── telemetryManager.js  # Profile ID manager, timer persistence & event logger
│   ├── utils/
│   │   └── demoDataSeeder.js    # Calibrated demo dataset, Schema v2 events & safe teardown
│   ├── App.jsx                  # State orchestrator, telemetry integration & Web Speech
│   ├── App.css                  # Highlighters, animations & typography styles
│   └── main.jsx
│
├── scripts/
│   └── demoLauncher.mjs         # Windows/Cross-platform demo orchestrator with health checks
│
├── tests/
│   ├── telemetry.test.js          # 14 unit tests for schema, IndexedDB, stats & timers
│   ├── personal_model.test.js     # 39 unit tests for duration model, evaluation guards & risk
│   └── adaptive_scheduler.test.js # 19 unit tests for scheduling engine, DAG, limits & safety
│
├── voxplan_architecture_audit.md # Full architecture audit and transformation plan
├── run-demo.bat                 # Windows one-click demo launch wrapper
├── PROJECT_SCOPE.md             # Authoritative scope register (Categories A-F & boundaries)
├── PROJECT_PLAN.md              # Living implementation roadmap & phase tracking
└── README.md
```

---

## Adaptive Scheduling Foundations (Phase 4, Stage 1)

VoxPlan features a deterministic, local-first adaptive scheduling engine designed to turn static task lists into executable calendar proposals without ever silently rearranging the user's plan.

### 1. Key Principles & Governance
- **Proposal-Based Flow**: The engine generates a transparent proposal object. Existing tasks and due dates remain completely untouched until the user explicitly clicks **"Apply Schedule"**.
- **Deterministic Output**: Given identical inputs (tasks, settings, personal history), the engine always outputs identical placements, utilizing deterministic tie-breaking based on stable IDs.
- **Evidence-Based Durations**: When the local Personal Duration Model has observed sufficient evidence ($W \ge 3.0$), the scheduler automatically allocates time based on the user's personalized pace ($r_{\text{adjusted}} \times \text{estimate}$). In cold-start or sparse data scenarios, it seamlessly falls back to the user's original estimate.
- **Zero Paid AI / Local Execution**: Runs entirely in the client without external optimization APIs, cloud services, or paid token dependencies.

### 2. Constraint Solving & Prioritization Rules
1. **Topological Dependency Ordering**: Tasks with prerequisites are scheduled after their prerequisites, verified via DFS 3-color cycle detection. Circular dependencies are safely isolated without crashing.
2. **Earliest Deadline First (EDF) & Overdue Recovery**: Overdue tasks and near-term deadlines receive elevated prioritization scores to protect commitments.
3. **Daily Working-Hour Capacity**: Consecutive calendar slots are populated up to user-configured hours (default `6.0h/day`). Tasks that exceed remaining day hours cleanly roll over into the next working weekday.
4. **Guarded Delay-Risk Urgency**: Tasks identified by the hybrid model as having high completion risk ($P_{\text{delay}} \ge 0.65$) receive a secondary heuristic boost to position them earlier in the sprint.
5. **No Hidden Failures**: If the planning horizon cannot accommodate a task or a deadline is missed, the scheduler reports explicit conflict reasons (`deadline_missed`, `capacity_exceeded`, `unscheduled`) rather than concealing feasibility limits.

---

## Local Schedule Feedback & Outcome Tracking (Phase 4, Stage 5)

Phase 4 Stage 5 establishes empirical feedback tracking to determine whether VoxPlan's schedule proposals are genuinely useful in real-world usage.

### 1. Versioned Event Schema (Schema Version 2)
The behavioral telemetry event schema (`SCHEMA_VERSION = 2`) introduces versioned, minimal scheduling events:
- **`schedule_proposal_generated`**: Logged once when a unique schedule ID is calculated (`total_eligible_tasks`, `scheduled_count`, `date_changes_count`, `feasibility`).
- **`schedule_proposal_accepted`**: Logged when the user clicks "Apply Schedule", capturing the exact snapshot of applied task placements (`task_id`, `original_due_date`, `proposed_date`).
- **`schedule_proposal_discarded`**: Logged if the user closes or discards the proposal without applying it (`reason`: `user_discard` | `user_closed`).

### 2. Privacy & Local Storage
- **Zero Remote Transmission**: All feedback records remain strictly inside browser IndexedDB (`voxplan_db`). No schedule events or task details are transmitted to the backend.
- **Content Minimization**: Only stable opaque IDs (`task_id`, `schedule_id`) and dates are stored. No task titles, descriptions, or sensitive text are embedded in proposal events.
- **Immediate Data Deletion**: Clicking "Clear Behavioral History" in Section 04 permanently wipes all telemetry records and resets all feedback metrics to cold-start immediately.

### 3. Metric Definitions & Explicit Denominators
- **Proposal Acceptance Rate**:
  $$\text{Acceptance Rate} = \frac{\text{acceptedCount}}{\text{acceptedCount} + \text{discardedCount}}$$
  Explicitly reports the denominator of decided proposals. Measures initial adoption willingness, **not** schedule quality.
- **Manual Override Rate**:
  Measures tasks altered after proposal acceptance via `task_rescheduled` (where `reason !== 'adaptive_scheduler'`):
  $$\text{Task Override Rate} = \frac{\text{uniqueOverriddenTasksCount}}{\text{totalPlacedTasksCount}}$$
  Classifies shift direction: **postponed** ($+Xd$) vs **advanced** ($-Xd$).
- **Unaltered On-Time Completion Rate**:
  $$\text{On-Time Completion Rate} = \frac{\text{completedOnTimeCount}}{\text{eligibleCompletedCount}}$$
  Strictly evaluates tasks that were **not** manually rescheduled prior to completion.

### 4. Outcome Attribution & Limitation Integrity
- **Interval-Based Multi-Proposal Attribution**: When a task appears in multiple proposals over time, events are attributed strictly within the interval `[acceptedAt, supersededAt)` of the active proposal placement.
- **Manual Overrides Prior to Completion**: If a user reschedules a scheduled task prior to completing it, that task's completion is categorized under `excludedObservations` (`overridden_prior_to_completion`). This prevents attributing the outcome of manual user interventions to the automated scheduling algorithm.
- **Lifecycle Integrity**: Tasks reopened after completion or still active in backlog are excluded (`reopened_incomplete_lifecycle`, `task_currently_open`).
- **Sparse Data Guard**: If fewer than 3 decided proposals or completed observations exist, the UI renders an honest insufficient-data banner without extrapolating or fabricating metrics.

### 5. Cautious Learning Boundary
- **Measurement Only**: VoxPlan strictly does **not** automatically retrain the scheduler, tune heuristic weights, or alter priority rules from sparse user feedback.
- **Concept Independence**: Acceptance rate, manual overrides, and execution timeliness are separated into distinct concepts. A high acceptance rate is not proof that the schedule was good; a low override rate is not proof that all tasks were completed on time.
- **Automated Test Coverage**: 115 automated tests passing across 30 suites in `tests/schedule_feedback.test.js`, `tests/schedule_evaluation.test.js`, `tests/personal_model.test.js`, and `tests/telemetry.test.js`.
