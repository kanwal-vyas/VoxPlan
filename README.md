# VoxPlan: Predictive Task & Schedule Intelligence
[Live Demo](https://voxplan-u31l.onrender.com/)

> **"VoxPlan transforms task lists into structured execution plans, evaluating delivery risk with supervised machine learning and an accessible natural language interface."**

VoxPlan is being evolved from a student/sprint task tracker into an independent, AI-powered personal planning system that learns from actual user task-completion patterns and adapts scheduling to individual working styles.

---

## Current Architecture & System State (Phase 1)

```
BROWSER WEB SPEECH API / TEXT INPUT
                 ↓
      [ Speech-to-Text Dictation ]
                 ↓
VOXPLAN COMMAND ENGINE (Deterministic NL Parser)
                 ↓
REACT / VITE DASHBOARD (Client State & LocalStorage)
     │                     │
     ├─ Dynamic Task Roadmap (Real User Tasks & Dates)
     ├─ Dynamic Risk Visualizations
     ├─ Browser Voice Dictation & Text Fallback
     └─ Offline-Resilient Local State
                 ↕ (HTTP REST, Optional Backend)
FASTAPI ML BACKEND (scikit-learn Pipeline)
     ├─ /api/model/status (Baseline Training State & Real Holdout Metrics)
     ├─ /api/train (Fits RandomForest on Baseline Dataset)
     ├─ /api/predict/all (Batch Delay-Risk Probabilities)
     └─ /api/feature-importance (Gini Feature Importances)
```

---

## Machine Learning Pipeline & Data Truth

### 1. Synthetic vs. User-Provided Data
- **Synthetic Historical Dataset (`backend/ml/data_generator.py`)**: Used solely as a cold-start baseline to fit the initial Random Forest classifier (`backend/ml/train.py`). It models correlations between task effort, remaining calendar days, workload pressure, priority, and completion delays.
- **User-Provided Tasks**: All tasks displayed in the task manager, the roadmap, and the sprint health overview are genuine user tasks entered manually or via voice commands, persisted in browser `localStorage`.
- **Illustrative UI Previews**: The Hero section contains explicitly labeled design previews for illustration.

### 2. Genuinely Measured Metrics vs. Unavailable States
- **Model Evaluation Metrics**: Accuracy, Precision, Recall, F1 score, and the 2x2 Confusion Matrix are **genuinely computed** by scikit-learn on a 20% stratified test holdout split during `/api/train`.
- **Honest Offline States**: If the backend is not running or the model is not yet trained, the dashboard displays an honest "awaiting analysis" / "model not trained" state (`—`). No fallback accuracy or confusion matrix numbers are fabricated.
- **Individual Task Explanations**: Contributing risk factors in the Task Explanation Modal are rule-based heuristic signals derived from deadline pressure, effort density, and task priority.

### 3. Backend Dependency & Offline Resilience
- **Without Backend**: Full task management (creation, editing, completion, priority cycling, arbitrary calendar dates, deletion, filtering, and local persistence) and voice dictation work entirely offline in the browser. Task risk cards display an honest "Awaiting analysis" indicator.
- **With Backend**: Connecting the FastAPI backend enables live delay-risk inference via `predict_proba()`, real-time sprint risk aggregation, and model training.

### 4. Planned Personalization (Roadmap)
- **Phase 1 (Completed)**: Unified arbitrary date parsing, task schema normalization, complete de-mocking of metrics and demo fallbacks, dynamic task-risk visualizations, and browser Web Speech integration.
- **Phase 2 (Next)**: Local SQLite database, behavioral event telemetry (capturing task completion times, reschedule counts, estimation accuracy), and real habit tracking.
- **Phase 3**: Personalized hybrid model adapting baseline predictions to actual user velocity and working habits.
- **Phase 4**: Adaptive scheduling assistant and optimal task calendar allocation.

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

### 3. Run Backend Test Suite
```bash
python -m pytest backend/tests/ -v
```

### 4. Build Frontend for Production
```bash
npm run build
```

---

## Repository Structure

```
VoxPlan/
├── backend/
│   ├── main.py                  # FastAPI application & REST endpoints
│   ├── requirements.txt         # Python dependencies
│   ├── ml/
│   │   ├── data_generator.py    # Synthetic historical dataset generator (baseline)
│   │   ├── features.py          # Unified calendar date parsing & feature pipeline
│   │   ├── train.py             # RandomForest training & test-split evaluation
│   │   ├── predict.py           # Delay risk inference & rule-based factor signals
│   │   └── model.py             # Pydantic schemas (TaskInput, TaskPrediction, etc.)
│   ├── models/                  # Saved model artifacts (.joblib, metadata.json)
│   └── tests/
│       ├── test_date_handling.py # 18 tests for calendar date & timezone logic
│       └── test_ml_backend.py   # FastAPI routes & ML pipeline test suite
│
├── src/
│   ├── api/
│   │   └── mlApi.js             # HTTP client for FastAPI backend
│   ├── components/
│   │   ├── Header.jsx           # Top bar & live backend connectivity status
│   │   ├── Hero.jsx             # Editorial typography & illustrative preview cards
│   │   ├── CommandBar.jsx       # Browser Web Speech API & NL command parser
│   │   ├── ProjectOverview.jsx  # Dynamic task risk pathway & live sprint health
│   │   ├── MLModelPanel.jsx     # Honest metrics, holdout confusion matrix, Gini bars
│   │   ├── TaskList.jsx         # Task management controls & filterable list
│   │   ├── TaskCard.jsx         # Task item with dynamic date & genuine ML risk pill
│   │   └── TaskExplanationModal.jsx # Risk factor explanation modal
│   ├── App.jsx                  # State orchestrator, localStorage migration & Web Speech
│   ├── App.css                  # Highlighters, animations & typography styles
│   └── main.jsx
│
├── voxplan_architecture_audit.md # Full architecture audit and transformation plan
├── PROJECT_PLAN.md              # Living implementation roadmap & phase tracking
└── README.md
```
