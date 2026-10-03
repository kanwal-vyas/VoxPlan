"""
VoxPlan Pydantic Schemas for API Request/Response validation.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "voxplan-ml"


class TaskInput(BaseModel):
    id: Optional[str] = "task-default"
    title: str
    priority: Optional[str] = "medium"
    dueDate: Optional[str] = "October 7"
    completed: Optional[bool] = False
    category: Optional[str] = "General"
    estimatedEffort: Optional[float] = None
    dependencies: Optional[List[str]] = None
    days_remaining: Optional[float] = None


class BatchPredictRequest(BaseModel):
    tasks: List[TaskInput]
    context: Optional[Dict[str, Any]] = None


class PredictionResult(BaseModel):
    task_id: str
    title: str
    probability: float
    risk: str
    percentage: float
    explanation: List[str]
    is_completed: Optional[bool] = False
    derived_features: Optional[Dict[str, float]] = None


class BatchPredictionResponse(BaseModel):
    total_tasks: int
    pending_tasks_count: Optional[int] = 0
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    average_delay_probability: float
    average_delay_percentage: float
    predictions: List[PredictionResult]
    model_status: str = "trained"


class FeatureImportanceItem(BaseModel):
    feature: str
    label: str
    importance: float
    percentage: float


class FeatureImportanceResponse(BaseModel):
    is_trained: bool
    feature_importances: List[FeatureImportanceItem]


class TrainRequest(BaseModel):
    num_samples: Optional[int] = 1200
    random_seed: Optional[int] = 42


class TrainResponse(BaseModel):
    model_type: str
    n_estimators: int
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    confusion_matrix: List[List[int]]
    n_train_samples: int
    n_val_samples: int
    total_samples: int
    trained_at: str
    feature_importances: List[FeatureImportanceItem]
    is_trained: bool


class ModelStatusResponse(BaseModel):
    is_trained: bool
    model_type: Optional[str] = None
    accuracy: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    confusion_matrix: Optional[List[List[int]]] = None
    n_train_samples: Optional[int] = None
    n_val_samples: Optional[int] = None
    trained_at: Optional[str] = None
    message: Optional[str] = None
