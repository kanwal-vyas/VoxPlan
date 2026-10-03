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

# Enable CORS for local React/Vite development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
