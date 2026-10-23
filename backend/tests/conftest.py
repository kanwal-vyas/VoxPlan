"""
Pytest configuration and sandbox fixtures for VoxPlan ML backend tests.
Ensures running tests never mutates committed model and metadata artifacts on disk.
Uses Python's standard tempfile to remain fully portable across Windows, macOS, and Linux
without requiring Windows Developer Mode symlink privileges.
"""

import os
import shutil
import tempfile
from pathlib import Path
import pytest
import backend.ml.train as train_module

ORIGINAL_MODELS_DIR = train_module.MODELS_DIR


@pytest.fixture(autouse=True)
def isolate_model_artifacts(monkeypatch):
    """
    Isolates model file operations into a clean temporary directory.
    Copies existing committed model artifacts into the temp directory so tests have realistic baselines,
    while guaranteeing that training writes never dirty the Git working tree.
    """
    with tempfile.TemporaryDirectory(prefix="voxplan_models_") as temp_dir_str:
        temp_models_dir = Path(temp_dir_str)

        # Copy existing models and metadata if present
        if ORIGINAL_MODELS_DIR.exists():
            for item in ORIGINAL_MODELS_DIR.iterdir():
                if item.is_file():
                    shutil.copy2(item, temp_models_dir / item.name)

        monkeypatch.setattr(train_module, "MODELS_DIR", temp_models_dir)
        monkeypatch.setattr(train_module, "MODEL_FILE", temp_models_dir / "trained_model.joblib")
        monkeypatch.setattr(train_module, "METADATA_FILE", temp_models_dir / "model_metadata.json")

        yield temp_models_dir
