"""
VoxPlan Model Training Pipeline.
Trains a scikit-learn RandomForestClassifier on historical task dataset and calculates real evaluation metrics.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from backend.ml.data_generator import generate_historical_tasks
from backend.ml.features import FEATURE_LABELS, FEATURE_NAMES, VoxPlanFeatureTransformer

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_FILE = MODELS_DIR / "trained_model.joblib"
METADATA_FILE = MODELS_DIR / "model_metadata.json"


def train_model(num_samples: int = 1200, random_seed: int = 42) -> Dict[str, Any]:
    """
    Executes the end-to-end VoxPlan ML training pipeline.
    
    Returns:
        Dict containing training metrics, confusion matrix, sample counts, feature importances, and timestamp.
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Generate realistic historical dataset
    df = generate_historical_tasks(num_samples=num_samples, random_seed=random_seed)

    X = df.drop(columns=['overdue', 'status', 'task_id'])
    y = df['overdue'].values

    # 2. Stratified train/val split
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.20, random_state=random_seed, stratify=y
    )

    # 3. Create pipeline with feature engineering + RandomForest
    rf_classifier = RandomForestClassifier(
        n_estimators=120,
        max_depth=8,
        min_samples_split=4,
        min_samples_leaf=2,
        class_weight='balanced',
        random_state=random_seed,
        n_jobs=-1
    )

    pipeline = Pipeline([
        ('transformer', VoxPlanFeatureTransformer()),
        ('classifier', rf_classifier)
    ])

    # 4. Fit model on training data
    pipeline.fit(X_train, y_train)

    # 5. Evaluate on validation set
    y_pred = pipeline.predict(X_val)

    acc = float(accuracy_score(y_val, y_pred))
    prec = float(precision_score(y_val, y_pred, zero_division=0))
    rec = float(recall_score(y_val, y_pred, zero_division=0))
    f1 = float(f1_score(y_val, y_pred, zero_division=0))
    cm = confusion_matrix(y_val, y_pred).tolist()  # [[TN, FP], [FN, TP]]

    # 6. Extract actual feature importances
    raw_importances = pipeline.named_steps['classifier'].feature_importances_
    feature_importances = []
    for name, imp in zip(FEATURE_NAMES, raw_importances):
        feature_importances.append({
            'feature': name,
            'label': FEATURE_LABELS.get(name, name),
            'importance': round(float(imp), 4),
            'percentage': round(float(imp) * 100, 1)
        })

    # Sort descending by importance
    feature_importances.sort(key=lambda x: x['importance'], reverse=True)

    training_timestamp = datetime.now().isoformat()

    metadata = {
        'model_type': 'RandomForestClassifier',
        'n_estimators': 120,
        'accuracy': round(acc, 4),
        'precision': round(prec, 4),
        'recall': round(rec, 4),
        'f1_score': round(f1, 4),
        'confusion_matrix': cm,
        'n_train_samples': int(len(X_train)),
        'n_val_samples': int(len(X_val)),
        'total_samples': int(num_samples),
        'trained_at': training_timestamp,
        'feature_importances': feature_importances,
        'is_trained': True
    }

    # 7. Persist pipeline artifact & metadata
    joblib.dump(pipeline, MODEL_FILE)
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)

    return metadata


def load_model_metadata() -> Dict[str, Any]:
    """Loads metadata about the currently trained model, if available."""
    if METADATA_FILE.exists():
        try:
            with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {
        'is_trained': False,
        'message': 'No trained model available. Click "Train Model" to initialize.'
    }


def load_trained_pipeline():
    """Loads the trained scikit-learn pipeline."""
    if MODEL_FILE.exists():
        return joblib.load(MODEL_FILE)
    return None


if __name__ == '__main__':
    metrics = train_model(1000)
    print("Training finished successfully!")
    print(f"Accuracy: {metrics['accuracy'] * 100:.1f}%")
    print(f"F1 Score: {metrics['f1_score'] * 100:.1f}%")
    print(f"Confusion Matrix: {metrics['confusion_matrix']}")
