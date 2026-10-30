"""
Tests for CORS Preflight, Origin Whitelisting, and Options Handlers.
Verifies that FastAPI correctly returns CORS headers for the deployed frontend
and handles OPTIONS requests without 503 or 405 failures.
"""

import pytest
from starlette.testclient import TestClient
from backend.main import app, allowed_origins, is_allowed_origin

client = TestClient(app)

DEPLOYED_FRONTEND_ORIGIN = "https://voxplan-u31l.onrender.com"
RENDER_PREVIEW_ORIGIN = "https://voxplan-preview-abc.onrender.com"
DISALLOWED_ORIGIN = "https://malicious-external-site.example.com"


def test_allowed_origin_helper():
    """Verify is_allowed_origin accurately identifies permitted origins and patterns."""
    assert is_allowed_origin(DEPLOYED_FRONTEND_ORIGIN) is True
    assert is_allowed_origin("http://localhost:5173") is True
    assert is_allowed_origin("http://127.0.0.1:8000") is True
    assert is_allowed_origin(RENDER_PREVIEW_ORIGIN) is True
    assert is_allowed_origin("https://any-app.onrender.com") is True
    assert is_allowed_origin(DISALLOWED_ORIGIN) is False
    assert is_allowed_origin("") is False


def test_cors_preflight_options_train_endpoint():
    """
    Verify browser CORS preflight (OPTIONS with Access-Control-Request-Method)
    to /api/train returns 200 OK with proper Access-Control-Allow-* headers.
    """
    headers = {
        "Origin": DEPLOYED_FRONTEND_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    response = client.options("/api/train", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == DEPLOYED_FRONTEND_ORIGIN
    assert response.headers.get("access-control-allow-credentials") == "true"
    assert "POST" in response.headers.get("access-control-allow-methods", "")


def test_cors_preflight_options_render_regex_matching():
    """Verify any Render subdomain receives valid CORS preflight headers."""
    headers = {
        "Origin": RENDER_PREVIEW_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }
    response = client.options("/api/train", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == RENDER_PREVIEW_ORIGIN
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_direct_options_request_without_cors_headers():
    """
    Verify manual or non-preflight OPTIONS requests to /api/train return 200 OK
    rather than 405 Method Not Allowed.
    """
    response = client.options("/api/train")
    assert response.status_code == 200


def test_direct_options_request_on_various_api_routes():
    """Verify OPTIONS requests return 200 OK across various API endpoints."""
    routes = [
        "/api/model/status",
        "/api/predict",
        "/api/predict/all",
        "/api/telemetry/events",
        "/api/feature-importance",
    ]
    for route in routes:
        response = client.options(route)
        assert response.status_code == 200, f"Failed for route {route}: status {response.status_code}"


def test_cors_post_train_execution():
    """
    Verify actual POST /api/train request from the deployed frontend executes successfully,
    returns 200 OK, includes CORS headers, and completes model training.
    """
    headers = {
        "Origin": DEPLOYED_FRONTEND_ORIGIN,
        "Content-Type": "application/json",
    }
    payload = {
        "num_samples": 200,
        "random_seed": 42,
    }
    response = client.post("/api/train", json=payload, headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == DEPLOYED_FRONTEND_ORIGIN
    assert response.headers.get("access-control-allow-credentials") == "true"

    data = response.json()
    assert data.get("is_trained") is True
    assert "accuracy" in data
    assert "precision" in data
    assert "recall" in data
    assert "f1_score" in data
    assert "confusion_matrix" in data
    assert "feature_importances" in data


def test_cors_headers_on_get_endpoints():
    """Verify GET endpoints return appropriate CORS headers when called from deployed frontend."""
    headers = {"Origin": DEPLOYED_FRONTEND_ORIGIN}
    response = client.get("/api/model/status", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == DEPLOYED_FRONTEND_ORIGIN
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_disallowed_origin_does_not_get_cors_headers():
    """Verify unauthorized origins do not receive Access-Control-Allow-Origin headers."""
    headers = {
        "Origin": DISALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
    }
    response = client.options("/api/train", headers=headers)
    assert response.headers.get("access-control-allow-origin") != DISALLOWED_ORIGIN
