# VoxPlan: Predictive Project Intelligence

> **"VoxPlan learns from project history to identify task delay risk, understand workload patterns, and provide predictive project intelligence through a voice-first interface."**

VoxPlan is an intelligent project management platform that combines modern task management, real-time machine learning delay-risk prediction, and a voice-driven command interface designed for Wispr Flow and voice typing.

---

## Architecture Overview

```
VOICE COMMAND / WISPR FLOW
           ↓
   [ Speech-to-Text ]
           ↓
VOXPLAN COMMAND PARSER (Deterministic NL Engine)
           ↓
REACT / VITE DASHBOARD  ←── (HTTP REST) ──→  FASTAPI ML BACKEND
           │                                         │
           ├─ Sprint Health Overview                 ├─ /api/train (Scikit-Learn Pipeline)
           ├─ Task Cards & Priority Cycling          ├─ /api/predict/all (Delay-Risk Proba)
           ├─ Transparent ML Breakdown               ├─ /api/feature-importance (Gini)
           └─ LocalStorage Persistence               └─ /api/metrics (Confusion Matrix)
```

---

## Machine Learning Pipeline

VoxPlan does not use fake AI or hardcoded mock predictions. It runs a local supervised machine learning pipeline powered by **scikit-learn**:

1. **Synthetic Historical Generator (`backend/ml/data_generator.py`)**:
   Generates realistic historical task records containing task effort, remaining days, workload scores, dependency counts, and historical completion patterns.
2. **Feature Engineering (`backend/ml/features.py`)**:
   Transforms tabular attributes into interaction features:
   - `priority_score` (Numeric mapping)
   - `effort_ratio` (Required effort vs available working hours)
   - `deadline_pressure` (Inverse remaining window)
   - `dependency_pressure` (Bottleneck chain score)
   - `workload_score` & `historical_risk`
3. **RandomForest Classifier (`backend/ml/train.py`)**:
   Trains on stratified train/validation splits, calculating real metrics (**Accuracy, Precision, Recall, F1 Score**) and a **2x2 Confusion Matrix**.
4. **Live Inference & Explainability (`backend/ml/predict.py`)**:
   Uses `predict_proba()` to compute exact delay risk probabilities for active sprint tasks, categorized into:
   - **LOW Risk**: `< 35%` delay probability
   - **MEDIUM Risk**: `35% – 64%` delay probability
   - **HIGH Risk**: `≥ 65%` delay probability
   Transparent contributing factors are derived directly from task feature values.

---

## Voice-First Workflow & Wispr Flow

```
VOICE
  ↓
WISPR FLOW (Voice-to-Text Dictation)
  ↓
TEXT IN THE VOXPLAN COMMAND BAR
  ↓
DETERMINISTIC COMMAND PARSER
  ↓
REACT DISPATCH / FASTAPI ML PREDICTION
```

VoxPlan natively accepts voice dictation from **Wispr Flow** and manual microphone commands.

### Supported Commands:

- **Task Management**:
  - `"create a high priority task called Cloud Infrastructure Audit"`
  - `"add task Practice Subnetting"`
  - `"complete Revise Cryptography"` / `"mark Revise Cryptography as completed"`
  - `"uncomplete Revise Cryptography"` / `"mark Revise Cryptography as pending"`
  - `"delete Revise Cryptography"` / `"remove the task Revise Cryptography"`
  - `"clear completed tasks"`
- **Predictive ML Intelligence**:
  - `"train the model"` / `"retrain the model"`
  - `"predict delay risk"` / `"run predictions"`
  - `"show high risk tasks"` / `"which tasks are most likely to be delayed"`
  - `"show model performance"` / `"show metrics"`
  - `"show feature importance"` / `"what drives delay risk"`
  - `"explain the project risk"`

---

## API Endpoints Reference

FastAPI exposes automatic Swagger documentation at **`http://127.0.0.1:8000/docs`**.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | System health check (`status: ok`) |
| `GET` | `/api/model/status` | Model training state, timestamp & evaluation metrics |
| `POST` | `/api/train` | Trains RandomForest on historical data and returns real metrics |
| `GET` | `/api/metrics` | Evaluation metrics & 2x2 confusion matrix |
| `GET` | `/api/feature-importance` | Gini feature importances ranked descending |
| `POST` | `/api/predict` | Single-task delay risk probability and explanation |
| `POST` | `/api/predict/all` | Batch delay risk predictions & aggregate sprint risk stats |

---

## Local Development & Setup

### Prerequisites:
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
# Install npm dependencies
npm install

# Start Vite dev server
npm run dev
```

### 3. Run Backend Test Suite
```bash
python -m pytest backend/tests/test_ml_backend.py -v
```

### 4. Build Frontend for Production
```bash
npm run build
```

---

## Directory Structure

```
VoxPlan/
├── backend/
│   ├── main.py                  # FastAPI application & routes
│   ├── requirements.txt         # Python dependencies
│   ├── ml/
│   │   ├── data_generator.py    # Synthetic historical dataset generator
│   │   ├── features.py          # Feature engineering & transformers
│   │   ├── train.py             # RandomForest training & evaluation
│   │   ├── predict.py           # Live prediction & explainability
│   │   └── model.py             # Pydantic schemas
│   ├── models/                  # Trained artifacts (.joblib, metadata.json)
│   └── tests/
│       └── test_ml_backend.py   # Pytest suite
│
├── src/
│   ├── api/
│   │   └── mlApi.js             # HTTP client for FastAPI backend
│   ├── components/
│   │   ├── Header.jsx           # Brand header & connection status
│   │   ├── CommandBar.jsx       # Voice & text command parser
│   │   ├── ProjectOverview.jsx  # Health metrics & risk distribution
│   │   ├── MLModelPanel.jsx     # Metrics, confusion matrix, feature importance
│   │   ├── TaskList.jsx         # Roadmap & filterable task list
│   │   ├── TaskCard.jsx         # Task item with priority & ML risk pill
│   │   └── TaskExplanationModal.jsx # Explainability popup
│   ├── App.jsx                  # Main integration orchestrator
│   ├── App.css                  # Animations & styling
│   └── main.jsx
│
└── README.md
```
