# VoxPlan — Academic Project Fact Sheet & Technical Reference

This document serves as the authoritative, source-grounded reference for creating the VoxPlan academic presentation PowerPoint. Every statement here is directly cross-referenced against the actual implementation in the repository.

---

## 1. Project Overview & Meta Information

- **Project Name:** VoxPlan
- **Tagline:** Adaptive Productivity & Task-Scheduling Application
- **Primary Repository:** `https://github.com/kanwal-vyas/VoxPlan`
- **Current Development Phase:** Phase 8 Complete (UI/UX Polish, Product Tour, PWA Assets, Deployment Diagnostics)
- **Deployment Platform:** Render
  - **Frontend Live URL (Render Static Site):** `https://voxplan-u31l.onrender.com`
  - **Backend Live URL (Render Web Service):** `https://voxplan-api.onrender.com`
  - **SPA Rewrite Rule:** `/* ➜ /index.html` (Required for client-side routing on Render)
- **Verification Evidence:** 1,282 automated tests passing across 280 test suites (`tests/`).

---

## 2. Problem Statement & Motivation

Traditional task managers and calendar apps suffer from three critical architectural flaws:
1. **Static, Non-Adaptive Scheduling:** Most tools act as dumb to-do lists. When a task overruns or an unexpected dependency delays work, users must manually reschedule every dependent task across multiple calendar days.
2. **Privacy Invasion & Cloud LLM Hallucinations:** Contemporary "AI productivity" apps frequently send personal notes, schedules, and voice dictations to third-party cloud APIs (such as OpenAI or Anthropic), compromising user privacy and introducing probabilistic hallucinations into rigid schedule math.
3. **Fragile Network Dependency:** Cloud-centric productivity suites fail entirely when offline, leaving users without access to their schedules during transit or intermittent connectivity.

---

## 3. Project Objectives

1. **Local-First Deterministic Scheduling:** Deliver an autonomous scheduling engine running directly in the browser that builds feasible daily sprint proposals respecting task dependencies (DAG) and working capacity limits.
2. **Empirical Bayesian Duration Personalization:** Adapt to individual user pacing using sound statistical shrinkage ($w = \frac{n}{n + k}$), correcting task duration estimates without overfitting on sparse user data.
3. **Explainable Delay Risk Machine Learning:** Provide transparent, machine-learning-driven delay risk forecasts using a dedicated Python/FastAPI microservice, clearly showing the top factors contributing to project risk.
4. **Complete Offline Resilience & Privacy:** Guarantee 100% core application functionality (task CRUD, DAG scheduling, calendar generation, sticky notes) offline using IndexedDB, Web Speech API, and PWA service workers without any external cloud LLM dependencies.

---

## 4. Actual Technology Stack

### Frontend Architecture
- **Framework:** React 19 (`react` ^19.0.0, `react-dom` ^19.0.0)
- **Build Tool:** Vite 6 (`vite` ^6.0.0)
- **Styling:** Modular Vanilla CSS & Design Tokens (warm editorial aesthetic: cream `#FAF8F5`, ink `#1C1917`, accents `#D9383A`, `#2D6A4F`, `#4338CA`)
- **Animation & Transitions:** GSAP 3 (`gsap` ^3.12.5) with `ScrollTrigger` for cinematic scroll storytelling
- **Routing:** Client-side zero-dependency router (`src/App.jsx`) with dynamic `React.lazy()` route splitting (`/` and `/app`)
- **Persistence:** Browser IndexedDB via `idb` (`voxplan_db`) for tasks and behavioral telemetry; `localStorage` for illustrated sticky notes and user preferences

### Backend & Machine Learning Stack
- **Language & Runtime:** Python 3.12
- **Web Framework:** FastAPI (`fastapi` ^0.115.0) with `uvicorn` ASGI server
- **Data Validation:** Pydantic (`pydantic` ^2.0)
- **Machine Learning Core:** `scikit-learn` (`RandomForestClassifier`), `numpy`, `pandas`
- **CORS Middleware:** Configured for cross-origin communication with local Vite dev server and Render frontend domains

---

## 5. Architectural Deep-Dive & Source Citations

### A. The Deterministic Scheduling Engine
- **Primary Source File:** `src/scheduler/adaptiveScheduler.js`
- **Key Functions:** `generateScheduleProposal()`, `topologicalSort()`, `computeTaskPriorityScore()`, `packDailyBins()`
- **Mathematical Methodology:**
  1. **Topological Dependency Resolution:** Uses **Kahn’s Algorithm** on a Directed Acyclic Graph (DAG) to resolve prerequisite tasks before dependent successors. Includes cycle detection to prevent infinite scheduling loops.
  2. **Composite Priority Function:**
     $$\text{Score} = (W_{\text{prio}} \times P) + (W_{\text{urg}} \times U) + (W_{\text{unblock}} \times B) + (W_{\text{risk}} \times R)$$
     - Canonical Weights: `priority: 100.0`, `urgency: 50.0`, `unblock: 15.0`, `risk: 25.0`
     - **Security Invariant:** Under Phase 7.4.4B, these weights are strictly immutable at runtime to prevent dynamic weight drift and destabilization.
  3. **Capacity Bin Packing:** Allocates sorted tasks into daily work blocks (default 6.0h / day). When a task exceeds available daily capacity, the scheduler automatically segments it into focused working sessions.
  4. **Two-Phase Commit:** Generated schedules are returned as an **Active Proposal**. The user must explicitly inspect the schedule diff and click "Apply Schedule" or "Discard" before tasks are updated in IndexedDB.

### B. Empirical Bayesian Duration Personalization
- **Primary Source File:** `src/telemetry/personalModel.js`
- **Key Functions:** `buildPersonalDurationModel()`, `computeBayesianEstimate()`, `computeBatchGuardedRisk()`
- **Mathematical Model:**
  - Employs empirical Bayesian shrinkage to adjust baseline task duration estimates by category:
    $$w_i = \frac{n_i}{n_i + k}$$
    $$\hat{\mu}_i = w_i \bar{x}_i + (1 - w_i) \mu_0$$
    Where:
    - $n_i$ = number of completed tasks in category $i$
    - $k = 3.0$ = prior confidence strength (Bayesian shrinkage parameter)
    - $\bar{x}_i$ = observed mean duration factor for category $i$
    - $\mu_0 = 1.0$ = global uninformative baseline prior
  - **Learning Readiness Gate:** To prevent erratic schedule shifts on initial usage, personal duration weights remain locked until the user reaches the minimum effective completion threshold ($n \ge 3.0$).

### C. Machine Learning Delay Risk Service
- **Primary Source File:** `backend/main.py`
- **API Endpoints:**
  - `GET /health` — Health check & connectivity status
  - `GET /model/status` — Model accuracy, sample count, and training timestamp
  - `POST /predict` & `POST /predict/batch` — Batch inference returning delay probability $[0.0, 1.0]$ and categorical risk (`LOW`, `MEDIUM`, `HIGH`)
  - `POST /train` — Retrains the `RandomForestClassifier` on synthetic or user-contributed telemetry datasets
  - `GET /model/feature-importance` — Returns Gini importance scores for features (effort hours, priority, dependency depth, historical delay ratio)
- **Explainability Modal (`TaskExplanationModal.jsx`):** Translates model feature importances into clear, non-technical plain English explanations (e.g., *"Flagged due to high duration (4.0h) combined with deep dependency chain"*).

### D. Conversational Interface & Speech Architecture
- **Primary Source Files:** `src/components/CommandBar.jsx`, `src/conversation/dialogueManager.js`, `src/conversation/speechEngine.js`
- **Capabilities:**
  - Natural language parsing using a deterministic regex/preposition grammar splitter (handles compound inputs like *"Create task Beta with low priority, and mark Alpha as completed"*).
  - Web Speech API integration (`webkitSpeechRecognition` & `speechSynthesis`) running natively inside the browser.
  - Zero server-side audio processing; 100% private to the client device.
  - Two-way spoken interaction: Spoken responses can be toggled on/off, and automatic rate-limiting deduplication prevents repetitive audio output.

### E. Storage & Data Persistence Architecture
- **IndexedDB (`src/utils/indexedDbStore.js`):**
  - Database: `voxplan_db`
  - Stores: `tasks` (full structured metadata, dependencies, priority, due dates), `telemetry_events` (completion timestamps, start/pause stopwatch intervals, task reorders).
- **localStorage (`src/utils/stickyNotesStorage.js`):**
  - Store: `voxplan_sticky_notes`
  - Houses user memo notes for each task across 6 stationery themes (Classic Yellow, Coral Alert, Mint Calm, Lavender Focus, Rose Gold, Blueprint).

---

## 6. Offline Behavior & Resilience Boundary

- **Offline Mode:** If the user is disconnected or the Python FastAPI backend is stopped:
  - The frontend status pill transitions from `"Brain active"` / `"Ready"` to `"Offline"`.
  - The scheduling engine continues to function with 100% accuracy using the built-in deterministic heuristic risk model and local Kahn's DAG topological solver.
  - All task modifications, notes, and schedule exports remain fully functional via IndexedDB.
  - When the backend comes back online, the frontend automatically re-synchronizes model predictions via background health checks without requiring a page reload.

---

## 7. Quality Assurance & Verification Results

- **Automated Test Suite:** Comprehensive test harness using Node.js built-in test runner (`node --test`).
- **Pass Rate:** **1,282 passing tests across 280 suites, 0 failures, 0 skipped**.
- **Key Test Suites Verified:**
  - `tests/scheduler.test.js` — Kahn's DAG sort, cycle detection, daily bin packing, priority weights.
  - `tests/personal_model.test.js` — Empirical Bayesian shrinkage calculations, threshold readiness gates.
  - `tests/voice_dialogue.test.js` — Compound preposition command parsing, dialogue state transitions, clarification flows.
  - `tests/components.test.jsx` — Accessibility, modal rendering, keyboard traps, color contrast.
  - `tests/telemetry_persistence.test.js` — IndexedDB transactions, schema upgrades, data recovery.
  - `tests/invariants.test.js` — Immutable factory weight preservation and Stage 7.4.4B locking.

---

## 8. Known Limitations & True Future Scope

### Known Limitations (Honest Academic Disclosure)
1. **Single-Device Local Persistence:** Because tasks are stored in client-side IndexedDB, data does not automatically sync across different devices or browsers without manual export/import.
2. **Speech Recognition Browser Dependency:** Web Speech API behavior depends on the host browser (Chrome/Edge provide robust speech engines, while Firefox has limited native Web Speech support).
3. **Model Retraining Dataset Size:** The FastAPI machine learning model is trained on a bootstrap reference dataset of common productivity task distributions; full personalization relies on the local Bayesian shrinkage model rather than continuous remote model fine-tuning.

### Future Scope (Genuinely Not Yet Implemented)
- **End-to-End Encrypted Peer Sync:** WebRTC-based local-first synchronization between desktop and mobile devices without a centralized cloud database.
- **Bi-directional Calendar Sync:** CalDAV protocol integration for two-way live synchronization with external calendars beyond current `.ics` file exports.
- **On-Device Small Language Model (SLM):** Running lightweight WebAssembly-compiled local language models (e.g. WebLLM/Gemma 2B) for conversational task entry without cloud API calls.

---

## 9. Critical Rules: Claims That Must NOT Be Made in the PPT

To ensure academic integrity, the following claims **must never be made** because they are factually false:
1. **DO NOT claim VoxPlan uses OpenAI, ChatGPT, Anthropic, Gemini, or any Cloud LLM:** VoxPlan’s natural language parsing is 100% deterministic and rule-based (`compoundCommandParser.js`), and voice processing uses the browser's native Web Speech API.
2. **DO NOT claim the scheduler itself is a Deep Neural Network or Reinforcement Learning agent:** The scheduler is a deterministic, mathematically verifiable topological DAG solver (`adaptiveScheduler.js`) utilizing Kahn's algorithm and composite linear weighting. Machine learning is strictly utilized in the backend for **delay risk estimation** (`RandomForestClassifier`).
3. **DO NOT claim user audio or task content is sent to a central cloud server:** All personal task telemetry and audio stay strictly on the user's local device.
4. **DO NOT claim dynamic scheduler weight tuning is active:** The dynamic weight tuning gate was permanently locked in Phase 7.4.4B to preserve deterministic stability invariants.
