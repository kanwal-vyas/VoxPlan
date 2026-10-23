"""
VoxPlan FastAPI Application.
Exposes REST endpoints for real machine learning training, live delay risk predictions, and explainability.
"""

from typing import Any, Dict, List
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from backend.ml.model import (
    BatchPredictionResponse,
    BatchPredictRequest,
    FeatureImportanceResponse,
    HealthResponse,
    ModelStatusResponse,
    PredictionResult,
    TaskInput,
    TelemetryBatchRequest,
    TelemetryBatchResponse,
    TelemetryEventInput,
    TrainRequest,
    TrainResponse,
)
from backend.ml.predict import predict_batch_tasks, predict_single_task
from backend.ml.train import load_model_metadata, train_model

app = FastAPI(
    title="VoxPlan Predictive Project Intelligence API",
    description="Local machine learning backend providing real-time delay-risk predictions and feature explainability for VoxPlan.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

import os
from pathlib import Path

# Enable CORS (configurable via CORS_ORIGINS environment variable)
cors_origins_env = os.getenv("CORS_ORIGINS", "*").strip()
if cors_origins_env == "*":
    allowed_origins = ["*"]
else:
    allowed_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    """
    Applies defensive HTTP security headers to all responses,
    including Content-Security-Policy (CSP), framing protection, MIME sniffing prevention,
    and restrictive permissions policy.
    """
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "microphone=(self), camera=(), geolocation=()"
    csp_directives = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' http://127.0.0.1:8000 http://localhost:8000 https://voxplan-u31l.onrender.com",
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
    ]
    response.headers["Content-Security-Policy"] = "; ".join(csp_directives)
    return response


@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    """Health check endpoint to verify ML backend service availability."""
    return HealthResponse(status="ok", service="voxplan-ml")


@app.get("/api/model/status", response_model=ModelStatusResponse, tags=["Model"])
def get_model_status():
    """Returns current model status, training timestamp, and evaluation metrics."""
    metadata = load_model_metadata()
    return metadata


@app.post("/api/train", response_model=TrainResponse, tags=["Model"])
def trigger_training(payload: TrainRequest = TrainRequest()):
    """
    Trains a real scikit-learn RandomForestClassifier on historical project task dataset.
    Calculates actual accuracy, precision, recall, F1 score, confusion matrix, and feature importances.
    """
    try:
        metrics = train_model(
            num_samples=payload.num_samples or 1200,
            random_seed=payload.random_seed or 42
        )
        return metrics
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model training failed: {str(e)}"
        )


@app.get("/api/metrics", tags=["Model"])
def get_metrics():
    """Returns the latest evaluation metrics and confusion matrix from the trained model."""
    metadata = load_model_metadata()
    if not metadata.get("is_trained", False):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No trained model found. Please train the model first via /api/train."
        )
    return {
        "accuracy": metadata.get("accuracy"),
        "precision": metadata.get("precision"),
        "recall": metadata.get("recall"),
        "f1_score": metadata.get("f1_score"),
        "confusion_matrix": metadata.get("confusion_matrix"),
        "n_train_samples": metadata.get("n_train_samples"),
        "n_val_samples": metadata.get("n_val_samples"),
        "trained_at": metadata.get("trained_at"),
    }


@app.get("/api/feature-importance", response_model=FeatureImportanceResponse, tags=["Explainability"])
def get_feature_importance():
    """Returns actual Gini feature importances derived from the trained RandomForest model."""
    metadata = load_model_metadata()
    if not metadata.get("is_trained", False):
        # If not trained yet, return empty list gracefully
        return FeatureImportanceResponse(is_trained=False, feature_importances=[])
    
    return FeatureImportanceResponse(
        is_trained=True,
        feature_importances=metadata.get("feature_importances", [])
    )


@app.post("/api/predict", response_model=PredictionResult, tags=["Predictions"])
def predict_task_risk(task: TaskInput):
    """
    Computes delay risk probability and category for a single task using model.predict_proba().
    Provides transparent feature contribution explanations.
    """
    try:
        result = predict_single_task(task.model_dump())
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {str(e)}"
        )


@app.post("/api/predict/all", response_model=BatchPredictionResponse, tags=["Predictions"])
def predict_all_tasks(payload: BatchPredictRequest):
    """
    Batch predicts delay risk probabilities for all active tasks and computes aggregate project health insights.
    """
    try:
        tasks_dicts = [t.model_dump() for t in payload.tasks]
        result = predict_batch_tasks(tasks_dicts, context=payload.context)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch prediction failed: {str(e)}"
        )


# In-memory store for backend telemetry synchronization
_telemetry_store: Dict[str, Dict[str, Dict[str, Any]]] = {}


@app.post("/api/telemetry/events", response_model=TelemetryBatchResponse, tags=["Telemetry"])
def ingest_telemetry_events(payload: TelemetryBatchRequest):
    """
    Ingests a validated batch of behavioral telemetry events.
    Enforces profile boundary isolation and handles duplicate event IDs idempotently.
    """
    accepted = 0
    ignored_duplicates = 0

    for event in payload.events:
        profile_events = _telemetry_store.setdefault(event.profile_id, {})
        if event.event_id in profile_events:
            ignored_duplicates += 1
        else:
            profile_events[event.event_id] = event.model_dump()
            accepted += 1

    return TelemetryBatchResponse(
        accepted_count=accepted,
        ignored_duplicates=ignored_duplicates,
        status="ok"
    )


@app.get("/api/telemetry/events", tags=["Telemetry"])
def get_telemetry_events(profile_id: str, limit: int = 200):
    """
    Retrieves stored behavioral events for a specific profile_id.
    """
    if not profile_id or not profile_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="profile_id parameter is required.")

    profile_events = _telemetry_store.get(profile_id, {})
    events_list = sorted(profile_events.values(), key=lambda e: e.get("timestamp", ""))
    return {"profile_id": profile_id, "count": len(events_list), "events": events_list[:limit]}


@app.delete("/api/telemetry/events", tags=["Telemetry"])
def clear_telemetry_events(profile_id: str):
    """
    Permanently clears behavioral telemetry events for a specific profile_id.
    """
    if not profile_id or not profile_id.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="profile_id parameter is required.")

    if profile_id in _telemetry_store:
        del _telemetry_store[profile_id]

    return {"status": "cleared", "profile_id": profile_id}


# Optional production static asset serving (Single-service deployment mode)
DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    if (DIST_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa_frontend(full_path: str):
        file_path = DIST_DIR / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(DIST_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload_mode = os.getenv("ENVIRONMENT", "development") == "development"
    uvicorn.run("backend.main:app", host=host, port=port, reload=reload_mode)

