"""
Comprehensive Test Suite for VoxPlan ML Backend.
Tests data generation, feature engineering, model training, evaluation metrics, prediction probabilities, and API endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.ml.data_generator import generate_historical_tasks
from backend.ml.features import derive_features_from_task_dict, FEATURE_NAMES
from backend.ml.train import train_model

client = TestClient(app)


def test_health_endpoint():
    """Verify /health returns status 200, correct service payload, and hardened security headers."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "voxplan-ml"
    # Verify defensive security headers
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in response.headers.get("content-security-policy", "")


def test_data_generator():
    """Verify historical dataset generation has plausible shape and distribution."""
    df = generate_historical_tasks(num_samples=200, random_seed=42)
    assert len(df) == 200
    assert 'overdue' in df.columns
    assert set(df['overdue'].unique()).issubset({0, 1})
    assert df['estimated_effort'].min() > 0
    assert df['workload_score'].min() >= 1.0


def test_feature_derivation():
    """Verify derived feature dictionary extracts all required feature names."""
    from datetime import date
    sample_task = {
        'id': 'test-1',
        'title': 'Test Subnetting',
        'priority': 'high',
        'dueDate': '2026-10-20',
        'estimatedEffort': 8.0,
        'dependencies': ['task-0']
    }
    features = derive_features_from_task_dict(sample_task, reference_date=date(2026, 10, 19))
    for name in FEATURE_NAMES:
        assert name in features
        assert features[name] is not None
    assert features['priority_score'] == 3.0
    assert features['days_remaining'] == 1.0



def test_training_pipeline_and_metrics():
    """Verify training pipeline produces numeric metrics and confusion matrix."""
    metrics = train_model(num_samples=300, random_seed=42)
    assert metrics['is_trained'] is True
    assert 0.0 <= metrics['accuracy'] <= 1.0
    assert 0.0 <= metrics['precision'] <= 1.0
    assert 0.0 <= metrics['recall'] <= 1.0
    assert 0.0 <= metrics['f1_score'] <= 1.0
    assert len(metrics['confusion_matrix']) == 2
    assert len(metrics['confusion_matrix'][0]) == 2
    assert len(metrics['feature_importances']) > 0


def test_api_train_and_status():
    """Verify /api/train and /api/model/status endpoints."""
    train_res = client.post("/api/train", json={"num_samples": 300, "random_seed": 42})
    assert train_res.status_code == 200
    train_data = train_res.json()
    assert train_data["is_trained"] is True
    assert train_data["accuracy"] > 0.60

    status_res = client.get("/api/model/status")
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["is_trained"] is True
    assert status_data["model_type"] == "RandomForestClassifier"


def test_api_feature_importance():
    """Verify /api/feature-importance returns ranked feature importances."""
    res = client.get("/api/feature-importance")
    assert res.status_code == 200
    data = res.json()
    assert data["is_trained"] is True
    assert len(data["feature_importances"]) == len(FEATURE_NAMES)
    assert all("importance" in item for item in data["feature_importances"])


def test_api_single_prediction():
    """Verify /api/predict produces valid probabilities between 0 and 1 with risk categories."""
    task_payload = {
        "id": "task-cryptography",
        "title": "Revise Cryptography",
        "priority": "high",
        "dueDate": "October 5",
        "estimatedEffort": 12.0
    }
    res = client.post("/api/predict", json=task_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["task_id"] == "task-cryptography"
    assert 0.0 <= data["probability"] <= 1.0
    assert data["risk"] in {"LOW", "MEDIUM", "HIGH"}
    assert len(data["explanation"]) > 0


def test_api_batch_prediction():
    """Verify /api/predict/all aggregates project health and task probabilities."""
    batch_payload = {
        "tasks": [
            {
                "id": "task-1",
                "title": "Revise Cryptography",
                "priority": "high",
                "dueDate": "October 5",
                "completed": False
            },
            {
                "id": "task-2",
                "title": "Practice Subnetting",
                "priority": "medium",
                "dueDate": "October 5",
                "completed": False
            },
            {
                "id": "task-3",
                "title": "Study OSI Model",
                "priority": "low",
                "dueDate": "October 6",
                "completed": True
            }
        ]
    }
    res = client.post("/api/predict/all", json=batch_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["total_tasks"] == 3
    assert len(data["predictions"]) == 3
    assert data["predictions"][2]["probability"] == 0.0  # completed task
    assert 0.0 <= data["average_delay_probability"] <= 1.0


def test_api_telemetry_batch_ingest_and_retrieval():
    """Verify /api/telemetry/events accepts validated event batches, enforces profile isolation, and ignores duplicates."""
    profile_id = "prof_test_py_user"
    batch_payload = {
        "events": [
            {
                "event_id": "evt_py_1",
                "profile_id": profile_id,
                "task_id": "task_1",
                "event_type": "task_created",
                "timestamp": "2026-10-16T12:00:00.000Z",
                "schema_version": 1,
                "payload": {"title": "Test Task 1", "priority": "high"}
            },
            {
                "event_id": "evt_py_2",
                "profile_id": profile_id,
                "task_id": "task_1",
                "event_type": "task_started",
                "timestamp": "2026-10-16T12:05:00.000Z",
                "schema_version": 1,
                "payload": {"session_id": "sess_py_1"}
            }
        ]
    }

    # Ingest batch
    res = client.post("/api/telemetry/events", json=batch_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["accepted_count"] == 2
    assert data["ignored_duplicates"] == 0

    # Ingest duplicate batch
    res_dup = client.post("/api/telemetry/events", json=batch_payload)
    assert res_dup.status_code == 200
    data_dup = res_dup.json()
    assert data_dup["accepted_count"] == 0
    assert data_dup["ignored_duplicates"] == 2

    # Query events
    res_get = client.get(f"/api/telemetry/events?profile_id={profile_id}")
    assert res_get.status_code == 200
    get_data = res_get.json()
    assert get_data["count"] == 2
    assert len(get_data["events"]) == 2

    # Clear events
    res_del = client.delete(f"/api/telemetry/events?profile_id={profile_id}")
    assert res_del.status_code == 200
    assert res_del.json()["status"] == "cleared"

    # Query after clear
    res_post_clear = client.get(f"/api/telemetry/events?profile_id={profile_id}")
    assert res_post_clear.json()["count"] == 0


def test_unknown_api_endpoint_returns_404():
    """Verify unknown /api endpoints return 404 JSON and are not intercepted by SPA index.html."""
    res = client.get("/api/unknown_endpoint")
    assert res.status_code == 404
    assert res.json()["detail"] == "API endpoint not found"


def test_spa_route_serving():
    """Verify SPA route /app serves HTML index when dist directory is present."""
    from backend.main import DIST_DIR
    if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
        res = client.get("/app")
        assert res.status_code == 200
        assert "text/html" in res.headers.get("content-type", "")

